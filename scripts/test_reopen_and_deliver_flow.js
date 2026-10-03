/**
 * Test: Reopen & Deliver Flow + 100% Accounting of Money and Items
 *
 * Verifies:
 * 1. Reactivating an already paid order preserves 'pagado' status if not modified.
 * 2. Marking it delivered immediately frees the table and removes it from active tables/deliveries/pickups.
 * 3. Reactivating a credit order preserves 'credito' status and debtor debt.
 * 4. Marking a credit order delivered keeps it settled and frees any table.
 * 5. Appending new items to a reopened order resets status to 'no_pagado' and re-occupies table until paid.
 * 6. 100% of money and items are accounted for across reporte-intervalo, reporte-diario, and thermal ticket.
 */

const http = require('http');
const { initDb, query, getClient } = require('../server/db');
const { createSession } = require('../server/helpers/sessionAuth');
const { buildCrispysCierreTicket } = require('../server/helpers/thermalPrinter');

const adminToken = createSession({ id: 'auditor-reopen-1', username: 'auditor', role: 'admin', shift: 'ambos' });
const PORT = 3001;

function api(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${adminToken}`,
        'x-mugrosito-token': adminToken
      },
      timeout: 10000
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: parsed });
        } catch (_) {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
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

// Helper to simulate frontend activeOrders filter
function isOrderSettled(o) {
  return (
    o.paymentStatus === 'pagado' ||
    o.payment_status === 'pagado' ||
    o.paymentStatus === 'credito' ||
    o.payment_status === 'credito' ||
    o.paymentMethod === 'Crédito' ||
    o.payment_method === 'Crédito' ||
    o.type === 'credito' ||
    (Number(o.paidAmountUSD || o.paid_amount_usd || 0) >= Number(o.totalUSD || o.total_usd || 0) - 0.01 && Number(o.totalUSD || o.total_usd || 0) > 0)
  );
}

function isOrderActive(o) {
  return (
    o.status !== 'cancelado' &&
    o.status !== 'fusionada' &&
    !(o.status === 'entregada' && isOrderSettled(o))
  );
}

async function runTest() {
  await initDb();
  console.log('======================================================================');
  console.log('   🔄 AUDITORÍA: REAPERTURA DE COMANDAS, ENTREGA Y LIBERACIÓN (100%)');
  console.log('======================================================================\n');

  const testRunId = Date.now();
  const startTime = new Date(Date.now() - 60000).toISOString();

  // Asegurar que las mesas 1 y 2 existan en tables_config
  await query(`INSERT INTO tables_config (id, number, name, capacity, status) VALUES ('tbl-1', 1, 'Mesa 1', 4, 'libre'), ('tbl-2', 2, 'Mesa 2', 4, 'libre') ON CONFLICT (number) DO UPDATE SET status = 'libre'`);
  await query(`UPDATE tables_config SET status = 'libre' WHERE number IN (1, 2)`);

  // -------------------------------------------------------------------------
  // TEST 1: Comanda de Salón Pagada -> Entregada -> Reabierta -> Entregada
  // -------------------------------------------------------------------------
  console.log('📋 TEST 1: Comanda de Salón (Mesa 1) Pagada -> Reabierta -> Entregada');
  const ord1Id = `reopen-mesa-${testRunId}`;
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, created_at, updated_at)
     VALUES ($1, '801', 'mesa', 1, 'preparada', 'no_pagado', 10.00, 31000, 'ambos', 3100, 3.2, NOW(), NOW())`,
    [ord1Id]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
     VALUES ($1, $2, 'prod-1', 'Hot Dog Especial', 31000, 1, 'Hot Dogs')`,
    [`it-1-${testRunId}`, ord1Id]
  );
  await query(`UPDATE tables_config SET status = 'ocupada' WHERE number = 1`);

  // Pagar comanda 1 en su totalidad
  const pay1Res = await api('POST', `/api/orders/${ord1Id}/pay`, {
    paymentMethod: 'Efectivo COP',
    amountUSD: 10.00,
    cashTenderedCOP: 31000,
    changeGivenCOP: 0
  });
  assert(pay1Res.ok, 'Pago de comanda 1 registrado');

  // Entregar comanda 1
  const del1Res = await api('PATCH', `/api/orders/${ord1Id}/status`, { status: 'entregada' });
  assert(del1Res.ok, 'Comanda 1 marcada como entregada');

  // Verificar que la mesa 1 quedó libre
  const { rows: table1Rows } = await query(`SELECT status FROM tables_config WHERE number = 1`);
  assert(table1Rows[0]?.status === 'libre', 'Mesa 1 quedó LIBRE tras entregar comanda pagada');

  // Reactivar comanda 1
  const reopen1Res = await api('POST', `/api/orders/${ord1Id}/reopen`);
  assert(reopen1Res.ok, 'Comanda 1 reabierta exitosamente vía POST /reopen');
  assert(reopen1Res.data?.paymentStatus === 'pagado', 'Comanda 1 preserva paymentStatus="pagado" porque ya estaba saldada');
  assert(reopen1Res.data?.status === 'preparada', 'Comanda 1 tiene status="preparada"');

  // Volver a marcar como entregada
  const redeliver1Res = await api('PATCH', `/api/orders/${ord1Id}/status`, { status: 'entregada' });
  assert(redeliver1Res.ok, 'Comanda 1 marcada nuevamente como entregada');
  assert(redeliver1Res.data?.paymentStatus === 'pagado', 'Comanda 1 entregada mantiene paymentStatus="pagado"');

  // Verificar que la mesa 1 quedó LIBRE de inmediato
  const { rows: table1AfterReopen } = await query(`SELECT status FROM tables_config WHERE number = 1`);
  assert(table1AfterReopen[0]?.status === 'libre', 'Mesa 1 quedó LIBRE inmediatamente tras entregar comanda reabierta');

  // Verificar filtro de comanda activa
  assert(!isOrderActive(redeliver1Res.data), 'Comanda 1 ya NO figura en activeOrders de mesas');

  // -------------------------------------------------------------------------
  // TEST 2: Comanda a Crédito -> Reabierta -> Entregada
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 2: Comanda a Crédito -> Reabierta -> Entregada');
  const ord2Id = `reopen-cred-${testRunId}`;
  await query(
    `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, created_at, updated_at)
     VALUES ($1, '802', 'delivery', 'Cliente Crédito SA', 'preparada', 'no_pagado', 20.00, 62000, 'ambos', 3100, 3.2, NOW(), NOW())`,
    [ord2Id]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
     VALUES ($1, $2, 'prod-2', 'Hamburguesa Doble', 62000, 1, 'Hamburguesas')`,
    [`it-2-${testRunId}`, ord2Id]
  );

  // Cerrar a crédito
  const creditRes = await api('POST', `/api/orders/${ord2Id}/credit`, {
    debtorName: 'Cliente Crédito SA',
    notes: 'Cuenta a crédito mensual'
  });
  assert(creditRes.ok, 'Comanda 2 cerrada a crédito exitosamente');
  assert(creditRes.data?.paymentStatus === 'credito' || creditRes.data?.order?.paymentStatus === 'credito', 'Comanda 2 tiene paymentStatus="credito"');

  // Reabrir comanda 2
  const reopen2Res = await api('POST', `/api/orders/${ord2Id}/reopen`);
  assert(reopen2Res.ok, 'Comanda 2 reabierta');
  assert(reopen2Res.data?.paymentStatus === 'credito', 'Comanda 2 preserva estatus "credito" sin volver a no_pagado');

  // Volver a entregar comanda 2
  const redeliver2Res = await api('PATCH', `/api/orders/${ord2Id}/status`, { status: 'entregada' });
  assert(redeliver2Res.ok, 'Comanda 2 entregada');
  assert(redeliver2Res.data?.paymentStatus === 'credito', 'Comanda 2 mantiene paymentStatus="credito" al entregarse');
  assert(!isOrderActive(redeliver2Res.data), 'Comanda 2 a crédito ya NO figura en activeDeliveryOrders');

  // -------------------------------------------------------------------------
  // TEST 3: Comanda Pagada -> Reabierta -> Nuevos Ítems Adicionados -> Saldo Pendiente
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 3: Comanda Pagada (Mesa 2) -> Reabierta -> Adición de Ítems');
  const ord3Id = `reopen-append-${testRunId}`;
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, created_at, updated_at)
     VALUES ($1, '803', 'mesa', 2, 'preparada', 'no_pagado', 5.00, 15500, 'ambos', 3100, 3.2, NOW(), NOW())`,
    [ord3Id]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
     VALUES ($1, $2, 'prod-3', 'Papas Fritas', 15500, 1, 'Papas')`,
    [`it-3-${testRunId}`, ord3Id]
  );
  await query(`UPDATE tables_config SET status = 'ocupada' WHERE number = 2`);

  // Pagar y entregar comanda 3
  await api('POST', `/api/orders/${ord3Id}/pay`, { paymentMethod: 'Efectivo USD', amountUSD: 5.00 });
  await api('PATCH', `/api/orders/${ord3Id}/status`, { status: 'entregada' });
  const { rows: table2Free } = await query(`SELECT status FROM tables_config WHERE number = 2`);
  assert(table2Free[0]?.status === 'libre', 'Mesa 2 libre tras pago y entrega inicial');

  // Reabrir comanda 3
  await api('POST', `/api/orders/${ord3Id}/reopen`);

  // Adicionar un nuevo producto (+ $5.00 USD / 15.500 COP)
  const appendRes = await api('POST', `/api/orders/${ord3Id}/append-items`, {
    addedItems: [
      { id: `it-3b-${testRunId}`, productId: 'prod-4', productName: 'Gaseosa 1.5L', price: 15500, quantity: 1, category: 'Bebidas' }
    ]
  });
  assert(appendRes.ok, 'Ítems adicionales agregados a comanda 3');
  assert(appendRes.data?.order?.paymentStatus === 'no_pagado', 'Comanda 3 pasa a paymentStatus="no_pagado" por el saldo adicional');

  // Verificar que la mesa 2 se marcó ocupada
  const { rows: table2Occupied } = await query(`SELECT status FROM tables_config WHERE number = 2`);
  assert(table2Occupied[0]?.status === 'ocupada', 'Mesa 2 se re-ocupó debido al saldo pendiente');

  // Pagar el saldo restante ($5.00 USD)
  const pay3Res = await api('POST', `/api/orders/${ord3Id}/pay`, { paymentMethod: 'Efectivo USD', amountUSD: 5.00 });
  assert(pay3Res.ok, 'Saldo pendiente de comanda 3 cubierto');

  // Entregar comanda 3
  const redeliver3Res = await api('PATCH', `/api/orders/${ord3Id}/status`, { status: 'entregada' });
  assert(redeliver3Res.ok, 'Comanda 3 entregada');
  const { rows: table2FreeAgain } = await query(`SELECT status FROM tables_config WHERE number = 2`);
  assert(table2FreeAgain[0]?.status === 'libre', 'Mesa 2 quedó LIBRE tras pagar y entregar los ítems adicionales');
  assert(!isOrderActive(redeliver3Res.data), 'Comanda 3 no está activa en la cuadrícula de mesas');

  // -------------------------------------------------------------------------
  // TEST 4: Contabilidad al 100% en Reporte de Intervalo y Reporte Diario
  // -------------------------------------------------------------------------
  console.log('\n📊 TEST 4: Verificación Contable de Dinero e Ítems al 100%');
  const endTime = new Date(Date.now() + 60000).toISOString();

  const repRes = await api('GET', `/api/caja/reporte-intervalo?from=${encodeURIComponent(startTime)}&to=${encodeURIComponent(endTime)}`);
  assert(repRes.ok, 'GET /caja/reporte-intervalo responde 200');

  const { orders: repOrders, items: repItems, payments: repPayments } = repRes.data;

  // 1. Todas las órdenes están presentes
  const f1 = repOrders.find(o => o.id === ord1Id);
  const f2 = repOrders.find(o => o.id === ord2Id);
  const f3 = repOrders.find(o => o.id === ord3Id);
  assert(Boolean(f1), 'Comanda 1 (Salón pagada) presente en reporte');
  assert(Boolean(f2), 'Comanda 2 (Crédito) presente en reporte');
  assert(Boolean(f3), 'Comanda 3 (Con adición) presente en reporte');

  // 2. Todos los ítems están presentes al 100%
  const i1 = repItems.filter(i => i.orderId === ord1Id);
  const i2 = repItems.filter(i => i.orderId === ord2Id);
  const i3 = repItems.filter(i => i.orderId === ord3Id);
  assert(i1.length === 1, 'Comanda 1 tiene su ítem en el reporte');
  assert(i2.length === 1, 'Comanda 2 a crédito tiene su ítem en el reporte');
  assert(i3.length === 2, 'Comanda 3 tiene sus 2 ítems (original + adicional) en el reporte');

  // 3. Pagos y Créditos reflejados
  const pCred = repPayments.find(p => p.orderId === ord2Id);
  assert(Boolean(pCred), 'Existe pago de comanda a crédito en historial');
  assert(pCred?.paymentMethod === 'Crédito', 'Método de pago de crédito es "Crédito"');
  assert(Number(pCred?.cashTenderedCOP) === 62000, 'cashTenderedCOP de crédito es 62.000 COP exacto');

  // 4. Reporte Diario
  const diarioRes = await api('GET', `/api/caja/reporte-diario`);
  assert(diarioRes.ok, 'GET /caja/reporte-diario responde 200');
  assert(diarioRes.data?.totalOrdersCredit >= 1, 'Reporte diario contabiliza órdenes a crédito');
  assert(diarioRes.data?.byPaymentMethod?.Crédito >= 20, 'Reporte diario desglose incluye Crédito');

  // 5. Ticket Térmico de Cierre
  console.log('\n🧾 Probando Ticket Térmico de Cierre con Créditos...');
  const ticketBuf = buildCrispysCierreTicket({
    dateRange: { from: startTime, to: endTime },
    apertura: { usdCash: 10, copCash: 20000 },
    orders: [f1, f2, f3],
    items: [...i1, ...i2, ...i3],
    payments: repPayments,
    transactions: [],
    exchangeRates: { COP: 3100, Bs: 3.2 }
  });
  const ticketStr = Buffer.isBuffer(ticketBuf) ? ticketBuf.toString('utf8') : String(ticketBuf || '');
  assert(ticketStr.includes('CUENTAS POR COBRAR') || ticketStr.includes('CREDITO') || ticketStr.includes('Cliente'), 'Ticket térmico contiene sección de cuentas por cobrar');
  assert(ticketStr.includes('Hamburguesa') || ticketStr.includes('HAMBURGUESA'), 'Ticket térmico contiene ítem de orden a crédito');
  assert(ticketStr.includes('Gaseosa') || ticketStr.includes('GASEOSA'), 'Ticket térmico contiene ítem adicional agregado tras reapertura');

  // Cleanup de las órdenes de prueba
  await query(`DELETE FROM order_payments WHERE order_id IN ($1, $2, $3)`, [ord1Id, ord2Id, ord3Id]);
  await query(`DELETE FROM order_items WHERE order_id IN ($1, $2, $3)`, [ord1Id, ord2Id, ord3Id]);
  await query(`DELETE FROM orders WHERE id IN ($1, $2, $3)`, [ord1Id, ord2Id, ord3Id]);
  await query(`UPDATE tables_config SET status = 'libre' WHERE number IN (1, 2)`);

  console.log('\n======================================================================');
  console.log(`TOTAL PRUEBAS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Fatal error in test:', err);
  process.exit(1);
});
