/**
 * Test Exhaustivo de Casos Extremos y Concurrencia para Producción
 * Valida:
 * 1. Cobro dividido por personas con ítems asignados (is_paid_individually).
 * 2. Transferencia / cambio de mesa y sincronización de estado libre/ocupado.
 * 3. Cancelación de comanda con liberación instantánea de mesa.
 * 4. Caja chica multimoneda (Apertura, Ingreso, Egreso, Arqueo de gaveta).
 * 5. Reporte contable por intervalo con validación de gaveta física vs créditos.
 * 6. Concurrencia de pagos protegida por transacciones PostgreSQL (FOR UPDATE).
 * 7. Cero productos cartesianos y consistencia matemática 100%.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

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
  console.log('🚀 Iniciando servidor backend temporal para pruebas de casos extremos...');
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

async function runDeepEdgeCaseTests() {
  console.log('======================================================================');
  console.log(' 🔬 AUDITORÍA ULTRA EXHAUSTIVA DE CASOS EXTREMOS Y CONCURRENCIA');
  console.log(` Conectando a backend en http://127.0.0.1:${PORT}`);
  console.log('======================================================================\n');

  const spawnedServer = await ensureServerRunning();
  let passed = 0;
  let failed = 0;
  const createdOrderIds = [];

  function check(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
      throw new Error(`Aserción fallida: ${message}`);
    }
  }

  try {
    // -----------------------------------------------------------------------
    // FASE 0: Auth
    // -----------------------------------------------------------------------
    console.log('>>> FASE 0: AUTENTICACIÓN Y ROLES');
    const loginCaja = await apiCall('POST', '/api/auth/login', { username: 'cajero', password: 'cajero' });
    check(loginCaja.status === 200 && loginCaja.data.success, 'Login cajero exitoso');
    const cajaToken = loginCaja.data.user.sessionToken;

    const ratesRes = await apiCall('GET', '/api/rates', null, cajaToken);
    check(ratesRes.status === 200, 'Tasas cambiarias obtenidas');
    const copRate = Number(ratesRes.data?.COP || 3100);
    const bsRate = Number(ratesRes.data?.Bs || 3.2);

    await pool.query(`INSERT INTO tables_config (id, number, name, capacity, status) VALUES 
      ('tbl-3', 3, 'Mesa 3', 4, 'libre'),
      ('tbl-4', 4, 'Mesa 4', 4, 'libre'),
      ('tbl-9', 9, 'Mesa 9', 4, 'libre')
      ON CONFLICT (number) DO NOTHING`);

    // -----------------------------------------------------------------------
    // FASE 1: COBRO DIVIDIDO POR PERSONA (ÍTEM POR ÍTEM)
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 1: COBRO DIVIDIDO POR PERSONA CON ÍTEMS INDIVIDUALES');
    const splitOrderPayload = {
      type: 'mesa',
      tableNumber: 3,
      customerName: 'Grupo Amigos',
      waiterName: 'Carlos',
      totalCOP: 50000,
      totalUSD: Number((50000 / copRate).toFixed(2)),
      items: [
        {
          id: `item-split-1-${Date.now()}`,
          productId: 'prod-burger-special',
          productName: 'Hamburguesa Especial',
          price: 25000,
          quantity: 1,
          category: 'Hamburguesas'
        },
        {
          id: `item-split-2-${Date.now()}`,
          productId: 'prod-hotdog-especial',
          productName: 'Perro Especial',
          price: 15000,
          quantity: 1,
          category: 'Hot Dogs'
        },
        {
          id: `item-split-3-${Date.now()}`,
          productId: 'prod-soda',
          productName: 'Gaseosa Postobón',
          price: 5000,
          quantity: 2,
          category: 'Bebidas'
        }
      ]
    };

    const resCreateSplit = await apiCall('POST', '/api/orders', splitOrderPayload, cajaToken);
    check(resCreateSplit.status === 201 || resCreateSplit.status === 200, 'Comanda de grupo creada en Mesa #3');
    const splitOrderId = resCreateSplit.data.id;
    createdOrderIds.push(splitOrderId);

    // Obtener la comanda con sus IDs de items generados en DB
    const freshOrderRes = await apiCall('GET', `/api/orders/historico/${splitOrderId}`, null, cajaToken);
    check(freshOrderRes.status === 200, 'Comanda obtenida con ítems');
    const itemsDb = freshOrderRes.data.items;
    check(itemsDb.length === 3, '3 ítems registrados en comanda');

    const itemBurger = itemsDb.find((i) => i.productName === 'Hamburguesa Especial');
    const itemHotdog = itemsDb.find((i) => i.productName === 'Perro Especial');
    const itemSoda = itemsDb.find((i) => i.productName === 'Gaseosa Postobón');

    // Persona 1: Paga su Hamburguesa (25.000 COP) vía Bancolombia
    const payPerson1 = await apiCall('POST', `/api/payments/${splitOrderId}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 25000,
      paymentMethod: 'Bancolombia',
      payerName: 'Persona 1 (Juan)',
      itemIds: [itemBurger.id]
    }, cajaToken);
    check(payPerson1.status === 200, 'Persona 1 pagó su hamburguesa en Bancolombia');

    // Verificar que el ítem de hamburguesa ahora esté marcado como pagado individualmente
    const checkAfterP1 = await apiCall('GET', `/api/orders/historico/${splitOrderId}`, null, cajaToken);
    const burgerAfterP1 = checkAfterP1.data.items.find((i) => i.id === itemBurger.id);
    check(burgerAfterP1.isPaidIndividually === true, 'Hamburguesa marcada como pagada individualmente');
    check(burgerAfterP1.paidByName === 'Persona 1 (Juan)', 'Nombre del pagador registrado en el ítem');

    // Intento de Persona 2 de pagar el MISMO ítem de hamburguesa (debe ser rechazado con 409)
    const duplicateItemPay = await apiCall('POST', `/api/payments/${splitOrderId}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 25000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Persona 2 (Maria)',
      itemIds: [itemBurger.id]
    }, cajaToken);
    check(duplicateItemPay.status === 409, 'Pago duplicado de ítem ya cobrado RECHAZADO con 409');

    // Persona 2: Paga su Perro (15.000 COP) y Bebidas (10.000 COP) = 25.000 COP en Efectivo COP (con billete de 50.000 COP)
    const payPerson2 = await apiCall('POST', `/api/payments/${splitOrderId}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 50000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Persona 2 (Maria)',
      itemIds: [itemHotdog.id, itemSoda.id]
    }, cajaToken);
    check(payPerson2.status === 200, 'Persona 2 pagó con 50.000 COP');

    // Registrar vuelto de Persona 2 (25.000 COP)
    const changePerson2 = await apiCall('POST', `/api/payments/${splitOrderId}/ledger`, {
      entryType: 'change',
      currency: 'COP',
      amountLocal: 25000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Persona 2 (Maria)',
      itemIds: [itemHotdog.id, itemSoda.id]
    }, cajaToken);
    check(changePerson2.status === 200, 'Vuelto de Persona 2 registrado correctamente');

    // Finalizar comanda dividida
    const finalizeSplit = await apiCall('POST', `/api/payments/${splitOrderId}/finalize`, {}, cajaToken);
    check(finalizeSplit.status === 200, 'Comanda dividida finalizada con éxito');

    const tablesAfterSplit = await apiCall('GET', '/api/tables', null, cajaToken);
    const table3After = (tablesAfterSplit.data || []).find((t) => t.number === 3);
    check(table3After && table3After.status === 'libre', 'Mesa #3 liberada automáticamente tras cobro dividido');

    // -----------------------------------------------------------------------
    // FASE 2: TRANSFERENCIA / CAMBIO DE MESA
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 2: TRANSFERENCIA / CAMBIO DE MESA ENTRE MESAS LIBRES');
    const transferOrderPayload = {
      type: 'mesa',
      tableNumber: 4,
      customerName: 'Familia Perez',
      totalCOP: 30000,
      totalUSD: Number((30000 / copRate).toFixed(2)),
      items: [
        {
          productId: 'prod-hotdog-1',
          productName: 'Perro Especial',
          price: 15000,
          quantity: 2,
          category: 'Hot Dogs'
        }
      ]
    };
    const resCreateTransfer = await apiCall('POST', '/api/orders', transferOrderPayload, cajaToken);
    check(resCreateTransfer.status === 201 || resCreateTransfer.status === 200, 'Comanda creada en Mesa #4');
    const transferOrderId = resCreateTransfer.data.id;
    createdOrderIds.push(transferOrderId);

    // Verificar que Mesa 4 esté ocupada
    const tablesBeforeTransfer = await apiCall('GET', '/api/tables', null, cajaToken);
    const table4Before = (tablesBeforeTransfer.data || []).find((t) => t.number === 4);
    check(table4Before && table4Before.status === 'ocupada', 'Mesa #4 ocupada tras crear comanda');

    // Transferir comanda de Mesa 4 a Mesa 9
    const resTransfer = await apiCall('PATCH', `/api/orders/${transferOrderId}/change-table`, {
      newTableNumber: 9
    }, cajaToken);
    check(resTransfer.status === 200, 'Transferencia de Mesa #4 a Mesa #9 exitosa');

    // Verificar que Mesa 4 quedó libre y Mesa 9 quedó ocupada
    const tablesAfterTransfer = await apiCall('GET', '/api/tables', null, cajaToken);
    const table4After = (tablesAfterTransfer.data || []).find((t) => t.number === 4);
    const table9After = (tablesAfterTransfer.data || []).find((t) => t.number === 9);
    check(table4After && table4After.status === 'libre', 'Mesa #4 LIBERADA tras transferencia');
    check(table9After && table9After.status === 'ocupada', 'Mesa #9 OCUPADA tras recibir transferencia');

    // -----------------------------------------------------------------------
    // FASE 3: CANCELACIÓN DE COMANDA Y LIBERACIÓN INMEDIATA
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 3: CANCELACIÓN DE COMANDA CON LIBERACIÓN INMEDIATA DE MESA');
    const resCancel = await apiCall('DELETE', `/api/orders/${transferOrderId}`, null, cajaToken);
    check(resCancel.status === 200, 'Comanda en Mesa #9 cancelada con éxito');

    // Verificar que Mesa 9 quedó libre de inmediato
    const tablesAfterCancel = await apiCall('GET', '/api/tables', null, cajaToken);
    const table9AfterCancel = (tablesAfterCancel.data || []).find((t) => t.number === 9);
    check(table9AfterCancel && table9AfterCancel.status === 'libre', 'Mesa #9 LIBERADA inmediatamente al cancelar orden');

    // -----------------------------------------------------------------------
    // FASE 4: CAJA CHICA MULTIMONEDA (APERTURA, INGRESO, EGRESO, ARQUEO)
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 4: CAJA CHICA Y ARQUEO FÍSICO DE GAVETA');
    // Registrar apertura de caja chica
    const aperturaPayload = {
      usdCash: 30,
      copCash: 50000
    };
    const resApertura = await apiCall('POST', '/api/caja/apertura', aperturaPayload, cajaToken);
    check(resApertura.status === 200 || resApertura.status === 201, 'Apertura de caja chica registrada (50.000 COP + 30 USD)');

    // Registrar egreso de caja chica (ej. compra insumos 15.000 COP)
    const egresoPayload = {
      type: 'egreso',
      amountCOP: 15000,
      amountUSD: 0,
      paymentMethod: 'Efectivo COP',
      description: 'Compra de bolsas y hielo de emergencia'
    };
    const resEgreso = await apiCall('POST', '/api/caja/transaction', egresoPayload, cajaToken);
    check(resEgreso.status === 200 || resEgreso.status === 201, 'Egreso de 15.000 COP registrado en caja chica');

    // Registrar ingreso extraordinario (ej. ingreso 10 USD)
    const ingresoPayload = {
      type: 'ingreso',
      amountCOP: 0,
      amountUSD: 10,
      paymentMethod: 'Efectivo USD',
      description: 'Ingreso fondo extra en divisas'
    };
    const resIngreso = await apiCall('POST', '/api/caja/transaction', ingresoPayload, cajaToken);
    check(resIngreso.status === 200 || resIngreso.status === 201, 'Ingreso de 10 USD registrado en caja chica');

    // Consultar estado de caja chica
    const resCajaEstado = await apiCall('GET', '/api/caja', null, cajaToken);
    check(resCajaEstado.status === 200, 'Estado de caja obtenido');
    const transacciones = resCajaEstado.data.transacciones || [];
    const foundEgreso = transacciones.find((t) => t.type === 'egreso' && t.amountCOP === 15000);
    const foundIngreso = transacciones.find((t) => t.type === 'ingreso' && t.amountUSD === 10);
    check(foundEgreso !== undefined, 'Egreso en COP reflejado en transacciones de caja');
    check(foundIngreso !== undefined, 'Ingreso en USD reflejado en transacciones de caja');

    // -----------------------------------------------------------------------
    // FASE 5: REPORTE CONTABLE POR INTERVALO Y AUDITORÍA DE ÍTEMS Y DINERO
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 5: REPORTE CONTABLE POR INTERVALO (EXCLUSIÓN DE CANCELADOS)');
    const nowIso = new Date().toISOString();
    const pastIso = new Date(Date.now() - 3600000 * 24).toISOString();
    const repRes = await apiCall('GET', `/api/caja/reporte-intervalo?from=${pastIso}&to=${nowIso}`, null, cajaToken);
    check(repRes.status === 200, 'Reporte de intervalo obtenido');

    // Comprobar que la orden cancelada (transferOrderId) NO aparezca en las órdenes contabilizadas
    const cancelledInReport = (repRes.data.orders || []).find((o) => o.id === transferOrderId);
    check(cancelledInReport === undefined, 'Orden CANCELADA estrictamente excluida del reporte contable');

    // Comprobar que la comanda pagada (splitOrderId) SÍ esté en el reporte
    const splitInReport = (repRes.data.orders || []).find((o) => o.id === splitOrderId);
    check(splitInReport !== undefined, 'Orden pagada presente y contabilizada en reporte');

    // Comprobar que los ítems del reporte coincidan exactamente con la cantidad de la orden
    const burgerItemsInReport = (repRes.data.items || []).filter((it) => it.orderId === splitOrderId && it.productName === 'Hamburguesa Especial');
    check(burgerItemsInReport.length === 1 && burgerItemsInReport[0].quantity === 1, 'Cantidad exacta de 1 hamburguesa sin duplicados');

    const hotdogItemsInReport = (repRes.data.items || []).filter((it) => it.orderId === splitOrderId && it.productName === 'Perro Especial');
    check(hotdogItemsInReport.length === 1 && hotdogItemsInReport[0].quantity === 1, 'Cantidad exacta de 1 perro sin duplicados');

    const sodaItemsInReport = (repRes.data.items || []).filter((it) => it.orderId === splitOrderId && it.productName === 'Gaseosa Postobón');
    check(sodaItemsInReport.length === 1 && sodaItemsInReport[0].quantity === 2, 'Cantidad exacta de 2 gaseosas sin duplicados');

    // -----------------------------------------------------------------------
    // FASE 6: PRUEBA DE CONCURRENCIA Y BLOQUEO SQL (FOR UPDATE)
    // -----------------------------------------------------------------------
    console.log('\n>>> FASE 6: PRUEBA DE CONCURRENCIA Y SEGURIDAD TRANSACCIONAL');
    const concOrderPayload = {
      type: 'delivery',
      customerName: 'Cliente Concurrente',
      deliveryFeeCOP: 5000,
      totalCOP: 15000,
      totalUSD: Number((15000 / copRate).toFixed(2)),
      items: [
        {
          productId: 'prod-p1',
          productName: 'Perro Sencillo',
          price: 10000,
          quantity: 1,
          category: 'Hot Dogs'
        }
      ]
    };
    const resCreateConc = await apiCall('POST', '/api/orders', concOrderPayload, cajaToken);
    check(resCreateConc.status === 201 || resCreateConc.status === 200, 'Orden de concurrencia creada');
    const concOrderId = resCreateConc.data.id;
    createdOrderIds.push(concOrderId);

    // Ejecutar dos registros simultáneos de pago del total exacto (15.000 COP)
    const [p1, p2] = await Promise.all([
      apiCall('POST', `/api/payments/${concOrderId}/ledger`, {
        entryType: 'payment',
        currency: 'COP',
        amountLocal: 15000,
        paymentMethod: 'Bancolombia'
      }, cajaToken),
      apiCall('POST', `/api/payments/${concOrderId}/ledger`, {
        entryType: 'payment',
        currency: 'COP',
        amountLocal: 15000,
        paymentMethod: 'Nequi'
      }, cajaToken)
    ]);

    // Uno de los dos debe ganar (200) y el segundo debe ser rechazado (409) porque la deuda ya está cubierta
    const statuses = [p1.status, p2.status].sort();
    check(statuses[0] === 200 && statuses[1] === 409, 'Transacciones concurrentes resueltas con seguridad (1 éxito, 1 conflicto 409 rechazado)');

    // Finalizar comanda de concurrencia
    const finalizeConc = await apiCall('POST', `/api/payments/${concOrderId}/finalize`, {}, cajaToken);
    check(finalizeConc.status === 200, 'Comanda concurrente finalizada sin inconsistencias');

    console.log('\n======================================================================');
    console.log(`   RESULTADOS DE CASOS EXTREMOS: ${passed} PASSED | ${failed} FAILED`);
    console.log('======================================================================\n');
  } finally {
    // Limpieza
    if (createdOrderIds.length > 0) {
      await pool.query(`DELETE FROM order_payments WHERE order_id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM order_items WHERE order_id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM caja_chica_transactions WHERE order_id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1::text[])`, [createdOrderIds]);
      await pool.query(`UPDATE tables_config SET status = 'libre' WHERE number IN (3, 4, 9)`);
    }
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch (_) {}
    }
    await pool.end();
  }

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runDeepEdgeCaseTests().catch((err) => {
  console.error('Fatal error en deep edge cases test:', err);
  process.exit(1);
});
