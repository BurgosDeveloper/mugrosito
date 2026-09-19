const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireRole } = require('../helpers/sessionAuth');
const { printReportTicket } = require('../helpers/thermalPrinter');

module.exports = function (io) {
  router.post('/reporte-intervalo/imprimir', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { reportType, data, targetPrinter = 'caja' } = req.body || {};
      if (!['contable', 'pizzas', 'ingresos', 'egresos', 'cocina'].includes(reportType)) {
        return res.status(400).json({ error: 'El tipo de reporte no es válido.' });
      }
      if (!data || !Array.isArray(data.orders) || !Array.isArray(data.items) || !Array.isArray(data.payments) || !Array.isArray(data.transactions)) {
        return res.status(400).json({ error: 'No se recibió un reporte válido para imprimir.' });
      }

      if (!data.apertura || (Number(data.apertura.usdCash) === 0 && Number(data.apertura.copCash) === 0)) {
        const { rows: apRows } = await query(
          `SELECT * FROM caja_chica_apertura${req.user.shift === 'ambos' ? '' : ' WHERE shift = $1'} ORDER BY timestamp DESC LIMIT 1`,
          req.user.shift === 'ambos' ? [] : [req.user.shift]
        );
        if (apRows[0]) {
          data.apertura = {
            usdCash: parseFloat(apRows[0].usd_cash) || 0,
            copCash: parseFloat(apRows[0].cop_cash) || 0,
            openedAt: apRows[0].timestamp,
          };
        }
      }

      const result = await printReportTicket(reportType, data, targetPrinter);
      if (!result.printed) {
        return res.status(409).json({ error: 'La impresión térmica no se pudo completar (verifique configuración de impresora).' });
      }
      return res.json({ success: true, copies: result.copies, results: result.results });
    } catch (error) {
      console.error('Error imprimiendo reporte térmico:', error);
      return res.status(502).json({ error: `No se pudo imprimir el reporte: ${error.message}` });
    }
  });

  // GET /api/caja/reporte-intervalo?from=...&to=...
  router.get('/reporte-intervalo', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: 'Se requieren parámetros from y to.' });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ error: 'Fechas inválidas.' });
      }
      if (fromDate > toDate) {
        return res.status(400).json({ error: 'Fecha inicio debe ser menor o igual a fecha fin.' });
      }

      // Normalizar límites de fecha para coincidir exactamente con los timestamps de PostgreSQL en hora local
      let fromClean = String(from || '').trim().replace('T', ' ');
      let toClean = String(to || '').trim().replace('T', ' ');

      if (/^\d{4}-\d{2}-\d{2}$/.test(fromClean)) {
        fromClean += ' 00:00:00';
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fromClean)) {
        fromClean += ':00';
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(toClean)) {
        toClean += ' 23:59:59.999';
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(toClean)) {
        toClean += ':59.999';
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(toClean)) {
        toClean += '.999';
      }

      const shiftScope = req.user.shift === 'ambos' ? '' : ' AND orders.shift = $3';
      const shiftParams = req.user.shift === 'ambos' ? [fromClean, toClean] : [fromClean, toClean, req.user.shift];

      // 1. Órdenes pagadas o a crédito en el rango.
      const { rows: orderRows } = await query(
        `SELECT * FROM orders
         WHERE payment_status IN ('pagado', 'credito')
           AND status != 'cancelado'
           AND (
             EXISTS (
               SELECT 1 FROM order_payments op
               WHERE op.order_id = orders.id
                 AND op.created_at >= $1 AND op.created_at <= $2
             )
             OR (orders.created_at >= $1 AND orders.created_at <= $2)
           )
           ${shiftScope}
         ORDER BY created_at ASC`,
        shiftParams
      );

      const orderIds = orderRows.map((o) => o.id);

      // 2. Items de esas órdenes
      let itemRows = [];
      if (orderIds.length > 0) {
        const { rows } = await query(
          `SELECT oi.*, o.order_number, o.total_usd, o.total_cop, o.cop_rate_at_payment, o.bs_rate_at_payment, COALESCE(NULLIF(oi.category, ''), p.category, 'Sin categoría') AS category FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON (p.id = oi.product_id OR LOWER(p.name) = LOWER(oi.product_name))
           WHERE oi.order_id = ANY($1::text[])`,
          [orderIds]
        );
        itemRows = rows;
      }

      // 3. Pagos de esas órdenes (excluyendo comandas canceladas)
      let paymentRows = [];
      if (orderIds.length > 0) {
        const { rows } = await query(
          `SELECT op.*, o.order_number FROM order_payments op
           JOIN orders o ON o.id = op.order_id
           WHERE (
             (op.created_at >= $1 AND op.created_at <= $2)
             OR op.order_id = ANY($3::text[])
           )
           AND o.status != 'cancelado'
           ${req.user.shift === 'ambos' ? '' : 'AND o.shift = $4'}
           ORDER BY op.created_at ASC`,
          req.user.shift === 'ambos' ? [fromClean, toClean, orderIds] : [fromClean, toClean, orderIds, req.user.shift]
        );
        paymentRows = rows;
      } else {
        const { rows } = await query(
          `SELECT op.*, o.order_number FROM order_payments op
           JOIN orders o ON o.id = op.order_id
           WHERE op.created_at >= $1 AND op.created_at <= $2
           AND o.status != 'cancelado'
           ${req.user.shift === 'ambos' ? '' : 'AND o.shift = $3'}
           ORDER BY op.created_at ASC`,
          shiftParams
        );
        paymentRows = rows;
      }

      // 4. Transacciones de caja en el rango
      const { rows: txRows } = await query(
        `SELECT tx.*, o.order_number
         FROM caja_chica_transactions tx
         LEFT JOIN orders o ON o.id = tx.order_id
         WHERE tx.timestamp >= $1 AND tx.timestamp <= $2
          ${req.user.shift === 'ambos' ? '' : 'AND tx.shift = $3'}
         ORDER BY tx.timestamp ASC`,
        shiftParams
      );

      // Asegurar que cualquier vuelto registrado en order_payments esté incluido en las transacciones de egreso
      for (const pm of paymentRows) {
        const changeUSD = parseFloat(pm.change_given_usd) || 0;
        const changeCOP = parseFloat(pm.change_given_cop) || 0;
        const changeBs = parseFloat(pm.change_given_bs) || 0;
        if (changeUSD > 0 || changeCOP > 0 || changeBs > 0) {
          const hasTx = txRows.some((t) => t.description && (t.description.includes(pm.id) || (t.id && t.id.includes(pm.id))));
          if (!hasTx) {
            txRows.push({
              id: `vuelto-${pm.id}`,
              type: 'egreso',
              amount_usd: changeUSD,
              amount_cop: changeCOP,
              amount_bs: changeBs,
              payment_method: pm.payment_method || 'Efectivo USD',
              description: `Vuelto de comanda finalizada #${pm.order_number} [${pm.id}]`,
              order_id: pm.order_id,
              order_number: pm.order_number,
              timestamp: pm.created_at,
            });
          }
        }
      }

      // 5. Ediciones de órdenes en el rango
      let editRows = [];
      try {
        const { rows } = await query(
          `SELECT oe.* FROM order_edits oe
           JOIN orders o ON o.id = oe.order_id
           WHERE oe.created_at >= $1 AND oe.created_at <= $2
           ${req.user.shift === 'ambos' ? '' : 'AND o.shift = $3'}
           ORDER BY created_at ASC`,
          shiftParams
        );
        editRows = rows;
      } catch (e) {
        // Tabla puede no existir aún
        console.warn('Aviso: tabla order_edits no disponible:', e.message);
      }

      // 6. Tasas de cambio actuales
      const { rows: rateRows } = await query(
        `SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = $1`,
        [req.user.shift]
      );
      const copRate = Number(rateRows[0]?.cop_rate) || 3100;
      const bsRate = Number(rateRows[0]?.bs_rate) || 3.2;

      // 7. Fondo de apertura de caja chica para el turno
      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura${req.user.shift === 'ambos' ? '' : ' WHERE shift = $1'} ORDER BY timestamp DESC LIMIT 1`,
        req.user.shift === 'ambos' ? [] : [req.user.shift]
      );
      const apertura = aperturaRows[0] ? {
        usdCash: parseFloat(aperturaRows[0].usd_cash) || 0,
        copCash: parseFloat(aperturaRows[0].cop_cash) || 0,
        openedAt: aperturaRows[0].timestamp,
      } : { usdCash: 0, copCash: 0 };

      // Construir respuesta estructurada
      const orders = orderRows.map((ord) => ({
        id: ord.id,
        orderNumber: String(ord.order_number || '').replace(/^#+/, ''),
        type: ord.type,
        tableNumber: ord.table_number,
        customerName: ord.customer_name,
        status: ord.status,
        paymentStatus: ord.payment_status,
        paymentMethod: ord.payment_method,
        totalUSD: parseFloat(ord.total_usd) || 0,
        totalCOP: parseFloat(ord.total_cop) || ((parseFloat(ord.total_usd) || 0) * (parseFloat(ord.cop_rate_at_payment) || copRate)),
        paidAmountUSD: parseFloat(ord.paid_amount_usd) || 0,
        deliveryFeeUSD: parseFloat(ord.delivery_fee_usd) || 0,
        deliveryFeeCOP: parseFloat(ord.delivery_fee_cop) || ((parseFloat(ord.delivery_fee_usd) || 0) * (parseFloat(ord.cop_rate_at_payment) || copRate)),
        copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || copRate,
        bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || bsRate,
        createdAt: ord.created_at,
        archivedAt: ord.archived_at || null,
        isEdited: !!ord.is_edited,
      }));

      const items = itemRows.map((it) => {
        let extras = [];
        try {
          if (it.extras_json) {
            extras = typeof it.extras_json === 'string' ? JSON.parse(it.extras_json) : it.extras_json;
          }
        } catch (e) {}
        let halfDetails = undefined;
        try {
          if (it.half_details) {
            halfDetails = typeof it.half_details === 'string' ? JSON.parse(it.half_details) : it.half_details;
          }
        } catch (e) {}

        const rawPrice = parseFloat(it.price) || 0;
        const ordCopRate = parseFloat(it.cop_rate_at_payment) || copRate;
        const ordBsRate = parseFloat(it.bs_rate_at_payment) || bsRate;
        const isRawInCOP = rawPrice >= 100;
        const priceCOP = isRawInCOP ? rawPrice : Math.round(rawPrice * ordCopRate);
        const priceUSD = isRawInCOP ? (ordCopRate > 0 ? Number((rawPrice / ordCopRate).toFixed(4)) : rawPrice) : rawPrice;

        const normalizedExtras = (Array.isArray(extras) ? extras : []).map((ex) => {
          const exRaw = parseFloat(ex.price) || 0;
          const exIsCOP = exRaw >= 100;
          const exCOP = exIsCOP ? exRaw : Math.round(exRaw * ordCopRate);
          const exUSD = exIsCOP ? (ordCopRate > 0 ? Number((exRaw / ordCopRate).toFixed(4)) : exRaw) : exRaw;
          return {
            ...ex,
            price: exRaw,
            priceCOP: exCOP,
            priceUSD: exUSD,
          };
        });

        return {
          id: it.id,
          orderId: it.order_id,
          orderNumber: String(it.order_number || '').replace(/^#+/, ''),
          productId: it.product_id,
          productName: it.product_name,
          price: rawPrice,
          priceUSD,
          priceCOP,
          copRate: ordCopRate,
          bsRate: ordBsRate,
          quantity: it.quantity || 1,
          category: it.category || 'Sin categoría',
          drinkType: it.drink_type,
          flavor: it.flavor || undefined,
          sugarPreference: it.sugar_preference || undefined,
          isTakeaway: !!it.is_takeaway,
          isDelivery: !!it.is_delivery,
          notes: it.notes || '',
          isHalfHalf: !!it.is_half_half,
          halfDetails,
          extras: normalizedExtras,
          extrasJson: normalizedExtras,
          proteins: it.proteins || [],
          defaultProteins: it.default_proteins || [],
          removedIngredients: it.removed_ingredients || [],
          isPaidIndividually: !!it.is_paid_individually,
          paidByName: it.paid_by_name || undefined,
          size: it.size || 'Estándar',
          isCut: !!it.is_cut,
          cutPreference: it.cut_preference || undefined,
        };
      });

      const payments = paymentRows.map((pm) => ({
        id: pm.id,
        orderId: pm.order_id,
        orderNumber: String(pm.order_number || '').replace(/^#+/, ''),
        payerName: pm.payer_name || 'Cliente General',
        paymentMethod: pm.payment_method,
        amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
        cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
        cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
        cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
        changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
        changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
        changeGivenBs: parseFloat(pm.change_given_bs) || 0,
        copRate: parseFloat(pm.cop_rate) || copRate,
        bsRate: parseFloat(pm.bs_rate) || bsRate,
        createdAt: pm.created_at,
      }));

      const transactions = txRows.map((t) => ({
        id: t.id,
        type: t.type,
        amountUSD: parseFloat(t.amount_usd) || 0,
        amountCOP: parseFloat(t.amount_cop) || 0,
        amountBs: parseFloat(t.amount_bs) || 0,
        paymentMethod: t.payment_method,
        description: t.description,
        orderId: t.order_id,
        orderNumber: t.order_number,
        timestamp: t.timestamp,
      }));

      const edits = editRows.map((e) => ({
        id: e.id,
        orderId: e.order_id,
        orderNumber: e.order_number,
        editedBy: e.edited_by || 'admin',
        editType: e.edit_type || 'modificacion',
        editDetails: e.edit_details || '',
        createdAt: e.created_at,
      }));

      res.json({
        orders,
        items,
        payments,
        transactions,
        edits,
        exchangeRates: { COP: copRate, Bs: bsRate },
        dateRange: { from, to },
        apertura,
      });
    } catch (err) {
      console.error('Error generando reporte por intervalo:', err);
      res.status(500).json({ error: 'Error al generar el reporte por intervalo.' });
    }
  });

  return router;
};
