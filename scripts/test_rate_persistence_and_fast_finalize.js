/**
 * Test de Persistencia de Tasas de Cambio y Cierre Instantáneo de Cobro
 * Valida:
 * 1. Edición de tasas de cambio (POST /api/rates) por cajero/admin.
 * 2. Persistencia absoluta tras reinicio del servidor backend (initDb NO debe sobreescribir).
 * 3. Finalización de comanda inmediata sin demoras de red ni bloqueos térmicos.
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
  console.log('🚀 Iniciando servidor backend temporal...');
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

async function run() {
  console.log('======================================================================');
  console.log(' 🪙 PRUEBA DE PERSISTENCIA DE TASAS Y VELOCIDAD DE COBRO');
  console.log('======================================================================\n');

  let serverProc = await ensureServerRunning();
  let passed = 0;
  let failed = 0;

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
    // 1. Login Cajero
    const loginCaja = await apiCall('POST', '/api/auth/login', { username: 'cajero', password: 'cajero' });
    check(loginCaja.status === 200 && loginCaja.data.success, 'Login cajero exitoso');
    const cajaToken = loginCaja.data.user.sessionToken;

    // 2. Modificar tasa a un valor personalizado (ej: COP 4250, Bs 38.5)
    console.log('\n>>> 1. MODIFICACIÓN DE TASAS POR CAJERO / ADMIN');
    const updateRes = await apiCall('POST', '/api/rates', { COP: 4250, Bs: 38.5 }, cajaToken);
    check(updateRes.status === 200 && updateRes.data.success, 'Tasas actualizadas exitosamente a COP 4250 y Bs 38.5');

    // 3. Consultar /api/rates
    const getRatesRes = await apiCall('GET', '/api/rates', null, cajaToken);
    check(getRatesRes.status === 200, 'Endpoint /api/rates responde 200');
    check(Number(getRatesRes.data.COP) === 4250, 'Tasa COP es exactamente 4250');
    check(Number(getRatesRes.data.Bs) === 38.5, 'Tasa Bs es exactamente 38.5');

    // 4. SIMULAR REINICIO DEL SERVIDOR BACKEND (initDb de server/db.js)
    console.log('\n>>> 2. SIMULACIÓN DE REINICIO DEL SISTEMA / APERTURA DE PC');
    const { initDb } = require('../server/db');
    // Ejecutar initDb directamente (lo mismo que se ejecuta al encender la app o abrir el acceso directo)
    await initDb();
    console.log('  ℹ️ initDb() ejecutado nuevamente como si el sistema acabara de encender');

    // 5. Verificar que las tasas en la base de datos NO se hayan reseteado a 3100 y 3.20
    const { rows: dbRates } = await pool.query(`SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = 'ambos'`);
    check(Number(dbRates[0].cop_rate) === 4250, 'Tasa COP se mantuvo en 4250 en shift_exchange_rates (NO sobreescrita a 3100)');
    check(Number(dbRates[0].bs_rate) === 38.5, 'Tasa Bs se mantuvo en 38.5 en shift_exchange_rates (NO sobreescrita a 3.20)');

    const { rows: legacyRates } = await pool.query(`SELECT cop_rate, bs_rate FROM exchange_rates WHERE id = 1`);
    check(Number(legacyRates[0].cop_rate) === 4250, 'Tasa COP se mantuvo en 4250 en exchange_rates');
    check(Number(legacyRates[0].bs_rate) === 38.5, 'Tasa Bs se mantuvo en 38.5 en exchange_rates');

    // Consultar vía API después del reinicio
    const getRatesAfterRestart = await apiCall('GET', '/api/rates', null, cajaToken);
    check(Number(getRatesAfterRestart.data.COP) === 4250, 'API devuelve COP 4250 intacta tras reinicio del sistema');
    check(Number(getRatesAfterRestart.data.Bs) === 38.5, 'API devuelve Bs 38.5 intacta tras reinicio del sistema');

    // 6. Test de velocidad de cobro: Finalizar comanda
    console.log('\n>>> 3. VELOCIDAD Y TIEMPO DE RESPUESTA AL FINALIZAR COBRO');
    const orderPayload = {
      type: 'delivery',
      customerName: 'Cliente Veloz',
      deliveryFeeCOP: 3000,
      totalCOP: 18000,
      totalUSD: 18000 / 4250,
      items: [
        {
          productId: 'prod-fast-1',
          productName: 'Perro Sencillo',
          price: 15000,
          quantity: 1,
          category: 'Hot Dogs'
        }
      ]
    };
    const createRes = await apiCall('POST', '/api/orders', orderPayload, cajaToken);
    const orderId = createRes.data.id;

    // Registrar pago
    await apiCall('POST', `/api/payments/${orderId}/ledger`, {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 18000,
      paymentMethod: 'Bancolombia'
    }, cajaToken);

    // Medir tiempo de finalización
    const startTime = Date.now();
    const finalizeRes = await apiCall('POST', `/api/payments/${orderId}/finalize`, {}, cajaToken);
    const elapsedMs = Date.now() - startTime;

    check(finalizeRes.status === 200, 'Comanda finalizada con código 200');
    check(elapsedMs < 1000, `Finalización ultrarrápida: ${elapsedMs} ms (menos de 1 segundo)`);

    // Limpieza de orden de prueba
    await pool.query(`DELETE FROM order_payments WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM orders WHERE id = $1`, [orderId]);

    // Restaurar tasas base oficiales (3100, 3.20)
    await apiCall('POST', '/api/rates', { COP: 3100, Bs: 3.20 }, cajaToken);
    console.log('  ℹ️ Tasas base restauradas a COP 3100 y Bs 3.20.');

    console.log('\n======================================================================');
    console.log(`   RESULTADOS PERSISTENCIA: ${passed} PASSED | ${failed} FAILED`);
    console.log('======================================================================\n');
  } finally {
    if (serverProc) {
      try { serverProc.kill(); } catch (_) {}
    }
    await pool.end();
  }

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error en test de persistencia:', err);
  process.exit(1);
});
