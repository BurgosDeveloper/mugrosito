const { initDb, getClient } = require('../server/db');
const { roundCOPPayment, roundCOP } = require('../server/helpers/currencyRounding');
const { getRatesForShift } = require('../server/helpers/exchangeRates');
const { buildReportTicket, buildCrispysCierreTicket } = require('../server/helpers/thermalPrinter');

async function testCOPPrimaryAccounting() {
  console.log('======================================================================');
  console.log(' 🌭 AUDITORÍA EXHAUSTIVA DE MONEDA PRINCIPAL COP (MUGROSITO POS)');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}${detail ? ' -> ' + detail : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}${detail ? ' -> ' + detail : ''}`);
      failed++;
    }
  }

  await initDb();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const copRate = 3100;
    const bsRate = 3.2;

    console.log('--- [1] CREACIÓN DE COMANDAS CON ÍTEMS EN COP (>= 100) ---');
    // Orden 1:
    // Hot Dog Clásico: 10.000 COP
    // Hot Dog Especial con Extra Tocineta (2.000 COP) y Maíz Gratis (0 COP): 17.000 COP total (15k base + 2k extra)
    // Refresco: 4.000 COP
    // Delivery: 2.000 COP
    // Total Orden 1: 10.000 + 17.000 + 4.000 + 2.000 = 33.000 COP (10.6451 USD)
    const ord1Id = `test-cop-ord1-${Date.now()}`;
    const ord1Num = '#COP-901';
    const totalCOP1 = 33000;
    const totalUSD1 = Number((totalCOP1 / copRate).toFixed(4));
    const delCOP1 = 2000;
    const delUSD1 = Number((delCOP1 / copRate).toFixed(4));

    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, payment_method, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, cop_rate_at_payment, bs_rate_at_payment, shift, created_at)
       VALUES ($1, $2, 'delivery', 'Cliente COP 1', 'entregado', 'pagado', 'Efectivo COP', $3, $4, $5, $6, $7, $8, 'ambos', CURRENT_TIMESTAMP)`,
      [ord1Id, ord1Num, totalUSD1, totalCOP1, delUSD1, delCOP1, copRate, bsRate]
    );

    // Ítem 1: Hot Dog Clásico (10.000 COP)
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'prod-hd-clasico', 'Hot Dog Clásico', 10000, 1, 'Hot Dogs')`,
      [`it1-${Date.now()}`, ord1Id]
    );

    // Ítem 2: Hot Dog Especial (17.000 COP con extra de 2.000)
    const extrasJson = JSON.stringify([
      { name: 'Tocineta Crispy', price: 2000, quantity: 1 },
      { name: 'Maíz Dulce', price: 0, quantity: 1 }
    ]);
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, extras_json)
       VALUES ($1, $2, 'prod-hd-esp', 'Hot Dog Especial', 17000, 1, 'Hot Dogs', $3)`,
      [`it2-${Date.now()}`, ord1Id, extrasJson]
    );

    // Ítem 3: Refresco 350ml (4.000 COP)
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, drink_type, flavor)
       VALUES ($1, $2, 'prod-refresco-cop', 'Refresco 350ml', 4000, 1, 'Bebidas', 'refresco', 'Colombiana')`,
      [`it3-${Date.now()}`, ord1Id]
    );

    // Pago Orden 1: Cliente entregó 50.000 COP en Efectivo COP, y recibió 17.000 COP de vuelto
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente COP 1', 'Efectivo COP', $3, 50000, $4, $5, CURRENT_TIMESTAMP)`,
      [`pay1-${Date.now()}`, ord1Id, totalUSD1, copRate, bsRate]
    );
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, change_given_cop, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente COP 1', 'Efectivo COP', 0.00, 17000, $3, $4, CURRENT_TIMESTAMP)`,
      [`chg1-${Date.now()}`, ord1Id, copRate, bsRate]
    );

    console.log('--- [2] ORDEN 2: PAGO MIXTO CON USD CASH Y COP ---');
    // Orden 2:
    // Salchipapa Gigante: 25.000 COP
    // Total Orden 2: 25.000 COP ($8.0645 USD)
    // Pago: $5.00 USD (equiv. 15.500 COP) + 9.500 COP en Efectivo COP
    const ord2Id = `test-cop-ord2-${Date.now()}`;
    const ord2Num = '#COP-902';
    const totalCOP2 = 25000;
    const totalUSD2 = Number((totalCOP2 / copRate).toFixed(4));

    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, payment_method, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, cop_rate_at_payment, bs_rate_at_payment, shift, created_at)
       VALUES ($1, $2, 'mesa', 'Cliente COP 2', 'entregado', 'pagado', 'Múltiples Métodos', $3, $4, 0, 0, $5, $6, 'ambos', CURRENT_TIMESTAMP)`,
      [ord2Id, ord2Num, totalUSD2, totalCOP2, copRate, bsRate]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'prod-salchipapa', 'Salchipapa Gigante', 25000, 1, 'Comidas')`,
      [`it4-${Date.now()}`, ord2Id]
    );

    // Pago mixto:
    // Parte A: $5.00 USD
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente COP 2', 'Efectivo USD', 5.00, 5.00, $3, $4, CURRENT_TIMESTAMP)`,
      [`pay2a-${Date.now()}`, ord2Id, copRate, bsRate]
    );
    // Parte B: 9.500 COP (9500 / 3100 = 3.0645 USD)
    const paidUSD2b = Number((9500 / copRate).toFixed(4));
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente COP 2', 'Efectivo COP', $3, 9500, $4, $5, CURRENT_TIMESTAMP)`,
      [`pay2b-${Date.now()}`, ord2Id, paidUSD2b, copRate, bsRate]
    );

    console.log('--- [3] CAMBIO POSTERIOR DE TASA DE CAMBIO (SIMULACIÓN FUTURA) ---');
    // La tasa del turno sube de 3100 a 3400 COP, pero las comandas pasadas deben mantener 3100
    await client.query(
      `UPDATE shift_exchange_rates SET cop_rate = 3400, bs_rate = 3.5 WHERE shift = 'ambos'`
    );

    console.log('--- [4] CONSULTA Y NORMALIZACIÓN DE REPORTE DE INTERVALO ---');
    const { rows: orderRows } = await client.query(
      `SELECT * FROM orders WHERE id IN ($1, $2) ORDER BY created_at ASC`,
      [ord1Id, ord2Id]
    );
    const { rows: itemRows } = await client.query(
      `SELECT oi.*, o.cop_rate_at_payment, o.bs_rate_at_payment
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.order_id IN ($1, $2)
       ORDER BY oi.id ASC`,
      [ord1Id, ord2Id]
    );
    const { rows: paymentRows } = await client.query(
      `SELECT * FROM order_payments WHERE order_id IN ($1, $2) ORDER BY created_at ASC`,
      [ord1Id, ord2Id]
    );

    assert(orderRows.length === 2, 'Se consultaron las 2 comandas de prueba');
    assert(itemRows.length === 4, 'Se consultaron los 4 ítems de prueba');
    assert(paymentRows.length === 4, 'Se consultaron los 4 pagos/vueltos de prueba');

    // Normalizar ítems como en server/routes/reporteIntervalo.js
    const normalizedItems = itemRows.map((it) => {
      const rawPrice = parseFloat(it.price) || 0;
      const ordCopRate = parseFloat(it.cop_rate_at_payment) || 3100;
      const isRawInCOP = rawPrice >= 100;
      const priceCOP = isRawInCOP ? rawPrice : Math.round(rawPrice * ordCopRate);
      const priceUSD = isRawInCOP ? (ordCopRate > 0 ? Number((rawPrice / ordCopRate).toFixed(4)) : rawPrice) : rawPrice;

      let extras = [];
      if (it.extras_json) {
        try { extras = typeof it.extras_json === 'string' ? JSON.parse(it.extras_json) : it.extras_json; } catch(e){}
      }
      const normExtras = extras.map(ex => {
        const exRaw = parseFloat(ex.price) || 0;
        const exIsCOP = exRaw >= 100;
        return {
          ...ex,
          price: exRaw,
          priceCOP: exIsCOP ? exRaw : Math.round(exRaw * ordCopRate),
          priceUSD: exIsCOP ? (ordCopRate > 0 ? Number((exRaw / ordCopRate).toFixed(4)) : exRaw) : exRaw
        };
      });

      return {
        id: it.id,
        orderId: it.order_id,
        productName: it.product_name,
        category: it.category,
        price: rawPrice,
        priceUSD,
        priceCOP,
        quantity: it.quantity,
        copRate: ordCopRate,
        extras: normExtras,
        extrasJson: normExtras
      };
    });

    const itClasico = normalizedItems.find(i => i.productName === 'Hot Dog Clásico');
    assert(itClasico && itClasico.priceCOP === 10000, 'Hot Dog Clásico tiene precio COP = 10,000');
    assert(itClasico && Math.abs(itClasico.priceUSD - (10000 / 3100)) < 0.01, 'Hot Dog Clásico tiene precio USD normalizado = ~$3.23 USD (NO $10,000 USD)');

    const itEsp = normalizedItems.find(i => i.productName === 'Hot Dog Especial');
    assert(itEsp && itEsp.priceCOP === 17000, 'Hot Dog Especial tiene precio COP = 17,000');
    assert(itEsp && itEsp.extras[0].priceCOP === 2000, 'Extra Tocineta tiene precio COP = 2,000');
    assert(itEsp && Math.abs(itEsp.extras[0].priceUSD - (2000 / 3100)) < 0.01, 'Extra Tocineta tiene precio USD = ~$0.65 USD (NO $2,000 USD)');

    console.log('--- [5] VERIFICACIÓN DE TICKET TÉRMICO DE ÍTEMS VENDIDOS (HOT DOGS) ---');
    const reportData = {
      items: normalizedItems,
      orders: orderRows.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        type: o.type,
        totalUSD: parseFloat(o.total_usd),
        totalCOP: parseFloat(o.total_cop),
        deliveryFeeUSD: parseFloat(o.delivery_fee_usd),
        deliveryFeeCOP: parseFloat(o.delivery_fee_cop),
        copRateAtPayment: parseFloat(o.cop_rate_at_payment),
        paymentStatus: o.payment_status
      })),
      exchangeRates: { COP: 3100, Bs: 3.2 }
    };

    const ticketBuffer = buildReportTicket('hotdogs', reportData);
    assert(Buffer.isBuffer(ticketBuffer), 'buildReportTicket generó Buffer válido');
    const ticketText = ticketBuffer.toString('latin1');

    // Verificar que NO contenga precios disparados en USD como $10000.00 o $17000.00
    assert(!ticketText.includes('$10000.00'), 'Ticket térmico NO infló precio de Hot Dog a $10000.00 USD');
    assert(!ticketText.includes('$17000.00'), 'Ticket térmico NO infló precio de Hot Dog a $17000.00 USD');
    assert(!ticketText.includes('$2000.00'), 'Ticket térmico NO infló delivery a $2000.00 USD');
    assert(ticketText.includes('10.000 COP'), 'Ticket térmico incluye monto en COP correctamente (10.000 COP)');

    console.log('--- [6] VERIFICACIÓN DE TICKET TÉRMICO DE CIERRE CONTABLE ---');
    const cierreData = {
      ...reportData,
      payments: paymentRows.map(p => ({
        id: p.id,
        orderId: p.order_id,
        paymentMethod: p.payment_method,
        amountPaidUSD: parseFloat(p.amount_paid_usd) || 0,
        cashTenderedUSD: parseFloat(p.cash_tendered_usd) || 0,
        cashTenderedCOP: parseFloat(p.cash_tendered_cop) || 0,
        cashTenderedBs: parseFloat(p.cash_tendered_bs) || 0,
        changeGivenUSD: parseFloat(p.change_given_usd) || 0,
        changeGivenCOP: parseFloat(p.change_given_cop) || 0,
        changeGivenBs: parseFloat(p.change_given_bs) || 0,
        copRate: parseFloat(p.cop_rate) || 3100,
        bsRate: parseFloat(p.bs_rate) || 3.2
      })),
      openedUSD: 0,
      openedCOP: 0
    };

    const cierreBuffer = buildCrispysCierreTicket(cierreData);
    assert(Buffer.isBuffer(cierreBuffer), 'buildCrispysCierreTicket generó Buffer válido');
    const cierreText = cierreBuffer.toString('latin1');

    // Total general ítems en cierre debe ser ~$18.71 USD (33k + 25k = 58,000 COP / 3100)
    assert(!cierreText.includes('$58000.00'), 'Cierre contable NO sumó 58,000 como dólares');
    assert(cierreText.includes('$18.71 USD') || cierreText.includes('$18.70 USD') || cierreText.includes('$18.72 USD'), 'Cierre contable calculó Total General Ítems exacto en USD (~$18.71 USD)');

    console.log('--- [7] COMPROBACIÓN DE CUADRE DE CAJA FISICA (INGRESOS - VUELTOS) ---');
    // Efectivo COP:
    // Orden 1: Ingreso 50.000 COP, Vuelto 17.000 COP => Neto = 33.000 COP
    // Orden 2: Ingreso 9.500 COP, Vuelto 0 COP => Neto = 9.500 COP
    // Total Efectivo COP en gaveta = 42.500 COP
    // Efectivo USD:
    // Orden 2: Ingreso $5.00 USD => Neto = $5.00 USD
    // Total Facturado = 42.500 COP + $5.00 USD = 42.500 + 15.500 = 58.000 COP (100% exacto!)
    assert(cierreText.includes('42.500COP') || cierreText.includes('42,500COP'), 'Efectivo COP en caja física cuadra exacto (42.500 COP)');
    assert(cierreText.includes('5.00$'), 'Efectivo USD en caja física cuadra exacto ($5.00 USD)');

    await client.query('ROLLBACK');
    console.log('\n🔒 [ROLLBACK EJECUTADO] Base de datos limpia y sin datos de prueba.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en auditoría:', err);
    failed++;
  } finally {
    client.release();
  }

  console.log('======================================================================');
  console.log(` RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================');
  if (failed > 0) process.exit(1);
}

testCOPPrimaryAccounting();
