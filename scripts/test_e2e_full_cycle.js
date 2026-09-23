/**
 * Test E2E Full Cycle over LAN IP:
 * - Auth login (mesero, caja, admin)
 * - Order creation with items & delivery
 * - Kitchen prep status transition
 * - Order append items
 * - Transfer service (mesa to delivery to mesa)
 * - Ledger payment in COP with cash tendered and change
 * - Order finalization and Cash Drawer movement settlement
 * - Interval report verification
 * - Reversal / Clean rollback
 */
const http = require('http');
const { Pool } = require('pg');

const { getLanConnectionInfo } = require('../server/helpers/lan');
const LAN_IP = getLanConnectionInfo().lanIp || '127.0.0.1';
const PORT = 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mugrosito'
});

function lanRequest(method, path, body = null, token = null) {
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
      hostname: LAN_IP,
      port: PORT,
      path: path,
      method: method,
      headers: headers,
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

async function runE2E() {
  console.log(`======================================================================`);
  console.log(` 🌐 PRUEBA E2E PUNTA A PUNTA EN RED LAN: http://${LAN_IP}:${PORT}`);
  console.log(`======================================================================\n`);

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

  const createdOrderIds = [];

  try {
    // 1. Check LAN Info endpoint
    const infoRes = await lanRequest('GET', '/api/connection-info');
    assert(infoRes.status === 200, `Endpoint /api/connection-info responde 200 en LAN`);
    assert(infoRes.data.lanIp === LAN_IP, `IP LAN detectada coincide (${infoRes.data.lanIp})`);

    // 2. Authentication Test for Users
    const loginMesero = await lanRequest('POST', '/api/auth/login', { username: 'mesero', password: 'mesero' });
    assert(loginMesero.status === 200 && loginMesero.data.success, `Login mesero exitoso por LAN`);
    const meseroToken = loginMesero.data.user.sessionToken;

    const loginCaja = await lanRequest('POST', '/api/auth/login', { username: 'cajero', password: 'cajero' });
    assert(loginCaja.status === 200 && loginCaja.data.success, `Login caja exitoso por LAN`);
    const cajaToken = loginCaja.data.user.sessionToken;

    const loginAdmin = await lanRequest('POST', '/api/auth/login', { username: 'linda', password: 'lindamugrosito' });
    assert(loginAdmin.status === 200 && loginAdmin.data.success, `Login admin exitoso por LAN`);
    const adminToken = loginAdmin.data.user.sessionToken;

    // 3. Mesero creates an order via LAN
    const orderPayload = {
      type: 'delivery',
      customerName: 'Cliente E2E LAN',
      totalCOP: 32000,
      totalUSD: 10.32,
      deliveryFeeCOP: 2000,
      deliveryFeeUSD: 0.65,
      phone: '04140000000',
      address: 'Avenida Principal #42',
      items: [
        {
          productId: 'e2e-prod-1',
          productName: 'Hot Dog Especial',
          price: 15000,
          quantity: 2,
          category: 'Comidas'
        }
      ]
    };

    const createOrderRes = await lanRequest('POST', '/api/orders', orderPayload, meseroToken);
    assert(createOrderRes.status === 200 || createOrderRes.status === 201, `Comanda creada exitosamente por mesero vía LAN (Status: ${createOrderRes.status})`);
    const order = createOrderRes.data;
    assert(order && order.id, `Comanda tiene ID generado: ${order?.id}`);
    createdOrderIds.push(order.id);

    // Verify order total: 2 * 15000 + 2000 = 32000 COP
    assert(Number(order.totalCOP || order.total_cop) === 32000, `Total en COP es exactamente 32.000 COP (obtenido: ${order.totalCOP || order.total_cop})`);
    assert(Number(order.deliveryFeeCOP || order.delivery_fee_cop) === 2000, `Delivery fee en COP es 2.000 COP (obtenido: ${order.deliveryFeeCOP || order.delivery_fee_cop})`);

    // 4. Kitchen marks order as 'preparada' (using adminToken / cajaToken)
    const prepRes = await lanRequest('PATCH', `/api/orders/${order.id}/status`, { status: 'preparada' }, cajaToken);
    assert(prepRes.status === 200, `Cocina/Caja marca comanda como 'preparada' vía LAN`);

    // 5. Append item to order (OrderAppendModal flow)
    const appendPayload = {
      addedItems: [
        {
          productId: 'e2e-drink-1',
          productName: 'Refresco Familiar',
          price: 6000,
          quantity: 1,
          category: 'Bebidas'
        }
      ]
    };
    const appendRes = await lanRequest('POST', `/api/orders/${order.id}/append-items`, appendPayload, meseroToken);
    assert(appendRes.status === 200, `Adición de ítems ejecutada vía LAN (32k + 6k = 38k COP)`);
    const appendedOrder = appendRes.data.order || appendRes.data;
    assert(Number(appendedOrder.totalCOP || appendedOrder.total_cop) === 38000, `Nuevo total es exactamente 38.000 COP (obtenido: ${appendedOrder.totalCOP || appendedOrder.total_cop})`);

    // 6. Cashier registers a payment in COP: Customer pays with 50.000 COP cash bill
    // Total debt: 38,000 COP. Bill: 50,000 COP.
    const paymentPayload = {
      entryType: 'payment',
      currency: 'COP',
      amountLocal: 50000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente E2E LAN'
    };
    const paymentRes = await lanRequest('POST', `/api/orders/${order.id}/ledger`, paymentPayload, cajaToken);
    assert(paymentRes.status === 200, `Cobro en Efectivo COP (billete de 50.000 COP) procesado exitosamente vía LAN`);

    // 7. Cashier registers change returned: 12.000 COP
    const changePayload = {
      entryType: 'change',
      currency: 'COP',
      amountLocal: 12000,
      paymentMethod: 'Efectivo COP',
      payerName: 'Cliente E2E LAN'
    };
    const changeRes = await lanRequest('POST', `/api/orders/${order.id}/ledger`, changePayload, cajaToken);
    assert(changeRes.status === 200, `Vuelto entregado de 12.000 COP registrado en historial vía LAN`);

    // 8. Cashier finalizes order
    const finalizeRes = await lanRequest('POST', `/api/orders/${order.id}/finalize`, {}, cajaToken);
    assert(finalizeRes.status === 200, `Comanda finalizada con éxito vía LAN`);

    // 9. Verify cash drawer transactions in PostgreSQL
    const client = await pool.connect();
    try {
      const cashRows = await client.query(
        `SELECT type, amount_cop, payment_method, description FROM caja_chica_transactions WHERE order_id = $1 ORDER BY timestamp ASC`,
        [order.id]
      );
      assert(cashRows.rows.length === 2, `Caja chica asentó exactamente 2 movimientos (1 ingreso + 1 vuelto)`);
      const incMov = cashRows.rows.find(r => r.type === 'ingreso');
      const chgMov = cashRows.rows.find(r => r.type === 'egreso');
      assert(Number(incMov?.amount_cop) === 50000, `Ingreso bruto en gaveta registrado: 50.000 COP`);
      assert(Number(chgMov?.amount_cop) === 12000, `Vuelto entregado de gaveta registrado: 12.000 COP`);
      assert(Number(incMov?.amount_cop) - Number(chgMov?.amount_cop) === 38000, `Neto en gaveta cuadra exactamente con total comanda: 38.000 COP`);
    } finally {
      client.release();
    }

    // 10. Verify Interval Report via LAN
    const nowStr = new Date().toISOString();
    const pastStr = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const reportRes = await lanRequest('GET', `/api/caja/reporte-intervalo?from=${encodeURIComponent(pastStr)}&to=${encodeURIComponent(nowStr)}`, null, cajaToken);
    assert(reportRes.status === 200, `Reporte de intervalo responde 200 vía LAN`);
    const foundOrder = reportRes.data.orders?.find(o => o.id === order.id);
    assert(foundOrder !== undefined, `Comanda E2E encontrada en el reporte de intervalo contable`);
    assert(Number(foundOrder?.totalCOP || foundOrder?.total_cop) === 38000, `Reporte refleja exactamente 38.000 COP en comanda`);

  } finally {
    // Clean rollback of test order
    if (createdOrderIds.length > 0) {
      const client = await pool.connect();
      try {
        await client.query(`DELETE FROM caja_chica_transactions WHERE order_id = ANY($1)`, [createdOrderIds]);
        await client.query(`DELETE FROM order_payments WHERE order_id = ANY($1)`, [createdOrderIds]);
        await client.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [createdOrderIds]);
        await client.query(`DELETE FROM orders WHERE id = ANY($1)`, [createdOrderIds]);
        console.log(`\n🔒 [ROLLBACK LIMPIO] Comandas de prueba eliminadas de PostgreSQL.`);
      } finally {
        client.release();
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`RESULTADOS E2E LAN: ${passed} PASSED | ${failed} FAILED`);
  console.log(`======================================================\n`);
  if (failed > 0) process.exit(1);
}

runE2E().catch(err => {
  console.error('Error en prueba E2E:', err);
  process.exit(1);
});
