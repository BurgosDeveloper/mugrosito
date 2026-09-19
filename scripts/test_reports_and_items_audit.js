const { initDb, getClient } = require('../server/db');
const { roundCOPPayment, roundCOP } = require('../server/helpers/currencyRounding');
const { getRatesForShift } = require('../server/helpers/exchangeRates');

async function runReportAndItemsAudit() {
  console.log('======================================================================');
  console.log(' 🍔 CRISPY BURGER POS - AUDITORÍA COMPLETA DE ÍTEMS Y REPORTES');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}${detail ? ' -> ' + detail : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
      failed++;
    }
  }

  await initDb();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { COP: copRate, Bs: bsRate } = await getRatesForShift(client, 'ambos');
    console.log(`Tasas activas: COP = ${copRate}, Bs = ${bsRate}\n`);

    // ------------------------------------------------------------------
    // CASO 1: Comanda con Hamburguesas Personalizadas (Proteínas, SIN, Extras)
    // ------------------------------------------------------------------
    console.log('--- [1] CREACIÓN DE COMANDA CON PERSONALIZACIONES AVANZADAS ---');
    const order1Id = `test-rep-ord1-${Date.now()}`;
    const order1Num = '#AUDIT-101';

    // Item 1: Hamburguesa Bistro ($7.00 base) + Tocineta ($1.00 extra) = $8.00
    // Proteína cambiada: Pollo Crispy; Ingrediente retirado: SIN Cebolla; Topping gratis: Jalapeños ($0.00)
    const it1Id = `it-aud-1-${Date.now()}`;
    const it1Extras = [
      { name: 'Tocineta', price: 1.00, quantity: 1, unitPrice: 1.00 },
      { name: 'Jalapeños Picantes', price: 0, quantity: 1, unitPrice: 0 }
    ];
    const it1Proteins = ['Pollo Crispy'];
    const it1Removed = ['Cebolla'];

    // Item 2: Bebida Refresco 350ml ($1.00) con sabor Coca-Cola
    const it2Id = `it-aud-2-${Date.now()}`;

    // Item 3: Salsa de la Casa ($0.00, no contable)
    const it3Id = `it-aud-3-${Date.now()}`;

    // Delivery: $2.00 USD (6,200 COP)
    const deliveryFeeUSD = 2.00;
    const deliveryFeeCOP = deliveryFeeUSD * copRate;

    const totalUSD1 = 8.00 + 1.00 + 0.00 + deliveryFeeUSD; // $11.00 USD
    const totalCOP1 = totalUSD1 * copRate;

    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, cop_rate_at_payment, bs_rate_at_payment, shift, created_at)
       VALUES ($1, $2, 'delivery', 'Cliente Auditoría 1', 'en_preparacion', 'no_pagado', $3, $4, $5, $6, $7, $8, 'ambos', CURRENT_TIMESTAMP)`,
      [order1Id, order1Num, totalUSD1, totalCOP1, deliveryFeeUSD, deliveryFeeCOP, copRate, bsRate]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, proteins, removed_ingredients, extras_json)
       VALUES ($1, $2, 'prod-bistro', 'Bistro', 8.00, 1, 'Hamburguesas', $3, $4, $5)`,
      [it1Id, order1Id, it1Proteins, it1Removed, JSON.stringify(it1Extras)]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, drink_type, flavor)
       VALUES ($1, $2, 'prod-refresco', 'Refresco 350ml', 1.00, 1, 'Bebidas', 'refresco', 'Coca-Cola')`,
      [it2Id, order1Id]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'ing-salsa-casa', 'Salsa de la Casa', 0.00, 1, 'Salsas')`,
      [it3Id, order1Id]
    );

    // Pago de orden 1: El cliente paga con $20.00 USD en Efectivo USD, y recibe $9.00 USD de vuelto
    const pay1Id = `pm-aud-1-${Date.now()}`;
    const chg1Id = `pm-aud-chg1-${Date.now()}`;

    // Fila 1: Pago
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente Auditoría 1', 'Efectivo USD', 11.00, 20.00, $3, $4, CURRENT_TIMESTAMP)`,
      [pay1Id, order1Id, copRate, bsRate]
    );

    // Fila 2: Vuelto
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, change_given_usd, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Cliente Auditoría 1', 'Efectivo USD', 0.00, 9.00, $3, $4, CURRENT_TIMESTAMP)`,
      [chg1Id, order1Id, copRate, bsRate]
    );

    await client.query(
      `UPDATE orders SET payment_status = 'pagado', paid_amount_usd = 11.00, payment_method = 'Efectivo USD' WHERE id = $1`,
      [order1Id]
    );

    // ------------------------------------------------------------------
    // CASO 2: Comanda con Pago Dividido por Persona
    // ------------------------------------------------------------------
    console.log('--- [2] CREACIÓN DE COMANDA CON COBRO POR PERSONAS ---');
    const order2Id = `test-rep-ord2-${Date.now()}`;
    const order2Num = '#AUDIT-102';

    // Persona A: Hamburguesa Street ($7.00)
    const it2_1Id = `it-aud-2-1-${Date.now()}`;
    // Persona B: Hamburguesa Bistro ($7.00)
    const it2_2Id = `it-aud-2-2-${Date.now()}`;

    const totalUSD2 = 14.00;
    const totalCOP2 = 14.00 * copRate;

    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift, created_at)
       VALUES ($1, $2, 'mesa', 'Mesa 4', 'en_preparacion', 'no_pagado', $3, $4, 'ambos', CURRENT_TIMESTAMP)`,
      [order2Id, order2Num, totalUSD2, totalCOP2]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, proteins)
       VALUES ($1, $2, 'prod-street', 'Street', 7.00, 1, 'Hamburguesas', $3)`,
      [it2_1Id, order2Id, ['Carne de Res']]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, proteins)
       VALUES ($1, $2, 'prod-bistro', 'Bistro', 7.00, 1, 'Hamburguesas', $3)`,
      [it2_2Id, order2Id, ['Pollo a la Plancha']]
    );

    // Persona A paga su Street en Efectivo COP
    const pay2_AId = `pm-aud-2a-${Date.now()}`;
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, item_ids, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Persona A', 'Efectivo COP', 7.00, 21700, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [pay2_AId, order2Id, [it2_1Id], copRate, bsRate]
    );
    await client.query(
      `UPDATE order_items SET is_paid_individually = true, paid_by_name = 'Persona A' WHERE id = $1`,
      [it2_1Id]
    );

    // Persona B paga su Bistro con Zelle ($7.00 USD)
    const pay2_BId = `pm-aud-2b-${Date.now()}`;
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, item_ids, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Persona B', 'Zelle', 7.00, 7.00, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [pay2_BId, order2Id, [it2_2Id], copRate, bsRate]
    );
    await client.query(
      `UPDATE order_items SET is_paid_individually = true, paid_by_name = 'Persona B' WHERE id = $1`,
      [it2_2Id]
    );

    await client.query(
      `UPDATE orders SET payment_status = 'pagado', paid_amount_usd = 14.00, payment_method = 'Efectivo COP + Zelle' WHERE id = $1`,
      [order2Id]
    );

    // ------------------------------------------------------------------
    // CASO 3: Comanda Cerrada a Crédito (Deudor: "Carlos Abogado")
    // ------------------------------------------------------------------
    console.log('--- [3] CREACIÓN DE COMANDA A CRÉDITO ---');
    const order3Id = `test-rep-ord3-${Date.now()}`;
    const order3Num = '#AUDIT-103';

    const it3_1Id = `it-aud-3-1-${Date.now()}`;
    const totalUSD3 = 9.00;
    const totalCOP3 = 9.00 * copRate;

    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, payment_method, paid_amount_usd, shift, created_at)
       VALUES ($1, $2, 'credito', 'Carlos Abogado', 'entregada', 'credito', $3, $4, 'Crédito', $3, 'ambos', CURRENT_TIMESTAMP)`,
      [order3Id, order3Num, totalUSD3, totalCOP3]
    );

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, proteins)
       VALUES ($1, $2, 'prod-house', 'House', 9.00, 1, 'Hamburguesas', $3)`,
      [it3_1Id, order3Id, ['Carne de Res', 'Chuleta']]
    );

    const pay3Id = `pm-aud-3-${Date.now()}`;
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cash_tendered_cop, cash_tendered_bs, change_given_usd, change_given_cop, change_given_bs, item_ids, cop_rate, bs_rate, created_at)
       VALUES ($1, $2, 'Carlos Abogado', 'Crédito', 9.00, 0, 0, 0, 0, 0, 0, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [pay3Id, order3Id, [], copRate, bsRate]
    );

    // ------------------------------------------------------------------
    // CASO 4: Comanda Cancelada (No debe salir en reportes ni pagos)
    // ------------------------------------------------------------------
    console.log('--- [4] COMANDA CANCELADA (DEBE ESTAR EXCLUIDA DE REPORTES) ---');
    const order4Id = `test-rep-ord4-${Date.now()}`;
    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift, created_at)
       VALUES ($1, '#AUDIT-104', 'mesa', 'Cliente Cancelado', 'cancelado', 'no_pagado', 7.00, 21700, 'ambos', CURRENT_TIMESTAMP)`,
      [order4Id]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'prod-cancel', 'Crispys', 7.00, 1, 'Hamburguesas')`,
      [`it-aud-4-${Date.now()}`, order4Id]
    );

    // ------------------------------------------------------------------
    // AUDITORÍA DE CONSULTAS DE REPORTE INTERVALO (ENDPOINT SIMULADO)
    // ------------------------------------------------------------------
    console.log('\n--- [5] VERIFICACIÓN DE MAPEOS EN REPORTE DE INTERVALO ---');

    // 1. Órdenes
    const { rows: fetchedOrders } = await client.query(
      `SELECT * FROM orders
       WHERE id IN ($1, $2, $3, $4)
         AND payment_status IN ('pagado', 'credito')
         AND status != 'cancelado'
       ORDER BY created_at ASC`,
      [order1Id, order2Id, order3Id, order4Id]
    );
    assert(fetchedOrders.length === 3, 'Se retornan exactamente las 3 órdenes válidas (excluyendo la cancelada)');

    const billedOrderIds = fetchedOrders.map(o => o.id);
    assert(!billedOrderIds.includes(order4Id), 'Comanda cancelada estrictamente excluida');

    // 2. Ítems mapeados
    const { rows: fetchedItems } = await client.query(
      `SELECT oi.*, o.order_number, COALESCE(NULLIF(oi.category, ''), p.category, 'Sin categoría') AS category FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON (p.id = oi.product_id OR LOWER(p.name) = LOWER(oi.product_name))
       WHERE oi.order_id = ANY($1::text[])`,
      [billedOrderIds]
    );

    // Validar ítems de orden 1
    const item1 = fetchedItems.find(it => it.id === it1Id);
    assert(item1 !== undefined, 'Ítem Bistro encontrado en reporte');
    assert(Array.isArray(item1.proteins) && item1.proteins[0] === 'Pollo Crispy', 'Proteína personalizada Pollo Crispy preservada en BD y reporte');
    assert(Array.isArray(item1.removed_ingredients) && item1.removed_ingredients[0] === 'Cebolla', 'Ingrediente retirado Cebolla preservado');

    const extras1 = typeof item1.extras_json === 'string' ? JSON.parse(item1.extras_json) : item1.extras_json;
    assert(extras1.some(e => e.name === 'Tocineta' && e.price === 1.00), 'Extra pago Tocineta ($1.00) preservado');
    assert(extras1.some(e => e.name === 'Jalapeños Picantes' && e.price === 0), 'Topping gratis Jalapeños ($0.00) preservado');

    // Validar ítems de orden 2 (pago por personas)
    const item2_1 = fetchedItems.find(it => it.id === it2_1Id);
    assert(item2_1.is_paid_individually === true, 'Ítem Street marcado como pagado individualmente');
    assert(item2_1.paid_by_name === 'Persona A', 'Ítem Street registrado a nombre de Persona A');

    const item2_2 = fetchedItems.find(it => it.id === it2_2Id);
    assert(item2_2.is_paid_individually === true, 'Ítem Bistro marcado como pagado individualmente');
    assert(item2_2.paid_by_name === 'Persona B', 'Ítem Bistro registrado a nombre de Persona B');

    // 3. Pagos
    const { rows: fetchedPayments } = await client.query(
      `SELECT op.*, o.order_number FROM order_payments op
       JOIN orders o ON o.id = op.order_id
       WHERE op.order_id = ANY($1::text[])
         AND o.status != 'cancelado'
       ORDER BY op.created_at ASC`,
      [billedOrderIds]
    );

    assert(fetchedPayments.length === 5, 'Se recuperan los 5 movimientos de pago/vuelto de las 3 comandas válidas');

    // Validar pago 1: tender 20, change 9, net 11 USD
    const pay1 = fetchedPayments.find(p => p.id === pay1Id);
    const chg1 = fetchedPayments.find(p => p.id === chg1Id);
    assert(Number(pay1.cash_tendered_usd) === 20.00, 'Pago 1: Efectivo USD recibido $20.00');
    assert(Number(chg1.change_given_usd) === 9.00, 'Vuelto 1: Efectivo USD entregado $9.00');

    // Validar pago 2: Persona A Efectivo COP, Persona B Zelle
    const pay2A = fetchedPayments.find(p => p.id === pay2_AId);
    const pay2B = fetchedPayments.find(p => p.id === pay2_BId);
    assert(pay2A.payer_name === 'Persona A' && pay2A.payment_method === 'Efectivo COP', 'Pago 2A de Persona A en Efectivo COP');
    assert(pay2B.payer_name === 'Persona B' && pay2B.payment_method === 'Zelle', 'Pago 2B de Persona B en Zelle');

    // Validar crédito
    const pay3 = fetchedPayments.find(p => p.id === pay3Id);
    assert(pay3.payment_method === 'Crédito' && Number(pay3.amount_paid_usd) === 9.00, 'Crédito registrado con monto $9.00 USD');

    // ------------------------------------------------------------------
    // PRUEBA 6: Balance y Cuadre Matemático de Secciones Contables
    // ------------------------------------------------------------------
    console.log('\n--- [6] VERIFICACIÓN DE TOTALES Y BALANCES CONTABLES ---');

    const totalVentaEsperadaUSD = totalUSD1 + totalUSD2 + totalUSD3;
    assert(totalVentaEsperadaUSD === 34.00, 'Venta Total Esperada', `$${totalVentaEsperadaUSD.toFixed(2)} USD`);

    let foodTotal = 0;
    let drinkTotal = 0;
    let extraTotal = 0;
    let deliveryTotal = 0;

    for (const ord of fetchedOrders) {
      deliveryTotal += Number(ord.delivery_fee_usd) || 0;
    }

    for (const it of fetchedItems) {
      const cat = (it.category || '').toLowerCase();
      const rawPrice = Number(it.price) || 0;
      let itExtrasUnit = 0;
      const exList = typeof it.extras_json === 'string' ? JSON.parse(it.extras_json || '[]') : (it.extras_json || []);
      for (const ex of exList) {
        if (Number(ex.price) > 0) {
          itExtrasUnit += Number(ex.price);
          extraTotal += Number(ex.price) * (it.quantity || 1);
        }
      }
      const basePrice = Math.max(0, rawPrice - itExtrasUnit);
      if (cat.includes('bebida')) {
        drinkTotal += basePrice * (it.quantity || 1);
      } else if (cat.includes('hamburguesa') || cat.includes('hot dog') || cat.includes('comida')) {
        foodTotal += basePrice * (it.quantity || 1);
      }
    }

    assert(foodTotal === 30.00, 'Subtotal Comidas Base', `$${foodTotal.toFixed(2)} USD`);
    assert(drinkTotal === 1.00, 'Subtotal Bebidas', `$${drinkTotal.toFixed(2)} USD`);
    assert(extraTotal === 1.00, 'Subtotal Adicionales Pagos', `$${extraTotal.toFixed(2)} USD`);
    assert(deliveryTotal === 2.00, 'Subtotal Delivery', `$${deliveryTotal.toFixed(2)} USD`);

    const sumAllCategories = foodTotal + drinkTotal + extraTotal + deliveryTotal;
    assert(sumAllCategories === totalVentaEsperadaUSD, 'Cuadre 100% Perfecto: Suma de Categorías == Total Facturado', `$${sumAllCategories.toFixed(2)} == $${totalVentaEsperadaUSD.toFixed(2)}`);

    // Rollback para garantizar cero contaminación de la base de datos de producción
    await client.query('ROLLBACK');
    console.log('\n🔒 [ROLLBACK EJECUTADO] Base de datos limpia y sin datos de prueba.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error durante la auditoría:', err);
    failed++;
  } finally {
    client.release();
  }

  console.log('\n======================================================================');
  console.log(` RESULTADOS AUDITORÍA: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runReportAndItemsAudit().catch((err) => {
  console.error('Fallo crítico ejecutando auditoría:', err);
  process.exit(1);
});
