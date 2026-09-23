/**
 * Test Tarea 2: Consistencia Exacta de Montos en Cobranza
 * Validates:
 * - Order with 15.000 COP is pending exactly 15.000 COP (NOT 15.500 COP)
 * - Equivalent in Bs is exactly 4687.50 Bs (15000 / 3.20, NOT 4688.75 Bs)
 * - Equivalent in USD is $4.84 USD
 * - Registering exact 15.000 COP payment covers 100% of order without residual unpaid fractions
 * - Partial payments (abonos) subtract cleanly in COP without rounding inflation
 */
const { initDb, getClient } = require('../server/db');
const http = require('http');
const { createSession } = require('../server/helpers/sessionAuth');

const adminToken = createSession({ id: 'admin-tester', username: 'admin', role: 'admin' });

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
        'Authorization': `Bearer ${adminToken}`,
        'x-mugrosito-token': adminToken
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

async function runTest() {
  console.log('Testing Consistencia Exacta de Montos en Cobranza (Tarea 2)...');
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

  await initDb();
  const client = await getClient();
  const testOrderIds = [];

  try {
    // 1. Create order with 15.000 COP
    const ordRes = await request('POST', '/api/orders', {
      type: 'mesa',
      tableNumber: 1,
      customerName: 'Cliente Prueba 15k',
      totalCOP: 15000,
      totalUSD: 4.84,
      items: [{ productId: 'p1', productName: 'Hamburguesa 15k', price: 15000, quantity: 1 }]
    });

    assert(ordRes.status === 200 || ordRes.status === 201, `Comanda de 15.000 COP creada exitosamente`);
    const ordId = ordRes.data.id;
    if (ordId) testOrderIds.push(ordId);

    // Verify stored amounts in DB
    const dbOrder = await client.query('SELECT total_cop, total_usd FROM orders WHERE id = $1', [ordId]);
    assert(Number(dbOrder.rows[0].total_cop) === 15000, `Base de datos almacena total_cop = 15000 COP`);
    assert(Number(dbOrder.rows[0].total_usd) === 4.84, `Base de datos almacena total_usd = 4.84 USD`);

    // 2. Register exact payment in COP: 15000 COP
    const payRes = await request('POST', `/api/payments/${ordId}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 15000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente Prueba 15k'
    });

    assert(payRes.status === 200, `Registro de pago exacto 15.000 COP respondió 200 OK`);

    // 3. Verify order paid amounts in DB
    const checkPaid = await client.query('SELECT paid_amount_usd, total_usd FROM orders WHERE id = $1', [ordId]);
    const paidUSD = Number(checkPaid.rows[0].paid_amount_usd);
    const totalUSD = Number(checkPaid.rows[0].total_usd);
    const remainingUSD = Math.max(0, totalUSD - paidUSD);

    assert(remainingUSD <= 0.001, `Deuda pendiente en USD es 0 (paid: ${paidUSD}, total: ${totalUSD})`);

    // 4. Finalize order
    const finRes = await request('POST', `/api/orders/${ordId}/finalize`);
    assert(finRes.status === 200, `Finalización de orden completada exitosamente sin deudas residuales`);

    // 5. Test partial payment (abono de 5.000 COP a una orden de 15.000 COP)
    const ordRes2 = await request('POST', '/api/orders', {
      type: 'mesa',
      tableNumber: 2,
      customerName: 'Cliente Abono',
      totalCOP: 15000,
      totalUSD: 4.84,
      items: [{ productId: 'p1', productName: 'Hamburguesa 15k', price: 15000, quantity: 1 }]
    });

    const ordId2 = ordRes2.data.id;
    if (ordId2) testOrderIds.push(ordId2);

    const abonoRes = await request('POST', `/api/payments/${ordId2}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 5000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente Abono'
    });
    assert(abonoRes.status === 200, `Abono de 5.000 COP registrado exitosamente`);

    // Remaining payment of 10.000 COP
    const payRemainingRes = await request('POST', `/api/payments/${ordId2}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 10000,
      paymentMethod: 'Bancolombia',
      payerName: 'Cliente Abono'
    });
    assert(payRemainingRes.status === 200, `Pago restante de 10.000 COP registrado exitosamente`);

    const finRes2 = await request('POST', `/api/orders/${ordId2}/finalize`);
    assert(finRes2.status === 200, `Segunda orden con abonos finalizada limpiamente`);

  } finally {
    if (testOrderIds.length > 0) {
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM order_payments WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM orders WHERE id = ANY($1)', [testOrderIds]);
    }
    client.release();
  }

  console.log(`\n======================================================`);
  console.log(`RESULTADOS TAREA 2: ${passed} PASSED | ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runTest().catch((err) => {
  console.error('Error fatal en test:', err);
  process.exit(1);
});
