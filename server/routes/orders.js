const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db');
const { fetchAllOrders, fetchAllTables, safeJsonParse, safeJsonParseObj } = require('../helpers/fetchAll');
const { postCompletedOrderCashMovements } = require('../helpers/cashLedger');
const { requireRole } = require('../helpers/sessionAuth');
const { assertShiftAccess } = require('../helpers/shiftScope');
const { getRatesForShift } = require('../helpers/exchangeRates');
const { printKitchenTicket, printKitchenAdditionTicket, printReceiptTicket, isKitchenItem } = require('../helpers/thermalPrinter');

async function assertOrderAccess(executor, user, orderId) {
  const { rows } = await executor.query(`SELECT shift FROM orders WHERE id = $1`, [orderId]);
  if (!rows[0]) {
    const error = new Error('Comanda no encontrada.');
    error.statusCode = 404;
    throw error;
  }
  assertShiftAccess(user, rows[0].shift);
}

module.exports = function(io) {
  router.delete('/purge-all', requireRole('admin'), async (req, res) => {
    try {
      const pgTables = [
        'order_payments',
        'order_items',
        'order_edits',
        'orders',
        'caja_chica_transactions',
        'caja_chica_cierres',
        'caja_chica_apertura',
        'exchange_rate_history',
      ];
      for (const t of pgTables) {
        await query(`TRUNCATE TABLE ${t} CASCADE`);
      }
      await query("UPDATE tables_config SET status = 'libre'");
      io.emit('orders:sync', []);
      io.emit('tables:sync', await fetchAllTables());
      io.emit('caja:updated');
      res.json({ message: 'Todos los datos de comandas, pagos, caja y mesas han sido purgados exitosamente.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al purgar los datos del sistema' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const orders = await fetchAllOrders(req.user);
      res.json(orders);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener comandas' });
    }
  });

  router.post('/', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { type, tableNumber, customerName, kitchenNotes, items, totalUSD, deliveryFeeUSD, totalCOP, deliveryFeeCOP, targetPrinter } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La comanda debe incluir al menos un ítem.' });
      }

      const rawDeliveryCOP = Number(deliveryFeeCOP !== undefined ? deliveryFeeCOP : (deliveryFeeUSD || 0));

      if (type === 'delivery') {
        if (!customerName || !customerName.trim()) {
          return res.status(400).json({ error: 'Para órdenes Delivery es obligatorio ingresar el nombre del cliente.' });
        }
        if (rawDeliveryCOP <= 0) {
          return res.status(400).json({ error: 'Para órdenes Delivery es obligatorio ingresar el monto del servicio de delivery mayor a 0 COP.' });
        }
      }

      if (type === 'pickup') {
        if (!customerName || !customerName.trim()) {
          return res.status(400).json({ error: 'Para órdenes PickUp / Para Llevar es obligatorio ingresar el nombre o referencia del cliente.' });
        }
      }

      client = await getClient();
      await client.query('BEGIN');
      const orderId = `ord-${Date.now()}`;

      let nextNum = 1;
      try {
        const maxRes = await client.query(
          `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '') AS INTEGER)), 0) AS max_num FROM orders WHERE archived_at IS NULL`
        );
        nextNum = 1 + parseInt(maxRes.rows[0]?.max_num || '0', 10);
      } catch (e) {
        const countRes = await client.query(`SELECT COUNT(*) FROM orders WHERE archived_at IS NULL`);
        nextNum = 1 + parseInt(countRes.rows[0]?.count || '0', 10);
      }
      const orderNumber = `#${nextNum}`;

      const isPickupOrDelivery = type === 'delivery' || type === 'pickup';
      const requiresKitchen = isPickupOrDelivery || (items || []).some(it => isKitchenItem(it));
      const initialStatus = requiresKitchen ? 'en_preparacion' : 'preparada';

      const ratesRes = await client.query(`SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = 'ambos' LIMIT 1`);
      const currentCopRate = Number(ratesRes.rows[0]?.cop_rate || 3100);
      const currentBsRate = Number(ratesRes.rows[0]?.bs_rate || 3.2);

      const computedTotalCOP = Number(totalCOP !== undefined ? totalCOP : (totalUSD || 0));
      const computedTotalUSD = currentCopRate > 0 ? Number((computedTotalCOP / currentCopRate).toFixed(2)) : computedTotalCOP;
      const computedDeliveryCOP = rawDeliveryCOP;
      const computedDeliveryUSD = currentCopRate > 0 ? Number((computedDeliveryCOP / currentCopRate).toFixed(2)) : computedDeliveryCOP;

      console.log(`📝 [COMANDA RECIBIDA] ${orderNumber} (${(type || 'mesa').toUpperCase()}) | Cliente: ${customerName || 'N/A'} | Items: ${items?.length || 0} | Total: ${computedTotalCOP.toLocaleString('es-CO')} COP ($${computedTotalUSD} USD) | Requiere Cocina: ${requiresKitchen}`);

      await client.query(
        `INSERT INTO orders (id, order_number, type, table_number, customer_name, kitchen_notes, status, payment_status, total_usd, total_cop, waiter_name, shift, delivery_fee_usd, delivery_fee_cop, cop_rate_at_payment, bs_rate_at_payment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'no_pagado', $8, $9, 'Mesero', 'ambos', $10, $11, $12, $13)`,
        [orderId, orderNumber, type || 'mesa', tableNumber || null, customerName || null, kitchenNotes || null, initialStatus, computedTotalUSD, computedTotalCOP, computedDeliveryUSD, computedDeliveryCOP, currentCopRate, currentBsRate]
      );

      for (const item of items) {
        const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, is_delivery, notes, drink_type, category, proteins, is_cut, cut_preference, flavor)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [
            itemId,
            orderId,
            item.productId || 'prod-custom',
            item.productName || 'Producto',
            item.price || 0,
            item.quantity || 1,
            item.size || 'Grande',
            !!item.isHalfHalf,
            JSON.stringify(item.halfDetails || null),
            item.removedIngredients || [],
            JSON.stringify(item.extras || []),
            item.sugarPreference || null,
            !!item.isTakeaway,
            !!(item.isDelivery || item.is_delivery),
            item.notes || '',
            item.drinkType || item.drink_type || null,
            item.category || null,
            item.proteins || [],
            !!(item.isCut || item.is_cut || item.cutPreference === 'Picada'),
            item.cutPreference || item.cut_preference || (item.isCut ? 'Picada' : 'Entera'),
            item.flavor || null,
          ]
        );
      }

      if (type === 'mesa' && tableNumber) {
        await client.query("UPDATE tables_config SET status = 'ocupada' WHERE number = $1", [tableNumber]);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const createdOrder = allOrders.find((o) => o.id === orderId) || {
        id: orderId,
        orderNumber,
        type,
        tableNumber,
        customerName,
        kitchenNotes,
        status: initialStatus,
        paymentStatus: 'no_pagado',
        totalUSD,
        deliveryFeeUSD,
        shift: req.user.shift || 'ambos',
        createdAt: new Date().toISOString(),
        items: items || []
      };

      io.emit('order:created', createdOrder);
      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);

      console.log(`✅ [COMANDA REGISTRADA OK] ${createdOrder.orderNumber} enviada a WebSocket`);
      if (requiresKitchen && targetPrinter !== 'ninguna') {
        void printKitchenTicket(createdOrder, targetPrinter || 'cocina', io)
          .then((result) => {
            if (result.fallback) {
              console.log(`🚨 [RESPALDO EN CAJA] Comanda ${createdOrder.orderNumber} impresa en CAJA con alerta para cocina`);
            } else if (result.printed) {
              console.log(`🖨️ [COMANDA IMPRESA] ${createdOrder.orderNumber} en ${targetPrinter || 'cocina'} (${result.copies} copia${result.copies === 1 ? '' : 's'})`);
            }
          })
          .catch((printError) => {
            console.error(`⚠️ [IMPRESIÓN PENDIENTE] ${createdOrder.orderNumber}: ${printError.message}`);
            io.emit('order:print_failed', {
              orderId: createdOrder.id,
              orderNumber: createdOrder.orderNumber,
              message: printError.message,
            });
          });
      }
      res.status(201).json(createdOrder);
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('❌ Error general al crear comanda:', err);
      res.status(500).json({ error: 'Error al crear la comanda en el servidor' });
    }
  });

  router.patch('/:id/status', requireRole('cocina', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!['en_preparacion', 'preparada', 'entregada', 'cancelado'].includes(status)) {
        return res.status(400).json({ error: 'El estado de comanda no es válido.' });
      }

      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);
      const { rows } = await client.query(
        `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      if (status === 'entregada') {
        const { rows: ordRows } = await client.query('SELECT table_number, type FROM orders WHERE id = $1', [id]);
        if (ordRows[0]?.type === 'mesa' && ordRows[0]?.table_number) {
          const { rows: otherOrders } = await client.query(
            `SELECT id FROM orders WHERE type = 'mesa' AND table_number = $1 AND id != $2 AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL`,
            [ordRows[0].table_number, id]
          );
          if (otherOrders.length === 0) {
            await client.query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [ordRows[0].table_number]);
          }
        }
      }

      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = allOrders.find((o) => o.id === id);

      io.emit('order:status_updated', updatedOrder);
      
      if (status === 'preparada') {
        io.emit('order:prepared_sound', updatedOrder);
      }

      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');

      res.json(updatedOrder);
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar estado de comanda' });
    }
  });

  router.delete('/:id', requireRole('caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, table_number, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const order = orderRows[0];

      // 1. Eliminar transacciones de caja chica vinculadas a la comanda
      await client.query(`DELETE FROM caja_chica_transactions WHERE order_id = $1`, [id]);

      // 2. Eliminar auditorías de edición
      await client.query(`DELETE FROM order_edits WHERE order_id = $1`, [id]);

      // 3. Eliminar pagos de la comanda
      await client.query(`DELETE FROM order_payments WHERE order_id = $1`, [id]);

      // 4. Eliminar ítems de la comanda
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);

      // 5. Eliminar la comanda de la tabla orders
      await client.query(`DELETE FROM orders WHERE id = $1`, [id]);

      // 6. Liberar la mesa si corresponde
      if (order.table_number) {
        await client.query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [order.table_number]);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables();

      io.emit('order:deleted', { id, orderNumber: order.order_number });
      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);
      io.emit('caja:updated');

      console.log(`🗑️ [COMANDA ANULADA/ELIMINADA] ${order.order_number} (${id}) eliminada completamente del sistema por ${req.user.username}`);
      res.json({ success: true, message: `Comanda ${order.order_number} eliminada del sistema.`, deletedId: id });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al anular/eliminar comanda:', err);
      res.status(500).json({ error: 'Error al anular la comanda en el servidor: ' + (err.message || err) });
    }
  });

  router.patch('/:id/cancel', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;

      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);
      const { rows } = await client.query(
        `UPDATE orders SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
        [id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const cancelledOrder = allOrders.find((o) => o.id === id);

      io.emit('order:cancelled', cancelledOrder);
      io.emit('order:cancelled_sound', cancelledOrder);
      io.emit('orders:sync', allOrders);
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');

      console.log(`🚫 [COMANDA CANCELADA] ${cancelledOrder?.orderNumber || id} - Alerta sonora enviada a Cocina`);
      res.json({ success: true, order: cancelledOrder });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al cancelar comanda:', err);
      res.status(500).json({ error: 'Error al cancelar la comanda' });
    }
  });

  router.patch('/:id/edit', requireRole('caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { items, kitchenNotes, totalUSD, deliveryFeeUSD, customerName, tableNumber, type, paymentStatus } = req.body;
      if (req.user.role !== 'admin' && req.user.role !== 'caja') return res.status(403).json({ error: 'Solo un administrador o usuario de caja puede editar una comanda.' });

      client = await getClient();
      await client.query('BEGIN');

      await assertOrderAccess({ query: (text, params) => client.query(text, params) }, req.user, id);

      const { rows: orderRows } = await client.query(
        `SELECT id, paid_amount_usd FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!orderRows[0]) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      if (Array.isArray(items)) {
        const { rows: paymentRows } = await client.query(
          `SELECT id FROM order_payments WHERE order_id = $1 LIMIT 1`,
          [id]
        );
        if (paymentRows.length > 0 || Number(orderRows[0].paid_amount_usd) > 0) {
          await client.query('ROLLBACK');
          client.release();
          client = null;
          return res.status(409).json({ error: 'Anula primero todos los pagos y vueltos antes de modificar los productos de la comanda.' });
        }
      }

      const ratesRes = await client.query(`SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = 'ambos' LIMIT 1`);
      const currentCopRate = Number(ratesRes.rows[0]?.cop_rate || 3100);

      let computedTotalCOP = req.body.totalCOP;
      let computedTotalUSD = totalUSD;
      let computedDeliveryCOP = req.body.deliveryFeeCOP;
      let computedDeliveryUSD = deliveryFeeUSD;

      if (items && Array.isArray(items)) {
        const itemsTotalCOP = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
        let delivCOP = 0;
        if (computedDeliveryCOP !== undefined && Number(computedDeliveryCOP) >= 0) {
          delivCOP = Number(computedDeliveryCOP);
        } else if (computedDeliveryUSD !== undefined && Number(computedDeliveryUSD) > 0) {
          delivCOP = Number(computedDeliveryUSD) >= 100 ? Number(computedDeliveryUSD) : Math.round(Number(computedDeliveryUSD) * currentCopRate);
        }
        computedTotalCOP = Math.round(itemsTotalCOP + delivCOP);
        computedTotalUSD = currentCopRate > 0 ? Number((computedTotalCOP / currentCopRate).toFixed(2)) : computedTotalCOP;
        computedDeliveryCOP = delivCOP;
        computedDeliveryUSD = currentCopRate > 0 ? Number((delivCOP / currentCopRate).toFixed(2)) : delivCOP;
      } else if (computedTotalCOP !== undefined && currentCopRate > 0) {
        computedTotalUSD = Number((Number(computedTotalCOP) / currentCopRate).toFixed(2));
      } else if (computedTotalUSD !== undefined && computedTotalUSD > 500) {
        computedTotalCOP = Number(computedTotalUSD);
        computedTotalUSD = currentCopRate > 0 ? Number((computedTotalCOP / currentCopRate).toFixed(2)) : computedTotalCOP;
      }

      await client.query(
        `UPDATE orders SET 
           kitchen_notes = COALESCE($1, kitchen_notes), 
           total_usd = COALESCE($2, total_usd), 
           total_cop = COALESCE($3, total_cop),
           delivery_fee_usd = COALESCE($4, delivery_fee_usd),
           delivery_fee_cop = COALESCE($5, delivery_fee_cop),
           customer_name = COALESCE($6, customer_name),
           table_number = COALESCE($7, table_number),
           type = COALESCE($8, type),
           payment_status = COALESCE($9, payment_status),
           is_edited = true, 
           updated_at = CURRENT_TIMESTAMP 
         WHERE id = $10`,
        [kitchenNotes ?? null, computedTotalUSD ?? null, computedTotalCOP ?? null, computedDeliveryUSD ?? null, computedDeliveryCOP ?? null, customerName ?? null, tableNumber ?? null, type ?? null, paymentStatus ?? null, id]
      );

      if (items && Array.isArray(items)) {
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);

        for (const item of items) {
          const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, is_delivery, is_new_or_modified, notes, drink_type, category, proteins, is_cut, cut_preference, flavor)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
            [
              itemId,
              id,
              item.productId || 'prod-custom',
              item.productName || 'Producto',
              item.price || 0,
              item.quantity || 1,
              item.size || 'Grande',
              !!item.isHalfHalf,
              JSON.stringify(item.halfDetails || null),
              item.removedIngredients || [],
              JSON.stringify(item.extras || []),
              item.sugarPreference || null,
              !!item.isTakeaway,
              !!(item.isDelivery || item.is_delivery),
              item.isNewOrModified !== false,
              item.notes || '',
              item.drinkType || item.drink_type || null,
              item.category || null,
              item.proteins || [],
              !!(item.isCut || item.is_cut || item.cutPreference === 'Picada'),
              item.cutPreference || item.cut_preference || (item.isCut ? 'Picada' : 'Entera'),
              item.flavor || null,
            ]
          );
        }
      }

      // Registrar edición en historial
      const editDetails = [];
      if (items && Array.isArray(items)) editDetails.push('Productos modificados');
      if (kitchenNotes !== undefined) editDetails.push('Notas de cocina actualizadas');
      if (totalUSD !== undefined) editDetails.push(`Total actualizado a $${totalUSD}`);
      if (customerName !== undefined) editDetails.push(`Cliente: ${customerName}`);
      if (tableNumber !== undefined) editDetails.push(`Mesa: ${tableNumber}`);
      if (type !== undefined) editDetails.push(`Tipo: ${type}`);
      if (deliveryFeeUSD !== undefined) editDetails.push(`Delivery fee: $${deliveryFeeUSD}`);
      const editId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      try {
        const { rows: orderForEdit } = await client.query(`SELECT order_number FROM orders WHERE id = $1`, [id]);
        await client.query(
          `INSERT INTO order_edits (id, order_id, order_number, edited_by, edit_type, edit_details) VALUES ($1, $2, $3, $4, $5, $6)`,
          [editId, id, orderForEdit[0]?.order_number || '', req.user.username, 'modificacion', editDetails.join('; ') || 'Edición general']
        );
      } catch (editErr) {
        console.warn('Aviso: No se pudo registrar edición en historial:', editErr.message);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const updatedOrder = allOrders.find((o) => o.id === id);

      io.emit('order:edited', updatedOrder);
      io.emit('orders:sync', allOrders);

      console.log(`✏️ [COMANDA EDITADA] ${updatedOrder?.orderNumber} actualizada`);
      res.json(updatedOrder);
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        try { client.release(); } catch (_) {}
      }
      console.error('Error al editar comanda:', err);
      res.status(500).json({ error: 'Error al editar la comanda' });
    }
  });

  router.post('/:id/reopen', requireRole('cocina', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;

      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, type, table_number, payment_status, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const ord = orderRows[0];

      const isCreditOrder = ord.payment_status === 'credito' || ord.type === 'credito';

      if (isCreditOrder) {
        // Al reactivar una comanda que estaba a crédito, su tipo pasa a ser 'credito' permanente sin ocupar mesa física
        await client.query(
          `UPDATE orders SET
            status = 'preparada',
            payment_status = 'no_pagado',
            type = 'credito',
            table_number = NULL,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );
      } else {
        await client.query(
          `UPDATE orders SET
            status = 'preparada',
            payment_status = 'no_pagado',
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );

        // Si es comanda de mesa normal, marcar la mesa como ocupada
        if (ord.type === 'mesa' && ord.table_number) {
          await client.query(`UPDATE tables_config SET status = 'ocupada' WHERE number = $1`, [ord.table_number]);
        }
      }

      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const updatedOrdersList = await fetchAllOrders(req.user);
      const updatedTablesList = await fetchAllTables(req.user);
      const updatedTarget = updatedOrdersList.find((o) => o.id === id);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('tables:sync', updatedTablesList);
      if (updatedTarget) {
        io.emit('order:status_updated', updatedTarget);
      }
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');

      console.log(`🔄 [REAPERTURA DE COMANDA] Comanda ${ord.order_number || id} reactivada exitosamente por ${req.user.username}`);
      res.json(updatedTarget || { success: true });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al reabrir comanda:', err);
      res.status(500).json({ error: 'Error interno al reabrir la comanda' });
    }
  });

  router.post('/merge', requireRole('admin'), async (req, res) => {
    try {
      const { targetOrderId, sourceOrderIds } = req.body;

      if (!targetOrderId || !sourceOrderIds || !Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) {
        return res.status(400).json({ error: 'Debe especificar la comanda principal y las comandas a fusionar.' });
      }

      let mergedOrderNumber = '';
      const allOrders = await fetchAllOrders();
      const targetOrder = allOrders.find((o) => o.id === targetOrderId);
      if (!targetOrder) {
        return res.status(404).json({ error: 'Comanda principal no encontrada.' });
      }

      const sourceOrders = allOrders.filter((o) => sourceOrderIds.includes(o.id));
      if (sourceOrders.length !== sourceOrderIds.length || sourceOrderIds.includes(targetOrderId)) {
        return res.status(403).json({ error: 'Solo puedes fusionar comandas distintas y accesibles en tu turno.' });
      }
      const allInvolved = [targetOrder, ...sourceOrders];

      const hasAnyPayment = allInvolved.some(
        (o) => (o.paidAmountUSD || 0) > 0 || o.paymentStatus === 'pagado' || (o.paymentHistory && o.paymentHistory.length > 0)
      );

      if (hasAnyPayment) {
        return res.status(400).json({
          error: 'No se pueden unificar comandas que ya tengan abonos o estén pagadas. La única forma de unificar comandas es si ninguna tiene pagos registrados.'
        });
      }
      mergedOrderNumber = targetOrder.orderNumber;
      const sourceNumbers = sourceOrders.map((o) => o.orderNumber).join(', ');

      await query(`UPDATE order_payments SET order_id = $1 WHERE order_id = ANY($2::text[])`, [targetOrderId, sourceOrderIds]);
      await query(`UPDATE order_items SET order_id = $1 WHERE order_id = ANY($2::text[])`, [targetOrderId, sourceOrderIds]);

      const { rows: ratesRows } = await query(`SELECT cop_rate FROM shift_exchange_rates WHERE shift = 'ambos' LIMIT 1`);
      const currentCopRate = Number(ratesRows[0]?.cop_rate || 3100);

      const { rows: allTargetItems } = await query(`SELECT price, quantity FROM order_items WHERE order_id = $1`, [targetOrderId]);
      let itemsTotalCOP = 0;
      for (const it of allTargetItems) {
        const itemPrice = parseFloat(it.price || 0);
        const qty = parseInt(it.quantity) || 1;
        itemsTotalCOP += itemPrice * qty;
      }

      const totalDeliveryFeeCOP = allInvolved.reduce((sum, o) => {
        const dCop = parseFloat(o.deliveryFeeCOP || o.delivery_fee_cop || 0);
        const dUsd = parseFloat(o.deliveryFeeUSD || o.delivery_fee_usd || 0);
        if (dCop > 0) return sum + dCop;
        if (dUsd >= 100) return sum + dUsd;
        return sum + Math.round(dUsd * currentCopRate);
      }, 0);

      const newTotalCOP = Math.round(itemsTotalCOP + totalDeliveryFeeCOP);
      const newTotalUSD = currentCopRate > 0 ? Number((newTotalCOP / currentCopRate).toFixed(2)) : newTotalCOP;
      const totalDeliveryFeeUSD = currentCopRate > 0 ? Number((totalDeliveryFeeCOP / currentCopRate).toFixed(2)) : totalDeliveryFeeCOP;

      const { rows: sumPayments } = await query(`SELECT COALESCE(SUM(amount_paid_usd), 0) as paid FROM order_payments WHERE order_id = $1`, [targetOrderId]);
      const newPaidUSD = parseFloat(sumPayments[0]?.paid || 0);
      const newPaymentStatus = newPaidUSD >= (newTotalUSD - 0.01) ? 'pagado' : 'no_pagado';

      const updatedNotes = `${targetOrder.kitchenNotes || ''} (Fusionada con comandas ${sourceNumbers})`.trim();
      await query(
        `UPDATE orders SET total_usd = $1, total_cop = $2, paid_amount_usd = $3, payment_status = $4, kitchen_notes = $5, merged_from_orders = $6, delivery_fee_usd = $7, delivery_fee_cop = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9`,
        [newTotalUSD, newTotalCOP, newPaidUSD, newPaymentStatus, updatedNotes, sourceOrders.map((o) => o.orderNumber), totalDeliveryFeeUSD, totalDeliveryFeeCOP, targetOrderId]
      );

      await query(
        `UPDATE orders SET status = 'fusionada', kitchen_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2::text[])`,
        [`Fusionada en Comanda ${targetOrder.orderNumber}`, sourceOrderIds]
      );

      const updatedOrdersList = await fetchAllOrders(req.user);
      const updatedTarget = updatedOrdersList.find((o) => o.id === targetOrderId);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('order:status_updated', updatedTarget);

      console.log(`🔗 [FUSIÓN DE COMANDAS] Comandas ${sourceNumbers} unificadas en Comanda ${mergedOrderNumber}`);
      res.json(updatedTarget);
    } catch (err) {
      console.error('Error al fusionar comandas:', err);
      res.status(500).json({ error: 'Error al fusionar comandas' });
    }
  });

  // Imprimir comanda completa / pre-cuenta en impresora térmica
  router.post('/:id/print-receipt', async (req, res) => {
    try {
      const { id } = req.params;
      const { targetPrinter = 'caja' } = req.body || {};
      const allOrders = await fetchAllOrders(req.user);
      const targetOrder = allOrders.find((o) => o.id === id);

      if (!targetOrder) {
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      // Obtener tasas del sistema / turno (o priorizar las recibidas desde el cliente POS)
      let rates = req.body.rates;
      if (!rates || !rates.COP || !rates.Bs) {
        const orderShift = targetOrder.shift || req.user?.shift || 'manana';
        rates = await getRatesForShift({ query }, orderShift);
      }

      const result = await printReceiptTicket(targetOrder, rates, targetPrinter);
      console.log(`🧾 [PRE-CUENTA IMPRESA] Comanda #${targetOrder.orderNumber} ➔ Destino: ${targetPrinter.toUpperCase()} | Tasas: COP ${rates.COP}, Bs ${rates.Bs}`);
      res.json({ success: true, printed: result.printed, copies: result.copies, results: result.results });
    } catch (err) {
      console.error('Error al imprimir pre-cuenta térmica:', err);
      res.status(500).json({ error: err.message || 'Error al imprimir ticket' });
    }
  });

  // Cambiar mesa de una comanda de salón
  router.patch('/:id/change-table', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { newTableNumber } = req.body;
      const parsedTableNumber = parseInt(newTableNumber, 10);

      if (!parsedTableNumber || parsedTableNumber <= 0) {
        return res.status(400).json({ error: 'Debe especificar un número de mesa válido.' });
      }

      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (!orderRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const order = orderRows[0];
      assertShiftAccess(req.user, order.shift);

      if (order.type !== 'mesa') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Solo se puede cambiar la mesa a comandas de salón (tipo mesa).' });
      }

      const oldTableNumber = order.table_number;
      if (oldTableNumber === parsedTableNumber) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'La comanda ya se encuentra en la mesa seleccionada.' });
      }

      // Actualizar mesa en la orden
      await client.query('UPDATE orders SET table_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        parsedTableNumber,
        id
      ]);

      // Marcar nueva mesa como ocupada
      await client.query("UPDATE tables_config SET status = 'ocupada' WHERE number = $1", [parsedTableNumber]);

      // Verificar si la mesa anterior todavía tiene otras órdenes activas
      if (oldTableNumber) {
        const { rows: otherOrders } = await client.query(
          "SELECT id FROM orders WHERE table_number = $1 AND id != $2 AND status NOT IN ('cancelado', 'fusionada') AND payment_status != 'pagado' AND archived_at IS NULL",
          [oldTableNumber, id]
        );
        if (otherOrders.length === 0) {
          await client.query("UPDATE tables_config SET status = 'libre' WHERE number = $1", [oldTableNumber]);
        }
      }

      await client.query('COMMIT');

      const updatedOrdersList = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = updatedOrdersList.find((o) => o.id === id);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('tables:sync', allTables);
      io.emit('order:status_updated', updatedOrder);

      console.log(`🔄 [CAMBIO DE MESA] Comanda #${order.order_number} reubicada: Mesa #${oldTableNumber} ➔ Mesa #${parsedTableNumber}`);
      res.json(updatedOrder);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('Error al cambiar mesa:', err);
      res.status(500).json({ error: err.message || 'Error al cambiar mesa' });
    } finally {
      if (client) client.release();
    }
  });

  // Transferir o cambiar servicio / mesa de una comanda (Mesa <-> PickUp <-> Delivery)
  router.patch('/:id/transfer-service', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { action, newTableNumber, customerName, deliveryFeeUSD, selectedItemIds } = req.body;

      if (!action || !['change-table', 'to-mesa', 'to-delivery', 'to-pickup', 'assign-delivery-items'].includes(action)) {
        return res.status(400).json({ error: 'Acción de transferencia no válida.' });
      }

      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (!orderRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const order = orderRows[0];
      assertShiftAccess(req.user, order.shift);

      if (order.status === 'cancelado' || order.status === 'fusionada') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No se puede modificar una comanda cancelada o fusionada.' });
      }

      const oldTableNumber = order.table_number;

      const { rows: ratesRows } = await client.query(`SELECT cop_rate FROM shift_exchange_rates WHERE shift = 'ambos' LIMIT 1`);
      const currentCopRate = Number(ratesRows[0]?.cop_rate || 3100);

      // Obtener subtotal real de los ítems actuales
      const { rows: itemsRows } = await client.query(
        'SELECT price, quantity FROM order_items WHERE order_id = $1',
        [id]
      );
      let itemsSubtotalCOP = 0;
      for (const it of itemsRows) {
        const p = Number(it.price) || 0;
        itemsSubtotalCOP += p * (Number(it.quantity) || 1);
      }
      itemsSubtotalCOP = Math.round(itemsSubtotalCOP);

      if (action === 'change-table' || action === 'to-mesa') {
        const parsedTable = parseInt(newTableNumber, 10);
        if (!parsedTable || parsedTable <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Debe seleccionar una mesa válida.' });
        }
        if (action === 'change-table' && oldTableNumber === parsedTable) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'La comanda ya está en esa mesa.' });
        }

        // Mantener delivery_fee si la comanda tiene ítems marcados para delivery, de lo contrario 0
        const { rows: delItemRows } = await client.query(
          'SELECT COUNT(*) as count FROM order_items WHERE order_id = $1 AND is_delivery = true',
          [id]
        );
        const hasDeliveryItems = Number(delItemRows[0]?.count || 0) > 0;
        let currentFeeCOP = 0;
        if (hasDeliveryItems) {
          const rawDelCOP = Number(order.delivery_fee_cop) || 0;
          const rawDelUSD = Number(order.delivery_fee_usd) || 0;
          currentFeeCOP = rawDelCOP > 0 ? rawDelCOP : (rawDelUSD >= 100 ? rawDelUSD : Math.round(rawDelUSD * currentCopRate));
        }
        const newTotalCOP = itemsSubtotalCOP + currentFeeCOP;
        const newTotalUSD = currentCopRate > 0 ? Number((newTotalCOP / currentCopRate).toFixed(2)) : newTotalCOP;
        const currentFeeUSD = currentCopRate > 0 ? Number((currentFeeCOP / currentCopRate).toFixed(2)) : currentFeeCOP;

        await client.query(
          `UPDATE orders SET type = 'mesa', table_number = $1, delivery_fee_usd = $2, delivery_fee_cop = $3, total_usd = $4, total_cop = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
          [parsedTable, currentFeeUSD, currentFeeCOP, newTotalUSD, newTotalCOP, id]
        );

        await client.query("UPDATE tables_config SET status = 'ocupada' WHERE number = $1", [parsedTable]);

        if (oldTableNumber && oldTableNumber !== parsedTable) {
          const { rows: otherOrders } = await client.query(
            "SELECT id FROM orders WHERE table_number = $1 AND id != $2 AND status NOT IN ('cancelado', 'fusionada') AND payment_status != 'pagado' AND archived_at IS NULL",
            [oldTableNumber, id]
          );
          if (otherOrders.length === 0) {
            await client.query("UPDATE tables_config SET status = 'libre' WHERE number = $1", [oldTableNumber]);
          }
        }
      } else if (action === 'to-delivery') {
        let rawFee = deliveryFeeUSD !== undefined ? Number(deliveryFeeUSD) : (Number(order.delivery_fee_cop) || Number(order.delivery_fee_usd) || 2000);
        let feeCOP = rawFee >= 100 ? rawFee : Math.round(rawFee * currentCopRate);
        if (feeCOP <= 0) feeCOP = 2000;
        let feeUSD = currentCopRate > 0 ? Number((feeCOP / currentCopRate).toFixed(2)) : feeCOP;
        const finalCustName = customerName ? customerName.trim() : (order.customer_name || 'Cliente Delivery');
        const newTotalCOP = itemsSubtotalCOP + feeCOP;
        const newTotalUSD = currentCopRate > 0 ? Number((newTotalCOP / currentCopRate).toFixed(2)) : newTotalCOP;

        await client.query(
          `UPDATE orders SET type = 'delivery', table_number = NULL, customer_name = $1, delivery_fee_usd = $2, delivery_fee_cop = $3, total_usd = $4, total_cop = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
          [finalCustName, feeUSD, feeCOP, newTotalUSD, newTotalCOP, id]
        );

        if (oldTableNumber) {
          const { rows: otherOrders } = await client.query(
            "SELECT id FROM orders WHERE table_number = $1 AND id != $2 AND status NOT IN ('cancelado', 'fusionada') AND payment_status != 'pagado' AND archived_at IS NULL",
            [oldTableNumber, id]
          );
          if (otherOrders.length === 0) {
            await client.query("UPDATE tables_config SET status = 'libre' WHERE number = $1", [oldTableNumber]);
          }
        }
      } else if (action === 'to-pickup') {
        const newTotalCOP = itemsSubtotalCOP;
        const newTotalUSD = currentCopRate > 0 ? Number((newTotalCOP / currentCopRate).toFixed(2)) : newTotalCOP;
        await client.query(
          `UPDATE orders SET type = 'pickup', table_number = NULL, delivery_fee_usd = 0, delivery_fee_cop = 0, total_usd = $1, total_cop = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [newTotalUSD, newTotalCOP, id]
        );

        if (oldTableNumber) {
          const { rows: otherOrders } = await client.query(
            "SELECT id FROM orders WHERE table_number = $1 AND id != $2 AND status NOT IN ('cancelado', 'fusionada') AND payment_status != 'pagado' AND archived_at IS NULL",
            [oldTableNumber, id]
          );
          if (otherOrders.length === 0) {
            await client.query("UPDATE tables_config SET status = 'libre' WHERE number = $1", [oldTableNumber]);
          }
        }
      } else if (action === 'assign-delivery-items') {
        // Asignar servicio delivery a ítems específicos dentro de la comanda
        const targetIds = Array.isArray(selectedItemIds) ? selectedItemIds : [];
        await client.query(
          'UPDATE order_items SET is_delivery = (id = ANY($2::text[])) WHERE order_id = $1',
          [id, targetIds]
        );
        let rawFee = deliveryFeeUSD !== undefined ? Number(deliveryFeeUSD) : (Number(order.delivery_fee_cop) || Number(order.delivery_fee_usd) || 0);
        let feeCOP = rawFee >= 100 ? rawFee : Math.round(rawFee * currentCopRate);
        let feeUSD = currentCopRate > 0 ? Number((feeCOP / currentCopRate).toFixed(2)) : feeCOP;
        const newTotalCOP = itemsSubtotalCOP + feeCOP;
        const newTotalUSD = currentCopRate > 0 ? Number((newTotalCOP / currentCopRate).toFixed(2)) : newTotalCOP;
        await client.query(
          `UPDATE orders SET delivery_fee_usd = $1, delivery_fee_cop = $2, total_usd = $3, total_cop = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
          [feeUSD, feeCOP, newTotalUSD, newTotalCOP, id]
        );
      }

      await client.query('COMMIT');

      const updatedOrdersList = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = updatedOrdersList.find((o) => o.id === id);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('tables:sync', allTables);
      io.emit('order:status_updated', updatedOrder);

      console.log(`🔄 [TRASLADO DE SERVICIO] Comanda #${order.order_number}: Acción ${action} procesada`);
      res.json(updatedOrder);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('Error al transferir servicio:', err);
      res.status(500).json({ error: err.message || 'Error al transferir servicio' });
    } finally {
      if (client) client.release();
    }
  });

  // Expandir ítems con cantidad > 1 a filas individuales de 1x para cobro por persona / cuenta separada
  router.post('/:id/expand-split-items', requireRole('caja', 'admin', 'mesero'), async (req, res) => {
    const { id } = req.params;
    let client = null;
    try {
      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      assertShiftAccess(req.user, orderRows[0].shift);

      const { rows: items } = await client.query(
        `SELECT * FROM order_items WHERE order_id = $1 AND quantity > 1 FOR UPDATE`,
        [id]
      );

      let expandedCount = 0;
      for (const it of items) {
        const qty = parseInt(it.quantity, 10) || 1;
        if (qty <= 1) continue;

        // Actualizar la fila existente para que tenga quantity = 1
        await client.query(
          `UPDATE order_items SET quantity = 1 WHERE id = $1`,
          [it.id]
        );

        const extrasJsonVal = typeof it.extras_json === 'string'
          ? it.extras_json
          : (it.extras_json ? JSON.stringify(it.extras_json) : null);
        const halfDetailsVal = typeof it.half_details === 'string'
          ? it.half_details
          : (it.half_details ? JSON.stringify(it.half_details) : null);

        // Insertar (qty - 1) copias idénticas, cada una con quantity = 1 y su propio id único
        for (let i = 1; i < qty; i++) {
          const newId = `it-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;
          await client.query(
            `INSERT INTO order_items (
              id, order_id, product_id, product_name, price, quantity,
              size, is_half_half, half_details, removed_ingredients, extras_json,
              sugar_preference, is_takeaway, is_delivery, is_new_or_modified,
              notes, drink_type, category, proteins, is_cut, cut_preference, flavor,
              is_paid_individually, paid_by_name
            ) VALUES (
              $1, $2, $3, $4, $5, 1,
              $6, $7, $8, $9, $10,
              $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21,
              $22, $23
            )`,
            [
              newId,
              it.order_id,
              it.product_id,
              it.product_name,
              it.price,
              it.size,
              it.is_half_half,
              halfDetailsVal,
              it.removed_ingredients,
              extrasJsonVal,
              it.sugar_preference,
              it.is_takeaway,
              it.is_delivery,
              it.is_new_or_modified,
              it.notes,
              it.drink_type,
              it.category,
              it.proteins,
              it.is_cut,
              it.cut_preference,
              it.flavor,
              it.is_paid_individually || false,
              it.paid_by_name || null
            ]
          );
          expandedCount++;
        }
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const updatedOrders = await fetchAllOrders(req.user);
      const updatedOrder = updatedOrders.find((o) => o.id === id);

      if (expandedCount > 0) {
        io.emit('orders:sync', updatedOrders);
        console.log(`👥 [CUENTA SEPARADA] Comanda #${orderRows[0].order_number}: expandidos ${expandedCount} ítem(s) para cobro individual.`);
      }

      return res.json({ success: true, order: updatedOrder, expandedCount });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
      }
      console.error('Error al expandir ítems para división:', err);
      return res.status(500).json({ error: err.message || 'Error al preparar ítems para división.' });
    }
  });

  // Adicionar productos a una comanda abierta (Mesero, Caja, Admin)
  router.post('/:id/append-items', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    const { id } = req.params;
    const { addedItems = [], removedItemIds = [], targetPrinter = 'cocina', customerName, kitchenNotes } = req.body;

    if (!Array.isArray(addedItems) && !Array.isArray(removedItemIds)) {
      return res.status(400).json({ error: 'Debes proporcionar los ítems a adicionar o remover.' });
    }

    if (addedItems.length === 0 && removedItemIds.length === 0) {
      return res.status(400).json({ error: 'No se indicaron cambios de adición ni eliminación.' });
    }

    let client = null;
    try {
      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, type, table_number, customer_name, waiter_name, status, payment_status, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      const order = orderRows[0];
      assertShiftAccess(req.user, order.shift);

      if (order.status === 'cancelado' || order.status === 'fusionada') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No se pueden adicionar productos a una comanda cancelada o fusionada.' });
      }

      // Si se indicaron ítems a remover
      if (Array.isArray(removedItemIds) && removedItemIds.length > 0) {
        await client.query(
          `DELETE FROM order_items WHERE order_id = $1 AND id = ANY($2::text[])`,
          [id, removedItemIds]
        );
      }

      // Insertar nuevos ítems adicionados
      if (Array.isArray(addedItems) && addedItems.length > 0) {
        for (const item of addedItems) {
          const itemId = item.id || `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, is_delivery, is_new_or_modified, notes, drink_type, category, proteins, is_cut, cut_preference, flavor)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, $15, $16, $17, $18, $19, $20, $21)`,
            [
              itemId,
              id,
              item.productId || 'prod-custom',
              item.productName || 'Producto',
              Number(item.price) || 0,
              Number(item.quantity) || 1,
              item.size || 'Grande',
              !!item.isHalfHalf,
              JSON.stringify(item.halfDetails || null),
              item.removedIngredients || [],
              JSON.stringify(item.extras || []),
              item.sugarPreference || null,
              !!item.isTakeaway,
              !!(item.isDelivery || item.is_delivery),
              item.notes || '',
              item.drinkType || item.drink_type || null,
              item.category || null,
              item.proteins || [],
              !!(item.isCut || item.is_cut || item.cutPreference === 'Picada'),
              item.cutPreference || item.cut_preference || (item.isCut ? 'Picada' : 'Entera'),
              item.flavor || null,
            ]
          );
        }
      }

      // Recalcular total_usd de la orden sumando items actuales (incluyendo extras)
      const { rows: currentItems } = await client.query(
        `SELECT price, quantity FROM order_items WHERE order_id = $1`,
        [id]
      );

      let itemsTotalUSD = 0;
      for (const it of currentItems) {
        const itemPrice = Number(it.price) || 0;
        const qty = Number(it.quantity) || 1;
        itemsTotalUSD += itemPrice * qty;
      }

      const ratesRes = await client.query(`SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = 'ambos' LIMIT 1`);
      const currentCopRate = Number(ratesRes.rows[0]?.cop_rate || 3100);

      let deliveryFeeCOP = 0;
      if (req.body.deliveryFeeCOP !== undefined) {
        deliveryFeeCOP = Number(req.body.deliveryFeeCOP) || 0;
      } else if (req.body.deliveryFeeUSD !== undefined) {
        const rawDel = Number(req.body.deliveryFeeUSD) || 0;
        deliveryFeeCOP = rawDel >= 100 ? rawDel : Math.round(rawDel * currentCopRate);
      } else {
        const rawDelCop = Number(order.delivery_fee_cop) || 0;
        const rawDelUsd = Number(order.delivery_fee_usd) || 0;
        deliveryFeeCOP = rawDelCop > 0 ? rawDelCop : (rawDelUsd >= 100 ? rawDelUsd : Math.round(rawDelUsd * currentCopRate));
      }
      const newTotalCOP = Math.round(itemsTotalUSD + deliveryFeeCOP);
      const newTotalUSD = currentCopRate > 0 ? Number((newTotalCOP / currentCopRate).toFixed(2)) : newTotalCOP;
      const deliveryFeeUSD = currentCopRate > 0 ? Number((deliveryFeeCOP / currentCopRate).toFixed(2)) : deliveryFeeCOP;

      // Si la orden estaba como lista o entregada pero se le añadieron ítems de cocina (o cualquier ítem en delivery/pickup), reabrir a 'en_preparacion'
      const isPickupOrDelivery = order.type === 'delivery' || order.type === 'pickup';
      const kitchenItemsAdded = isPickupOrDelivery ? (addedItems || []) : (addedItems || []).filter(isKitchenItem);

      let nextStatus = order.status;
      if (kitchenItemsAdded.length > 0 && (order.status === 'preparada' || order.status === 'lista')) {
        nextStatus = 'en_preparacion';
      }

      const updateFields = ['total_usd = $1', 'total_cop = $2', 'status = $3', 'delivery_fee_usd = $4', 'delivery_fee_cop = $5', 'updated_at = CURRENT_TIMESTAMP'];
      const updateValues = [newTotalUSD, newTotalCOP, nextStatus, deliveryFeeUSD, deliveryFeeCOP, id];
      let paramIdx = 7;

      if (customerName && customerName.trim()) {
        updateFields.push(`customer_name = $${paramIdx++}`);
        updateValues.push(customerName.trim());
      }
      if (kitchenNotes !== undefined && kitchenNotes !== null) {
        updateFields.push(`kitchen_notes = $${paramIdx++}`);
        updateValues.push(kitchenNotes.trim());
      }

      await client.query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $6`,
        updateValues
      );

      // Registrar auditoría de edición en order_edits
      const editDetails = [];
      if (addedItems.length > 0) {
        editDetails.push(`Adicionados ${addedItems.length} ítem(s): ${addedItems.map(it => it.productName || it.name || 'Producto').join(', ')}`);
      }
      if (removedItemIds.length > 0) {
        editDetails.push(`Eliminados ${removedItemIds.length} ítem(s)`);
      }
      const editId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      try {
        await client.query(
          `INSERT INTO order_edits (id, order_id, order_number, edited_by, edit_type, edit_details) VALUES ($1, $2, $3, $4, $5, $6)`,
          [editId, id, order.order_number || '', req.user.username || 'usuario', 'adicion_items', editDetails.join('; ')]
        );
      } catch (editErr) {
        console.warn('Aviso: No se pudo registrar auditoría de adición:', editErr.message);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const updatedOrdersList = await fetchAllOrders(req.user);
      const updatedOrder = updatedOrdersList.find((o) => o.id === id);

      // Impresión térmica selectiva según destino
      if (kitchenItemsAdded.length > 0 && updatedOrder && targetPrinter !== 'ninguna') {
        try {
          const addResult = await printKitchenAdditionTicket(updatedOrder, addedItems, targetPrinter, io);
          if (addResult?.fallback) {
            console.log(`🚨 [RESPALDO EN CAJA] Ticket adición #${order.order_number} impreso en CAJA con alerta para cocina`);
          } else if (addResult?.printed) {
            console.log(`🖨️ [TICKET ADICIÓN] Impreso exitosamente para comanda #${order.order_number} en destino: ${targetPrinter}`);
          }
        } catch (err) {
          console.warn(`⚠️ [IMPRESORA TÉRMICA] No se pudo imprimir ticket de adición: ${err.message}`);
        }
      }

      io.emit('orders:sync', updatedOrdersList);
      io.emit('order:status_updated', updatedOrder);

      console.log(`➕ [ADICIÓN A COMANDA] #${order.order_number} (${order.type.toUpperCase()}) | ${addedItems.length} ítems añadidos | Nuevo Total: $${newTotalUSD} USD`);
      res.json({ success: true, order: updatedOrder, newTotalUSD });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('Error al adicionar productos a comanda:', err);
      res.status(500).json({ error: err.message || 'Error al adicionar productos' });
    } finally {
      if (client) client.release();
    }
  });

  router.post('/:id/reprint-kitchen', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { targetPrinter = 'cocina' } = req.body || {};
      const { rows: orderRows } = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
      if (orderRows.length === 0) return res.status(404).json({ error: 'Comanda no encontrada' });
      const ord = orderRows[0];
      const { rows: items } = await query(
        `SELECT oi.*, p.default_proteins 
         FROM order_items oi 
         LEFT JOIN products p ON (oi.product_id = p.id OR LOWER(oi.product_name) = LOWER(p.name))
         WHERE oi.order_id = $1`,
        [id]
      );
      const fullOrder = {
        ...ord,
        orderNumber: ord.order_number,
        customerName: ord.customer_name,
        tableNumber: ord.table_number,
        waiterName: ord.waiter_name || 'Mesero',
        kitchenNotes: ord.kitchen_notes,
        createdAt: ord.created_at,
        type: ord.type,
        shiftType: ord.shift_type || 'noche',
        items: items.map((it) => ({
          ...it,
          productName: it.product_name,
          price: parseFloat(it.price) || 0,
          quantity: parseInt(it.quantity, 10) || 1,
          drinkType: it.drink_type,
          category: it.category,
          sugarPreference: it.sugar_preference,
          size: it.size,
          isHalfHalf: it.is_half_half,
          halfDetails: safeJsonParseObj(it.half_details),
          extras: safeJsonParse(it.extras_json),
          removedIngredients: Array.isArray(it.removed_ingredients) ? it.removed_ingredients : (safeJsonParse(it.removed_ingredients) || []),
          proteins: it.proteins || [],
          defaultProteins: it.default_proteins || [],
          isDelivery: !!it.is_delivery,
          flavor: it.flavor || undefined,
          notes: it.notes,
          isTakeaway: it.is_takeaway,
        }))
      };

      const printResult = await printKitchenTicket(fullOrder, targetPrinter, io);
      if (!printResult || printResult.printed === false) {
        if (printResult?.reason === 'no_kitchen_items') {
          return res.status(400).json({ error: 'Esta comanda no contiene ítems que requieran preparación en cocina.' });
        }
        return res.status(502).json({ error: 'No se pudo conectar con la impresora de cocina ni con la de caja.' });
      }
      const message = printResult.fallback
        ? 'Aviso: La impresora de cocina no respondió. La comanda se imprimió en CAJA como respaldo.'
        : 'Comanda de cocina reimpresa exitosamente.';
      return res.json({ success: true, message, fallback: !!printResult.fallback });
    } catch (err) {
      console.error('Error al reimprimir comanda:', err);
      return res.status(500).json({ error: 'Error al procesar la reimpresión de comanda.' });
    }
  });

  return router;
};
