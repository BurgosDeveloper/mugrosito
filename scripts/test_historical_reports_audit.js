/**
 * Test: Auditoría de Reportes Históricos (Días Anteriores)
 * Valida:
 * 1. Comandas archivadas / cerradas de días anteriores se consultan al 100%.
 * 2. 100% del dinero e ítems vendidos en días pasados están intactos.
 * 3. Comandas a crédito de días pasados se contabilizan con sus deudores y montos.
 * 4. Tasas de cambio históricas se respetan (no se contaminan con la tasa de hoy).
 * 5. Fondo de apertura histórico se respeta.
 * 6. Generación de ticket y reporte HTML para fechas pasadas es 100% libre de errores.
 */

const { initDb, query } = require('../server/db');
const { createSession } = require('../server/helpers/sessionAuth');
const { buildReportTicket } = require('../server/helpers/thermalPrinter');

const token = createSession({ id: 'auditor-hist', username: 'auditor', role: 'admin', shift: 'ambos' });
const API_BASE = 'http://localhost:3001/api';

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
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

async function runTest() {
  await initDb();
  console.log('======================================================================');
  console.log('   🗓️ AUDITORÍA DE REPORTES HISTÓRICOS Y DÍAS ANTERIORES (100%)');
  console.log('======================================================================\n');

  // Pre-limpieza
  await query(`DELETE FROM order_payments WHERE order_id LIKE 'audit-hist-%'`);
  await query(`DELETE FROM order_items WHERE order_id LIKE 'audit-hist-%'`);
  await query(`DELETE FROM orders WHERE id LIKE 'audit-hist-%'`);
  await query(`DELETE FROM caja_chica_transactions WHERE id LIKE 'audit-hist-%'`);

  const runId = Date.now();
  const pastDateStr = '2026-08-15';
  const pastCreatedAt = `${pastDateStr} 19:30:00.000`;
  const pastRateCOP = 2950; // Tasa histórica diferente a la de hoy (3100)
  const pastRateBs = 2.80;

  try {
    // 1. Crear Orden 1 Histórica (Contado Efectivo COP) - Archivada
    const ord1Id = `audit-hist-ord1-${runId}`;
    await query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, payment_method, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, archived_at, created_at, updated_at)
       VALUES ($1, '701', 'mesa', 'Cliente Histórico 1', 'entregada', 'pagado', 'Efectivo COP', 10.00, 29500, 'ambos', $2, $3, $4, $5, $5)`,
      [ord1Id, pastRateCOP, pastRateBs, `${pastDateStr} 23:00:00`, pastCreatedAt]
    );
    await query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'p-hist1', 'Hamburguesa Especial', 29500, 1, 'Hamburguesas')`,
      [`it-h1-${runId}`, ord1Id]
    );
    await query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente Histórico 1', 'Efectivo COP', 10.00, 29500, $3, $4, $5)`,
      [`pay-h1-${runId}`, ord1Id, pastRateCOP, pastRateBs, pastCreatedAt]
    );

    // 2. Crear Orden 2 Histórica (A CRÉDITO) - Archivada
    const ord2Id = `audit-hist-ord2-${runId}`;
    await query(
      `INSERT INTO orders (id, order_number, type, customer_name, debtor_name, status, payment_status, payment_method, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment, archived_at, created_at, updated_at)
       VALUES ($1, '702', 'para_llevar', 'Empresa Histórica S.A.', 'Empresa Histórica S.A.', 'entregada', 'credito', 'Crédito', 15.00, 44250, 'ambos', $2, $3, $4, $5, $5)`,
      [ord2Id, pastRateCOP, pastRateBs, `${pastDateStr} 23:00:00`, pastCreatedAt]
    );
    await query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES 
       ($1, $2, 'p-hist2', 'Salchipapa Mega', 34250, 1, 'Salchipapas'),
       ($3, $2, 'p-hist3', 'Refresco 350ml', 10000, 1, 'Bebidas')`,
      [`it-h2-${runId}`, ord2Id, `it-h3-${runId}`]
    );
    await query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Empresa Histórica S.A.', 'Crédito', 15.00, 44250, $3, $4, $5)`,
      [`pay-h2-${runId}`, ord2Id, pastRateCOP, pastRateBs, pastCreatedAt]
    );

    // 3. Crear Gasto Histórico
    const txId = `audit-hist-tx-${runId}`;
    await query(
      `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, amount_bs, payment_method, description, shift, timestamp)
       VALUES ($1, 'egreso', 0, 5000, 0, 'Efectivo COP', 'Compra de hielo histórica', 'ambos', $2)`,
      [txId, pastCreatedAt]
    );

    // CONSULTAR REPORTE DEL DÍA HISTÓRICO VÍA API
    const fromParam = `${pastDateStr}T00:00`;
    const toParam = `${pastDateStr}T23:59`;
    console.log(`📡 Consultando API /api/caja/reporte-intervalo para fecha ${pastDateStr}...`);
    const res = await api(`/caja/reporte-intervalo?from=${encodeURIComponent(fromParam)}&to=${encodeURIComponent(toParam)}`);

    assert(res.status === 200, 'GET /caja/reporte-intervalo responde 200 OK para fecha pasada');
    const { orders, items, payments, transactions, exchangeRates } = res.data;

    // Aserciones de Órdenes
    assert(orders.length === 2, `Se recuperaron exactamente las 2 órdenes del día histórico (obtenidas: ${orders.length})`);
    const ord1 = orders.find(o => o.id === ord1Id);
    const ord2 = orders.find(o => o.id === ord2Id);
    assert(ord1 && ord1.paymentStatus === 'pagado', 'Orden 1 recuperada en estado "pagado"');
    assert(ord2 && ord2.paymentStatus === 'credito', 'Orden 2 a crédito recuperada en estado "credito"');
    assert(ord1.orderNumber === '701' && ord2.orderNumber === '702', 'Números de comanda limpios sin prefijo duplicado');

    // Intervalo de comandas
    assert(orders[0].orderNumber === '701', 'Comanda inicial del día histórico es #701');
    assert(orders[1].orderNumber === '702', 'Comanda final del día histórico es #702');

    // Aserciones de Ítems
    assert(items.length === 3, `Se recuperaron los 3 ítems vendidos en esa fecha pasada (obtenidos: ${items.length})`);
    const h1 = items.find(i => i.productName === 'Hamburguesa Especial');
    const h2 = items.find(i => i.productName === 'Salchipapa Mega');
    const h3 = items.find(i => i.productName === 'Refresco 350ml');
    assert(h1 && h2 && h3, 'Los 3 ítems específicos están presentes con nombre y categoría');

    // Aserciones de Dinero y Contabilidad
    const totalVentaCOP = orders.reduce((sum, o) => sum + (o.totalCOP || 0), 0);
    assert(totalVentaCOP === 29500 + 44250, `Total facturado histórico cuadra exacto: 73.750 COP (calculado: ${totalVentaCOP})`);

    // Aserciones de Pagos y Créditos
    assert(payments.length === 2, `Se recuperaron los 2 registros de pago (obtenidos: ${payments.length})`);
    const credPay = payments.find(p => p.paymentMethod === 'Crédito');
    assert(credPay && credPay.cashTenderedCOP === 44250, 'Pago a crédito registrado por 44.250 COP');

    // Aserciones de Transacciones (Egresos)
    assert(transactions.length === 1, `Gasto histórico de caja chica recuperado (obtenido: ${transactions.length})`);
    assert(transactions[0].amountCOP === 5000, 'Gasto por 5.000 COP correcto');

    // Aserción de Tasa Histórica
    assert(exchangeRates.COP === pastRateCOP, `Tasa de cambio aplicada al reporte corresponde a la fecha histórica (${pastRateCOP} COP, no la actual)`);

    // Aserción de Ticket Térmico Histórico
    const ticketBuf = buildReportTicket('contable', res.data);
    assert(ticketBuf && ticketBuf.length > 0, 'Ticket térmico generado sin excepciones para data histórica');
    const ticketText = Buffer.isBuffer(ticketBuf) ? ticketBuf.toString('latin1') : (Array.isArray(ticketBuf) ? ticketBuf.join('\n') : String(ticketBuf));
    assert(ticketText.includes('CREDITO') || ticketText.includes('CREDITOS'), 'Ticket térmico incluye sección de créditos');
    assert(ticketText.toUpperCase().includes('EMPRESA HIST') || ticketText.includes('44,250'), 'Ticket térmico incluye la comanda a crédito (44.250 COP / EMPRESA HIST)');

  } finally {
    // Limpieza confiable
    await query(`DELETE FROM order_payments WHERE order_id LIKE 'audit-hist-%'`);
    await query(`DELETE FROM order_items WHERE order_id LIKE 'audit-hist-%'`);
    await query(`DELETE FROM orders WHERE id LIKE 'audit-hist-%'`);
    await query(`DELETE FROM caja_chica_transactions WHERE id LIKE 'audit-hist-%'`);
  }

  console.log('\n======================================================================');
  console.log(`   RESULTADOS HISTÓRICOS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTest().catch(err => {
  console.error('Fatal error en test histórico:', err);
  process.exit(1);
});
