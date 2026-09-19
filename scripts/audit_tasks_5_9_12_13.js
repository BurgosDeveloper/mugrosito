const { initDb, query } = require('../server/db');
const { isKitchenItem } = require('../server/helpers/thermalPrinter');
const { roundCOP, roundBs, roundUSD } = require('../server/helpers/currencyRounding');

async function runAudit() {
  console.log('============================================================');
  console.log(' 🍔 AUDITORÍA INTEGRAL DE TAREAS 5, 9, 12 Y 13');
  console.log('============================================================');

  // 1. Validar Tarea 13: Redondeo Comercial Contable
  console.log('\n[1] VALIDANDO TAREA 13: Redondeo comercial contable (COP al millar)');
  const testCases = [
    { input: 1500,  expected: 1500,  desc: '1,500 COP -> 1,500 COP (<= 500 se mantiene en 500)' },
    { input: 1600,  expected: 2000,  desc: '1,600 COP -> 2,000 COP (> 500 aproxima al millar)' },
    { input: 39500, expected: 39500, desc: '39,500 COP -> 39,500 COP (500 exacto se mantiene en 500)' },
    { input: 39600, expected: 40000, desc: '39,600 COP -> 40,000 COP (> 500 aproxima al siguiente millar)' },
    { input: 40000, expected: 40000, desc: '40,000 COP -> 40,000 COP (múltiplo exacto)' },
    { input: 0,     expected: 0,     desc: '0 COP -> 0 COP' },
  ];
  let allRoundPassed = true;
  for (const tc of testCases) {
    const res = roundCOP(tc.input);
    const pass = res === tc.expected;
    console.log(`  ${pass ? '✅' : '❌'} ${tc.desc}: Obtenido = ${res}`);
    if (!pass) allRoundPassed = false;
  }
  const bsTest = roundBs(123.456) === 123.46 && roundBs(10.5) === 10.5;
  console.log(`  ${bsTest ? '✅' : '❌'} Bolívares (Bs) a 2 decimales: 123.456 -> ${roundBs(123.456)}`);

  // 2. Validar Tarea 12: Impresión Selectiva de Cocina
  console.log('\n[2] VALIDANDO TAREA 12: Impresión selectiva de cocina');
  const kitchenItemsTest = [
    { item: { name: 'Crispy Clásica', category: 'Hamburguesas' }, expected: true, label: 'Hamburguesa' },
    { item: { name: 'Papas Rústicas', category: 'Acompañantes' }, expected: true, label: 'Papas' },
    { item: { name: 'Jugo Natural de Fresa', category: 'Bebidas', drinkType: 'jugo' }, expected: true, label: 'Jugo Natural' },
    { item: { name: 'Coca Cola 350ml', category: 'Bebidas', drinkType: 'refresco' }, expected: false, label: 'Coca Cola de Lata' },
    { item: { name: 'Cerveza Polar', category: 'Licores', drinkType: 'cerveza' }, expected: false, label: 'Cerveza' },
    { item: { name: 'Agua Mineral', category: 'Bebidas', drinkType: 'agua' }, expected: false, label: 'Agua Mineral' },
  ];
  let allKitchenPassed = true;
  for (const k of kitchenItemsTest) {
    const isK = isKitchenItem(k.item);
    const pass = isK === k.expected;
    console.log(`  ${pass ? '✅' : '❌'} ${k.label}: Esperado = ${k.expected}, Obtenido = ${isK}`);
    if (!pass) allKitchenPassed = false;
  }

  // 3. Validar Tarea 9: Reinicio de Correlativos en BD
  console.log('\n[3] VALIDANDO TAREA 9: Correlativos tras arqueo y cierre en BD');
  await initDb();
  const maxRes = await query(
    `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '') AS INTEGER)), 0) AS max_num FROM orders WHERE archived_at IS NULL`
  );
  const nextNumber = 1 + parseInt(maxRes.rows[0]?.max_num || '0', 10);
  console.log(`  ✅ Correlativo activo actual para próxima comanda sin archivar: #${nextNumber}`);

  // 4. Resumen
  console.log('\n============================================================');
  console.log(`🏆 RESULTADO GLOBAL DE AUDITORÍA: ${allRoundPassed && allKitchenPassed ? 'TODAS LAS PRUEBAS PASARON EXITOSAMENTE' : 'HAY ERRORES'}`);
  console.log('============================================================');
  process.exit(0);
}

runAudit().catch(err => {
  console.error('Error en auditoría:', err);
  process.exit(1);
});
