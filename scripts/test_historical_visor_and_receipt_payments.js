const assert = require('assert');
const { initDb, query } = require('../server/db');
const { buildKitchenTicket, buildReceiptTicket } = require('../server/helpers/thermalPrinter');

async function runTest() {
  console.log('======================================================================');
  console.log('   🧪 PRUEBA DE VISOR HISTÓRICO Y RECIBO TÉRMICO CON DETALLE DE PAGO');
  console.log('======================================================================');

  await initDb();
  let passed = 0;
  let failed = 0;

  function check(condition, desc) {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${desc}`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL] ${desc}`);
      throw new Error(`Fallo de aserción: ${desc}`);
    }
  }

  // 1. Probar formateo de Fecha/Hora en Comanda de Cocina (Mes, Día, Hora, Minutos)
  console.log('\n>>> 1. FORMATO DE FECHA EN COMANDA DE COCINA (Mes, Día, Hora, Minuto)');
  const sampleKitchenOrder = {
    orderNumber: '55',
    type: 'mesa',
    tableNumber: 4,
    createdAt: new Date('2026-10-13T14:35:00Z'),
    items: [
      { productName: 'Perro Especial', quantity: 4, category: 'Hot Dogs' }
    ]
  };
  const kitchenBuf = buildKitchenTicket(sampleKitchenOrder, false);
  const kitchenText = kitchenBuf.toString('ascii');
  check(kitchenText.includes('COMANDA: #55'), 'Comanda #55 presente en ticket de cocina');
  check(kitchenText.includes('FECHA:'), 'Encabezado FECHA presente en cocina');
  check(/FECHA:\s*\d{2}\/\d{2}\s+\d{1,2}:\d{2}\s+(AM|PM)/i.test(kitchenText), 'Formato de fecha incluye Mes, Día, Hora y Minutos');

  // 2. Probar Recibo Térmico No Pagado (Pre-cuenta)
  console.log('\n>>> 2. RECIBO TÉRMICO PRE-CUENTA (NO PAGADO)');
  const unpaidOrder = {
    orderNumber: '101',
    type: 'mesa',
    tableNumber: 2,
    customerName: 'Juan Perez',
    createdAt: new Date(),
    paymentStatus: 'no_pagado',
    totalUSD: 10,
    totalCOP: 31000,
    copRateAtPayment: 3100,
    bsRateAtPayment: 3.2,
    items: [
      { productName: 'Hamburguesa Doble', quantity: 1, price: 31000 }
    ],
    paymentHistory: []
  };
  const unpaidBuf = buildReceiptTicket(unpaidOrder, { COP: 3100, Bs: 3.2 });
  const unpaidText = unpaidBuf.toString('latin1');
  check(unpaidText.includes('PRE-CUENTA / CONSUMO'), 'Título PRE-CUENTA para orden sin pagar');
  check(!unpaidText.includes('DETALLE DE PAGO'), 'No muestra detalle de pago si no está pagada');

  // 3. Probar Recibo Térmico Pagado con 1 Método y Vuelto
  console.log('\n>>> 3. RECIBO TÉRMICO PAGADO CON MÉTODO Y VUELTO');
  const paidOrder = {
    orderNumber: '102',
    type: 'pickup',
    customerName: 'Maria Rodriguez',
    createdAt: new Date(),
    paymentStatus: 'pagado',
    paidAmountUSD: 10,
    totalUSD: 10,
    totalCOP: 31000,
    copRateAtPayment: 3100,
    bsRateAtPayment: 3.2,
    items: [
      { productName: 'Perro Mugroso', quantity: 2, price: 15500 }
    ],
    paymentHistory: [
      {
        id: 'pm-1',
        paymentMethod: 'Efectivo COP',
        amountPaidUSD: 10,
        cashTenderedCOP: 50000,
        changeGivenCOP: 19000,
        copRate: 3100,
        bsRate: 3.2,
        currency: 'COP',
        entryType: 'payment'
      }
    ]
  };
  const paidBuf = buildReceiptTicket(paidOrder, { COP: 3100, Bs: 3.2 });
  const paidText = paidBuf.toString('latin1');
  check(paidText.includes('RECIBO DE PAGO'), 'Título es RECIBO DE PAGO cuando está pagada');
  check(paidText.includes('DETALLE DE PAGO'), 'Encabezado DETALLE DE PAGO presente');
  check(paidText.includes('METODO') && paidText.includes('MONTO'), 'Columnas METODO y MONTO presentes');
  check(paidText.includes('EFECTIVO COP'), 'Método EFECTIVO COP presente en ticket');
  check(paidText.includes('50.000 COP'), 'Monto entregado 50.000 COP presente en columna');
  check(paidText.includes('VUELTO:'), 'Encabezado VUELTO presente');
  check(paidText.includes('19.000 COP'), 'Vuelto de 19.000 COP con su moneda exacto');

  // 4. Probar Recibo Térmico con Múltiples Métodos de Pago (Mixto)
  console.log('\n>>> 4. RECIBO TÉRMICO CON MÚLTIPLES MÉTODOS DE PAGO');
  const splitPaidOrder = {
    orderNumber: '103',
    type: 'delivery',
    customerName: 'Carlos Gomez',
    createdAt: new Date(),
    paymentStatus: 'pagado',
    paidAmountUSD: 20,
    totalUSD: 20,
    totalCOP: 62000,
    copRateAtPayment: 3100,
    bsRateAtPayment: 3.2,
    items: [
      { productName: 'Hamburguesa Triple', quantity: 2, price: 31000 }
    ],
    paymentHistory: [
      {
        id: 'pm-a',
        paymentMethod: 'Bancolombia',
        amountPaidUSD: 10,
        currency: 'COP',
        copRate: 3100,
        entryType: 'payment'
      },
      {
        id: 'pm-b',
        paymentMethod: 'Efectivo USD',
        amountPaidUSD: 10,
        cashTenderedUSD: 10,
        currency: 'USD',
        entryType: 'payment'
      }
    ]
  };
  const splitBuf = buildReceiptTicket(splitPaidOrder, { COP: 3100, Bs: 3.2 });
  const splitText = splitBuf.toString('latin1');
  check(splitText.includes('BANCOLOMBIA'), 'Método BANCOLOMBIA presente en columna');
  check(splitText.includes('31.000 COP'), 'Monto de Bancolombia en COP presente');
  check(splitText.includes('EFECTIVO USD'), 'Método EFECTIVO USD presente en columna');
  check(splitText.includes('$10.00 USD'), 'Monto en USD presente');

  // 5. Probar Comprobante a Crédito
  console.log('\n>>> 5. COMPROBANTE DE COMANDA A CRÉDITO');
  const creditOrder = {
    orderNumber: '104',
    type: 'credito',
    customerName: 'Doctor Morales',
    debtorName: 'Doctor Morales',
    notes: 'Paga fin de mes',
    createdAt: new Date(),
    paymentStatus: 'credito',
    totalUSD: 15,
    totalCOP: 46500,
    copRateAtPayment: 3100,
    items: [
      { productName: 'Perro Especial', quantity: 3, price: 15500 }
    ],
    paymentHistory: []
  };
  const creditBuf = buildReceiptTicket(creditOrder, { COP: 3100 });
  const creditText = creditBuf.toString('latin1');
  check(creditText.includes('COMPROBANTE A CREDITO'), 'Título COMPROBANTE A CREDITO presente');
  check(creditText.includes('CREDITO'), 'Método CREDITO presente');
  check(creditText.includes('DEUDOR: Doctor Morales'), 'Nombre del deudor reflejado en el ticket');

  // 6. Probar Consulta de Órdenes Históricas en Base de Datos (incluyendo archivadas)
  console.log('\n>>> 6. CONSULTA HISTÓRICA EN BASE DE DATOS (ÓRDENES ARCHIVADAS)');
  const testOrderId = `test-hist-${Date.now()}`;
  await query(
    `INSERT INTO orders (id, order_number, type, customer_name, debtor_name, total_usd, total_cop, payment_status, payment_method, archived_at, created_at)
     VALUES ($1, '999', 'credito', 'Don Ramon', 'Don Ramon', 10.00, 31000.00, 'credito', 'Crédito', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [testOrderId]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, removed_ingredients, proteins, is_cut)
     VALUES ($1, $2, 'prod-p1', 'Perro Caliente', 15500.00, 2, 'Grande', ARRAY['cebolla'], ARRAY['Carne'], TRUE)`,
    [`it-${testOrderId}`, testOrderId]
  );

  const { rows: histRows } = await query(
    `SELECT o.*,
       COALESCE((SELECT json_agg(json_build_object('productName', oi.product_name, 'quantity', oi.quantity, 'proteins', oi.proteins, 'removedIngredients', oi.removed_ingredients))
                 FROM order_items oi WHERE oi.order_id = o.id), '[]'::json) AS items
     FROM orders o WHERE o.id = $1`,
    [testOrderId]
  );
  check(histRows.length === 1, 'Comanda histórica archivada recuperada');
  check(histRows[0].archived_at !== null, 'Comanda tiene marca de archived_at');
  check(histRows[0].items.length === 1, 'Ítems detallados recuperados intactos');
  check(histRows[0].items[0].productName === 'Perro Caliente', 'Nombre de producto intacto');
  check(histRows[0].items[0].quantity === 2, 'Cantidad intacta (2 perros)');
  check(histRows[0].items[0].proteins.includes('Carne'), 'Proteínas intactas');
  check(histRows[0].items[0].removedIngredients.includes('cebolla'), 'Ingrediente retirado intacto');

  // Limpieza de registro de prueba
  await query(`DELETE FROM order_items WHERE order_id = $1`, [testOrderId]);
  await query(`DELETE FROM orders WHERE id = $1`, [testOrderId]);

  console.log('\n======================================================================');
  console.log(`   RESULTADOS VISOR HISTÓRICO: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Fatal error en test histórico:', err);
  process.exit(1);
});
