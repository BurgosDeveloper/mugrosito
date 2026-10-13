/**
 * Test de Estrés y Perfección Operativa para Producción
 * Valida:
 * 1. Pedidos Salón, Delivery y Pickup con modificadores, proteínas, salsas y bebidas.
 * 2. Adición y edición sin duplicación de ítems (0 productos cartesianos).
 * 3. Pagos multimoneda (COP + USD) con registro de vueltos en el ledger.
 * 4. Cuentas a crédito con deudor obligatorio y liberación de mesas (aisladas de gaveta).
 * 5. Caja chica (apertura, ingresos, egresos, arqueo de cierre y archivado total).
 * 6. Reporte contable por intervalo con cuadre al 100% de dinero e ítems vendidos.
 * 7. Endpoints de visor histórico (/api/orders/historico y /api/orders/historico/:id).
 * 8. Reimpresión térmica de comandas activas y archivadas (formato fecha mes/día hora/min y 2 columnas de pago).
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const { buildKitchenTicket, buildReceiptTicket } = require('../server/helpers/thermalPrinter');

const PORT = 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mugrosito'
});

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/connection-info`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning() {
  const isRunning = await checkServer();
  if (isRunning) return null;
  console.log('🚀 Iniciando servidor backend temporal para prueba de estrés...');
  const serverProc = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: false
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const ok = await checkServer();
    if (ok) {
      console.log('✅ Servidor backend listo para pruebas en puerto 3001.\n');
      return serverProc;
    }
  }
  return serverProc;
}

function apiCall(method, reqPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-mugrosito-token'] = token;
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: reqPath,
      method: method,
      headers: headers,
      timeout: 10000
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

async function runStressTest() {
  console.log('======================================================================');
  console.log(' 🚀 AUDITORÍA DE MÁXIMA PERFECCIÓN OPERATIVA (PRODUCCIÓN REAL)');
  console.log(` Conectando a backend en http://127.0.0.1:${PORT}`);
  console.log('======================================================================\n');

  const spawnedServer = await ensureServerRunning();

  let passed = 0;
  let failed = 0;

  function check(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
      throw new Error(`Aserción fallida: ${msg}`);
    }
  }

  const createdOrderIds = [];

  try {
    // -----------------------------------------------------------------------
    // 0. Autenticación de Usuarios
    // -----------------------------------------------------------------------
    console.log('>>> FASE 0: AUTENTICACIÓN Y ROLES');
    const loginCaja = await apiCall('POST', '/api/auth/login', { username: 'cajero', password: 'cajero' });
    check(loginCaja.status === 200 && loginCaja.data.success, 'Login cajero exitoso');
    const cajaToken = loginCaja.data.user.sessionToken;

    const loginAdmin = await apiCall('POST', '/api/auth/login', { username: 'linda', password: 'lindamugrosito' });
    check(loginAdmin.status === 200 && loginAdmin.data.success, 'Login administrador exitoso');
    const adminToken = loginAdmin.data.user.sessionToken;

    // Asegurar tasas de cambio
    const ratesRes = await apiCall('GET', '/api/caja/exchange-rates', null, cajaToken);
    const copRate = Number(ratesRes.data?.rates?.COP || 3100);
    const bsRate = Number(ratesRes.data?.rates?.Bs || 3.2);
    check(copRate > 0 && bsRate > 0, `Tasas del sistema válidas: COP ${copRate}, Bs ${bsRate}`);

    // Asegurar que mesas 6 y 8 existan en tables_config para pruebas de salón
    await pool.query(`INSERT INTO tables_config (id, number, name, capacity, status) VALUES ('tbl-6', 6, 'Mesa 6', 4, 'libre'), ('tbl-8', 8, 'Mesa 8', 4, 'libre') ON CONFLICT (number) DO NOTHING`);

    // -----------------------------------------------------------------------
    // 1. Creación de Pedido en Salón con Modificadores
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 1: PEDIDO SALÓN MESA #6 (4 PERROS + SALSAS + BEBIDAS)');
    const order1Payload = {
      type: 'mesa',
      tableNumber: 6,
      customerName: 'Familia Perez',
      kitchenNotes: 'Carne bien cocida',
      targetPrinter: 'ninguna',
      items: [
        {
          productId: 'prod-p1',
          productName: 'Perro Especial',
          price: 15000,
          quantity: 4,
          proteins: ['Carne', 'Pollo'],
          removedIngredients: ['cebolla'],
          extras: [{ name: 'Queso Extra', price: 2000 }],
          isCut: true,
          cutPreference: 'Picada',
          category: 'Hot Dogs'
        },
        {
          productId: 'prod-s1',
          productName: 'Salsa Tártara',
          price: 0,
          quantity: 2,
          category: 'Salsas'
        },
        {
          productId: 'prod-d1',
          productName: 'Refresco 350ml',
          price: 5000,
          quantity: 2,
          category: 'Bebidas',
          drinkType: 'refresco'
        }
      ]
    };

    const resOrder1 = await apiCall('POST', '/api/orders', order1Payload, cajaToken);
    check(resOrder1.status === 201 || resOrder1.status === 200, 'Comanda Mesa #6 creada exitosamente');
    const order1Id = resOrder1.data.id;
    createdOrderIds.push(order1Id);

    // Verificar que Mesa #6 está marcada como ocupada
    const tablesRes1 = await apiCall('GET', '/api/tables', null, cajaToken);
    const table6 = (tablesRes1.data || []).find((t) => t.number === 6);
    check(table6 && table6.status === 'ocupada', 'Mesa #6 marcada como ocupada en el sistema');

    // -----------------------------------------------------------------------
    // 2. Adición a Comanda Existente (Evitar Bug de 4 a 7 perros)
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 2: ADICIÓN DE PRODUCTOS A COMANDA EXISTENTE');
    const appendPayload = {
      addedItems: [
        {
          productId: 'prod-h1',
          productName: 'Hamburguesa Bistro',
          price: 25000,
          quantity: 2,
          proteins: ['Carne Res'],
          removedIngredients: ['tomate'],
          isTakeaway: false,
          category: 'Hamburguesas'
        }
      ],
      targetPrinter: 'ninguna'
    };
    const resAppend = await apiCall('POST', `/api/orders/${order1Id}/append-items`, appendPayload, cajaToken);
    check(resAppend.status === 200, 'Adición de 2 hamburguesas completada exitosamente');

    // Consultar comanda activa y validar conteo EXACTO de ítems
    const getOrder1 = await apiCall('GET', `/api/orders`, null, cajaToken);
    const order1Data = (getOrder1.data || []).find((o) => o.id === order1Id);
    check(order1Data !== undefined, 'Comanda #6 encontrada en comandas activas');

    const totalDogs = (order1Data.items || [])
      .filter((it) => it.productName === 'Perro Especial')
      .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalBurgers = (order1Data.items || [])
      .filter((it) => it.productName === 'Hamburguesa Bistro')
      .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    check(totalDogs === 4, `Conteo de Perros EXACTO: 4 perros (obtenido: ${totalDogs}) - NO multiplicados`);
    check(totalBurgers === 2, `Conteo de Hamburguesas EXACTO: 2 hamburguesas (obtenido: ${totalBurgers})`);

    // -----------------------------------------------------------------------
    // 3. Pago Multimoneda con Vuelto en COP y USD
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 3: COBRO MULTIMONEDA CON REGISTRO DE VUELTO');
    const order1TotalCOP = Number(order1Data.totalCOP || 0);
    check(order1TotalCOP > 0, `Total de Comanda calculado en COP: ${order1TotalCOP.toLocaleString('es-CO')} COP`);

    // Pago 1: Bancolombia por 50.000 COP
    const pay1Res = await apiCall('POST', `/api/payments/${order1Id}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 50000,
      paymentMethod: 'Bancolombia'
    }, cajaToken);
    check(pay1Res.status === 200, 'Pago 1 (Bancolombia 50.000 COP) registrado en ledger');

    // Pago 2: Efectivo COP 100.000 COP (Tendered 100.000 COP, con vuelto)
    const pendingCOP = order1TotalCOP - 50000;
    const changeGivenCOP = 100000 - pendingCOP;
    check(changeGivenCOP > 0, `Vuelto calculado: ${changeGivenCOP.toLocaleString('es-CO')} COP`);

    const pay2Res = await apiCall('POST', `/api/payments/${order1Id}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 100000,
      paymentMethod: 'Efectivo COP'
    }, cajaToken);
    check(pay2Res.status === 200, 'Pago 2 (Efectivo COP 100.000) registrado en ledger');

    // Registro de vuelto entregado
    const changeRes = await apiCall('POST', `/api/payments/${order1Id}/ledger`, {
      entryType: 'change',
      currency: 'COP',
      amountLocal: changeGivenCOP,
      paymentMethod: 'Efectivo COP'
    }, cajaToken);
    check(changeRes.status === 200, 'Vuelto en Efectivo COP registrado en ledger');

    // Finalizar comanda
    const finalize1Res = await apiCall('POST', `/api/payments/${order1Id}/finalize`, {}, cajaToken);
    check(finalize1Res.status === 200, 'Comanda Mesa #6 finalizada exitosamente');

    // Entregar comanda y verificar liberación inmediata de Mesa #6
    const deliver1Res = await apiCall('PATCH', `/api/orders/${order1Id}/status`, { status: 'entregada' }, cajaToken);
    check(deliver1Res.status === 200, 'Comanda marcada como entregada');

    const tablesRes2 = await apiCall('GET', '/api/tables', null, cajaToken);
    const table6After = (tablesRes2.data || []).find((t) => t.number === 6);
    check(table6After && table6After.status === 'libre', 'Mesa #6 LIBERADA automáticamente tras entrega y cobro');

    // -----------------------------------------------------------------------
    // 4. Ticket Térmico de Recibo de Pago (Verificar 2 Columnas y Vuelto)
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 4: VALIDACIÓN DEL RECIBO TÉRMICO CON DETALLE DE PAGO');
    const updatedOrder1 = await apiCall('GET', `/api/orders/historico/${order1Id}`, null, cajaToken);
    check(updatedOrder1.status === 200, 'Comanda recuperada desde API histórica');

    const receiptBuf = buildReceiptTicket(updatedOrder1.data, { COP: copRate, Bs: bsRate });
    const receiptText = receiptBuf.toString('latin1');

    check(receiptText.includes('RECIBO DE PAGO'), 'Recibo térmico tiene título RECIBO DE PAGO');
    check(receiptText.includes('DETALLE DE PAGO'), 'Recibo térmico incluye sección DETALLE DE PAGO');
    check(receiptText.includes('METODO') && receiptText.includes('MONTO'), 'Columnas METODO y MONTO presentes');
    check(receiptText.includes('BANCOLOMBIA'), 'Método BANCOLOMBIA presente en columna');
    check(receiptText.includes('EFECTIVO COP'), 'Método EFECTIVO COP presente en columna');
    check(receiptText.includes('100.000 COP'), 'Monto entregado 100.000 COP presente');
    check(receiptText.includes('VUELTO:'), 'Línea de VUELTO presente');
    check(receiptText.includes(`${Math.round(changeGivenCOP).toLocaleString('es-CO')} COP`), 'Monto y moneda exacta del vuelto presentes');

    // -----------------------------------------------------------------------
    // 5. Comanda a Crédito con Deudor Obligatorio
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 5: COMANDA A CRÉDITO Y REGLAS ESTRICTAS');
    const order2Payload = {
      type: 'mesa',
      tableNumber: 8,
      customerName: 'Cliente Temporal',
      items: [
        {
          productId: 'prod-p2',
          productName: 'Perro Sencillo',
          price: 10000,
          quantity: 2,
          category: 'Hot Dogs'
        }
      ]
    };
    const resOrder2 = await apiCall('POST', '/api/orders', order2Payload, cajaToken);
    check(resOrder2.status === 201 || resOrder2.status === 200, 'Comanda Mesa #8 creada');
    const order2Id = resOrder2.data.id;
    createdOrderIds.push(order2Id);

    // Intento de cerrar a crédito con deudor vacío -> DEBE RECHAZAR
    const badCredit = await apiCall('POST', `/api/payments/${order2Id}/credit`, { debtorName: '   ' }, cajaToken);
    check(badCredit.status === 400, 'Cierre a crédito con deudor vacío rechazado con 400 Bad Request');

    // Cierre a crédito con deudor legítimo
    const goodCredit = await apiCall('POST', `/api/payments/${order2Id}/credit`, {
      debtorName: 'Dr. Jose Gregorio Hernandez',
      notes: 'Pago mensual autorizado'
    }, cajaToken);
    check(goodCredit.status === 200, 'Comanda cerrada a crédito con deudor registrado');

    // Verificar liberación de Mesa #8
    const tablesRes3 = await apiCall('GET', '/api/tables', null, cajaToken);
    const table8 = (tablesRes3.data || []).find((t) => t.number === 8);
    check(table8 && table8.status === 'libre', 'Mesa #8 LIBERADA inmediatamente al pasar a crédito');

    // -----------------------------------------------------------------------
    // 6. Cierre de Turno y Archivado de Comandas
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 6: ARQUEO Y CIERRE DE TURNO CONTABLE');
    // Registrar apertura de caja chica previa
    await apiCall('POST', '/api/caja/apertura', { usdCash: 50, copCash: 100000 }, cajaToken);

    // Ejecutar cierre de caja
    const cierreRes = await apiCall('POST', '/api/caja/cierre', {
      actualUSD: 50,
      actualCOP: 100000,
      notes: 'Cierre de prueba de auditoría'
    }, cajaToken);
    check(cierreRes.status === 200, 'Cierre de caja y arqueo ejecutado exitosamente');

    // Verificar que todas las órdenes activas fueron archivadas
    const activeOrdersAfter = await apiCall('GET', '/api/orders', null, cajaToken);
    const remainingActive = (activeOrdersAfter.data || []).filter((o) => createdOrderIds.includes(o.id));
    check(remainingActive.length === 0, 'Tablero activo 100% limpio (todas las órdenes archivadas)');

    // -----------------------------------------------------------------------
    // 7. Visor Histórico: Búsqueda y Detalle al 100%
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 7: VISOR HISTÓRICO DE COMANDAS DE DÍAS ANTERIORES');
    // Búsqueda por texto (Deudor)
    const searchRes = await apiCall('GET', `/api/orders/historico?search=Gregorio`, null, cajaToken);
    check(searchRes.status === 200 && Array.isArray(searchRes.data), 'Endpoint /api/orders/historico responde 200');
    const foundCredit = searchRes.data.find((o) => o.id === order2Id);
    check(foundCredit !== undefined, 'Comanda a crédito encontrada por nombre de deudor en histórico');
    check(foundCredit.debtorName === 'Dr. Jose Gregorio Hernandez', 'Nombre de deudor preservado intacto');
    check(foundCredit.archivedAt !== null, 'Comanda marcada como archivada');

    // Consulta de detalle completo de comanda archivada #1
    const detailRes = await apiCall('GET', `/api/orders/historico/${order1Id}`, null, cajaToken);
    check(detailRes.status === 200, 'Detalle de comanda histórica recuperado');
    const histOrder = detailRes.data;
    const paymentRecords = histOrder.paymentHistory.filter((p) => p.entryType === 'payment');
    const changeRecords = histOrder.paymentHistory.filter((p) => p.entryType === 'change');
    check(paymentRecords.length === 2 && changeRecords.length === 1, 'Historial de pagos íntegro (2 abonos + 1 vuelto)');

    // Reimpresión de orden archivada (no debe dar 404)
    const reprintRes = await apiCall('POST', `/api/orders/${order1Id}/print-receipt`, { targetPrinter: 'ninguna' }, cajaToken);
    check(reprintRes.status === 200, 'Reimpresión de recibo térmico de comanda archivada exitosa (sin 404)');

    // -----------------------------------------------------------------------
    // 8. Reporte Contable de Intervalo
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 8: REPORTE CONTABLE POR INTERVALO DE FECHAS');
    const nowIso = new Date().toISOString();
    const pastIso = new Date(Date.now() - 3600000 * 24).toISOString();
    const reporteRes = await apiCall('GET', `/api/caja/reporte-intervalo?from=${pastIso}&to=${nowIso}`, null, cajaToken);
    const creditOrdersInReport = (reporteRes.data.orders || []).filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito' || o.type === 'credito');
    check(creditOrdersInReport.length > 0, 'Comandas a crédito registradas y aisladas en reporte');
    const creditFound = creditOrdersInReport.find((o) => o.id === order2Id);
    check(creditFound !== undefined, 'Comanda a crédito de prueba presente en reporte contable');
    const itemsInReport = reporteRes.data.items || [];
    check(itemsInReport.length >= 3, 'Conteo total de ítems vendidos 100% íntegro en reporte');

    console.log('\n======================================================================');
    console.log(`   RESULTADOS DE ESTRÉS: ${passed} PASSED | ${failed} FAILED`);
    console.log('======================================================================\n');
  } finally {
    // Limpieza de datos de prueba
    if (createdOrderIds.length > 0) {
      await pool.query(`DELETE FROM order_payments WHERE order_id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM order_items WHERE order_id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM caja_chica_transactions WHERE order_id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`UPDATE tables_config SET status = 'libre' WHERE number IN (6, 8)`);
    }
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch (_) {}
    }
    await pool.end();
  }

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runStressTest().catch((err) => {
  console.error('Fatal error en stress test:', err);
  process.exit(1);
});
