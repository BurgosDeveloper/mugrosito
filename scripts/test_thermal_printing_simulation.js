/**
 * Thermal Printing Simulation & LAN Connectivity Test Suite
 * Tests ESC/POS ticket generation, LAN socket communication, error resilience,
 * kitchen filtering, salsa positioning, pre-cuenta formatting, and dual-printer fallback
 * WITHOUT requiring a physical printer.
 */
const net = require('net');
const {
  isKitchenItem,
  isSalsaItem,
  buildKitchenTicket,
  buildKitchenAdditionTicket,
  buildReceiptTicket,
  buildCrispysCierreTicket,
  sendRawTicket,
  sendRawTicketToTarget,
} = require('../server/helpers/thermalPrinter');

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

async function run() {
  console.log('======================================================================');
  console.log(' 🖨️ AUDITORÍA DEL FLUJO DE IMPRESIÓN TÉRMICA Y CONECTIVIDAD LAN');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // 1. SIMULACIÓN DE CONECTIVIDAD SOCKET TCP LAN (PUERTO 9199 LOCAL)
  // -------------------------------------------------------------------------
  console.log('>>> 1. PRUEBA DE CONECTIVIDAD LAN TCP (SOCKET ESC/POS)');
  let receivedBytes = Buffer.alloc(0);
  let serverDone;
  const serverFinished = new Promise(resolve => serverDone = resolve);
  const mockPrinterServer = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      receivedBytes = Buffer.concat([receivedBytes, chunk]);
    });
    socket.on('end', () => {
      if (serverDone) serverDone();
    });
  });

  await new Promise((resolve) => mockPrinterServer.listen(9199, '127.0.0.1', resolve));

  const testPayload = Buffer.from('\x1B@TEST_PRINT_LAN\x1DV\x00', 'ascii');
  const mockLanConfig = {
    enabled: true,
    connectionType: 'lan',
    host: '127.0.0.1',
    port: 9199,
    timeoutMs: 3000,
    copies: 1,
  };

  try {
    await sendRawTicket(testPayload, mockLanConfig);
    await Promise.race([serverFinished, new Promise(r => setTimeout(r, 100))]);
    assert(receivedBytes.length > 0, 'Socket LAN envió datos al puerto de impresora');
    assert(receivedBytes.includes('TEST_PRINT_LAN'), 'Contenido del ticket recibido intacto vía LAN TCP');
  } catch (err) {
    assert(false, `Fallo en socket LAN: ${err.message}`);
  } finally {
    await new Promise((resolve) => mockPrinterServer.close(resolve));
  }

  // -------------------------------------------------------------------------
  // 2. RESILIENCIA Y MANEJO DE ERRORES LAN (PUERTO CERRADO / DESCONEXIÓN)
  // -------------------------------------------------------------------------
  console.log('\n>>> 2. RESILIENCIA ANTE IMPRESORA LAN DESCONECTADA');
  const deadLanConfig = {
    enabled: true,
    connectionType: 'lan',
    host: '127.0.0.1',
    port: 9198, // puerto sin escucha
    timeoutMs: 1000,
    copies: 1,
  };

  let caughtError = null;
  try {
    await sendRawTicket(testPayload, deadLanConfig);
  } catch (err) {
    caughtError = err;
  }
  assert(caughtError !== null, 'Rechaza limpiamente cuando la impresora LAN no responde');
  assert(caughtError.code === 'ECONNREFUSED' || caughtError.message.includes('ECONNREFUSED'), 'Error devuelto es conexión rechazada estándar');

  // Verificar que sendRawTicketToTarget no explota ni tira la app
  const targetResult = await sendRawTicketToTarget(testPayload, 'cocina', 'cocina');
  assert(typeof targetResult === 'object', 'sendRawTicketToTarget retorna objeto de resultado sin excepciones fatales');
  assert(targetResult.printed === false, 'Indica que no se pudo imprimir si la impresora está apagada');

  // -------------------------------------------------------------------------
  // 3. CLASIFICACIÓN DE PRODUCTOS DE COCINA (isKitchenItem)
  // -------------------------------------------------------------------------
  console.log('\n>>> 3. CLASIFICACIÓN DE PRODUCTOS DE COCINA (isKitchenItem)');
  assert(isKitchenItem({ name: 'Hamburguesa Bistro', category: 'Hamburguesas' }) === true, 'Hamburguesa es ítem de cocina');
  assert(isKitchenItem({ name: 'Papas Fritas', category: 'Acompañantes' }) === true, 'Papas fritas son ítem de cocina');
  assert(isKitchenItem({ name: 'Refresco 350ml', category: 'Bebidas', drinkType: 'refresco' }) === false, 'Refresco comercial NO va a cocina');
  assert(isKitchenItem({ name: 'Agua Mineral', category: 'Bebidas', drinkType: 'agua' }) === false, 'Agua mineral NO va a cocina');
  assert(isKitchenItem({ name: 'Cerveza Polar', category: 'Bebidas', drinkType: 'cerveza' }) === false, 'Cerveza comercial NO va a cocina');
  assert(isKitchenItem({ name: 'Jugo Natural de Fresa', category: 'Bebidas', drinkType: 'jugo', sugarPreference: 'Con azúcar' }) === true, 'Jugo preparado SI va a cocina');
  assert(isKitchenItem({ name: 'Malteada de Chocolate', category: 'Bebidas', drinkType: 'malteada' }) === true, 'Malteada preparada SI va a cocina');

  // -------------------------------------------------------------------------
  // 4. GENERACIÓN DE TICKET DE COCINA (buildKitchenTicket)
  // -------------------------------------------------------------------------
  console.log('\n>>> 4. GENERACIÓN DE TICKET DE COCINA (buildKitchenTicket)');
  const kitchenOrder = {
    orderNumber: 42,
    type: 'mesa',
    tableNumber: 3,
    customerName: 'Carlos Perez',
    createdAt: new Date(),
    kitchenNotes: 'Bien cocida la carne',
    items: [
      {
        id: 'it-1',
        productName: 'Hamburguesa Bistro',
        quantity: 2,
        category: 'Hamburguesas',
        proteins: ['Pollo Crispy'], // cambió de res a pollo crispy
        removedIngredients: ['cebolla', 'tomate'],
        extras: [{ name: 'Tocineta', price: 3000 }],
        isCut: true,
      },
      {
        id: 'it-2',
        productName: 'Salsa BBQ',
        quantity: 1,
        category: 'Salsas',
      },
      {
        id: 'it-3',
        productName: 'Refresco 350ml',
        quantity: 2,
        category: 'Bebidas',
        drinkType: 'refresco',
      }
    ]
  };

  const ticketBuf = buildKitchenTicket(kitchenOrder, false);
  assert(ticketBuf !== null && Buffer.isBuffer(ticketBuf), 'Ticket de cocina generado como Buffer');
  const ticketStr = ticketBuf.toString('ascii');

  assert(ticketStr.includes('MUGROSITO'), 'Encabezado MUGROSITO presente');
  assert(ticketStr.includes('COMANDA: #42'), 'Número de comanda presente');
  assert(ticketStr.includes('MESA #3'), 'Mesa especificada');
  const normalizedTicket = ticketStr.replace(/\s+/g, ' ');
  assert(ticketStr.includes('CLIENTE: Carlos Perez'), 'Nombre de cliente presente');
  assert(ticketStr.includes('2x Hamburguesa Bistro'), 'Cantidad y nombre del producto presentes');
  assert(normalizedTicket.includes('PROTEINAS: Pollo Crispy'), 'Proteína cambiada especificada');
  assert(normalizedTicket.includes('SIN: CEBOLLA, TOMATE'), 'Ingredientes retirados en mayúsculas');
  assert(ticketStr.includes('ADD: Tocineta'), 'Adicional pago especificado');
  assert(ticketStr.includes('PICADA'), 'Indicación de corte presente');
  assert(ticketStr.includes('NOTA COCINA:'), 'Encabezado de nota presente');
  assert(ticketStr.includes('Bien cocida la carne'), 'Texto de nota presente');

  // Refresco comercial no debe aparecer en cocina
  assert(!ticketStr.includes('Refresco 350ml'), 'Refresco comercial excluido de ticket de cocina');

  // Regla estricta: Salsa SIEMPRE al final de la comanda de cocina
  assert(ticketStr.includes('1x Salsa BBQ'), 'Salsa presente en comanda de cocina');
  const bistroPos = ticketStr.indexOf('Hamburguesa Bistro');
  const salsaPos = ticketStr.indexOf('Salsa BBQ');
  assert(salsaPos > bistroPos, 'REGLA ESTRICTA: Salsa ubicada al final, después de las comidas');

  // Comanda SOLO con bebidas comerciales -> buildKitchenTicket debe ser NULL (cero gasto de papel)
  const drinksOnlyOrder = {
    orderNumber: 43,
    type: 'mesa',
    tableNumber: 1,
    items: [
      { id: 'it-d1', productName: 'Cerveza Polar', quantity: 3, category: 'Bebidas', drinkType: 'cerveza' },
      { id: 'it-d2', productName: 'Agua Mineral', quantity: 2, category: 'Bebidas', drinkType: 'agua' },
    ]
  };
  const drinksTicket = buildKitchenTicket(drinksOnlyOrder, false);
  assert(drinksTicket === null, 'Comanda con solo bebidas comerciales retorna null (no gasta papel térmico en cocina)');

  // -------------------------------------------------------------------------
  // 5. TICKET DE ADICIÓN A COCINA (buildKitchenAdditionTicket)
  // -------------------------------------------------------------------------
  console.log('\n>>> 5. TICKET DE ADICIÓN A COCINA (buildKitchenAdditionTicket)');
  const addedItemsList = [
    { id: 'it-add-1', productName: 'Hamburguesa Doble', quantity: 1, category: 'Hamburguesas', isTakeaway: true },
    { id: 'it-add-2', productName: 'Salsa Tártara', quantity: 1, category: 'Salsas' },
  ];
  const additionBuf = buildKitchenAdditionTicket(kitchenOrder, addedItemsList, false);
  assert(additionBuf !== null, 'Ticket de adición generado como Buffer');
  const additionStr = additionBuf.toString('ascii');
  assert(additionStr.includes('ADICION COCINA'), 'Encabezado ADICION COCINA presente');
  assert(additionStr.includes('1x Hamburguesa Doble'), 'Ítem adicionado presente');
  assert(additionStr.includes('SOLO PREPARAR ADICION'), 'Instrucción SOLO PREPARAR ADICION presente');
  const addBurgerPos = additionStr.indexOf('Hamburguesa Doble');
  const addSalsaPos = additionStr.indexOf('Salsa Tartara') !== -1 ? additionStr.indexOf('Salsa Tartara') : additionStr.indexOf('Salsa');
  assert(addSalsaPos > addBurgerPos, 'Salsa en adición ubicada después de la hamburguesa');

  // Adición solo con bebidas comerciales -> null
  const sodaAddition = [{ id: 'it-soda', productName: 'Refresco Lata', quantity: 1, category: 'Bebidas', drinkType: 'comercial' }];
  assert(buildKitchenAdditionTicket(kitchenOrder, sodaAddition, false) === null, 'Adición solo con bebida comercial retorna null (no gasta papel en cocina)');

  // -------------------------------------------------------------------------
  // 6. PRE-CUENTA Y CONSUMO DE CLIENTE (buildReceiptTicket)
  // -------------------------------------------------------------------------
  console.log('\n>>> 6. PRE-CUENTA Y CONSUMO EN 3 MONEDAS (buildReceiptTicket)');
  const receiptOrder = {
    orderNumber: 50,
    type: 'delivery',
    customerName: 'Maria Rodriguez',
    createdAt: new Date(),
    totalUSD: 11.29,
    totalCOP: 35000,
    deliveryFeeCOP: 2000,
    deliveryFeeUSD: 0.65,
    copRateAtPayment: 3100,
    bsRateAtPayment: 3.2,
    items: [
      { id: 'it-r1', productName: 'Hamburguesa Bistro', quantity: 2, price: 15000 },
      { id: 'it-r2', productName: 'Refresco 350ml', quantity: 1, price: 3000 },
      { id: 'it-r3', productName: 'Salsa BBQ', quantity: 1, price: 0, category: 'Salsas' },
    ]
  };

  const receiptBuf = buildReceiptTicket(receiptOrder, { COP: 3100, Bs: 3.2 });
  assert(receiptBuf !== null && Buffer.isBuffer(receiptBuf), 'Pre-cuenta generada como Buffer');
  const receiptStr = receiptBuf.toString('latin1');

  assert(receiptStr.includes('PRE-CUENTA / CONSUMO'), 'Título PRE-CUENTA / CONSUMO presente');
  assert(receiptStr.includes('COMANDA: #50'), 'Número de comanda presente');
  assert(receiptStr.includes('DELIVERY'), 'Tipo de servicio delivery presente');
  assert(receiptStr.includes('Maria Rodriguez'), 'Nombre del cliente en pre-cuenta');
  assert(receiptStr.includes('2x Hamburguesa Bistro'), 'Hamburguesa Bistro presente');
  assert(receiptStr.includes('30.000'), 'Subtotal de hamburguesas en COP (2 x 15.000 = 30.000)');
  assert(receiptStr.includes('1x Refresco 350ml'), 'Refresco presente en pre-cuenta');
  assert(receiptStr.includes('1x SERVICIO DELIVERY'), 'Servicio de delivery explicitado en pre-cuenta');
  assert(receiptStr.includes('2.000'), 'Tarifa de delivery en COP (2.000) presente');

  // REGLA ESTRICTA DE SALSAS: Exclusión absoluta de pre-cuenta
  assert(!receiptStr.includes('Salsa BBQ'), 'REGLA ESTRICTA: Salsas excluidas 100% de la pre-cuenta del cliente');

  // Totales en las 3 monedas
  assert(receiptStr.includes('TOTAL COP:'), 'TOTAL COP presente');
  assert(receiptStr.includes('35.000'), 'Total 35.000 COP reflejado');
  assert(receiptStr.includes('TOTAL USD:'), 'TOTAL USD presente');
  assert(receiptStr.includes('TOTAL Bs:'), 'TOTAL Bs presente');

  // Tipografía ampliada (+30% / Doble Alto + Doble Ancho)
  assert(receiptStr.includes('\x1D!\x11\x1BE\x01'), 'Comando ESC/POS de tipografía ampliada (+30%) presente');

  // -------------------------------------------------------------------------
  // 7. TICKET DE CIERRE / ARQUEO (buildCrispysCierreTicket)
  // -------------------------------------------------------------------------
  console.log('\n>>> 7. TICKET DE ARQUEO Y CIERRE DE TURNO (buildCrispysCierreTicket)');
  const cierreData = {
    shift: 'ambos',
    totalGeneralUSD: 150.00,
    totalGeneralCOP: 465000,
    fondoAperturaUSD: 20.00,
    fondoAperturaCOP: 50000,
    cajaEsperadaUSD: 170.00,
    cajaEsperadaCOP: 515000,
    cajaRealUSD: 170.00,
    cajaRealCOP: 515000,
    diferenciaUSD: 0.00,
    diferenciaCOP: 0,
    byMethod: [
      { method: 'Efectivo COP', amountUSD: 100.00 },
      { method: 'Efectivo USD', amountUSD: 50.00 },
    ],
    creditOrders: [
      { orderNumber: 1, customerName: 'Deudor Prueba', totalUSD: 15.00 }
    ],
    itemsSoldSummary: {
      comidas: [{ name: 'Hamburguesa Bistro', quantity: 10, subtotalUSD: 100.00 }],
      bebidas: [{ name: 'Refresco 350ml', quantity: 15, subtotalUSD: 30.00 }],
      adicionales: [{ name: 'ADD Tocineta', quantity: 5, subtotalUSD: 10.00 }],
      delivery: [{ name: 'Delivery ($2.00)', quantity: 5, subtotalUSD: 10.00 }],
    }
  };

  const cierreBuf = buildCrispysCierreTicket(cierreData);
  assert(cierreBuf !== null && Buffer.isBuffer(cierreBuf), 'Ticket de cierre generado como Buffer');
  const cierreStr = cierreBuf.toString('ascii');
  assert(cierreStr.includes('CIERRE'), 'Título de cierre presente');
  assert(cierreStr.includes('COP'), 'Desglose de Efectivo COP presente');
  assert(cierreStr.includes('USD'), 'Desglose de Efectivo USD presente');
  assert(cierreStr.includes('DEUDOR PRUEBA'), 'Créditos pendientes incluidos en reporte de cierre');

  console.log('\n======================================================================');
  console.log(` RESULTADOS IMPRESIÓN Y CONECTIVIDAD: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('ERROR EN SUITE DE IMPRESIÓN:', err);
  process.exit(1);
});
