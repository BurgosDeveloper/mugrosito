const { initDb, query } = require('../server/db');
const { createSession } = require('../server/helpers/sessionAuth');

const adminToken = createSession({ id: 'admin-tester', username: 'admin', role: 'admin' });

async function testSplitFlow() {
  await initDb();
  console.log('Testing split payment by person backend flow...');
  const orderId = 'test-split-' + Date.now();
  const itemId1 = 'item-1-' + Date.now();
  const itemId2 = 'item-2-' + Date.now();
  const itemId3 = 'item-3-' + Date.now();

  // Create order with 3 items (each 10000 COP, total 30000 COP)
  await query(
    `INSERT INTO orders (id, order_number, type, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment)
     VALUES ($1, '9999', 'mesa', 'entregada', 'no_pagado', 9.68, 30000, 'ambos', 3100, 3.2)`,
    [orderId]
  );

  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, is_paid_individually, paid_by_name)
     VALUES
     ($1, $2, 'prod-1', 'Hamburguesa 1', 10000, 1, false, null),
     ($3, $2, 'prod-1', 'Hamburguesa 2', 10000, 1, false, null),
     ($4, $2, 'prod-1', 'Hamburguesa 3', 10000, 1, false, null)`,
    [itemId1, orderId, itemId2, itemId3]
  );

  // Person 1 pays items 1 and 2
  const p1Res = await fetch('http://localhost:3001/api/orders/' + orderId + '/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 20000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Carlos',
      itemIds: [itemId1, itemId2]
    })
  });
  const p1Data = await p1Res.json();
  console.log('P1 Ledger Status:', p1Res.status);
  if (p1Res.status !== 200) {
    console.error('P1 Error:', p1Data);
    throw new Error('P1 Ledger failed');
  }

  // Check items
  const { rows: itemsAfterP1 } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  console.log('Items after P1:', itemsAfterP1);
  const it1 = itemsAfterP1.find(i => i.id === itemId1);
  const it2 = itemsAfterP1.find(i => i.id === itemId2);
  const it3 = itemsAfterP1.find(i => i.id === itemId3);

  if (!it1.is_paid_individually || it1.paid_by_name !== 'Carlos') {
    throw new Error('Item 1 not properly paid by Carlos');
  }
  if (!it2.is_paid_individually || it2.paid_by_name !== 'Carlos') {
    throw new Error('Item 2 not properly paid by Carlos');
  }
  if (it3.is_paid_individually) {
    throw new Error('Item 3 should NOT be paid yet');
  }
  console.log('✅ P1 payment correctly marked items 1 & 2 as paid by Carlos and left item 3 unpaid!');

  // Person 2 pays item 3
  const p2Res = await fetch('http://localhost:3001/api/orders/' + orderId + '/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 10000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Ana',
      itemIds: [itemId3]
    })
  });
  const p2Data = await p2Res.json();
  console.log('P2 Ledger Status:', p2Res.status);
  if (p2Res.status !== 200) {
    console.error('P2 Error:', p2Data);
    throw new Error('P2 Ledger failed');
  }

  const { rows: itemsAfterP2 } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  console.log('Items after P2:', itemsAfterP2);
  const it3After = itemsAfterP2.find(i => i.id === itemId3);
  if (!it3After.is_paid_individually || it3After.paid_by_name !== 'Ana') {
    throw new Error('Item 3 not properly paid by Ana');
  }
  console.log('✅ P2 payment correctly marked item 3 as paid by Ana!');

  // Now finalize order
  const finRes = await fetch('http://localhost:3001/api/orders/' + orderId + '/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Finalize status:', finRes.status);
  if (finRes.status !== 200) {
    const finErr = await finRes.json();
    console.error('Finalize error:', finErr);
    throw new Error('Finalize failed');
  }

  const { rows: finalOrderRows } = await query('SELECT payment_status FROM orders WHERE id = $1', [orderId]);
  console.log('Final order status:', finalOrderRows[0].payment_status);
  if (finalOrderRows[0].payment_status !== 'pagado') {
    throw new Error('Order not marked as pagado');
  }
  console.log('✅ Order finalized successfully as pagado!');

  // Clean up
  await query('DELETE FROM order_payments WHERE order_id = $1', [orderId]);
  await query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
  await query('DELETE FROM orders WHERE id = $1', [orderId]);
  console.log('✅ ALL SPLIT PERSON FLOW TESTS PASSED 100%!');
  console.log('4 PASSED | 0 FAILED');
  process.exit(0);
}

testSplitFlow().catch(err => {
  console.error(err);
  process.exit(1);
});
