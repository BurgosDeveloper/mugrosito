/**
 * Test script for POST /api/orders/merge and POST /api/orders/:id/transfer-service
 * Validates COP and USD totals, delivery fees, and order states.
 */
const { initDb, getClient } = require('../server/db');
const http = require('http');
const { createSession } = require('../server/helpers/sessionAuth');

const adminToken = createSession({ id: 'admin-tester', username: 'admin', role: 'admin' });

function request(method, path, body) {
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
        'Authorization': `Bearer ${adminToken}`
      }
    }, (res) => {
      let resBody = '';
      res.on('data', (chunk) => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, body: resBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Testing Merge & Transfer Service endpoints...');
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
    // 1. Create two test orders
    const ord1Id = `test-ord-1-${Date.now()}`;
    const ord2Id = `test-ord-2-${Date.now()}`;

    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, table_number)
      VALUES ($1, 998, 'mesa', 'activa', 'pendiente', 3.23, 10000, 0, 0, 1)
    `, [ord1Id]);
    testOrderIds.push(ord1Id);

    await client.query(`
      INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price)
      VALUES ($1, $2, 'prod-hd-1', 'Hot Dog Clásico', 1, 10000)
    `, [`item-1-${Date.now()}`, ord1Id]);

    await client.query(`
      INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, table_number)
      VALUES ($1, 999, 'mesa', 'activa', 'pendiente', 4.84, 15000, 0, 0, 2)
    `, [ord2Id]);
    testOrderIds.push(ord2Id);

    await client.query(`
      INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price)
      VALUES ($1, $2, 'prod-hd-2', 'Hot Dog Especial', 1, 15000)
    `, [`item-2-${Date.now()}`, ord2Id]);

    // 2. Test Merge: merge order 2 into order 1
    const mergeRes = await request('POST', '/api/orders/merge', {
      targetOrderId: ord1Id,
      sourceOrderIds: [ord2Id]
    });

    assert(mergeRes.status === 200, `Merge returned 200 OK (got ${mergeRes.status})`);
    
    // Check order 1 in DB
    const ord1Check = await client.query('SELECT * FROM orders WHERE id = $1', [ord1Id]);
    const mergedOrd1 = ord1Check.rows[0];
    assert(Number(mergedOrd1.total_cop) === 25000, `Merged order total_cop is 25000 COP (got ${mergedOrd1.total_cop})`);
    assert(Number(mergedOrd1.total_usd) > 7.0 && Number(mergedOrd1.total_usd) < 9.0, `Merged order total_usd is ~$8 USD (NOT 25000 USD! Got: ${mergedOrd1.total_usd})`);

    // Check order 2 is merged
    const ord2Check = await client.query('SELECT * FROM orders WHERE id = $1', [ord2Id]);
    assert(ord2Check.rows[0].status === 'fusionada', `Source order marked as 'fusionada'`);

    // 3. Test Transfer Service: Transfer order 1 to delivery with 2000 COP delivery fee
    const transferRes = await request('PATCH', `/api/orders/${ord1Id}/transfer-service`, {
      action: 'to-delivery',
      deliveryFeeUSD: 2000, // Client passes COP fee
      customerName: 'Cliente Delivery Test',
      phone: '04141234567',
      address: 'Calle Falsa 123'
    });

    assert(transferRes.status === 200, `Transfer to-delivery returned 200 OK (got ${transferRes.status})`);

    const transferCheck = await client.query('SELECT * FROM orders WHERE id = $1', [ord1Id]);
    const transOrd = transferCheck.rows[0];
    assert(transOrd.type === 'delivery', `Order type changed to delivery`);
    assert(Number(transOrd.delivery_fee_cop) === 2000, `Delivery fee COP is 2000 (got ${transOrd.delivery_fee_cop})`);
    assert(Number(transOrd.delivery_fee_usd) < 1.0, `Delivery fee USD is ~$0.65 (got ${transOrd.delivery_fee_usd})`);
    assert(Number(transOrd.total_cop) === 27000, `Order total_cop is 27000 (25000 items + 2000 delivery, got ${transOrd.total_cop})`);
    assert(Number(transOrd.total_usd) > 8.0 && Number(transOrd.total_usd) < 10.0, `Order total_usd is ~$8.71 USD (NOT 27000 USD! Got: ${transOrd.total_usd})`);

    // 4. Test Transfer back to Mesa
    const transferToMesaRes = await request('PATCH', `/api/orders/${ord1Id}/transfer-service`, {
      action: 'to-mesa',
      newTableNumber: 5
    });

    assert(transferToMesaRes.status === 200, `Transfer to-mesa returned 200 OK (got ${transferToMesaRes.status})`);
    const mesaCheck = await client.query('SELECT * FROM orders WHERE id = $1', [ord1Id]);
    const mesaOrd = mesaCheck.rows[0];
    assert(mesaOrd.type === 'mesa', `Order type changed back to mesa`);
    assert(mesaOrd.table_number === 5, `Table number changed to 5`);
    assert(Number(mesaOrd.delivery_fee_cop) === 0, `Delivery fee COP reset to 0`);
    assert(Number(mesaOrd.total_cop) === 25000, `Total COP reset to 25000 items without delivery fee`);

    // 5. Test Full Order Edit (PATCH /api/orders/:id/edit)
    const editRes = await request('PATCH', `/api/orders/${ord1Id}/edit`, {
      type: 'delivery',
      customerName: 'Cliente Editado VIP',
      deliveryFeeCOP: 3000,
      items: [
        { productId: 'p1', productName: 'Hamburguesa Doble', price: 15000, quantity: 2, isDelivery: true }
      ]
    });

    assert(editRes.status === 200, `Order edit returned 200 OK (got ${editRes.status})`);
    const editCheck = await client.query('SELECT * FROM orders WHERE id = $1', [ord1Id]);
    const editedOrd = editCheck.rows[0];
    assert(editedOrd.customer_name === 'Cliente Editado VIP', `Customer name updated`);
    assert(Number(editedOrd.delivery_fee_cop) === 3000, `Edited delivery_fee_cop is 3000 (got ${editedOrd.delivery_fee_cop})`);
    assert(Number(editedOrd.total_cop) === 33000, `Edited total_cop is 33000 (30000 items + 3000 delivery, got ${editedOrd.total_cop})`);
    assert(Number(editedOrd.total_usd) > 10.0 && Number(editedOrd.total_usd) < 11.0, `Edited total_usd is ~$10.65 USD (got ${editedOrd.total_usd})`);


  } finally {
    // Cleanup
    if (testOrderIds.length > 0) {
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1)', [testOrderIds]);
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
