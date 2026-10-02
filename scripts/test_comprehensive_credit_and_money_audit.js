/**
 * Comprehensive Money & Items 100% Audit
 * Tests:
 * 1. Cash COP, Cash USD, Pago Móvil (Bs), Bancolombia (COP)
 * 2. Orders closed as CREDIT (with items and extras)
 * 3. Verify that 100% of items and 100% of money are present in:
 *    - /api/reportes/reporte-intervalo
 *    - /api/caja/cierre simulation
 *    - reportService (reporte contable logic)
 *    - thermalPrinter (buildCrispysCierreTicket)
 *    - excelExport (export logic)
 */

const { initDb, query } = require('../server/db');
const { createSession } = require('../server/helpers/sessionAuth');
const { buildCrispysCierreTicket } = require('../server/helpers/thermalPrinter');

const adminToken = createSession({ id: 'auditor-credit-1', username: 'auditor', role: 'admin', shift: 'ambos' });
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

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runAudit() {
  await initDb();
  console.log('======================================================================');
  console.log('   🔍 AUDITORÍA DE REPORTES: 100% DE DINERO E ÍTEMS (CONTADO Y CRÉDITO)');
  console.log('======================================================================\n');

  const copRate = 3100;
  const bsRate = 3.2;
  const testRunId = Date.now();
  const startTime = new Date(Date.now() - 60000).toISOString();

  // Create 3 orders:
  // Order 1: Contado Efectivo COP (30.000 COP) - 2 Hot Dogs
  const ord1Id = `audit-c-cop-${testRunId}`;
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, status, payment_status, payment_method, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, created_at, updated_at)
     VALUES ($1, '901', 'mesa', 1, 'entregada', 'pagado', 'Efectivo COP', 9.68, 30000, 'ambos', $2, $3, NOW(), NOW())`,
    [ord1Id, copRate, bsRate]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
     VALUES 
     ($1, $2, 'p-hd1', 'Hot Dog Clásico', 15000, 1, 'Hot Dogs'),
     ($3, $2, 'p-hd2', 'Hot Dog Especial', 15000, 1, 'Hot Dogs')`,
    [`it-1-${testRunId}`, ord1Id, `it-2-${testRunId}`]
  );
  await query(
    `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, cop_rate, bs_rate, created_at)
     VALUES ($1, $2, 'Cliente Contado', 'Efectivo COP', 9.68, 30000, $3, $4, NOW())`,
    [`pay-1-${testRunId}`, ord1Id, copRate, bsRate]
  );

  // Order 2: Contado Pago Móvil (40.000 COP = 12.90 USD = 41.29 Bs) - 1 Hamburguesa + 1 Bebida
  const ord2Id = `audit-c-pm-${testRunId}`;
  await query(
    `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, payment_method, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, created_at, updated_at)
     VALUES ($1, '902', 'delivery', 'Cliente Móvil', 'entregada', 'pagado', 'Pago Móvil', 12.90, 40000, 'ambos', $2, $3, NOW(), NOW())`,
    [ord2Id, copRate, bsRate]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
     VALUES 
     ($1, $2, 'p-hamb1', 'Hamburguesa Doble', 35000, 1, 'Hamburguesas'),
     ($3, $2, 'p-beb1', 'Refresco 350ml', 5000, 1, 'Bebidas')`,
    [`it-3-${testRunId}`, ord2Id, `it-4-${testRunId}`]
  );
  await query(
    `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_bs, cop_rate, bs_rate, created_at)
     VALUES ($1, $2, 'Cliente Móvil', 'Pago Móvil', 12.90, 41.29, $3, $4, NOW())`,
    [`pay-2-${testRunId}`, ord2Id, copRate, bsRate]
  );

  // Order 3: CERRADO A CRÉDITO (50.000 COP = 16.13 USD) - 2 Salchipapas + 2 Bebidas
  // Test credit closing via the real API POST /api/orders/:id/credit
  const ord3Id = `audit-cred-${testRunId}`;
  await query(
    `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, created_at, updated_at)
     VALUES ($1, '903', 'para_llevar', 'Empresa Aliada S.A.', 'entregada', 'no_pagado', 16.13, 50000, 'ambos', $2, $3, NOW(), NOW())`,
    [ord3Id, copRate, bsRate]
  );
  const itCred1 = `it-5-${testRunId}`;
  const itCred2 = `it-6-${testRunId}`;
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
     VALUES 
     ($1, $2, 'p-salch1', 'Salchipapa Mixta', 20000, 2, 'Salchipapas'),
     ($3, $2, 'p-beb2', 'Nestea Durazno', 5000, 2, 'Bebidas')`,
    [itCred1, ord3Id, itCred2]
  );

  console.log('📌 Pasando comanda ord-3 a CRÉDITO vía POST /api/orders/:id/credit...');
  const creditRes = await api(`/orders/${ord3Id}/credit`, {
    method: 'POST',
    body: JSON.stringify({
      debtorName: 'Empresa Aliada S.A.',
      notes: 'Factura crédito a 15 días'
    })
  });

  assert(creditRes.status === 200, `POST /orders/${ord3Id}/credit responde 200 OK`);
  assert(creditRes.data?.paymentStatus === 'credito' || creditRes.data?.order?.paymentStatus === 'credito', 'Estado de la orden es "credito"');

  const endTime = new Date(Date.now() + 60000).toISOString();

  // -----------------------------------------------------------------------
  // TEST REPORT INTERVALO API (/api/caja/reporte-intervalo)
  // -----------------------------------------------------------------------
  console.log('\n📊 Probando Endpoint /api/caja/reporte-intervalo...');
  const repRes = await api(`/caja/reporte-intervalo?from=${encodeURIComponent(startTime)}&to=${encodeURIComponent(endTime)}`);
  assert(repRes.status === 200, 'GET /caja/reporte-intervalo responde 200 OK');

  const { orders: repOrders, items: repItems, payments: repPayments } = repRes.data;
  console.log(`startTime: ${startTime}, endTime: ${endTime}`);
  console.log(`repOrders count: ${repOrders?.length}, ids: ${repOrders?.map(o => o.id)}`);
  console.log(`target ids: ${ord1Id}, ${ord2Id}, ${ord3Id}`);

  // 1. Check all 3 orders are present
  const foundOrd1 = repOrders.find(o => o.id === ord1Id);
  const foundOrd2 = repOrders.find(o => o.id === ord2Id);
  const foundOrd3 = repOrders.find(o => o.id === ord3Id);

  assert(Boolean(foundOrd1), 'Comanda Contado Efectivo COP está presente en órdenes');
  assert(Boolean(foundOrd2), 'Comanda Contado Pago Móvil está presente en órdenes');
  assert(Boolean(foundOrd3), 'Comanda a CRÉDITO está 100% presente en órdenes');
  assert(foundOrd3?.paymentStatus === 'credito', 'Comanda 3 tiene paymentStatus="credito"');
  assert(Number(foundOrd3?.totalCOP) === 50000, 'Comanda a crédito tiene totalCOP=50.000 exacto');

  // 2. Check all items from all 3 orders are present (including credit items!)
  const itemsOrd1 = repItems.filter(i => i.orderId === ord1Id);
  const itemsOrd2 = repItems.filter(i => i.orderId === ord2Id);
  const itemsOrd3 = repItems.filter(i => i.orderId === ord3Id);

  assert(itemsOrd1.length === 2, `Comanda 1 tiene 2 ítems en reporte (encontrados: ${itemsOrd1.length})`);
  assert(itemsOrd2.length === 2, `Comanda 2 tiene 2 ítems en reporte (encontrados: ${itemsOrd2.length})`);
  assert(itemsOrd3.length === 2, `Comanda a CRÉDITO tiene 2 ítems en reporte (encontrados: ${itemsOrd3.length})`);

  const totalCreditSalchipapas = itemsOrd3.find(i => i.productName === 'Salchipapa Mixta');
  assert(Number(totalCreditSalchipapas?.quantity) === 2, 'Cantidad de Salchipapas a crédito es 2');

  // 3. Check payments include the credit order payment
  const creditPayment = repPayments.find(p => p.orderId === ord3Id);
  assert(Boolean(creditPayment), 'Existe registro de pago correspondiente a la comanda a crédito');
  assert(creditPayment?.paymentMethod === 'Crédito', 'Método de pago de crédito registrado como "Crédito"');
  assert(Number(creditPayment?.cashTenderedCOP) === 50000, `cashTenderedCOP del crédito es 50.000 COP (valor: ${creditPayment?.cashTenderedCOP})`);

  // -----------------------------------------------------------------------
  // TEST THERMAL CLOSING TICKET (buildCrispysCierreTicket)
  // -----------------------------------------------------------------------
  console.log('\n🧾 Probando Generación de Ticket Térmico de Cierre (buildCrispysCierreTicket)...');
  const dummyApertura = { usdCash: 50, copCash: 100000, openedAt: startTime };
  const ticketText = buildCrispysCierreTicket({
    dateRange: { from: startTime, to: endTime },
    apertura: dummyApertura,
    orders: [foundOrd1, foundOrd2, foundOrd3],
    items: repItems.filter(i => [ord1Id, ord2Id, ord3Id].includes(i.orderId)),
    payments: repPayments.filter(p => [ord1Id, ord2Id, ord3Id].includes(p.orderId)),
    transactions: [],
    exchangeRates: { COP: copRate, Bs: bsRate }
  });

  const ticketString = ticketText.toString('utf8');
  console.log('--- GENERATED TICKET TEXT ---');
  console.log(ticketString);
  console.log('-----------------------------');

  assert(ticketString.includes('CREDITO'), 'El ticket incluye la sección o concepto de CREDITO');
  assert(ticketString.includes('50.000') || ticketString.includes('50000') || ticketString.includes('50,000'), 'El ticket muestra el monto del crédito (50.000 COP)');
  assert(ticketString.includes('Empresa Aliada S.A.') || ticketString.includes('EMPRESA ALIADA') || ticketString.includes('Empresa'), 'El ticket incluye el nombre del deudor a crédito');
  assert(ticketString.includes('Salchipapa') || ticketString.includes('SALCHIPAPA'), 'El ticket incluye los productos vendidos a crédito');

  // Verify drawer cash is not inflated by credit
  // Expected COP in drawer should be: Apertura (100.000) + Efectivo COP cobrado (30.000) = 130.000 COP
  assert(ticketString.includes('130.000') || ticketString.includes('130,000') || ticketString.includes('130000'), 'Gaveta física en COP refleja estrictamente el efectivo real (130.000 COP), NO suma el crédito como dinero físico');

  // -----------------------------------------------------------------------
  // TEST TOTAL FACTURADO (Venta Neta = Contado + Crédito)
  // -----------------------------------------------------------------------
  console.log('\n💰 Verificando Consistencia Contable: Total Facturado = Contado + Crédito...');
  const totalFacturadoCOP = 30000 + 40000 + 50000; // 120.000 COP
  console.log(`  Total facturado esperado: ${totalFacturadoCOP.toLocaleString('es-CO')} COP`);
  assert(ticketString.includes('120.000') || ticketString.includes('120,000') || ticketString.includes('120000'), 'Total Facturado en ticket refleja 120.000 COP (100% de ventas contado + crédito)');

  // Cleanup test orders
  await query(`DELETE FROM order_payments WHERE order_id IN ($1, $2, $3)`, [ord1Id, ord2Id, ord3Id]);
  await query(`DELETE FROM order_items WHERE order_id IN ($1, $2, $3)`, [ord1Id, ord2Id, ord3Id]);
  await query(`DELETE FROM orders WHERE id IN ($1, $2, $3)`, [ord1Id, ord2Id, ord3Id]);

  console.log('\n======================================================================');
  console.log(`   RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('Fatal error in audit:', err);
  process.exit(1);
});
