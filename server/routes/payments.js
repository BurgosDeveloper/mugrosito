const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db');
const { fetchAllOrders, fetchAllTables } = require('../helpers/fetchAll');
const {
  isValidPaymentMethod,
  toUsd,
  paymentAmounts,
  changeAmounts,
  paymentHistoryTotals,
} = require('../helpers/paymentLedger');
const { postCompletedOrderCashMovements } = require('../helpers/cashLedger');
const { assertShiftAccess } = require('../helpers/shiftScope');
const { getRatesForShift } = require('../helpers/exchangeRates');
const { requireRole } = require('../helpers/sessionAuth');
const { roundCOPPayment } = require('../helpers/currencyRounding');

function assertPaymentOrderAccess(user, order) {
  if (!order) {
    const error = new Error('Comanda no encontrada.');
    error.statusCode = 404;
    throw error;
  }
  assertShiftAccess(user, order.shift);
}

module.exports = function(io) {
  router.post('/:id/ledger', requireRole('caja', 'admin'), async (req, res) => {
    const { id } = req.params;
    const { entryType, currency, amountLocal, paymentMethod, payerName, itemIds } = req.body;
    const normalizedItemIds = Array.isArray(itemIds)
      ? [...new Set(itemIds.filter((itemId) => typeof itemId === 'string' && itemId.trim()))]
      : [];

    if (!['payment', 'change'].includes(entryType)) {
      return res.status(400).json({ error: 'El tipo de registro debe ser pago o vuelto.' });
    }
    if (!['USD', 'COP', 'Bs'].includes(currency) || !isValidPaymentMethod(currency, paymentMethod)) {
      return res.status(400).json({ error: 'El método de pago no corresponde con la moneda seleccionada.' });
    }

    const localAmount = Number(amountLocal);
    if (!Number.isFinite(localAmount) || localAmount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor que cero.' });
    }
    if (Array.isArray(itemIds) && normalizedItemIds.length !== itemIds.length) {
      return res.status(400).json({ error: 'Los ítems seleccionados no son válidos.' });
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, type, total_usd, total_cop, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const order = orderRows[0];
      assertPaymentOrderAccess(req.user, order);

      const { COP: copRate, Bs: bsRate } = await getRatesForShift(client, req.user.shift);
      const amountUSD = toUsd(localAmount, currency, copRate, bsRate);
      const { rows: paymentRows } = await client.query('SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at ASC', [id]);
      const hasIndividualPayments = paymentRows.some((payment) => Array.isArray(payment.item_ids) && payment.item_ids.length > 0);
      if (hasIndividualPayments && normalizedItemIds.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(409).json({ error: 'Esta comanda ya tiene pagos por persona. Registra los movimientos restantes desde Pagar por personas.' });
      }
      const hasGeneralPayments = paymentRows.some((payment) => (!Array.isArray(payment.item_ids) || payment.item_ids.length === 0) && (Number(payment.amount_paid_usd) > 0 || Number(payment.cash_tendered_cop) > 0 || Number(payment.cash_tendered_usd) > 0 || Number(payment.cash_tendered_bs) > 0));
      if (hasGeneralPayments && normalizedItemIds.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(409).json({ error: 'Esta comanda ya tiene abonos generales registrados. Debes continuar el cobro desde la opción de Cobro General.' });
      }
      const totals = paymentHistoryTotals(paymentRows);
      const orderTotal = Number(order.total_usd) || 0;
      let pendingChangeUSD = Math.max(0, totals.tenderedUSD - orderTotal - totals.changeGivenUSD);

      let amountPaidUSD = 0;
      let scopedPaidUSD = 0;
      let tendered = { cashTenderedUSD: 0, cashTenderedCOP: 0, cashTenderedBs: 0 };
      let change = { changeGivenUSD: 0, changeGivenCOP: 0, changeGivenBs: 0 };

      let selectedTotalUSD = 0;
      if (normalizedItemIds.length > 0) {
        const { rows: selectedItems } = await client.query(
          `SELECT id, price, quantity, is_paid_individually
           FROM order_items
           WHERE order_id = $1 AND id = ANY($2::text[])
           FOR UPDATE`,
          [id, normalizedItemIds]
        );
        if (selectedItems.length !== normalizedItemIds.length) {
          await client.query('ROLLBACK');
          client.release();
          client = null;
          return res.status(400).json({ error: 'Uno o más ítems no pertenecen a esta comanda.' });
        }
        const selectedTotalCOP = selectedItems.reduce(
          (total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0),
          0
        );
        selectedTotalUSD = copRate > 0 ? Number((selectedTotalCOP / copRate).toFixed(4)) : selectedTotalCOP;
        if (entryType === 'payment' && selectedItems.some((item) => item.is_paid_individually)) {
          await client.query('ROLLBACK');
          client.release();
          client = null;
          return res.status(409).json({ error: 'Uno o más ítems seleccionados ya fueron cobrados.' });
        }
        const scopedRows = paymentRows.filter((payment) => Array.isArray(payment.item_ids)
          && payment.item_ids.some((itemId) => normalizedItemIds.includes(itemId)));
        const scopedTotals = paymentHistoryTotals(scopedRows);
        scopedPaidUSD = scopedTotals.paidUSD;

        if (entryType === 'change') {
          pendingChangeUSD = Math.max(0, scopedTotals.tenderedUSD - selectedTotalUSD - scopedTotals.changeGivenUSD);
        }
      }

      if (entryType === 'payment') {
        const scopePendingDebtUSD = selectedTotalUSD > 0
          ? Math.max(0, selectedTotalUSD - scopedPaidUSD)
          : Math.max(0, orderTotal - totals.paidUSD);

        if (scopePendingDebtUSD <= 0.01) {
          await client.query('ROLLBACK');
          client.release();
          client = null;
          return res.status(409).json({ error: 'El monto a pagar para esta selección ya está cubierto. Registra únicamente el vuelto pendiente si aplica.' });
        }

        // El monto imputado al pago (principal) es el mínimo entre lo entregado (amountUSD) y la deuda pendiente.
        // En COP, si el cliente paga el monto comercial redondeado, cubre la totalidad de la deuda.
        if (currency === 'COP') {
          const directTargetCOP = selectedTotalUSD > 0
            ? (selectedTotalUSD * copRate)
            : (Number(order.total_cop) > 0 ? Number(order.total_cop) : (orderTotal * copRate));
          const roundedTargetCOP = roundCOPPayment(scopePendingDebtUSD * copRate);
          const isFullCoverage = localAmount >= (directTargetCOP - 10) || localAmount >= roundedTargetCOP || (localAmount / copRate) >= (scopePendingDebtUSD - 0.01);
          if (isFullCoverage) {
            amountPaidUSD = scopePendingDebtUSD;
          } else {
            amountPaidUSD = Math.min(scopePendingDebtUSD, localAmount / copRate);
          }
        } else {
          amountPaidUSD = Math.min(amountUSD, scopePendingDebtUSD);
        }
        tendered = paymentAmounts(localAmount, currency);
      } else {
        const copToleranceUSD = currency === 'COP' && copRate > 0 ? (1000 / copRate) : 0.01;
        if (amountUSD > pendingChangeUSD + copToleranceUSD) {
          await client.query('ROLLBACK');
          client.release();
          client = null;
          return res.status(400).json({ error: 'El vuelto excede el monto pendiente por entregar.' });
        }
        change = changeAmounts(localAmount, currency);
      }

      const paymentId = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await client.query(
        `INSERT INTO order_payments
          (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cash_tendered_cop, cash_tendered_bs, change_given_usd, change_given_cop, change_given_bs, item_ids, cop_rate, bs_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          paymentId, id, payerName || 'Cliente General', paymentMethod, amountPaidUSD,
          tendered.cashTenderedUSD, tendered.cashTenderedCOP, tendered.cashTenderedBs,
          change.changeGivenUSD, change.changeGivenCOP, change.changeGivenBs,
          normalizedItemIds, copRate, bsRate,
        ]
      );

      const paidAmountUSD = totals.paidUSD + amountPaidUSD;
      await client.query(
        `UPDATE orders SET payment_status = 'no_pagado', payment_method = $1, paid_amount_usd = $2,
          cop_rate_at_payment = $3, bs_rate_at_payment = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
        [paymentMethod, paidAmountUSD, copRate, bsRate, id]
      );

      if (entryType === 'payment' && normalizedItemIds.length > 0) {
        const newScopedPaidUSD = scopedPaidUSD + amountPaidUSD;
        // Solo marcar los ítems como pagados individualmente si la suma de pagos cubre la totalidad de los ítems seleccionados
        if (newScopedPaidUSD >= selectedTotalUSD - 0.01) {
          await client.query(
            `UPDATE order_items SET is_paid_individually = true, paid_by_name = $1 WHERE order_id = $2 AND id = ANY($3::text[])`,
            [payerName || 'Cliente General', id, normalizedItemIds]
          );
        }
      }

      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const updatedOrder = allOrders.find((currentOrder) => currentOrder.id === id);
      io.emit('orders:sync', allOrders);
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');
      return res.json(updatedOrder);
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al registrar movimiento de cobro:', error);
      return res.status(500).json({ error: 'No se pudo registrar el movimiento de cobro.' });
    }
  });

  router.post('/:id/finalize', requireRole('caja', 'admin'), async (req, res) => {
    const { id } = req.params;
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const { rows: orderRows } = await client.query('SELECT total_usd, status, shift, type, table_number FROM orders WHERE id = $1 FOR UPDATE', [id]);
      const order = orderRows[0];
      if (!order) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      assertPaymentOrderAccess(req.user, order);

      const { rows: paymentRows } = await client.query('SELECT * FROM order_payments WHERE order_id = $1', [id]);
      const totals = paymentHistoryTotals(paymentRows);
      const totalUSD = Number(order.total_usd) || 0;
      const pendingDebtUSD = Math.max(0, totalUSD - totals.paidUSD);
      const pendingChangeUSD = Math.max(0, totals.tenderedUSD - totalUSD - totals.changeGivenUSD);
      const hasCopPayment = paymentRows.some((p) => Number(p.cash_tendered_cop) > 0 || Number(p.change_given_cop) > 0);
      const copRateFinalize = Number(order.cop_rate_at_payment) || 3100;
      const copToleranceUSD = (hasCopPayment && copRateFinalize > 0) ? (1000 / copRateFinalize) : 0.05;
      const maxChangeToleranceUSD = Math.max(0.05, copToleranceUSD);

      if (pendingDebtUSD > 0.05 || pendingChangeUSD > maxChangeToleranceUSD) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: pendingDebtUSD > 0.05 ? 'Aún falta pago por registrar.' : 'Aún hay vuelto pendiente por entregar.',
          pendingDebtUSD,
          pendingChangeUSD,
        });
      }

      // Si la comanda es de mesa: se cierra automáticamente marcándola como 'entregada'
      // Para delivery y pickup se mantiene su estado actual y requiere confirmación manual
      const isMesa = order.type === 'mesa' || !order.type;
      const nextStatus = isMesa ? 'entregada' : (order.status || 'preparada');

      await client.query(
        `UPDATE orders SET payment_status = 'pagado', paid_amount_usd = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [Math.min(totals.paidUSD, totalUSD), nextStatus, id]
      );

      // Si es mesa, liberar la mesa en tables_config si no hay otras comandas activas
      if (isMesa && order.table_number) {
        const { rows: otherOrders } = await client.query(
          `SELECT id FROM orders WHERE type = 'mesa' AND table_number = $1 AND id != $2 AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito'`,
          [order.table_number, id]
        );
        if (otherOrders.length === 0) {
          await client.query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [order.table_number]);
        }
      }

      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = allOrders.find((currentOrder) => currentOrder.id === id);
      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');
      return res.json(updatedOrder);
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al finalizar comanda:', error);
      return res.status(500).json({ error: 'No se pudo finalizar la comanda.' });
    }
  });

  router.post('/:id/credit', requireRole('caja', 'admin'), async (req, res) => {
    const { id } = req.params;
    const { debtorName, notes } = req.body || {};

    if (!debtorName || typeof debtorName !== 'string' || !debtorName.trim() || debtorName.trim().toLowerCase() === 'cliente general') {
      return res.status(400).json({ error: 'El nombre del cliente o deudor es obligatorio para cerrar la cuenta a crédito.' });
    }

    const cleanDebtorName = debtorName.trim();
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      const order = orderRows[0];
      if (!order) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      assertPaymentOrderAccess(req.user, order);

      const { COP: copRate, Bs: bsRate } = await getRatesForShift(client, req.user.shift);
      const totalUSD = Number(order.total_usd) || 0;

      // Liberar mesa si corresponde antes de desligarla (las comandas a crédito no bloquean mesas)
      if (order.type === 'mesa' && order.table_number) {
        const { rows: otherOrders } = await client.query(
          `SELECT id FROM orders WHERE type = 'mesa' AND table_number = $1 AND id != $2 AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito'`,
          [order.table_number, id]
        );
        if (otherOrders.length === 0) {
          await client.query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [order.table_number]);
        }
      }

      await client.query(
        `UPDATE orders SET
          status = 'entregada',
          payment_status = 'credito',
          payment_method = 'Crédito',
          paid_amount_usd = $6,
          type = 'credito',
          table_number = NULL,
          customer_name = $1,
          cop_rate_at_payment = $2,
          bs_rate_at_payment = $3,
          notes = CASE WHEN notes IS NULL OR notes = '' THEN $4 ELSE notes || ' | ' || $4 END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [cleanDebtorName, copRate, bsRate, `Cuenta a Crédito: ${cleanDebtorName}${notes ? ' - ' + notes : ''}`, id, totalUSD]
      );

      const paymentId = `pm-cred-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await client.query(
        `INSERT INTO order_payments
          (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cash_tendered_cop, cash_tendered_bs, change_given_usd, change_given_cop, change_given_bs, item_ids, cop_rate, bs_rate)
         VALUES ($1, $2, $3, 'Crédito', $4, 0, 0, 0, 0, 0, 0, $5, $6, $7)`,
        [paymentId, id, cleanDebtorName, totalUSD, [], copRate, bsRate]
      );

      await client.query(
        `DELETE FROM caja_chica_transactions
         WHERE order_id = $1
           AND (description LIKE 'Cobro de comanda finalizada %' OR description LIKE 'Vuelto de comanda finalizada %')`,
        [id]
      );

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = allOrders.find((currentOrder) => currentOrder.id === id);
      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);
      io.emit('caja:updated');
      return res.json(updatedOrder);
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al cerrar comanda a crédito:', error);
      return res.status(500).json({ error: 'No se pudo cerrar la comanda a crédito.' });
    }
  });

  router.delete('/:id/payments/:paymentId', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { id, paymentId } = req.params;
      const client = await getClient();
      try {
        await client.query('BEGIN');
        const { rows: orderRows } = await client.query(
          `SELECT id, total_usd, shift FROM orders WHERE id = $1 FOR UPDATE`,
          [id]
        );
        const order = orderRows[0];
        assertPaymentOrderAccess(req.user, order);
        const { rows: paymentRows } = await client.query(
          `SELECT item_ids, amount_paid_usd FROM order_payments WHERE id = $1 AND order_id = $2 FOR UPDATE`,
          [paymentId, id]
        );
        if (!paymentRows[0]) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(404).json({ error: 'Registro de pago no encontrado.' });
        }

        await client.query(`DELETE FROM order_payments WHERE id = $1 AND order_id = $2`, [paymentId, id]);
        await client.query(`DELETE FROM caja_chica_transactions WHERE order_id = $1 AND description LIKE $2`, [id, `%[${paymentId}]%`]);

        const { rows: remainingPayments } = await client.query(`SELECT * FROM order_payments WHERE order_id = $1`, [id]);
        const remainingTotals = paymentHistoryTotals(remainingPayments);
        const newPaid = remainingTotals.paidUSD;

        const total = parseFloat(order.total_usd || 0);
        const pendingDebtUSD = Math.max(0, total - newPaid);
        const pendingChangeUSD = Math.max(0, remainingTotals.tenderedUSD - total - remainingTotals.changeGivenUSD);
        const newStatus = pendingDebtUSD <= 0.05 && pendingChangeUSD <= 0.05 ? 'pagado' : 'no_pagado';

        await client.query(`UPDATE orders SET paid_amount_usd = $1, payment_status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [newPaid, newStatus, id]);

        if (Number(paymentRows[0].amount_paid_usd) > 0 && Array.isArray(paymentRows[0].item_ids) && paymentRows[0].item_ids.length > 0) {
          await client.query(
            `UPDATE order_items SET is_paid_individually = false, paid_by_name = NULL WHERE order_id = $1 AND id = ANY($2::text[])`,
            [id, paymentRows[0].item_ids]
          );
          const { rows: remainingItemPayments } = await client.query(
            `SELECT payer_name, item_ids FROM order_payments WHERE order_id = $1 AND cardinality(item_ids) > 0`,
            [id]
          );
          for (const payment of remainingItemPayments) {
            await client.query(
              `UPDATE order_items SET is_paid_individually = true, paid_by_name = $1 WHERE order_id = $2 AND id = ANY($3::text[])`,
              [payment.payer_name || 'Cliente General', id, payment.item_ids]
            );
          }
        }
        await postCompletedOrderCashMovements(client, id);
        await client.query('COMMIT');
        client.release();
      } catch (e) {
        await client.query('ROLLBACK');
        if (client) client.release();
        throw e;
      }

      const allOrders = await fetchAllOrders(req.user);
      const updatedOrder = allOrders.find((o) => o.id === id);
      io.emit('orders:sync', allOrders);
      io.emit('caja:updated');
      res.json(updatedOrder);
    } catch (err) {
      console.error('Error al eliminar movimiento de pago:', err);
      res.status(500).json({ error: 'Error al eliminar pago' });
    }
  });

  router.post('/:id/pay', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        paymentMethod, amountUSD, amountCOP, splitPayments, payerName,
        cashTenderedUSD, cashTenderedCOP, cashTenderedBs,
        changeGivenUSD, changeGivenCOP, changeGivenBs,
        itemIds, isDraft
      } = req.body;
      
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const { rows: existingRows } = await client.query(
          `SELECT id, payment_status, order_number, type, total_usd, paid_amount_usd, shift FROM orders WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!existingRows[0]) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(404).json({ error: 'Comanda no encontrada' });
        }

        const order = existingRows[0];
        assertPaymentOrderAccess(req.user, order);
        const currentPaid = parseFloat(order.paid_amount_usd || 0);
        const orderTotal = parseFloat(order.total_usd || 0);

        if (order.payment_status === 'pagado') {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({ error: 'Esta comanda ya fue cobrada totalmente.' });
        }

        const { rows: individualPaymentRows } = await client.query(
          `SELECT 1 FROM order_payments WHERE order_id = $1 AND cardinality(item_ids) > 0 LIMIT 1`,
          [id]
        );
        if (individualPaymentRows.length > 0 && (!Array.isArray(itemIds) || itemIds.length === 0)) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({ error: 'Esta comanda ya tiene pagos por persona. Registra los movimientos restantes desde Pagar por personas.' });
        }

        const { COP: currentCopRate, Bs: currentBsRate } = await getRatesForShift(client, req.user.shift);

        const payAmount = amountUSD !== undefined ? parseFloat(amountUSD) : (orderTotal - currentPaid);
        const totalTenderedVal = (parseFloat(cashTenderedUSD) || 0) + (parseFloat(cashTenderedCOP) || 0) + (parseFloat(cashTenderedBs) || 0);
        const totalChangeVal = (parseFloat(changeGivenUSD) || 0) + (parseFloat(changeGivenCOP) || 0) + (parseFloat(changeGivenBs) || 0);

        if (!Number.isFinite(payAmount) || !Number.isFinite(totalTenderedVal) || !Number.isFinite(totalChangeVal)
          || payAmount <= 0 || totalTenderedVal < 0 || totalChangeVal < 0) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ error: 'El monto del movimiento debe ser mayor a $0.00 USD' });
        }
        if (payAmount > (orderTotal - currentPaid) + 0.01) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ error: 'El pago no puede exceder la deuda pendiente de la comanda.' });
        }
        
        const newPaidAmount = currentPaid + payAmount;
        const isFullyPaid = newPaidAmount >= orderTotal - 0.01;
        const finalMethod = paymentMethod || (splitPayments?.length > 1 ? 'Mixto' : 'Efectivo USD');
        const activePayerName = payerName || 'Cliente General';

        await client.query(
          `UPDATE orders SET
            payment_status = $1, payment_method = $2, paid_amount_usd = $3,
            cop_rate_at_payment = $4, bs_rate_at_payment = $5, updated_at = CURRENT_TIMESTAMP
           WHERE id = $6`,
          [(isFullyPaid && !isDraft) ? 'pagado' : 'no_pagado', finalMethod, newPaidAmount, currentCopRate, currentBsRate, id]
        );

        if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
          await client.query(
            `UPDATE order_items SET is_paid_individually = true, paid_by_name = $1 WHERE id = ANY($2::text[])`,
            [activePayerName, itemIds]
          );
        }

        const pmId = `pm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(
          `INSERT INTO order_payments
            (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cash_tendered_cop, cash_tendered_bs, change_given_usd, change_given_cop, change_given_bs, item_ids, cop_rate, bs_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            pmId, id, activePayerName, finalMethod, payAmount,
            parseFloat(cashTenderedUSD) || 0, parseFloat(cashTenderedCOP) || 0, parseFloat(cashTenderedBs) || 0,
            parseFloat(changeGivenUSD) || 0, parseFloat(changeGivenCOP) || 0, parseFloat(changeGivenBs) || 0,
            itemIds || [], currentCopRate, currentBsRate,
          ]
        );

        await postCompletedOrderCashMovements(client, id);

        await client.query('COMMIT');
        client.release();
      } catch (txErr) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch(e){}
          client.release();
        }
        throw txErr;
      }

      const allOrders = await fetchAllOrders(req.user);
      const updatedOrder = allOrders.find((o) => o.id === id);

      io.emit('order:paid', updatedOrder);
      io.emit('orders:sync', allOrders);
      io.emit('caja:updated');

      res.json(updatedOrder);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al registrar cobro de comanda' });
    }
  });

  return router;
};
