/**
 * Validation script covering the mandatory scenarios from GUIA.md:
 * - Pago parcial
 * - Pago exacto
 * - Pago con excedente
 * - Intento de cierre con vuelto pendiente (Debe ser rechazado con 409)
 * - Registro de vuelto
 * - Finalización exitosa
 * - Anulación de pago / vuelto
 * - Reactivación desde histórico
 * - Pago dividido por ítems y reversión
 */
const http = require('http');
const { Pool } = require('pg');
const { createSession } = require('../server/helpers/sessionAuth');

const cajaToken = createSession({ id: 'caja-test', username: 'cajero', role: 'caja' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mugrosito'
});

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${cajaToken}`,
        'x-mugrosito-token': cajaToken
      },
      timeout: 5000
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, data: resBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runAuditScenarios() {
  console.log(`======================================================================`);
  console.log(` 📋 AUDITORÍA RIGUROSA DE ESCENARIOS OBLIGATORIOS (GUIA.MD)`);
  console.log(`======================================================================\n`);

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  const client = await pool.connect();
  const testOrderIds = [];

  try {
    // ---------------------------------------------------------
    // ORDEN 1: Pruebas de Pagos, Excedentes, Vueltos y Cierre
    // ---------------------------------------------------------
    const ord1Id = `guia-ord-1-${Date.now()}`;
    testOrderIds.push(ord1Id);

    // Creamos orden de 31.000 COP ($10.00 USD)
    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, table_number)
      VALUES ($1, '#101', 'mesa', 'preparada', 'no_pagado', 10.00, 31000, 'ambos', 3100, 1)
    `, [ord1Id]);

    await client.query(`
      INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
      VALUES ($1, $2, 'prod-1', 'Hamburguesa Especial', 31000, 1)
    `, [`it-1-${Date.now()}`, ord1Id]);

    // [Escenario 1] Pago parcial: abono de 15.000 COP
    const partialPayRes = await request('POST', `/api/orders/${ord1Id}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 15000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente Parcial'
    });
    assert(partialPayRes.status === 200, `[Escenario 1: Pago Parcial] Registrado con éxito`);
    const ordCheck1 = await client.query('SELECT payment_status, paid_amount_usd FROM orders WHERE id = $1', [ord1Id]);
    assert(ordCheck1.rows[0].payment_status === 'no_pagado', `Comanda permanece 'no_pagado' tras abono parcial`);
    assert(Number(ordCheck1.rows[0].paid_amount_usd) > 4.8 && Number(ordCheck1.rows[0].paid_amount_usd) < 4.9, `Monto abonado en USD es ~$4.84`);

    // Obtener ID del pago parcial
    const payRows1 = await client.query('SELECT id FROM order_payments WHERE order_id = $1', [ord1Id]);
    const partialPaymentId = payRows1.rows[0]?.id;

    // [Escenario 2] Anulación de pago
    const delPayRes = await request('DELETE', `/api/orders/${ord1Id}/payments/${partialPaymentId}`);
    assert(delPayRes.status === 200, `[Escenario 2: Anulación de Pago] Pago parcial anulado exitosamente`);
    const ordCheck2 = await client.query('SELECT paid_amount_usd FROM orders WHERE id = $1', [ord1Id]);
    assert(Number(ordCheck2.rows[0].paid_amount_usd) === 0, `Monto pagado regresa a 0.00 tras anulación`);

    // [Escenario 3] Pago con excedente: Entrega billete de 50.000 COP para cuenta de 31.000 COP
    const surplusPayRes = await request('POST', `/api/orders/${ord1Id}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 50000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente Excedente'
    });
    assert(surplusPayRes.status === 200, `[Escenario 3: Pago con Excedente] Pago de 50.000 COP procesado`);

    // [Escenario 4] Intento de cierre con vuelto pendiente: DEBE RECHAZARSE con 409
    const failedCloseRes = await request('POST', `/api/orders/${ord1Id}/finalize`, {});
    assert(failedCloseRes.status === 409, `[Escenario 4: Bloqueo de Cierre con Vuelto Pendiente] Cierre rechazado con 409 (got ${failedCloseRes.status})`);

    // [Escenario 5] Registro de vuelto exacto: 19.000 COP (50.000 - 31.000)
    const changeRes = await request('POST', `/api/orders/${ord1Id}/ledger`, {
      entryType: 'change',
      currency: 'COP',
      amountLocal: 19000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente Excedente'
    });
    assert(changeRes.status === 200, `[Escenario 5: Registro de Vuelto] Vuelto de 19.000 COP registrado`);

    // [Escenario 6] Finalización de comanda: Ahora que está saldada y vuelto en 0, debe cerrar exitosamente
    const successCloseRes = await request('POST', `/api/orders/${ord1Id}/finalize`, {});
    assert(successCloseRes.status === 200, `[Escenario 6: Cierre Exitoso] Comanda finalizada con éxito tras vuelto`);
    const ordCheck3 = await client.query('SELECT status, payment_status FROM orders WHERE id = $1', [ord1Id]);
    assert(ordCheck3.rows[0].status === 'entregada' && ordCheck3.rows[0].payment_status === 'pagado', `Comanda marcada como 'entregada' y 'pagado'`);

    // [Escenario 7] Reactivación desde histórico
    const reopenRes = await request('POST', `/api/orders/${ord1Id}/reopen`, {});
    assert(reopenRes.status === 200, `[Escenario 7: Reactivación desde Histórico] Comanda reactivada exitosamente`);
    const ordCheck4 = await client.query('SELECT status, payment_status FROM orders WHERE id = $1', [ord1Id]);
    assert(ordCheck4.rows[0].status === 'preparada', `Comanda reactivada vuelve a estado 'preparada'`);
    const payHistoryCheck = await client.query('SELECT COUNT(*) FROM order_payments WHERE order_id = $1', [ord1Id]);
    assert(Number(payHistoryCheck.rows[0].count) === 2, `Historial de pagos (ingreso y vuelto) preservado al 100%`);

    // ---------------------------------------------------------
    // ORDEN 2: Pago Dividido por Personas / Ítems Individuales
    // ---------------------------------------------------------
    const ord2Id = `guia-ord-2-${Date.now()}`;
    testOrderIds.push(ord2Id);

    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, table_number)
      VALUES ($1, '#102', 'mesa', 'preparada', 'no_pagado', 20.00, 62000, 'ambos', 3100, 2)
    `, [ord2Id]);

    const itemAId = `item-A-${Date.now()}`;
    const itemBId = `item-B-${Date.now()}`;

    await client.query(`
      INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
      VALUES ($1, $2, 'prod-burger-1', 'Hamburguesa A', 31000, 1)
    `, [itemAId, ord2Id]);

    await client.query(`
      INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
      VALUES ($1, $2, 'prod-burger-2', 'Hamburguesa B', 31000, 1)
    `, [itemBId, ord2Id]);

    // [Escenario 8] Cobro dividido: Amigo A paga su Ítem A en Efectivo COP
    const splitPayRes = await request('POST', `/api/orders/${ord2Id}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 31000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Amigo A',
      itemIds: [itemAId]
    });
    assert(splitPayRes.status === 200, `[Escenario 8: Pago Dividido por Ítem] Amigo A paga su ítem exitosamente`);

    const itemACheck = await client.query('SELECT is_paid_individually, paid_by_name FROM order_items WHERE id = $1', [itemAId]);
    const itemBCheck = await client.query('SELECT is_paid_individually, paid_by_name FROM order_items WHERE id = $1', [itemBId]);
    assert(itemACheck.rows[0].is_paid_individually === true, `Ítem A marcado como 'is_paid_individually = true'`);
    assert(itemACheck.rows[0].paid_by_name === 'Amigo A', `Ítem A registrado a nombre de 'Amigo A'`);
    assert(itemBCheck.rows[0].is_paid_individually === false, `Ítem B permanece pendiente sin pagar`);

    // [Escenario 9] Anulación del pago de Ítem A -> Debe revertir las marcas del ítem
    const payRows2 = await client.query('SELECT id FROM order_payments WHERE order_id = $1', [ord2Id]);
    const splitPaymentId = payRows2.rows[0]?.id;

    const delSplitRes = await request('DELETE', `/api/orders/${ord2Id}/payments/${splitPaymentId}`);
    assert(delSplitRes.status === 200, `[Escenario 9: Anulación de Pago Dividido] Pago anulado exitosamente`);

    const itemARevertCheck = await client.query('SELECT is_paid_individually, paid_by_name FROM order_items WHERE id = $1', [itemAId]);
    assert(itemARevertCheck.rows[0].is_paid_individually === false, `Ítem A liberado: 'is_paid_individually' regresa a false`);
    assert(itemARevertCheck.rows[0].paid_by_name === null, `Ítem A liberado: 'paid_by_name' regresa a NULL`);

  } finally {
    if (testOrderIds.length > 0) {
      await client.query('DELETE FROM caja_chica_transactions WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM order_payments WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM orders WHERE id = ANY($1)', [testOrderIds]);
    }
    client.release();
  }

  console.log(`\n======================================================`);
  console.log(`RESULTADOS ESCENARIOS GUIA.MD: ${passed} PASSED | ${failed} FAILED`);
  console.log(`======================================================\n`);
  if (failed > 0) process.exit(1);
}

runAuditScenarios().catch(err => {
  console.error(err);
  process.exit(1);
});
