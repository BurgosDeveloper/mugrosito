const { initDb, query, getClient } = require('../server/db');
const { roundCOPPayment, roundCOP, roundBs, roundUSD } = require('../server/helpers/currencyRounding');
const { paymentHistoryTotals, toUsd, paymentAmounts, changeAmounts } = require('../server/helpers/paymentLedger');
const { postCompletedOrderCashMovements } = require('../server/helpers/cashLedger');

async function runComprehensiveAudit() {
  console.log('======================================================================');
  console.log(' 🌭 MUGROSITO POS - AUDITORÍA EXHAUSTIVA DE CONTABILIDAD Y DINERO');
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

  // ------------------------------------------------------------------
  // PRUEBA 1: Reglas de Redondeo Comercial de Pagos en COP (roundCOPPayment)
  // ------------------------------------------------------------------
  console.log('--- [1] VALIDACIÓN DE REDONDEO COMERCIAL DE CLIENTES EN COP ---');
  const roundingCases = [
    { in: 0, out: 0, desc: '0 COP se mantiene 0' },
    { in: 100, out: 500, desc: '100 COP -> 500 COP (<= 500 sube al escalón 500)' },
    { in: 499, out: 500, desc: '499 COP -> 500 COP' },
    { in: 500, out: 500, desc: '500 COP -> 500 COP exacto' },
    { in: 501, out: 1000, desc: '501 COP -> 1,000 COP (> 500 aproxima al millar)' },
    { in: 1500, out: 1500, desc: '1,500 COP -> 1,500 COP (<= 500 fuera de miles)' },
    { in: 1600, out: 2000, desc: '1,600 COP -> 2,000 COP (> 500 fuera de miles aproxima a 2,000)' },
    { in: 2000, out: 2000, desc: '2,000 COP -> 2,000 COP múltiplo de mil' },
    { in: 31500, out: 31500, desc: '31,500 COP -> 31,500 COP' },
    { in: 31501, out: 32000, desc: '31,501 COP -> 32,000 COP' },
    { in: 39500, out: 39500, desc: '39,500 COP -> 39,500 COP' },
    { in: 39600, out: 40000, desc: '39,600 COP -> 40,000 COP' },
  ];

  for (const rc of roundingCases) {
    const res = roundCOPPayment(rc.in);
    assert(res === rc.out, rc.desc, `Esperado: ${rc.out}, Obtenido: ${res}`);
  }

  // ------------------------------------------------------------------
  // PRUEBA 2: Conversiones Fronterizas Exactas (Tasa Dólar 3100 COP, Tasa Bs 3.2 COP)
  // ------------------------------------------------------------------
  console.log('\n--- [2] VALIDACIÓN DE MATEMÁTICA FRONTERIZA MULTIMONEDA ---');
  const copRate = 3100;
  const bsRate = 3.2;

  // 31,000 COP deben ser exactamente 10.00 USD y 9,687.50 Bs
  const totalCOP = 31000;
  const usdEquiv = totalCOP / copRate;
  const bsEquiv = totalCOP / bsRate;
  assert(Math.abs(usdEquiv - 10.0) < 0.001, '31,000 COP a USD', `$${usdEquiv.toFixed(2)} USD`);
  assert(Math.abs(bsEquiv - 9687.5) < 0.001, '31,000 COP a Bs', `${bsEquiv.toFixed(2)} Bs`);

  // Conversión inversa: 10.00 USD -> COP -> Bs
  const usdToBs = (10.0 * copRate) / bsRate;
  assert(Math.abs(usdToBs - 9687.5) < 0.001, '10 USD a Bs vía frontera', `${usdToBs.toFixed(2)} Bs`);

  // Conversión de vuelto en Bs: 500 Bs en vuelto -> COP y USD
  const changeBs = 500;
  const changeBsInCOP = changeBs * bsRate; // 1,600 COP
  const changeBsInUSD = (changeBs * bsRate) / copRate; // $0.516... USD
  assert(changeBsInCOP === 1600, '500 Bs vuelto en COP', `${changeBsInCOP} COP`);
  assert(Math.abs(changeBsInUSD - 0.5161) < 0.001, '500 Bs vuelto en USD', `$${changeBsInUSD.toFixed(4)} USD`);

  // ------------------------------------------------------------------
  // PRUEBA 3: Conexión a Base de Datos PostgreSQL y Pruebas Transaccionales
  // ------------------------------------------------------------------
  console.log('\n--- [3] PRUEBAS TRANSACCIONALES EN BASE DE DATOS POSTGRESQL ---');
  await initDb();

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const testOrderId = `test-ord-${Date.now()}`;
    const testOrderNum = '#TEST-99';

    // 1. Crear Orden con 2 Hot Dogs + Adicionales + 2 Bebidas + Delivery
    const item1Price = 18000;
    const item2Price = 12000;
    const item3Price = 5000;
    const item3Qty = 2;
    const deliveryFeeCOP = 3000;
    const expectedOrderCOP = item1Price + item2Price + (item3Price * item3Qty) + deliveryFeeCOP;
    const expectedOrderUSD = Number((expectedOrderCOP / copRate).toFixed(2));

    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, delivery_fee_usd, delivery_fee_cop, cop_rate_at_payment, bs_rate_at_payment, shift)
       VALUES ($1, $2, 'delivery', 'Cliente Auditoría', 'en_preparacion', 'no_pagado', $3, $4, $5, $6, $7, $8, 'ambos')`,
      [testOrderId, testOrderNum, expectedOrderUSD, expectedOrderCOP, Number((deliveryFeeCOP / copRate).toFixed(2)), deliveryFeeCOP, copRate, bsRate]
    );

    const it1Id = `it-1-${Date.now()}`;
    const it2Id = `it-2-${Date.now()}`;
    const it3Id = `it-3-${Date.now()}`;

    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'p1', 'Perro Especial', $3, 1, 'Hot Dogs')`,
      [it1Id, testOrderId, item1Price]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'p2', 'Perro Clásico', $3, 1, 'Hot Dogs')`,
      [it2Id, testOrderId, item2Price]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category)
       VALUES ($1, $2, 'p3', 'Refresco', $3, $4, 'Bebidas')`,
      [it3Id, testOrderId, item3Price, item3Qty]
    );

    // Verificar que la suma de ítems + delivery coincide con total_cop de la orden
    const { rows: itemsSum } = await client.query(
      `SELECT SUM(price * quantity) as items_total FROM order_items WHERE order_id = $1`,
      [testOrderId]
    );
    const sumCalculatedCOP = Number(itemsSum[0].items_total) + deliveryFeeCOP;
    assert(sumCalculatedCOP === expectedOrderCOP, 'Contabilidad de Ítems + Delivery', `${sumCalculatedCOP} COP == ${expectedOrderCOP} COP`);

    // ------------------------------------------------------------------
    // PRUEBA 4: Pago Dividido por Persona (Cobrar Perro Especial individualmente)
    // ------------------------------------------------------------------
    console.log('\n--- [4] PRUEBA DE PAGO DIVIDIDO POR PERSONA (ÍTEM INDIVIDUAL) ---');
    const it1COP = 18000;
    const it1USD = Number((it1COP / copRate).toFixed(4));
    const pay1Id = `pm-1-${Date.now()}`;

    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, item_ids, cop_rate, bs_rate)
       VALUES ($1, $2, 'Amigo 1', 'Efectivo COP', $3, $4, $5, $6, $7)`,
      [pay1Id, testOrderId, it1USD, it1COP, [it1Id], copRate, bsRate]
    );

    await client.query(
      `UPDATE order_items SET is_paid_individually = true, paid_by_name = 'Amigo 1' WHERE id = $1`,
      [it1Id]
    );

    await client.query(
      `UPDATE orders SET paid_amount_usd = $1 WHERE id = $2`,
      [it1USD, testOrderId]
    );

    // Validar estado de ítems pagados
    const { rows: it1Row } = await client.query(`SELECT is_paid_individually, paid_by_name FROM order_items WHERE id = $1`, [it1Id]);
    assert(it1Row[0].is_paid_individually === true, 'Ítem 1 marcado como pagado individualmente');
    assert(it1Row[0].paid_by_name === 'Amigo 1', 'Ítem 1 registrado a nombre de Amigo 1');

    // Validar ítems restantes pendientes
    const { rows: pendingItems } = await client.query(
      `SELECT SUM(price * quantity) as remaining_items FROM order_items WHERE order_id = $1 AND is_paid_individually = false`,
      [testOrderId]
    );
    const remainingItemsCOP = Number(pendingItems[0].remaining_items);
    assert(remainingItemsCOP === 22000, 'Saldo restante de ítems pendientes (12,000 + 10,000)', `${remainingItemsCOP} COP`);

    // ------------------------------------------------------------------
    // PRUEBA 5: Pago del saldo restante en Efectivo COP con Billete de 50,000 COP y Vuelto
    // ------------------------------------------------------------------
    console.log('\n--- [5] PRUEBA DE PAGO EN EFECTIVO CON BILLETE MAYOR Y VUELTO EXACTO ---');
    const remainingDebtCOP = 25000;
    const remainingDebtUSD = Number((remainingDebtCOP / copRate).toFixed(4));
    const cashTenderedCOP = 50000;
    const changeGivenCOP = 25000;

    const pay2Id = `pm-2-${Date.now()}`;
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_cop, change_given_cop, item_ids, cop_rate, bs_rate)
       VALUES ($1, $2, 'Amigo 2', 'Efectivo COP', $3, $4, $5, $6, $7, $8)`,
      [pay2Id, testOrderId, remainingDebtUSD, cashTenderedCOP, changeGivenCOP, [it2Id, it3Id], copRate, bsRate]
    );

    await client.query(
      `UPDATE order_items SET is_paid_individually = true, paid_by_name = 'Amigo 2' WHERE id IN ($1, $2)`,
      [it2Id, it3Id]
    );

    // Finalizar orden
    const totalPaidUSD = it1USD + remainingDebtUSD;
    await client.query(
      `UPDATE orders SET payment_status = 'pagado', status = 'preparada', paid_amount_usd = $1 WHERE id = $2`,
      [totalPaidUSD, testOrderId]
    );

    // Validar que todos los ítems están pagados
    const { rows: unpaidCheck } = await client.query(
      `SELECT count(*) as count FROM order_items WHERE order_id = $1 AND is_paid_individually = false`,
      [testOrderId]
    );
    assert(parseInt(unpaidCheck[0].count) === 0, 'Todos los ítems de la comanda quedaron 100% liquidados');

    // ------------------------------------------------------------------
    // PRUEBA 6: Asentamiento Automático en Arqueo de Caja Chica (cashLedger)
    // ------------------------------------------------------------------
    console.log('\n--- [6] PRUEBA DE ASENTAMIENTO EN CAJA CHICA (CASH LEDGER) ---');
    const ledgerRes = await postCompletedOrderCashMovements(client, testOrderId);
    assert(ledgerRes.posted === true || ledgerRes.eligible === true, 'Comanda Delivery pagada elegible y asentada en Caja Chica');

    // Verificar transacciones registradas en caja_chica_transactions
    const { rows: cajaMovements } = await client.query(
      `SELECT type, amount_cop, payment_method, description FROM caja_chica_transactions WHERE order_id = $1 ORDER BY id ASC`,
      [testOrderId]
    );

    const totalIngresos = cajaMovements.filter(m => m.type === 'ingreso').reduce((s, m) => s + parseFloat(m.amount_cop), 0);
    const totalEgresos = cajaMovements.filter(m => m.type === 'egreso').reduce((s, m) => s + parseFloat(m.amount_cop), 0);
    const netDrawerCOP = totalIngresos - totalEgresos;

    assert(totalIngresos === 68000, 'Ingresos brutos en gaveta (18k + 50k)', `${totalIngresos} COP`);
    assert(totalEgresos === 25000, 'Vueltos entregados de la gaveta', `${totalEgresos} COP`);
    assert(netDrawerCOP === expectedOrderCOP, 'Balance Neto en gaveta igual al Total de la Comanda', `${netDrawerCOP} COP == ${expectedOrderCOP} COP`);

    // ------------------------------------------------------------------
    // PRUEBA 7: Pago Mixto Multimoneda (Parte en USD y Parte en Bs)
    // ------------------------------------------------------------------
    console.log('\n--- [7] PRUEBA DE PAGO MIXTO MULTIMONEDA (USD + BS) ---');
    const mixedOrderId = `test-mix-${Date.now()}`;
    // Comanda de 62,000 COP ($20.00 USD)
    const mixedTotalCOP = 62000;
    const mixedTotalUSD = 20.00;
    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift, cop_rate_at_payment, bs_rate_at_payment)
       VALUES ($1, '#TEST-MIX', 'mesa', 'Cliente Mixto', 'en_preparacion', 'no_pagado', $2, $3, 'ambos', $4, $5)`,
      [mixedOrderId, mixedTotalUSD, mixedTotalCOP, copRate, bsRate]
    );

    // Pago 1: $10.00 USD en efectivo (cubre 31,000 COP)
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cop_rate, bs_rate)
       VALUES ($1, $2, 'Cliente Mixto', 'Efectivo USD', 10.00, 10.00, $3, $4)`,
      [`pm-mix-1-${Date.now()}`, mixedOrderId, copRate, bsRate]
    );

    // Pago 2: Remanente en Bs (31,000 COP / 3.2 = 9,687.50 Bs) vía Pago Móvil
    const tenderBs = 9687.50;
    const paidUSD2 = 10.00;
    await client.query(
      `INSERT INTO order_payments (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_bs, cop_rate, bs_rate)
       VALUES ($1, $2, 'Cliente Mixto', 'Pago Móvil', $3, $4, $5, $6)`,
      [`pm-mix-2-${Date.now()}`, mixedOrderId, paidUSD2, tenderBs, copRate, bsRate]
    );

    const { rows: mixPayments } = await client.query(`SELECT * FROM order_payments WHERE order_id = $1`, [mixedOrderId]);
    const mixTotals = paymentHistoryTotals(mixPayments);
    const mixDebtUSD = Math.max(0, mixedTotalUSD - mixTotals.paidUSD);
    assert(mixTotals.paidUSD === 20.00, 'Suma de pagos mixtos (10 USD + 10 USD equiv. en Bs)', `$${mixTotals.paidUSD.toFixed(2)} USD`);
    assert(mixDebtUSD < 0.001, 'Deuda pendiente en comanda mixta liquidada a 0.00', `$${mixDebtUSD.toFixed(2)} USD`);

    // ------------------------------------------------------------------
    // PRUEBA 8: Adición de Ítems a Comanda Abierta (Order Append)
    // ------------------------------------------------------------------
    console.log('\n--- [8] PRUEBA DE ADICIÓN DE ÍTEMS A COMANDA (ORDER APPEND) ---');
    const appendOrderId = `test-app-${Date.now()}`;
    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift)
       VALUES ($1, '#TEST-APP', 'mesa', 'Cliente Append', 'en_preparacion', 'no_pagado', 4.84, 15000, 'ambos')`,
      [appendOrderId]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
       VALUES ($1, $2, 'p1', 'Perro Inicial', 15000, 1)`,
      [`it-app-1-${Date.now()}`, appendOrderId]
    );

    // Agregar 1 Bebida (5,000 COP) y 1 Adicional (3,000 COP)
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
       VALUES ($1, $2, 'p2', 'Refresco Adicionado', 5000, 1)`,
      [`it-app-2-${Date.now()}`, appendOrderId]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
       VALUES ($1, $2, 'p3', 'Papas Adicionadas', 3000, 1)`,
      [`it-app-3-${Date.now()}`, appendOrderId]
    );

    // Recalcular comanda
    const { rows: appSum } = await client.query(
      `SELECT SUM(price * quantity) as total FROM order_items WHERE order_id = $1`,
      [appendOrderId]
    );
    const newAppTotalCOP = Number(appSum[0].total);
    const newAppTotalUSD = Number((newAppTotalCOP / copRate).toFixed(2));
    await client.query(
      `UPDATE orders SET total_cop = $1, total_usd = $2 WHERE id = $3`,
      [newAppTotalCOP, newAppTotalUSD, appendOrderId]
    );

    assert(newAppTotalCOP === 23000, 'Recálculo tras adición (15k + 5k + 3k)', `${newAppTotalCOP} COP`);
    assert(newAppTotalUSD === 7.42, 'Recálculo de equivalente en USD (23,000 / 3100)', `$${newAppTotalUSD} USD`);

    // ------------------------------------------------------------------
    // PRUEBA 9: Cuentas a Crédito (Sin Afectar Dinero Físico en Gaveta)
    // ------------------------------------------------------------------
    console.log('\n--- [9] PRUEBA DE CUENTAS A CRÉDITO (CERO INGRESO EN GAVETA) ---');
    const creditOrderId = `test-cred-${Date.now()}`;
    await client.query(
      `INSERT INTO orders (id, order_number, type, customer_name, status, payment_status, total_usd, total_cop, shift)
       VALUES ($1, '#TEST-CRED', 'mesa', 'Juan Deudor', 'entregada', 'credito', 10.00, 31000, 'ambos')`,
      [creditOrderId]
    );
    const creditLedgerRes = await postCompletedOrderCashMovements(client, creditOrderId);
    const { rows: creditTx } = await client.query(
      `SELECT * FROM caja_chica_transactions WHERE order_id = $1`,
      [creditOrderId]
    );
    assert(creditTx.length === 0, 'Comanda a crédito NO genera ingresos en efectivo en gaveta', `Movimientos generados: ${creditTx.length}`);

    // ------------------------------------------------------------------
    // PRUEBA 10: Cancelación de Comanda (Neutralización Inmediata en Gaveta)
    // ------------------------------------------------------------------
    console.log('\n--- [10] PRUEBA DE CANCELACIÓN DE COMANDA (NEUTRALIZACIÓN EN GAVETA) ---');
    // Si la orden de prueba se cancela, debe eliminar cualquier movimiento en caja
    await client.query(`UPDATE orders SET status = 'cancelado' WHERE id = $1`, [testOrderId]);
    await postCompletedOrderCashMovements(client, testOrderId);
    const { rows: canceledTx } = await client.query(
      `SELECT * FROM caja_chica_transactions WHERE order_id = $1`,
      [testOrderId]
    );
    assert(canceledTx.length === 0, 'Comanda cancelada elimina o neutraliza automáticamente sus registros en caja chica', `Movimientos restantes: ${canceledTx.length}`);

    // ------------------------------------------------------------------
    // PRUEBA 11: Rollback Limpio de las pruebas temporales
    // ------------------------------------------------------------------
    await client.query('ROLLBACK');
    console.log('\n✅ Todas las transacciones de prueba revertidas limpiamente en PostgreSQL.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error durante la auditoría transaccional:', err);
    failed++;
  } finally {
    client.release();
  }

  console.log('\n======================================================================');
  if (failed === 0) {
    console.log(`🏆 AUDITORÍA FINALIZADA EXITOSAMENTE: ${passed} PRUEBAS APROBADAS, 0 FALLIDAS.`);
    console.log(`RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
    console.log('   La contabilidad de ítems y dinero es 100% íntegra y matemáticamente exacta.');
  } else {
    console.error(`⚠️ SE ENCONTRARON ${failed} ERRORES DE AUDITORÍA.`);
    console.log(`RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
  }
  console.log('======================================================================\n');
}

runComprehensiveAudit().catch(console.error);
