/**
 * Test Cierre de Turno y Preservación de Créditos
 * Validates:
 * - Paid and Cancelled orders are archived
 * - Active Credit orders remain unarchived and are renumbered #1, #2...
 * - Subsequent order created continues the sequence #3...
 * - Reversal / Clean rollback
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

async function run() {
  console.log('Testing Cierre de Turno y Preservación de Créditos...');
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

  const existingCreditsRes = await client.query("SELECT COUNT(*) FROM orders WHERE payment_status = 'credito' AND archived_at IS NULL");
  const existingCount = parseInt(existingCreditsRes.rows[0].count, 10) || 0;

  try {
    const now = new Date();
    const id1 = `test-cierre-1-${Date.now()}`;
    const id2 = `test-cierre-2-${Date.now()}`;
    const id3 = `test-cierre-3-${Date.now()}`;
    const id4 = `test-cierre-4-${Date.now()}`;

    // 1. Order 1: Paid
    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, shift, created_at)
      VALUES ($1, '#10', 'mesa', 'entregada', 'pagado', 10.00, 31000, 'ambos', $2)
    `, [id1, new Date(now.getTime() - 40000)]);
    testOrderIds.push(id1);

    // 2. Order 2: Cancelled
    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, shift, created_at)
      VALUES ($1, '#11', 'mesa', 'cancelado', 'no_pagado', 5.00, 15500, 'ambos', $2)
    `, [id2, new Date(now.getTime() - 30000)]);
    testOrderIds.push(id2);

    // 3. Order 3: Credit A
    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, debtor_name, shift, created_at)
      VALUES ($1, '#12', 'credito', 'entregada', 'credito', 8.00, 24800, 'Empresa Aliada', 'ambos', $2)
    `, [id3, new Date(now.getTime() - 20000)]);
    testOrderIds.push(id3);

    // 4. Order 4: Credit B
    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, debtor_name, shift, created_at)
      VALUES ($1, '#13', 'credito', 'entregada', 'credito', 12.00, 37200, 'Vecino', 'ambos', $2)
    `, [id4, new Date(now.getTime() - 10000)]);
    testOrderIds.push(id4);

    // Execute Cierre
    const cierreRes = await request('POST', '/api/caja/cierre', {
      actualUSD: 10,
      actualCOP: 31000,
      notes: 'Cierre de prueba auditoria'
    });

    assert(cierreRes.status === 200, `Cierre de caja respondió 200 OK (got ${cierreRes.status})`);
    const totalExpectedPreserved = existingCount + 2;
    assert(cierreRes.data.summary?.preservedCreditsCount === totalExpectedPreserved, `Se preservaron exactamente ${totalExpectedPreserved} créditos activos`);

    // Verify DB states
    const chk1 = await client.query('SELECT archived_at FROM orders WHERE id = $1', [id1]);
    assert(chk1.rows[0].archived_at !== null, `Comanda pagada fue archivada exitosamente`);

    const chk2 = await client.query('SELECT archived_at FROM orders WHERE id = $1', [id2]);
    assert(chk2.rows[0].archived_at !== null, `Comanda cancelada fue archivada exitosamente`);

    const expectedNum1 = `#${existingCount + 1}`;
    const expectedNum2 = `#${existingCount + 2}`;
    const expectedNext = `#${existingCount + 3}`;

    const chk3 = await client.query('SELECT archived_at, order_number FROM orders WHERE id = $1', [id3]);
    assert(chk3.rows[0].archived_at === null, `Comanda a crédito 1 NO fue archivada (permanece activa)`);
    assert(chk3.rows[0].order_number === expectedNum1, `Comanda a crédito 1 fue renumerada a ${expectedNum1} (got: ${chk3.rows[0].order_number})`);

    const chk4 = await client.query('SELECT archived_at, order_number FROM orders WHERE id = $1', [id4]);
    assert(chk4.rows[0].archived_at === null, `Comanda a crédito 2 NO fue archivada (permanece activa)`);
    assert(chk4.rows[0].order_number === expectedNum2, `Comanda a crédito 2 fue renumerada a ${expectedNum2} (got: ${chk4.rows[0].order_number})`);

    // 5. Create new order after cierre and check correlative
    const newOrdRes = await request('POST', '/api/orders', {
      type: 'delivery',
      customerName: 'Cliente Post Cierre',
      totalCOP: 15000,
      totalUSD: 4.84,
      deliveryFeeCOP: 2000,
      items: [{ productId: 'p1', productName: 'Hot Dog', price: 15000, quantity: 1 }]
    });

    assert(newOrdRes.status === 200 || newOrdRes.status === 201, `Nueva comanda creada tras cierre`);
    const newOrdId = newOrdRes.data.id;
    if (newOrdId) testOrderIds.push(newOrdId);

    const chk5 = await client.query('SELECT order_number FROM orders WHERE id = $1', [newOrdId]);
    assert(chk5.rows[0].order_number === expectedNext, `Nueva comanda tras cierre continúa el correlativo en ${expectedNext} (después de los créditos! Got: ${chk5.rows[0].order_number})`);

  } finally {
    if (testOrderIds.length > 0) {
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM order_payments WHERE order_id = ANY($1)', [testOrderIds]);
      await client.query('DELETE FROM orders WHERE id = ANY($1)', [testOrderIds]);
    }
    client.release();
  }

  console.log(`\n======================================================`);
  console.log(`RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
  console.log(`======================================================\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
