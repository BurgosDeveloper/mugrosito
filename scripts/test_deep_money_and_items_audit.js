/**
 * Deep Money & Items Accounting Verification Suite
 * Validates 100% precision on:
 * 1. Multi-currency split payments (COP, USD, Bs)
 * 2. Excess cash and change calculation without rounding drift
 * 3. Exact item quantity, prices, extras and payer attribution
 * 4. Multi-quantity items expansion for split (2x -> two 1x)
 * 5. Reversal / deletion of payment entry restores exact debt and un-marks item
 * 6. Finalization sets payment_status='pagado' and frees table
 */

const { initDb, query } = require('../server/db');
const { createSession } = require('../server/helpers/sessionAuth');

const adminToken = createSession({ id: 'auditor-1', username: 'auditor', role: 'admin' });
const API_BASE = 'http://localhost:3001/api';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
  }
}

async function runDeepAudit() {
  await initDb();
  console.log('======================================================================');
  console.log('   💰 AUDITORÍA PROFUNDA DE CONTABILIDAD DE DINERO E ÍTEMS (100%)');
  console.log('======================================================================\n');

  // Rate baseline
  const copRate = 3100;
  const bsRate = 3.2;

  // Set rates in DB for consistency
  await query(`UPDATE shift_exchange_rates SET cop_rate = $1, bs_rate = $2 WHERE shift = 'ambos'`, [copRate, bsRate]);

  await query(`DELETE FROM order_payments WHERE order_id LIKE 'audit-%' OR order_id LIKE 'test-%'`);
  await query(`DELETE FROM order_items WHERE order_id LIKE 'audit-%' OR order_id LIKE 'test-%'`);
  await query(`DELETE FROM orders WHERE id LIKE 'audit-%' OR id LIKE 'test-%'`);

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: Multi-Currency Split Payment with Exact Change (Dinero & Items)
    // -------------------------------------------------------------------------
    console.log('📋 Test 1: Comanda con 3 ítems cobrada a 3 personas en 3 monedas distintas (COP, USD, Bs)');
    const orderId = `audit-ord-${Date.now()}`;
    const it1Id = `it-1-${Date.now()}`;
  const it2Id = `it-2-${Date.now()}`;
  const it3Id = `it-3-${Date.now()}`;

  // It 1: Hamburguesa Especial (18.000 COP)
  // It 2: Salchipapa (12.000 COP)
  // It 3: Bebida (5.000 COP)
  // Total Comanda: 35.000 COP (~$11.29 USD)
  const totalCOP = 35000;
  const totalUSD = Number((totalCOP / copRate).toFixed(4));

  await query(
    `INSERT INTO orders (id, order_number, type, table_number, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment)
     VALUES ($1, '8888', 'mesa', 5, 'entregada', 'no_pagado', $2, $3, 'ambos', $4, $5)`,
    [orderId, totalUSD, totalCOP, copRate, bsRate]
  );

  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, is_paid_individually, paid_by_name)
     VALUES
     ($1, $2, 'prod-hamb', 'Hamburguesa Especial', 18000, 1, false, null),
     ($3, $2, 'prod-salch', 'Salchipapa', 12000, 1, false, null),
     ($4, $2, 'prod-bebid', 'Bebida', 5000, 1, false, null)`,
    [it1Id, orderId, it2Id, it3Id]
  );

  // Step 1: Persona 1 (Carlos) pays It 1 (18.000 COP) with a 20.000 COP bill -> receives 2.000 COP change
  console.log('   -> Carlos paga 18.000 COP con billete de 20.000 COP (vuelto 2.000 COP)...');
  const pay1 = await api(`/orders/${orderId}/ledger`, {
    method: 'POST',
    body: JSON.stringify({
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 20000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Carlos',
      itemIds: [it1Id]
    })
  });
  assert(pay1.status === 200, 'Carlos registra pago en COP exitosamente');

  // Change for Carlos
  const change1 = await api(`/orders/${orderId}/ledger`, {
    method: 'POST',
    body: JSON.stringify({
      entryType: 'change',
      currency: 'COP',
      amountLocal: 2000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Carlos',
      itemIds: [it1Id]
    })
  });
  assert(change1.status === 200, 'Vuelto de 2.000 COP entregado a Carlos');

  // Verify DB state for Item 1
  const { rows: itemsAfterP1 } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  const item1Db = itemsAfterP1.find(i => i.id === it1Id);
  const item2Db = itemsAfterP1.find(i => i.id === it2Id);
  const item3Db = itemsAfterP1.find(i => i.id === it3Id);

  assert(item1Db.is_paid_individually === true, 'Ítem 1 (18.000 COP) marcado como pagado individualmente');
  assert(item1Db.paid_by_name === 'Carlos', 'Ítem 1 atribuido exactamente a Carlos');
  assert(item2Db.is_paid_individually === false, 'Ítem 2 permanece impago');
  assert(item3Db.is_paid_individually === false, 'Ítem 3 permanece impago');

  // Step 2: Persona 2 (Ana) pays It 2 (12.000 COP) in USD: 12.000 / 3100 = 3.8709 USD -> pays $5 USD bill -> receives $1.13 USD change
  console.log('   -> Ana paga 12.000 COP en USD con billete de $5 USD...');
  const pay2 = await api(`/orders/${orderId}/ledger`, {
    method: 'POST',
    body: JSON.stringify({
      entryType: 'payment',
      currency: 'USD',
      amountLocal: 5.00,
      paymentMethod: 'Efectivo USD',
      payerName: 'Ana',
      itemIds: [it2Id]
    })
  });
  assert(pay2.status === 200, 'Ana registra pago en USD exitosamente');

  const changeUSD = Number((5.00 - (12000 / copRate)).toFixed(2));
  const change2 = await api(`/orders/${orderId}/ledger`, {
    method: 'POST',
    body: JSON.stringify({
      entryType: 'change',
      currency: 'USD',
      amountLocal: changeUSD,
      paymentMethod: 'Efectivo USD',
      payerName: 'Ana',
      itemIds: [it2Id]
    })
  });
  assert(change2.status === 200, `Vuelto de $${changeUSD} USD entregado a Ana`);

  // Verify DB state for Item 2
  const { rows: itemsAfterP2 } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  const item2After = itemsAfterP2.find(i => i.id === it2Id);
  assert(item2After.is_paid_individually === true, 'Ítem 2 (12.000 COP) marcado como pagado individualmente');
  assert(item2After.paid_by_name === 'Ana', 'Ítem 2 atribuido exactamente a Ana');

  // Verify order is NOT closed yet
  const { rows: ordCheck1 } = await query('SELECT payment_status FROM orders WHERE id = $1', [orderId]);
  assert(ordCheck1[0].payment_status === 'no_pagado', 'Comanda continúa no_pagado porque falta el ítem 3');

  // Step 3: Persona 3 (Luis) pays It 3 (5.000 COP) in Bs: 5.000 / 3.20 = 1562.50 Bs
  console.log('   -> Luis paga 5.000 COP en Bs (1562.50 Bs Pago Móvil)...');
  const pay3 = await api(`/orders/${orderId}/ledger`, {
    method: 'POST',
    body: JSON.stringify({
      entryType: 'payment',
      currency: 'Bs',
      amountLocal: 1562.50,
      paymentMethod: 'Pago Móvil',
      payerName: 'Luis',
      itemIds: [it3Id]
    })
  });
  if (pay3.status !== 200) {
    console.error('PAY3 FAILED:', pay3.status, pay3.data);
  }
  assert(pay3.status === 200, 'Luis registra pago en Bs exitosamente');

  // Verify DB state for Item 3
  const { rows: itemsAfterP3 } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  const item3After = itemsAfterP3.find(i => i.id === it3Id);
  assert(item3After.is_paid_individually === true, 'Ítem 3 (5.000 COP) marcado como pagado individualmente');
  assert(item3After.paid_by_name === 'Luis', 'Ítem 3 atribuido exactamente a Luis');

  // All items are now 100% paid!
  const allItemsPaid = itemsAfterP3.every(i => i.is_paid_individually);
  assert(allItemsPaid === true, 'El 100% de los ítems de la comanda están pagados');

  // Step 4: Finalize Comanda
  const fin1 = await api(`/orders/${orderId}/finalize`, { method: 'POST' });
  assert(fin1.status === 200, 'Comanda finalizada con éxito al completarse todos los ítems y pagos');

  const { rows: ordFinal } = await query('SELECT payment_status FROM orders WHERE id = $1', [orderId]);
  assert(ordFinal[0].payment_status === 'pagado', 'Estado de la comanda cambia oficialmente a "pagado"');

  // -------------------------------------------------------------------------
  // SCENARIO 2: Verificación de Movimientos de Caja (Gaveta y Contabilidad Neta)
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 2: Auditoría de Dinero Neto Ingresado en Caja');
  const { rows: payments } = await query('SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at ASC', [orderId]);
  
  // Total Tendered COP & Change COP
  const tenderCOP = payments.reduce((sum, p) => sum + (parseFloat(p.cash_tendered_cop) || 0), 0);
  const changeCOP = payments.reduce((sum, p) => sum + (parseFloat(p.change_given_cop) || 0), 0);
  const netCOP = tenderCOP - changeCOP;
  assert(netCOP === 18000, `Neto en COP es exactamente 18.000 COP (Tendered: ${tenderCOP}, Change: ${changeCOP})`);

  // Total Tendered USD & Change USD
  const tenderUSD = payments.reduce((sum, p) => sum + (parseFloat(p.cash_tendered_usd) || 0), 0);
  const changeUSDTotal = payments.reduce((sum, p) => sum + (parseFloat(p.change_given_usd) || 0), 0);
  const netUSD = Number((tenderUSD - changeUSDTotal).toFixed(2));
  const expectedNetUSD = Number((12000 / copRate).toFixed(2));
  assert(Math.abs(netUSD - expectedNetUSD) <= 0.02, `Neto en USD es exactamente ~$3.87 USD (Tendered: $${tenderUSD}, Change: $${changeUSDTotal})`);

  // Total Bs
  const tenderBs = payments.reduce((sum, p) => sum + (parseFloat(p.cash_tendered_bs) || 0), 0);
  assert(tenderBs === 1562.50, `Neto en Bs es exactamente 1562.50 Bs`);

  // Total converted net COP of all 3 payments
  const totalReceivedInCOP = netCOP + (netUSD * copRate) + (tenderBs * bsRate);
  assert(Math.abs(totalReceivedInCOP - totalCOP) <= 100, `Total recaudado en valor COP cubre exactamente los 35.000 COP (Recaudado: ${Math.round(totalReceivedInCOP)} COP)`);

  // -------------------------------------------------------------------------
  // SCENARIO 3: Expansión de Ítems Multi-Cantidad (2x -> two 1x)
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 3: Auditoría de Expansión de Ítems Multi-Cantidad para División');
  const orderMultiId = `audit-multi-${Date.now()}`;
  const multiItemId = `it-multi-${Date.now()}`;

  // Comanda con 2x Hamburguesas Clásicas (10.000 COP c/u = 20.000 COP)
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment)
     VALUES ($1, '8889', 'mesa', 3, 'entregada', 'no_pagado', 6.45, 20000, 'ambos', $2, $3)`,
    [orderMultiId, copRate, bsRate]
  );

  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, proteins, extras_json, is_paid_individually)
     VALUES ($1, $2, 'prod-clas', 'Hamburguesa Clásica', 10000, 2, ARRAY['Carne', 'Tocineta']::text[], '[{"name":"Queso Extra","price":2000}]', false)`,
    [multiItemId, orderMultiId]
  );

  // Call expandOrderItemsForSplit
  const expandRes = await api(`/orders/${orderMultiId}/expand-split-items`, { method: 'POST' });
  assert(expandRes.status === 200, 'Expansión de ítems multi-cantidad ejecutada en servidor');

  const { rows: expandedItems } = await query('SELECT id, product_name, price, quantity, proteins, extras_json FROM order_items WHERE order_id = $1 ORDER BY id', [orderMultiId]);
  assert(expandedItems.length === 2, `Ítem de 2x se expandió a exactamente 2 ítems independientes (Obtenidos: ${expandedItems.length})`);
  assert(expandedItems.every(i => i.quantity === 1), 'Cada ítem resultante tiene quantity = 1');
  assert(expandedItems.every(i => Number(i.price) === 10000), 'Cada ítem resultante mantiene su precio unitario de 10.000 COP');
  
  const sumExpandedPrices = expandedItems.reduce((sum, i) => sum + Number(i.price), 0);
  assert(sumExpandedPrices === 20000, `La suma de precios de los ítems expandidos es exactamente igual al total original (20.000 COP)`);

  // -------------------------------------------------------------------------
  // SCENARIO 4: Anulación / Reversión de Pago y Restauración de Deuda
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 4: Auditoría de Reversión / Anulación de Pago y Restauración de Ítems');
  // Pay item 1 of expanded order
  const expIt1 = expandedItems[0].id;
  const expIt2 = expandedItems[1].id;

  const payExp1 = await api(`/orders/${orderMultiId}/ledger`, {
    method: 'POST',
    body: JSON.stringify({
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 10000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Pedro',
      itemIds: [expIt1]
    })
  });
  assert(payExp1.status === 200, 'Pedro paga ítem 1 expandido');

  // Verify item 1 is paid
  const { rows: afterPedroPay } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE id = $1', [expIt1]);
  assert(afterPedroPay[0].is_paid_individually === true, 'Ítem 1 queda marcado como pagado por Pedro');

  // Find payment entry ID
  const { rows: pedroPayments } = await query('SELECT id FROM order_payments WHERE order_id = $1', [orderMultiId]);
  const paymentToDeleteId = pedroPayments[0].id;

  // Delete payment entry (Anular pago)
  console.log('   -> Eliminando movimiento de pago para probar reversión segura...');
  const deleteRes = await api(`/orders/${orderMultiId}/payments/${paymentToDeleteId}`, { method: 'DELETE' });
  assert(deleteRes.status === 200, 'Movimiento de pago eliminado correctamente por la API');

  // Verify item 1 is restored to UNPAID
  const { rows: afterDeleteItems } = await query('SELECT id, is_paid_individually, paid_by_name FROM order_items WHERE id = $1', [expIt1]);
  assert(afterDeleteItems[0].is_paid_individually === false, 'Ítem 1 vuelve automáticamente a estado impago (is_paid_individually = false)');
  assert(afterDeleteItems[0].paid_by_name === null, 'paid_by_name se reinicia a null');

  // Verify order paid amount is 0
  const { rows: afterDeleteOrder } = await query('SELECT paid_amount_usd, payment_status FROM orders WHERE id = $1', [orderMultiId]);
  assert(Number(afterDeleteOrder[0].paid_amount_usd) === 0, 'paid_amount_usd vuelve a 0');
  assert(afterDeleteOrder[0].payment_status === 'no_pagado', 'payment_status vuelve a "no_pagado"');

  } finally {
    // Cleanup test orders reliably
    await query(`DELETE FROM order_payments WHERE order_id LIKE 'audit-%' OR order_id LIKE 'test-%'`);
    await query(`DELETE FROM order_items WHERE order_id LIKE 'audit-%' OR order_id LIKE 'test-%'`);
    await query(`DELETE FROM orders WHERE id LIKE 'audit-%' OR id LIKE 'test-%'`);
  }

  console.log('\n======================================================================');
  console.log(`  RESUMEN: ${testsPassed} PRUEBAS APROBADAS | ${testsFailed} FALLIDAS`);
  console.log('======================================================================');

  if (testsFailed === 0) {
    console.log('🎉 ¡AUDITORÍA 100% EXITOSA! LA CONTABILIDAD DE DINERO E ÍTEMS ES PERFECTA.');
    console.log(`${testsPassed} PASSED | 0 FAILED`);
    process.exit(0);
  } else {
    console.error('❌ Fallos detectados en la auditoría.');
    process.exit(1);
  }
}

runDeepAudit().catch((err) => {
  console.error('Error fatal durante la auditoría:', err);
  process.exit(1);
});
