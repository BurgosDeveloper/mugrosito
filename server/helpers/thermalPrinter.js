const fs = require('fs');
const net = require('net');
const path = require('path');

const PRINTER_CONFIG_PATH = path.join(__dirname, '../config/thermal-printer.json');
const { roundCOP } = require('./currencyRounding');
// Font expansion in ESC/POS uses discrete sizes. Extra character spacing gives
// the 80 mm ticket approximately 40% more horizontal presence without relying
// on vendor-specific font modes.
const LINE_WIDTH = 28;
// Configuración ESC/POS con fuente 40% más grande y espaciado optimizado:
// - \x1B \x08: ESC SP 8 -> Aumenta el espaciado horizontal entre caracteres en 8 puntos (~40-50% más ancho y legible)
// - \x1B3\x2C: ESC 3 44 -> Altura de línea ampliada a 44 puntos (~40% más alto)
// - \x1BM\x00: ESC M 0 -> Fuente A estándar (12x24 puntos, máxima definición)
const PRINT_FORMAT_SETUP = '\x1B \x08\x1B3\x2C\x1BM\x00';
const PRINT_FORMAT_RESET = '\x1B \x00\x1B2';

const KITCHEN_LINE_WIDTH = 21;
// Configuración ESC/POS para COCINA y REPORTE CONTABLE (doble alto + doble ancho + negrita):
// - \x1B \x00: 0 espacio extra entre letras (texto continuo y natural)
// - \x1B3\x26: Interlineado compacto adecuado para fuente doble altura
// - \x1BM\x00: Fuente A estándar
// - \x1D!\x11: Doble alto + Doble ancho en TODO el ticket (tamaño gigante idéntico a COMANDA:#6)
// - \x1BE\x01: Negrita de alto contraste
const KITCHEN_FORMAT_SETUP = '\x1B \x00\x1B3\x26\x1BM\x00\x1D!\x11\x1BE\x01';

function loadDualPrinterConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(PRINTER_CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Aviso: no se pudo leer la configuración de impresoras: ${error.message}`);
    }
  }

  // Compatibilidad hacia atrás si el JSON no tiene las claves 'cocina' o 'caja'
  const cocinaRaw = fileConfig.cocina || {
    name: 'Impresora Cocina / KDS',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    connectionType: 'lan',
    paperWidth: '80mm',
    host: fileConfig.host || '192.168.1.200',
    port: Number(fileConfig.port || 9100),
    usbDeviceName: '',
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  const cajaRaw = fileConfig.caja || {
    name: 'Impresora Caja / Mostrador',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    connectionType: 'usb',
    paperWidth: '58mm',
    host: fileConfig.host || '192.168.1.201',
    port: Number(fileConfig.port || 9100),
    usbDeviceName: 'POS-58',
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  return {
    cocina: {
      name: cocinaRaw.name || 'Impresora Cocina / KDS',
      enabled: cocinaRaw.enabled === true,
      connectionType: cocinaRaw.connectionType === 'usb' ? 'usb' : 'lan',
      paperWidth: cocinaRaw.paperWidth === '58mm' ? '58mm' : '80mm',
      host: String(cocinaRaw.host || '').trim(),
      port: Number(cocinaRaw.port || 9100),
      usbDeviceName: String(cocinaRaw.usbDeviceName || '').trim(),
      timeoutMs: Number(cocinaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cocinaRaw.copies || 1)),
    },
    caja: {
      name: cajaRaw.name || 'Impresora Caja / Mostrador',
      enabled: cajaRaw.enabled === true,
      connectionType: cajaRaw.connectionType === 'lan' ? 'lan' : 'usb',
      paperWidth: cajaRaw.paperWidth === '80mm' ? '80mm' : '58mm',
      host: String(cajaRaw.host || '').trim(),
      port: Number(cajaRaw.port || 9100),
      usbDeviceName: String(cajaRaw.usbDeviceName !== undefined ? cajaRaw.usbDeviceName : 'POS-58').trim(),
      timeoutMs: Number(cajaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cajaRaw.copies || 1)),
    }
  };
}

function saveDualPrinterConfig(newConfig) {
  const current = loadDualPrinterConfig();
  const merged = {
    cocina: {
      ...current.cocina,
      ...(newConfig.cocina || {}),
      connectionType: newConfig.cocina?.connectionType === 'usb' ? 'usb' : 'lan',
      paperWidth: newConfig.cocina?.paperWidth === '58mm' ? '58mm' : '80mm',
      port: Number(newConfig.cocina?.port || current.cocina.port || 9100),
      usbDeviceName: String(newConfig.cocina?.usbDeviceName !== undefined ? newConfig.cocina.usbDeviceName : current.cocina.usbDeviceName || '').trim(),
      copies: Math.max(1, Number(newConfig.cocina?.copies || current.cocina.copies || 1)),
    },
    caja: {
      ...current.caja,
      ...(newConfig.caja || {}),
      connectionType: newConfig.caja?.connectionType === 'lan' ? 'lan' : 'usb',
      paperWidth: newConfig.caja?.paperWidth === '80mm' ? '80mm' : '58mm',
      port: Number(newConfig.caja?.port || current.caja.port || 9100),
      usbDeviceName: String(newConfig.caja?.usbDeviceName !== undefined ? newConfig.caja.usbDeviceName : current.caja.usbDeviceName || 'POS-58').trim(),
      copies: Math.max(1, Number(newConfig.caja?.copies || current.caja.copies || 1)),
    }
  };
  fs.writeFileSync(PRINTER_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function loadPrinterConfig(target = 'caja') {
  const dual = loadDualPrinterConfig();
  return dual[target] || dual.caja;
}

function printableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E€]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(value, width = LINE_WIDTH, indent = '') {
  const words = printableText(value).split(' ').filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = indent;
  for (const word of words) {
    if (current.trim() && (current.length + 1 + word.length) > width) {
      lines.push(current);
      current = indent;
    }

    if (current.trim()) {
      current += ` ${word}`;
    } else {
      let remaining = word;
      const availableWidth = Math.max(1, width - indent.length);
      while (remaining.length > availableWidth) {
        lines.push(`${indent}${remaining.slice(0, availableWidth)}`);
        remaining = remaining.slice(availableWidth);
      }
      current = `${indent}${remaining}`;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function divider(character = '-', width = LINE_WIDTH) {
  return character.repeat(width);
}

function centered(value, width = LINE_WIDTH) {
  const text = printableText(value).slice(0, width);
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(padding)}${text}`;
}

function formatTwoColumns(left, right, width = LINE_WIDTH) {
  const l = printableText(left);
  const r = printableText(right);
  const maxLeft = Math.max(1, width - r.length - 1);
  const truncatedLeft = l.length > maxLeft ? l.substring(0, maxLeft) : l;
  const spaces = Math.max(1, width - truncatedLeft.length - r.length);
  return `${truncatedLeft}${' '.repeat(spaces)}${r}`;
}

function formatThreeColumns(col1, col2, col3, width = LINE_WIDTH) {
  const c1 = printableText(col1);
  const c2 = printableText(col2);
  const c3 = printableText(col3);
  const rightPart = `${c2.padStart(4, ' ')} ${c3.padStart(8, ' ')}`;
  const maxLeft = Math.max(1, width - rightPart.length - 1);
  const truncatedLeft = c1.length > maxLeft ? c1.substring(0, maxLeft) : c1;
  const spaces = Math.max(1, width - truncatedLeft.length - rightPart.length);
  return `${truncatedLeft}${' '.repeat(spaces)}${rightPart}`;
}

function isKitchenItem(item) {
  if (!item) return false;

  const category = String(item.category || '').trim().toLowerCase();
  const drinkType = String(item.drinkType || item.drink_type || '').trim().toLowerCase();
  const rawName = String(item.productName || item.product_name || item.name || '').trim();
  const name = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nameClean = name.replace(/[^a-z0-9]/g, '');

  // 1. Detección de jugos naturales y merengadas/malteadas/batidos preparados
  const isJuiceOrShake = (
    drinkType === 'jugo' ||
    drinkType === 'merengada' ||
    drinkType === 'malteada' ||
    drinkType === 'batido' ||
    Boolean(item.sugarPreference || item.sugar_preference) ||
    name.includes('jugo') ||
    name.includes('merengada') ||
    name.includes('malteada') ||
    name.includes('batido')
  );

  // 2. REGLA ESTRICTA DE BEBIDAS:
  // Si pertenece a la categoría de Bebidas / Licores / Refrescos, la ÚNICA bebida que va a cocina es jugo/merengada/malteada.
  if (
    category === 'bebidas' ||
    category === 'bebida' ||
    category === 'licores' ||
    category === 'licor' ||
    category === 'cervezas' ||
    category === 'cerveza' ||
    category === 'gaseosas' ||
    category === 'refrescos' ||
    category === 'bebidas comerciales' ||
    category === 'bebida comercial'
  ) {
    return isJuiceOrShake;
  }

  // 3. Si tiene tipo de bebida explícito comercial o embotellado (refresco, licor, etc.)
  if (['refresco', 'gaseosa', 'licor', 'cerveza', 'comercial', 'soda', 'agua', 'te'].includes(drinkType)) {
    return false;
  }

  // 4. Todos los demás ítems (Pizzas, Platos, Entradas, Pastas, Especialidades, Postres, etc.) SI van a cocina
  return true;
}

function isSalsaItem(item) {
  if (!item) return false;
  const category = String(item.category || '').trim().toLowerCase();
  const name = String(item.productName || item.name || '').trim().toLowerCase();
  return (
    category === 'salsas' ||
    category === 'salsa' ||
    name.startsWith('salsa ') ||
    name.includes('salsa de') ||
    name.includes('salsa tártara') ||
    name.includes('salsa tartara') ||
    name.includes('salsa bbq')
  );
}

function normalizeProteinName(name = '') {
  const n = String(name || '').trim().toLowerCase();
  if (n.includes('mechada') || n.includes('street')) return 'carne mechada';
  if (n.includes('smash')) return 'smash';
  if (n.includes('chuleta') || n.includes('pork') || n.includes('cerdo')) return 'chuleta de cerdo ahumada';
  if (n.includes('plancha') || n.includes('grill') || n.includes('pechuga')) return 'pechuga de pollo a la plancha';
  if (n.includes('crispy') || (n.includes('pollo') && !n.includes('plancha'))) return 'pollo crispy';
  if (n.includes('novillo') || n.includes('carne') || n.includes('res')) return 'carne de novillo';
  return n;
}

function getCleanItemNote(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') return '';
  const cleaned = rawNotes
    .replace(/\[#\d+\]/g, '')
    .replace(/^[*•-]\s*/g, '')
    .replace(/^(nota|notas):?\s*/gi, '')
    .trim();
  const lower = cleaned.toLowerCase();
  if (
    !cleaned ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'sin notas' ||
    lower === 'sin nota' ||
    lower === 'nota' ||
    lower === 'notas' ||
    lower === 'ninguna' ||
    lower === '-' ||
    lower === '.'
  ) {
    return '';
  }
  return cleaned;
}

function areProteinsDefault(burgerName, proteins, defaultProteins) {
  if (!proteins || !Array.isArray(proteins) || proteins.length === 0) return true;
  const nameLower = String(burgerName || '').toLowerCase().trim();
  if (nameLower.includes('papas') || nameLower.includes('nugget')) return true;

  if (defaultProteins && Array.isArray(defaultProteins) && defaultProteins.length > 0) {
    const pSorted = [...proteins].map((p) => String(p).trim().toUpperCase()).sort();
    const dSorted = [...defaultProteins].map((d) => String(d).trim().toUpperCase()).sort();
    if (pSorted.length === dSorted.length && pSorted.every((val, idx) => val === dSorted[idx])) {
      return true;
    }
    const pNorm = [...proteins].map(normalizeProteinName).sort();
    const dNorm = [...defaultProteins].map(normalizeProteinName).sort();
    if (pNorm.length === dNorm.length && pNorm.every((val, idx) => val === dNorm[idx])) {
      return true;
    }
    return false;
  }

  const pSorted = [...proteins].map(normalizeProteinName).sort();

  // 1. Super Smash o Tasty: ambas o única proteína son smash
  if (nameLower.includes('super smash') || nameLower.includes('tasty') || nameLower.includes('smash')) {
    return pSorted.length > 0 && pSorted.every((p) => p === 'smash');
  }

  // 2. 3.0 / Triple: 3 proteínas (carne novillo + pollo crispy + chuleta ahumada)
  if (nameLower.includes('3.0') || nameLower.includes('triple')) {
    const expected = ['carne de novillo', 'chuleta de cerdo ahumada', 'pollo crispy'];
    return pSorted.length === 3 && pSorted.every((p, i) => p === expected[i]);
  }

  // 3. Mixtura: 2 proteínas (carne novillo + pollo crispy)
  if (nameLower.includes('mixtura')) {
    const expected = ['carne de novillo', 'pollo crispy'];
    return pSorted.length === 2 && pSorted.every((p, i) => p === expected[i]);
  }

  // 4. House: 2 proteínas (pollo crispy + chuleta ahumada)
  if (nameLower.includes('house')) {
    const expected = ['chuleta de cerdo ahumada', 'pollo crispy'];
    return pSorted.length === 2 && pSorted.every((p, i) => p === expected[i]);
  }

  // 5. Doble (2 carnes de novillo)
  if (nameLower.includes('doble')) {
    return pSorted.length === 2 && pSorted.every((p) => p === 'carne de novillo');
  }

  // 6. Hamburguesas individuales de 1 carne
  if (nameLower.includes('mr pork') || nameLower.includes('pork')) {
    return pSorted.length === 1 && pSorted[0] === 'chuleta de cerdo ahumada';
  }
  if (nameLower.includes('street')) {
    return pSorted.length === 1 && pSorted[0] === 'carne mechada';
  }
  if (nameLower.includes('chicken grill') || nameLower.includes('grill')) {
    return pSorted.length === 1 && pSorted[0] === 'pechuga de pollo a la plancha';
  }
  if (nameLower.includes('crispy') || nameLower.includes('crispys')) {
    return pSorted.length === 1 && pSorted[0] === 'pollo crispy';
  }
  if (nameLower.includes('bistro')) {
    return pSorted.length === 1 && pSorted[0] === 'carne de novillo';
  }

  // Default general: 1 carne de novillo
  return pSorted.length === 1 && pSorted[0] === 'carne de novillo';
}

function abbreviateFreeTopping(name = '') {
  const n = String(name).trim().toLowerCase();
  if (n.includes('jalape')) return 'JAL';
  if (n.includes('cebolla')) return 'CC';
  if (n.includes('relish')) return 'SR';
  if (n.includes('pepinillo')) return 'PEP';
  if (n.includes('maiz') || n.includes('maíz')) return 'MAIZ';
  return null;
}

function formatKitchenTime(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = hours < 10 ? `0${hours}` : `${hours}`;
  const strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${strHours}:${strMinutes} ${ampm}`;
}

function orderHasSalonItem(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.some((it) => {
    const isTk = !!(it.isTakeaway || it.is_takeaway);
    const isDel = !!(it.isDelivery || it.is_delivery);
    return !isTk && !isDel;
  });
}

function itemDetails(item, order = {}) {
  const details = [];
  const orderType = (order.type || '').toLowerCase();

  // 1. Para llevar / Delivery en ítems:
  if (orderType === 'delivery') {
    // Cuando el pedido es delivery, NUNCA se coloca 'para delivery' ni 'para llevar' en ningún ítem
  } else if (orderType === 'pickup') {
    // Para pickup: solo distinguir cuando haya al menos un ítem para comer en el lugar/salón
    const hasSalon = orderHasSalonItem(order);
    const isItemSalon = !(item.isTakeaway || item.is_takeaway) && !(item.isDelivery || item.is_delivery);
    if (hasSalon && !isItemSalon) {
      details.push('LLEVAR');
    }
  } else {
    // Mesa u otros servicios:
    if (item.isDelivery || item.is_delivery) {
      details.push('DELIVERY');
    } else if (item.isTakeaway || item.is_takeaway) {
      details.push('LLEVAR');
    }
  }

  // 2. Picada: Solo si está marcada como picada (sin ENTERA)
  const isCut = !!(item.isCut || item.is_cut || item.cutPreference === 'Picada' || item.cut_preference === 'Picada');
  if (isCut) {
    details.push('🔪 PICADA');
  }

  // 3. Proteínas: Solo si cambiaron respecto a la receta original
  const prodName = item.productName || item.product_name || item.name || '';
  if (item.proteins && Array.isArray(item.proteins) && item.proteins.length > 0) {
    if (!areProteinsDefault(prodName, item.proteins, item.defaultProteins || item.default_proteins)) {
      details.push(`PROTEINAS: ${[...item.proteins].sort().join(' + ')}`);
    }
  }

  // 3b. Sabor / Subtipo de bebida:
  const flavor = item.flavor;
  if (flavor && !prodName.toUpperCase().includes(String(flavor).toUpperCase())) {
    details.push(`SABOR: ${String(flavor).toUpperCase()}`);
  }

  // 4. Ingredientes removidos (SIN)
  const removed = item.removedIngredients || item.removed_ingredients;
  if (Array.isArray(removed) && removed.length > 0) {
    const hasLechuga = removed.some((r) => /lechuga/i.test(r));
    const hasTomate = removed.some((r) => /tomate/i.test(r));
    const hasCebolla = removed.some((r) => /cebolla/i.test(r));
    let displayRemoved;
    if (hasLechuga && hasTomate && hasCebolla) {
      const others = removed.filter((r) => !/lechuga|tomate|cebolla/i.test(r));
      displayRemoved = ['VEGETALES', ...others.map((o) => o.toUpperCase())];
    } else {
      displayRemoved = removed.map((r) => r.toUpperCase());
    }
    details.push(`SIN: ${displayRemoved.sort().join(', ')}`);
  }

  // 5. Toppings gratis abreviados y adicionales pagos con ADD:
  const freeToppings = [];
  const paidExtras = [];

  let rawExtras = [];
  if (Array.isArray(item.extras)) rawExtras = item.extras;
  else if (item.extrasJson && Array.isArray(item.extrasJson)) rawExtras = item.extrasJson;
  else if (item.extras_json) {
    try {
      rawExtras = typeof item.extras_json === 'string' ? JSON.parse(item.extras_json) : item.extras_json;
    } catch (e) {}
  }

  for (const ext of rawExtras) {
    const extName = typeof ext === 'string' ? ext : (ext.name || '');
    const extPrice = typeof ext === 'object' ? Number(ext.price) || 0 : 0;
    const extQty = typeof ext === 'object' ? (Number(ext.quantity) || 1) : 1;
    if (extPrice === 0 && extName) {
      const abbrev = abbreviateFreeTopping(extName);
      const tag = abbrev || extName.replace(/\s*\(GRATIS\)\s*/gi, '').trim().toUpperCase();
      if (!freeToppings.includes(tag)) freeToppings.push(tag);
    } else if (extName) {
      const cleanName = extName.replace(/^\d+x\s*/i, '').trim();
      const label = extQty > 1 ? `${extQty}x ${cleanName}` : cleanName;
      paidExtras.push(label);
    }
  }

  if (freeToppings.length > 0) {
    details.push(freeToppings.sort().join(', '));
  }
  paidExtras.sort();
  for (const paid of paidExtras) {
    details.push(`ADD: ${paid}`);
  }

  // 6. Bebidas / Azúcar
  const sugar = item.sugarPreference || item.sugar_preference;
  if (sugar) {
    details.push(`Azucar: ${sugar}`);
  }

  // 7. Notas del ítem: ÚNICAMENTE si el usuario escribió una nota real (sin tags artificiales [#1] ni textos vacíos)
  const cleanNote = getCleanItemNote(item.notes);
  if (cleanNote) {
    details.push(`NOTA: ${cleanNote}`);
  }

  return details;
}

function reportPaymentCurrency(method) {
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(method)) return 'COP';
  if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(method)) return 'Bs';
  return 'USD';
}

function reportAmounts(payment) {
  let usd = Number(payment.cashTenderedUSD) || 0;
  let cop = Number(payment.cashTenderedCOP) || 0;
  let bs = Number(payment.cashTenderedBs) || 0;
  const paidUSD = Number(payment.amountPaidUSD) || 0;
  if (usd === 0 && cop === 0 && bs === 0 && paidUSD > 0) {
    const cRate = Number(payment.copRate) || 3100;
    const bRate = Number(payment.bsRate) || 3.2;
    if (['Efectivo COP', 'Bancolombia', 'Nequi'].includes(payment.paymentMethod)) cop = paidUSD * cRate;
    else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) bs = bRate > 0 ? (paidUSD * cRate) / bRate : 0;
    else usd = paidUSD;
  }
  return { usd, cop, bs };
}

function reportSaleAmounts(payment) {
  const paidUSD = Number(payment.amountPaidUSD) || 0;
  const tenderUSD = Number(payment.cashTenderedUSD) || 0;
  const tenderCOP = Number(payment.cashTenderedCOP) || 0;
  const tenderBs = Number(payment.cashTenderedBs) || 0;
  const changeUSD = Number(payment.changeGivenUSD) || 0;
  const changeCOP = Number(payment.changeGivenCOP) || 0;
  const changeBs = Number(payment.changeGivenBs) || 0;

  const cRate = Number(payment.copRate) || 3100;
  const bRate = Number(payment.bsRate) || 3.2;

  let usd = 0;
  let cop = 0;
  let bs = 0;
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(payment.paymentMethod)) {
    cop = tenderCOP > 0 ? (tenderCOP - changeCOP) : (paidUSD * cRate);
  } else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) {
    bs = tenderBs > 0 ? (tenderBs - changeBs) : (bRate > 0 ? (paidUSD * cRate) / bRate : 0);
  } else {
    usd = tenderUSD > 0 ? (tenderUSD - changeUSD) : paidUSD;
  }
  return { usd, cop, bs, equivalentUSD: paidUSD };
}

function monetaryLines(amounts, prefix = '') {
  const lines = [];
  if (amounts.usd > 0) lines.push(`${prefix}$${amounts.usd.toFixed(2)} USD`);
  if (amounts.cop > 0) lines.push(`${prefix}${Math.round(amounts.cop).toLocaleString('en-US')} COP`);
  if (amounts.bs > 0) lines.push(`${prefix}${amounts.bs.toFixed(2)} Bs`);
  return lines;
}

function reportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printableText(value) : date.toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function reportTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printableText(value) : date.toLocaleString('es-VE', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function reportService(order) {
  if (order.type === 'mesa') return `MESA #${order.tableNumber || '?'}`;
  if (order.type === 'delivery') return 'DELIVERY';
  if (order.type === 'pickup') return 'PICKUP';
  return printableText(order.type || 'SIN TIPO');
}

function addSection(lines, title, width = LINE_WIDTH) {
  lines.push('', divider('-', width), '\x1BE\x01', ...wrapText(title, width), '\x1BE\x00');
}

function addAmountLines(lines, amounts, prefix = '  ', includeZeroAmounts = false) {
  const values = includeZeroAmounts
    ? [
      `${prefix}$${(Number(amounts.usd) || 0).toFixed(2)} USD`,
      `${prefix}${Math.round(Number(amounts.cop) || 0).toLocaleString('en-US')} COP`,
      `${prefix}${(Number(amounts.bs) || 0).toFixed(2)} Bs`,
    ]
    : monetaryLines(amounts, prefix);
  lines.push(...(values.length > 0 ? values : [`${prefix}SIN MONTO REGISTRADO`]));
}

function paymentChangeAmounts(payment) {
  return {
    usd: Number(payment.changeGivenUSD) || 0,
    cop: Number(payment.changeGivenCOP) || 0,
    bs: Number(payment.changeGivenBs) || 0,
  };
}

function addReportHeader(lines, title, data, width = LINE_WIDTH, formatSetup = PRINT_FORMAT_SETUP) {
  lines.push(
    '\x1B@',
    formatSetup,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('MUGROSITO', width),
    centered(title, width),
    '\x1BE\x00',
    `EMITIDO: ${reportTimestamp(new Date().toISOString())}`,
    '\x1Ba\x00',
    divider('=', width),
  );
  lines.push(...wrapText(`DESDE: ${reportTimestamp(data?.dateRange?.from)}`, width));
  lines.push(...wrapText(`HASTA: ${reportTimestamp(data?.dateRange?.to)}`, width));
  lines.push(...wrapText(`TASAS: 1 USD = ${Number(data?.exchangeRates?.COP) || 3100} COP | 1 Bs = ${Number(data?.exchangeRates?.Bs) || 3.2} COP`, width));
}

function getReportBaseProductName(item = {}) {
  let name = (item.productName || item.name || 'Item').trim();
  name = name.replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '').trim();
  if (item.flavor) {
    const escaped = String(item.flavor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    name = name.replace(new RegExp(`\\s*\\(${escaped}\\)\\s*$`, 'i'), '').trim();
  }
  const cat = (item.category || '').toLowerCase();
  const isDrink = cat.includes('bebida') || cat.includes('drink') || cat.includes('refresco') || cat.includes('jugo') || cat.includes('licor') || cat.includes('cerveza') || cat.includes('agua') || !!item.drinkType || !!item.flavor;
  if (isDrink) {
    name = name.replace(/\s*\([^)]+\)\s*$/g, '').trim();
  }
  return name || (item.productName || item.name || 'Item').trim();
}

function buildReportTicket(reportType, data) {
  if (reportType === 'contable') {
    return buildCrispysCierreTicket(data);
  }

  const titles = {
    contable: 'REPORTE CONTABLE',
    pizzas: 'HAMBURGUESAS E ÍTEMS VENDIDOS',
    hamburguesas: 'HAMBURGUESAS E ÍTEMS VENDIDOS',
    hotdogs: 'HAMBURGUESAS E ÍTEMS VENDIDOS',
    ingresos: 'INGRESOS Y COBROS',
    egresos: 'VUELTOS Y EGRESOS',
    cocina: 'REPORTE DE COCINA',
  };
  const title = titles[reportType];
  if (!title) throw new Error('Tipo de reporte térmico no válido.');

  const isContable = reportType === 'contable';
  const reportWidth = isContable ? KITCHEN_LINE_WIDTH : LINE_WIDTH;
  const formatSetup = isContable ? KITCHEN_FORMAT_SETUP : PRINT_FORMAT_SETUP;

  const lines = [];
  addReportHeader(lines, title, data, reportWidth, formatSetup);

  if (reportType === 'pizzas' || reportType === 'hamburguesas' || reportType === 'hotdogs') {
    const grouped = new Map();

    // 1. Productos y Adicionales
    for (const item of data.items || []) {
      const ordCopRate = Number(item.copRate) || Number(data.exchangeRates?.COP) || 3100;
      const catLower = (item.category || '').toLowerCase();
      const isComida = catLower.includes('burger') || catLower.includes('hamburguesa') || catLower.includes('hot dog') || catLower.includes('perro') || catLower.includes('mugrosito') || (item.productName || '').toLowerCase().includes('burger') || (item.productName || '').toLowerCase().includes('hot dog') || (item.productName || '').toLowerCase().includes('perro') || (item.productName || '').toLowerCase().includes('mugrosito');
      const fullName = getReportBaseProductName(item);
      const itQty = Number(item.quantity) || 1;

      // Extraer adicionales pagos
      const extrasList = [];
      if (Array.isArray(item.extras)) extrasList.push(...item.extras);
      else if (item.extrasJson && Array.isArray(item.extrasJson)) extrasList.push(...item.extrasJson);
      else if (typeof item.extrasJson === 'string') {
        try {
          const parsed = JSON.parse(item.extrasJson);
          if (Array.isArray(parsed)) extrasList.push(...parsed);
        } catch (e) {}
      }

      let paidExtrasUnitCostUSD = 0;
      let paidExtrasUnitCostCOP = 0;
      for (const extra of extrasList) {
        const rawExtraPrice = Number(extra.price) || 0;
        const extraName = (extra.name || 'Adicional').trim();
        if (rawExtraPrice > 0) {
          let extraUSD = Number(extra.priceUSD);
          let extraCOP = Number(extra.priceCOP);
          if (isNaN(extraUSD) || isNaN(extraCOP) || extraUSD === 0) {
            if (rawExtraPrice >= 100) {
              extraCOP = rawExtraPrice;
              extraUSD = ordCopRate > 0 ? rawExtraPrice / ordCopRate : 0;
            } else {
              extraUSD = rawExtraPrice;
              extraCOP = rawExtraPrice * ordCopRate;
            }
          }
          paidExtrasUnitCostUSD += extraUSD;
          paidExtrasUnitCostCOP += extraCOP;
          const extraKey = `Adicionales|ADD ${extraName}`;
          const currentExtra = grouped.get(extraKey) || { category: 'Adicionales', name: `ADD ${extraName}`, quantity: 0, totalUSD: 0, totalCOP: 0 };
          currentExtra.quantity += itQty;
          currentExtra.totalUSD += extraUSD * itQty;
          currentExtra.totalCOP += extraCOP * itQty;
          grouped.set(extraKey, currentExtra);
        }
      }

      const rawPrice = Number(item.price) || 0;
      let itPriceUSD = Number(item.priceUSD);
      let itPriceCOP = Number(item.priceCOP);
      if (isNaN(itPriceUSD) || isNaN(itPriceCOP) || itPriceUSD === 0) {
        if (rawPrice >= 100) {
          itPriceCOP = rawPrice;
          itPriceUSD = ordCopRate > 0 ? rawPrice / ordCopRate : 0;
        } else {
          itPriceUSD = rawPrice;
          itPriceCOP = rawPrice * ordCopRate;
        }
      }

      const baseUnitPriceUSD = Math.max(0, itPriceUSD - paidExtrasUnitCostUSD);
      const baseUnitPriceCOP = Math.max(0, itPriceCOP - paidExtrasUnitCostCOP);
      const category = isComida ? 'Hot Dogs' : (item.category || 'Sin categoria');
      const key = `${category}|${fullName}`;
      const current = grouped.get(key) || { category, name: fullName, quantity: 0, totalUSD: 0, totalCOP: 0 };
      current.quantity += itQty;
      current.totalUSD += baseUnitPriceUSD * itQty;
      current.totalCOP += baseUnitPriceCOP * itQty;
      grouped.set(key, current);
    }

    // 2. Servicios de Delivery Facturados
    for (const ord of (data.orders || [])) {
      const ordCopRate = Number(ord.copRateAtPayment) || Number(data.exchangeRates?.COP) || 3100;
      let feeUSD = Number(ord.deliveryFeeUSD || ord.delivery_fee_usd || 0);
      let feeCOP = Number(ord.deliveryFeeCOP || ord.delivery_fee_cop || 0);
      if (feeCOP === 0 && feeUSD > 0) {
        if (feeUSD >= 100) {
          feeCOP = feeUSD;
          feeUSD = ordCopRate > 0 ? feeUSD / ordCopRate : 0;
        } else {
          feeCOP = feeUSD * ordCopRate;
        }
      } else if (feeUSD === 0 && feeCOP > 0) {
        feeUSD = ordCopRate > 0 ? feeCOP / ordCopRate : 0;
      } else if (feeUSD >= 100 && feeCOP > 0) {
        feeUSD = ordCopRate > 0 ? feeCOP / ordCopRate : 0;
      }

      if (feeUSD > 0 || feeCOP > 0 || ord.type === 'delivery') {
        const fullName = feeCOP > 0 ? `Servicio Delivery (${roundCOP(feeCOP).toLocaleString('es-CO')} COP)` : 'Servicio Delivery';
        const category = 'Delivery';
        const key = `${category}|${fullName}`;
        const current = grouped.get(key) || { category, name: fullName, quantity: 0, totalUSD: 0, totalCOP: 0 };
        current.quantity += 1;
        current.totalUSD += feeUSD;
        current.totalCOP += feeCOP;
        grouped.set(key, current);
      }
    }
    const items = [...grouped.values()].sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
    const totalUnits = items.reduce((total, item) => total + item.quantity, 0);
    const totalUSD = items.reduce((total, item) => total + item.totalUSD, 0);
    const totalCOP = items.reduce((total, item) => total + (item.totalCOP || 0), 0);
    addSection(lines, 'DETALLE DE ITEMS FACTURADOS');
    if (items.length === 0) {
      lines.push('SIN COMIDAS, BEBIDAS O ADICIONALES');
    } else {
      let category = '';
      for (const item of items) {
        if (item.category !== category) {
          category = item.category;
          lines.push('', ...wrapText(`CATEGORIA: ${category}`));
        }
        lines.push(...wrapText(`${item.quantity}x ${item.name}`, LINE_WIDTH, '  '));
        lines.push(`  SUBTOTAL: $${item.totalUSD.toFixed(2)} USD / ${Math.round(item.totalCOP || 0).toLocaleString('es-CO')} COP`);
      }
    }
    addSection(lines, 'RESUMEN DE VENTAS');
    const rates = data.exchangeRates || {};
    lines.push(`PRODUCTOS DIFERENTES: ${items.length}`, `UNIDADES FACTURADAS: ${totalUnits}`, 'TOTAL PRODUCTOS:');
    const copVal = totalCOP > 0 ? totalCOP : totalUSD * (Number(rates.COP) || 3100);
    const bsR = Number(rates.Bs) || 3.2;
    addAmountLines(lines, {
      usd: totalUSD,
      cop: copVal,
      bs: bsR > 0 ? copVal / bsR : 0,
    }, '  ', true);
  } else if (reportType === 'ingresos') {
    const totals = { usd: 0, cop: 0, bs: 0 };
    const changes = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();
    addSection(lines, 'COBROS REGISTRADOS');
    if ((data.payments || []).length === 0) lines.push('SIN COBROS EN EL INTERVALO');
    for (const payment of data.payments || []) {
      const received = reportAmounts(payment);
      const change = paymentChangeAmounts(payment);
      totals.usd += received.usd; totals.cop += received.cop; totals.bs += received.bs;
      changes.usd += change.usd; changes.cop += change.cop; changes.bs += change.bs;
      const methodTotal = byMethod.get(payment.paymentMethod) || { count: 0, usd: 0, cop: 0, bs: 0 };
      methodTotal.count += 1; methodTotal.usd += received.usd; methodTotal.cop += received.cop; methodTotal.bs += received.bs;
      byMethod.set(payment.paymentMethod, methodTotal);
      lines.push('', ...wrapText(`${reportDate(payment.createdAt)} | #${payment.orderNumber || '?'}`));
      lines.push(...wrapText(`METODO: ${payment.paymentMethod || 'SIN METODO'}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`PAGADOR: ${payment.payerName || 'CLIENTE GENERAL'}`, LINE_WIDTH, '  '));
      lines.push('  RECIBIDO:');
      addAmountLines(lines, received, '    ');
      if (change.usd > 0 || change.cop > 0 || change.bs > 0) {
        lines.push('  VUELTO ENTREGADO:');
        addAmountLines(lines, change, '    ');
      }
    }
    addSection(lines, 'RESUMEN DE INGRESOS');
    lines.push(`MOVIMIENTOS: ${(data.payments || []).length}`, 'TOTAL RECIBIDO:');
    addAmountLines(lines, totals, '  ', true);
    lines.push('TOTAL VUELTOS:');
    addAmountLines(lines, changes, '  ', true);
    addSection(lines, 'TOTALES POR METODO');
    for (const [method, amounts] of byMethod) {
      lines.push('', ...wrapText(`${method} (${amounts.count})`));
      addAmountLines(lines, amounts, '  ');
    }
  } else if (reportType === 'egresos') {
    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');
    const totals = { usd: 0, cop: 0, bs: 0 };
    addSection(lines, 'MOVIMIENTOS DE SALIDA');
    if (expenses.length === 0) lines.push('SIN VUELTOS O EGRESOS EN EL INTERVALO');
    for (const transaction of expenses) {
      const amounts = { usd: Number(transaction.amountUSD) || 0, cop: Number(transaction.amountCOP) || 0, bs: Number(transaction.amountBs) || 0 };
      totals.usd += amounts.usd; totals.cop += amounts.cop; totals.bs += amounts.bs;
      lines.push('', ...wrapText(`${reportDate(transaction.timestamp)} | ${transaction.orderNumber ? `#${transaction.orderNumber}` : 'SIN COMANDA'}`));
      lines.push(...wrapText(`METODO: ${transaction.paymentMethod || 'EGRESO'}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`CONCEPTO: ${transaction.description || 'SIN DESCRIPCION'}`, LINE_WIDTH, '  '));
      lines.push('  ENTREGADO:');
      addAmountLines(lines, amounts, '    ');
    }
    addSection(lines, 'RESUMEN DE EGRESOS');
    lines.push(`MOVIMIENTOS DE SALIDA: ${expenses.length}`, 'TOTAL ENTREGADO:');
    addAmountLines(lines, totals, '  ', true);
  } else if (reportType === 'cocina') {
    const itemsByOrder = new Map();
    for (const item of data.items || []) {
      itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) || []), item]);
    }
    addSection(lines, 'COMANDAS DEL INTERVALO');
    if ((data.orders || []).length === 0) lines.push('SIN COMANDAS COBRADAS EN EL INTERVALO');
    for (const order of data.orders || []) {
      const orderItems = itemsByOrder.get(order.id) || [];
      lines.push('', '\x1BE\x01', ...wrapText(`#${order.orderNumber || '?'} | ${reportService(order)}`), '\x1BE\x00');
      lines.push(...wrapText(`RECIBIDA: ${reportDate(order.createdAt)} | ESTADO: ${order.status || 'SIN ESTADO'}`, LINE_WIDTH, '  '));
      if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`PAGO: ${order.paymentMethod || 'SEGUN MOVIMIENTO'}`, LINE_WIDTH, '  '));
      for (const item of orderItems) lines.push(...wrapText(`${item.quantity || 1}x ${item.productName || 'ITEM'}`, LINE_WIDTH, '  '));
      if (orderItems.length === 0) lines.push('  SIN ITEMS DISPONIBLES');
      lines.push(`  TOTAL: $${(Number(order.totalUSD) || 0).toFixed(2)} USD`);
    }
    addSection(lines, 'RESUMEN DE COCINA');
    lines.push(`COMANDAS: ${(data.orders || []).length}`, `ITEMS FACTURADOS: ${(data.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  } else {
    // REPORTE CONTABLE CONSOLIDADO
    const copRateGlobal = Number(data.exchangeRates?.COP) || 3100;
    const bsRateGlobal = Number(data.exchangeRates?.Bs) || 3.2;

    const billedTotals = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();

    for (const payment of data.payments || []) {
      const method = payment.paymentMethod || 'Efectivo USD';
      const curr = reportPaymentCurrency(method);
      const cRate = Number(payment.copRate) || copRateGlobal;
      const bRate = Number(payment.bsRate) || bsRateGlobal;

      const paidUSD = Number(payment.amountPaidUSD) || 0;
      let tenderUSD = Number(payment.cashTenderedUSD) || 0;
      let tenderCOP = Number(payment.cashTenderedCOP) || 0;
      let tenderBs = Number(payment.cashTenderedBs) || 0;

      if (tenderUSD === 0 && tenderCOP === 0 && tenderBs === 0 && paidUSD > 0) {
        if (curr === 'USD') tenderUSD = paidUSD;
        else if (curr === 'COP') tenderCOP = paidUSD * cRate;
        else if (curr === 'Bs') tenderBs = bRate > 0 ? (paidUSD * cRate) / bRate : 0;
      }

      const changeUSD = Number(payment.changeGivenUSD) || 0;
      const changeCOP = Number(payment.changeGivenCOP) || 0;
      const changeBs = Number(payment.changeGivenBs) || 0;

      const methodTotals = byMethod.get(method) || { currency: curr, incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };

      // 1. Sumar ingresos al método que recibió el dinero
      if (curr === 'USD') {
        methodTotals.incomeNative += tenderUSD;
        billedTotals.usd += tenderUSD;
      } else if (curr === 'COP') {
        methodTotals.incomeNative += tenderCOP;
        billedTotals.cop += tenderCOP;
      } else if (curr === 'Bs') {
        methodTotals.incomeNative += tenderBs;
        billedTotals.bs += tenderBs;
      }

      if (paidUSD > 0 || tenderUSD > 0 || tenderCOP > 0 || tenderBs > 0) {
        methodTotals.count += 1;
      }
      byMethod.set(method, methodTotals);

      // 2. Descontar vueltos estrictamente en su moneda nativa y método
      if (changeUSD > 0 || changeCOP > 0 || changeBs > 0) {
        if (paidUSD === 0) {
          if (changeUSD > 0) {
            methodTotals.changeNative += changeUSD;
            billedTotals.usd -= changeUSD;
          }
          if (changeCOP > 0) {
            methodTotals.changeNative += changeCOP;
            billedTotals.cop -= changeCOP;
          }
          if (changeBs > 0) {
            methodTotals.changeNative += changeBs;
            billedTotals.bs -= changeBs;
          }
          byMethod.set(method, methodTotals);
        } else {
          if (changeUSD > 0) {
            const m = byMethod.get('Efectivo USD') || { currency: 'USD', incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };
            m.changeNative += changeUSD;
            byMethod.set('Efectivo USD', m);
            billedTotals.usd -= changeUSD;
          }
          if (changeCOP > 0) {
            const m = byMethod.get('Efectivo COP') || { currency: 'COP', incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };
            m.changeNative += changeCOP;
            byMethod.set('Efectivo COP', m);
            billedTotals.cop -= changeCOP;
          }
          if (changeBs > 0) {
            const m = byMethod.get('Pago Móvil') || { currency: 'Bs', incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };
            m.changeNative += changeBs;
            byMethod.set('Pago Móvil', m);
            billedTotals.bs -= changeBs;
          }
        }
      }
    }

    for (const [, m] of byMethod) {
      m.netNative = m.incomeNative - m.changeNative;
      if (m.currency === 'USD') m.netUSD = m.netNative;
      else if (m.currency === 'COP') m.netUSD = m.netNative / copRateGlobal;
      else if (m.currency === 'Bs') m.netUSD = m.netNative / bsRateGlobal;
    }

    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');

    const creditOrders = (data.orders || []).filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
    const billedOrders = (data.orders || []).filter((o) => o.paymentStatus === 'pagado' || o.paymentStatus === 'credito');
    const billedOrderIds = new Set(billedOrders.map((o) => o.id));
    const cashItems = (data.items || []).filter((item) => billedOrderIds.has(item.orderId));

    const firstOrder = data.orders?.[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders?.[data.orders.length - 1]?.orderNumber || 'N/A';

    lines.push(...wrapText(`COMANDA INICIAL: #${firstOrder}`, reportWidth));
    lines.push(...wrapText(`COMANDA FINAL:   #${lastOrder}`, reportWidth));

    // Desglose de Deliverys de Comandas Facturadas
    const cashOrders = (data.orders || []).filter((o) => o.paymentStatus === 'pagado' && o.paymentMethod !== 'Crédito');
    const deliveryMap = new Map();
    for (const ord of billedOrders) {
      const ordCopRate = Number(ord.copRateAtPayment) || copRateGlobal;
      let fee = Number(ord.deliveryFeeUSD || ord.delivery_fee_usd) || 0;
      const feeCOP = Number(ord.deliveryFeeCOP || ord.delivery_fee_cop) || 0;
      if (feeCOP > 0 && (fee === 0 || fee >= 100)) {
        fee = ordCopRate > 0 ? feeCOP / ordCopRate : 0;
      } else if (fee >= 100) {
        fee = ordCopRate > 0 ? fee / ordCopRate : 0;
      }
      if (ord.type === 'delivery' || fee > 0 || feeCOP > 0) {
        deliveryMap.set(fee, (deliveryMap.get(fee) || 0) + 1);
      }
    }

    // Desglose de Extras / Adicionales de Comandas al Contado
    const extrasMap = new Map();
    for (const it of cashItems) {
      const itQty = Number(it.quantity) || 1;
      const extrasList = [];
      if (Array.isArray(it.extras)) {
        extrasList.push(...it.extras);
      } else if (it.extrasJson && Array.isArray(it.extrasJson)) {
        extrasList.push(...it.extrasJson);
      }
      for (const extra of extrasList) {
        const price = Number(extra.price) || 0;
        if (price > 0) {
          const count = itQty;
          const subtotal = price * count;
          const prev = extrasMap.get(price) || { count: 0, totalUSD: 0 };
          prev.count += count;
          prev.totalUSD += subtotal;
          extrasMap.set(price, prev);
        }
      }
    }

    const totalFacturadoUSD = billedTotals.usd + (billedTotals.cop / copRateGlobal) + (billedTotals.bs / bsRateGlobal);

    // SECCIÓN 2 — TOTAL FACTURADO POR MONEDA
    addSection(lines, 'SECCION 2: FACTURADO', reportWidth);
    lines.push(...wrapText(`USD: $${billedTotals.usd.toFixed(2)}`, reportWidth));
    lines.push(...wrapText(`COP: $${Math.round(billedTotals.cop).toLocaleString('en-US')} COP`, reportWidth));
    lines.push(...wrapText(`Bs:  Bs ${billedTotals.bs.toFixed(2)}`, reportWidth));
    lines.push(divider('-', reportWidth));
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`TOTAL: $${totalFacturadoUSD.toFixed(2)} USD`, reportWidth));
    lines.push('\x1BE\x00');
    lines.push(divider('-', reportWidth));
    lines.push(...wrapText(`TOTAL COMANDAS: ${(data.orders || []).length}`, reportWidth));
    lines.push(...wrapText(`  • Al Contado: ${cashOrders.length}`, reportWidth));
    lines.push(...wrapText(`  • A Credito:  ${creditOrders.length}`, reportWidth));

    // SECCIÓN 3 — DESGLOSE DE COBROS POR TIPO DE PAGO
    addSection(lines, 'SECCION 3: POR METODO', reportWidth);
    if (byMethod.size === 0) {
      lines.push('SIN COBROS EN EL INTERVALO');
    } else {
      for (const [method, totals] of byMethod) {
        if (totals.count === 0 && totals.netNative === 0) continue;
        const formatted = totals.currency === 'USD'
          ? `$${totals.netNative.toFixed(2)} USD`
          : totals.currency === 'COP'
          ? `$${Math.round(totals.netNative).toLocaleString('en-US')} COP`
          : `Bs ${totals.netNative.toFixed(2)}`;
        lines.push('', ...wrapText(`• ${method} (${totals.count}):`, reportWidth));
        lines.push(...wrapText(`    ${formatted}`, reportWidth));
      }
    }

    // SECCIÓN 4 — DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR (SI APLICA)
    if (creditOrders.length > 0) {
      const totalCreditUSD = creditOrders.reduce((sum, o) => sum + (Number(o.totalUSD) || 0), 0);
      addSection(lines, 'SECCION 4: CUENTAS POR COBRAR', reportWidth);
      for (const ord of creditOrders) {
        lines.push('', ...wrapText(`#${ord.orderNumber} | ${ord.customerName || 'Cliente'}`, reportWidth));
        lines.push(...wrapText(`  DEUDA: $${(Number(ord.totalUSD) || 0).toFixed(2)} USD`, reportWidth));
      }
      lines.push(divider('-', reportWidth));
      lines.push(...wrapText(`TOTAL A CREDITO: $${totalCreditUSD.toFixed(2)} USD`, reportWidth));
    }

    // SECCIÓN 6 — ÍTEMS FACTURADOS (Estructurado en 4 Secciones)
    const paidExtrasMap = new Map();
    let freeToppingsCount = 0;
    const foodMap = new Map();
    const drinkMap = new Map();
    const otherProductsMap = new Map();

    for (const it of cashItems) {
      const itQty = Number(it.quantity) || 1;
      const cleanName = getReportBaseProductName(it);

      const extrasList = [];
      if (Array.isArray(it.extras)) extrasList.push(...it.extras);
      else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);
      else if (typeof it.extrasJson === 'string') {
        try {
          const parsed = JSON.parse(it.extrasJson);
          if (Array.isArray(parsed)) extrasList.push(...parsed);
        } catch (e) {}
      }

      const itCopRate = Number(it.copRate) || copRateGlobal;
      let paidExtrasUnitCostUSD = 0;
      for (const extra of extrasList) {
        const rawExtraPrice = Number(extra.price) || 0;
        const extraName = (extra.name || 'Adicional').trim();
        if (rawExtraPrice > 0) {
          let extraUSD = Number(extra.priceUSD);
          if (isNaN(extraUSD) || extraUSD === 0) {
            extraUSD = rawExtraPrice >= 100 ? (itCopRate > 0 ? rawExtraPrice / itCopRate : 0) : rawExtraPrice;
          }
          paidExtrasUnitCostUSD += extraUSD;
          const current = paidExtrasMap.get(extraName) || { name: `ADD ${extraName}`, quantity: 0, subtotalUSD: 0 };
          current.quantity += itQty;
          current.subtotalUSD += extraUSD * itQty;
          paidExtrasMap.set(extraName, current);
        } else {
          freeToppingsCount += itQty;
        }
      }

      const rawPrice = Number(it.price) || 0;
      let itPriceUSD = Number(it.priceUSD);
      if (isNaN(itPriceUSD) || itPriceUSD === 0) {
        itPriceUSD = rawPrice >= 100 ? (itCopRate > 0 ? rawPrice / itCopRate : 0) : rawPrice;
      }
      const baseUnitPrice = Math.max(0, itPriceUSD - paidExtrasUnitCostUSD);
      const baseSubtotal = baseUnitPrice * itQty;

      const catLower = (it.category || '').toLowerCase().trim();
      const rawLower = (it.productName || it.name || '').toLowerCase().trim();
      const isDrink =
        catLower.includes('bebida') ||
        catLower.includes('drink') ||
        catLower.includes('refresco') ||
        catLower.includes('jugo') ||
        catLower.includes('licor') ||
        catLower.includes('cerveza') ||
        catLower.includes('agua') ||
        catLower.includes('trago') ||
        catLower.includes('coctel') ||
        catLower.includes('cóctel') ||
        catLower.includes('vino') ||
        catLower.includes('café') ||
        catLower.includes('cafe') ||
        catLower.includes('malta') ||
        Boolean(it.drinkType) ||
        Boolean(it.flavor) ||
        rawLower.includes('refresco') ||
        rawLower.includes('jugo') ||
        rawLower.includes('agua') ||
        rawLower.includes('cerveza') ||
        rawLower.includes('nestea') ||
        rawLower.includes('granizado') ||
        rawLower.includes('soda') ||
        rawLower.includes('malta') ||
        rawLower.includes('licor') ||
        rawLower.includes('ron') ||
        rawLower.includes('vodka') ||
        rawLower.includes('whisky') ||
        rawLower.includes('mojito') ||
        rawLower.includes('té') ||
        rawLower.includes('te ') ||
        rawLower.endsWith(' te');

      const isOther =
        catLower.includes('delivery') ||
        catLower.includes('servicio') ||
        catLower.includes('otro') ||
        rawLower.includes('delivery') ||
        rawLower.includes('servicio');

      const targetMap = isDrink ? drinkMap : isOther ? otherProductsMap : foodMap;
      const prevProd = targetMap.get(cleanName) || { name: cleanName, quantity: 0, subtotalUSD: 0 };
      prevProd.quantity += itQty;
      prevProd.subtotalUSD += baseSubtotal;
      targetMap.set(cleanName, prevProd);
    }

    const comidasList = Array.from(foodMap.values()).filter((p) => p.quantity > 0).sort((a, b) => a.name.localeCompare(b.name));
    const bebidasList = Array.from(drinkMap.values()).filter((p) => p.quantity > 0).sort((a, b) => a.name.localeCompare(b.name));

    const adicionalesList = Array.from(paidExtrasMap.values()).filter((e) => e.quantity > 0).sort((a, b) => a.name.localeCompare(b.name));
    if (freeToppingsCount > 0) {
      adicionalesList.push({ name: 'Toppings Gratis', quantity: freeToppingsCount, subtotalUSD: 0 });
    }

    const otrosList = [];
    const sortedFees = Array.from(deliveryMap.keys()).sort((a, b) => a - b);
    for (const fee of sortedFees) {
      const count = deliveryMap.get(fee) || 0;
      if (fee > 0 && count > 0) {
        otrosList.push({ name: `Delivery ($${fee.toFixed(2)})`, quantity: count, subtotalUSD: fee * count });
      }
    }
    for (const prod of otherProductsMap.values()) {
      if (prod.quantity > 0) otrosList.push(prod);
    }

    const totalComidasUnits = comidasList.reduce((s, it) => s + it.quantity, 0);
    const totalComidasUSD = comidasList.reduce((s, it) => s + it.subtotalUSD, 0);
    const totalBebidasUnits = bebidasList.reduce((s, it) => s + it.quantity, 0);
    const totalBebidasUSD = bebidasList.reduce((s, it) => s + it.subtotalUSD, 0);
    const totalAdicionalesUnits = adicionalesList.reduce((s, it) => s + it.quantity, 0);
    const totalAdicionalesUSD = adicionalesList.reduce((s, it) => s + it.subtotalUSD, 0);
    const totalOtrosUnits = otrosList.reduce((s, it) => s + it.quantity, 0);
    const totalOtrosUSD = otrosList.reduce((s, it) => s + it.subtotalUSD, 0);

    const grandUnits = totalComidasUnits + totalBebidasUnits + totalAdicionalesUnits + totalOtrosUnits;
    const grandUSD = totalComidasUSD + totalBebidasUSD + totalAdicionalesUSD + totalOtrosUSD;

    addSection(lines, creditOrders.length > 0 ? 'SECCION 5: ITEMS FACTURADOS' : 'SECCION 4: ITEMS FACTURADOS', reportWidth);

    // 1. COMIDAS
    lines.push('', ...wrapText('[1. COMIDAS]', reportWidth));
    if (comidasList.length === 0) {
      lines.push('  SIN COMIDAS');
    } else {
      for (const it of comidasList) {
        lines.push(...wrapText(`  ${it.quantity}x ${it.name} | $${it.subtotalUSD.toFixed(2)}`, reportWidth));
      }
    }

    // 2. BEBIDAS
    lines.push('', ...wrapText('[2. BEBIDAS]', reportWidth));
    if (bebidasList.length === 0) {
      lines.push('  SIN BEBIDAS');
    } else {
      for (const it of bebidasList) {
        lines.push(...wrapText(`  ${it.quantity}x ${it.name} | $${it.subtotalUSD.toFixed(2)}`, reportWidth));
      }
    }

    // 3. ADICIONALES
    lines.push('', ...wrapText('[3. ADICIONALES]', reportWidth));
    if (adicionalesList.length === 0) {
      lines.push('  SIN ADICIONALES');
    } else {
      for (const it of adicionalesList) {
        lines.push(...wrapText(`  ${it.quantity}x ${it.name} | $${it.subtotalUSD.toFixed(2)}`, reportWidth));
      }
    }

    // 4. OTROS
    lines.push('', ...wrapText('[4. OTROS / DELIVERY]', reportWidth));
    if (otrosList.length === 0) {
      lines.push('  SIN OTROS CONCEPTOS');
    } else {
      for (const it of otrosList) {
        lines.push(...wrapText(`  ${it.quantity}x ${it.name} | $${it.subtotalUSD.toFixed(2)}`, reportWidth));
      }
    }

    lines.push(divider('-', reportWidth));
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`TOTAL GENERAL FACTURADO EN ITEMS:`, reportWidth));
    lines.push(...wrapText(`$${grandUSD.toFixed(2)} USD`, reportWidth));
    lines.push('\x1BE\x00');
  }

  lines.push('', divider('=', reportWidth), centered('FIN DEL REPORTE', reportWidth), centered('MUGROSITO', reportWidth), PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');
  return Buffer.from(lines.join('\n'), 'ascii');
}

function kitchenDivider(char = '=') {
  return char.repeat(KITCHEN_LINE_WIDTH);
}

function kitchenCentered(value) {
  const text = printableText(value).slice(0, KITCHEN_LINE_WIDTH);
  const padding = Math.max(0, Math.floor((KITCHEN_LINE_WIDTH - text.length) / 2));
  return `${' '.repeat(padding)}${text}`;
}

function kitchenWrap(value, indent = '') {
  return wrapText(value, KITCHEN_LINE_WIDTH, indent);
}

function consolidateKitchenItems(items, order) {
  const consolidated = [];
  for (const item of items) {
    const cleanName = (item.productName || item.product_name || item.name || 'Producto')
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar)\)/gi, '')
      .trim();
    const details = itemDetails(item, order);
    const isSalsa = isSalsaItem(item);
    const key = `${cleanName.toLowerCase()}|||${details.join('|||')}`;

    const existing = consolidated.find((c) => c.key === key);
    if (existing) {
      existing.quantity += (Number(item.quantity) || 1);
    } else {
      consolidated.push({
        key,
        name: cleanName,
        quantity: Number(item.quantity) || 1,
        details,
        isSalsa,
      });
    }
  }

  // REGLA ESTRICTA: Las salsas SIEMPRE deben aparecer al final de la comanda de cocina
  return consolidated.sort((a, b) => {
    if (a.isSalsa && !b.isSalsa) return 1;
    if (!a.isSalsa && b.isSalsa) return -1;
    return 0;
  });
}

function buildKitchenTicket(order, isFallback = false) {
  const allItems = order.items || [];
  const orderType = (order.type || '').toLowerCase();
  const isPickupOrDelivery = orderType === 'delivery' || orderType === 'pickup';
  const kitchenItems = isPickupOrDelivery ? allItems : allItems.filter(isKitchenItem);

  if (kitchenItems.length === 0) {
    return null;
  }

  const lines = [
    '\x1B@',
    KITCHEN_FORMAT_SETUP,
  ];

  if (isFallback) {
    lines.push(
      '\x1Ba\x01',
      '\x1BE\x01',
      kitchenDivider('='),
      kitchenCentered('*** ALERTA ***'),
      kitchenCentered('FALLO EN COCINA'),
      kitchenCentered('IMPRESO EN CAJA'),
      kitchenCentered('(POR CABLE)'),
      kitchenCentered('ENTREGAR A COCINA!'),
      kitchenDivider('='),
      '\x1BE\x00',
      '\x1Ba\x00'
    );
  }

  lines.push(
    '\x1Ba\x01',
    kitchenCentered('MUGROSITO'),
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${formatKitchenTime(order.createdAt)}`,
  );

  if (orderType === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (orderType === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (orderType === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) {
    lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  }

  lines.push(kitchenDivider('-'));

  const consolidated = consolidateKitchenItems(kitchenItems, order);

  for (const item of consolidated) {
    lines.push(...kitchenWrap(`${item.quantity}x ${item.name}`));
    for (const detail of item.details) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
    lines.push(kitchenDivider('-'));
  }

  const cleanKitchenNote = getCleanItemNote(order.kitchenNotes);
  if (cleanKitchenNote) {
    lines.push('NOTA COCINA:');
    lines.push(...kitchenWrap(cleanKitchenNote));
    lines.push(kitchenDivider('-'));
  }

  lines.push(`ITEMS ${isPickupOrDelivery ? 'TOTALES' : 'COCINA'}: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('REVISAR ORDEN');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function buildKitchenAdditionTicket(order, addedItems, isFallback = false) {
  const allItems = addedItems || [];
  const orderType = (order.type || '').toLowerCase();
  const isPickupOrDelivery = orderType === 'delivery' || orderType === 'pickup';
  const kitchenItems = isPickupOrDelivery ? allItems : allItems.filter(isKitchenItem);

  if (kitchenItems.length === 0) {
    return null;
  }

  const lines = [
    '\x1B@',
    KITCHEN_FORMAT_SETUP,
  ];

  if (isFallback) {
    lines.push(
      '\x1Ba\x01',
      '\x1BE\x01',
      kitchenDivider('='),
      kitchenCentered('*** ALERTA ***'),
      kitchenCentered('FALLO EN COCINA'),
      kitchenCentered('IMPRESO EN CAJA'),
      kitchenCentered('(POR CABLE)'),
      kitchenCentered('ENTREGAR A COCINA!'),
      kitchenDivider('='),
      '\x1BE\x00',
      '\x1Ba\x00'
    );
  }

  lines.push(
    '\x1Ba\x01',
    kitchenCentered('MUGROSITO'),
    'ADICION COCINA',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${formatKitchenTime(new Date())}`,
  );

  if (orderType === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (orderType === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (orderType === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) {
    lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  }

  lines.push(kitchenDivider('-'));

  const combinedItems = [
    ...(Array.isArray(order.items) ? order.items : []),
    ...(Array.isArray(addedItems) ? addedItems : []),
  ];
  const orderForConsolidation = {
    ...order,
    items: combinedItems,
  };

  const consolidated = consolidateKitchenItems(kitchenItems, orderForConsolidation);

  for (const item of consolidated) {
    lines.push(...kitchenWrap(`${item.quantity}x ${item.name}`));
    for (const detail of item.details) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
    lines.push(kitchenDivider('-'));
  }

  lines.push(`ITEMS ADICIONADOS: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('SOLO PREPARAR ADICION');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function sendRawTicket(payload, config) {
  if (config.connectionType === 'usb') {
    return new Promise((resolve, reject) => {
      const printerName = String(config.usbDeviceName || 'POS-58').trim();
      if (!printerName) {
        return reject(new Error('Nombre de impresora o dispositivo USB no configurado.'));
      }

      // 1. Puerto serial o paralelo directo (COMx o LPTx)
      if (/^(COM\d+|LPT\d+)$/i.test(printerName)) {
        try {
          fs.writeFileSync(`\\\\.\\${printerName}`, payload);
          return resolve();
        } catch (err) {
          return reject(err);
        }
      }

      // 2. Impresora USB en Windows (Spooler WinSpool directo con winspool.drv)
      const os = require('os');
      const tempPath = path.join(os.tmpdir(), `ticket_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
      try {
        fs.writeFileSync(tempPath, payload);
      } catch (err) {
        return reject(err);
      }

      const scriptPath = path.join(__dirname, 'rawPrinter.ps1');
      const { execFile } = require('child_process');

      execFile(
        'powershell.exe',
        [
          '-WindowStyle', 'Hidden',
          '-NoLogo',
          '-NonInteractive',
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
          '-PrinterName', printerName,
          '-FilePath', tempPath,
        ],
        {
          timeout: config.timeoutMs || 8000,
          windowsHide: true,
        },
        (err, stdout, stderr) => {
          try { fs.unlinkSync(tempPath); } catch (_) {}
          if (err) {
            const detail = (stderr || stdout || err.message).trim();
            console.warn(`⚠️ [USB SPOOLER] Error en ${printerName}:`, detail);

            // Fallback a socket LAN si host y puerto están configurados explícitamente
            if (config.connectionType === 'lan' && config.host && Number.isInteger(config.port) && config.port > 0) {
              const socket = net.createConnection({ host: config.host, port: config.port });
              socket.setTimeout(config.timeoutMs || 5000);
              socket.once('connect', () => socket.end(payload, () => resolve()));
              socket.once('timeout', () => reject(new Error(`Fallo spooler USB (${printerName}) y tiempo de espera agotado en LAN (${config.host}:${config.port}).`)));
              socket.once('error', (netErr) => reject(new Error(`Fallo spooler USB (${printerName}) y fallback LAN falló: ${netErr.message}`)));
              return;
            }
            return reject(new Error(`No se pudo imprimir en USB "${printerName}". Detalle: ${detail}`));
          }
          resolve();
        }
      );
    });
  }

  // Conexión TCP / Red estándar para LAN
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let settled = false;
    const complete = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(config.timeoutMs || 5000);
    socket.once('connect', () => socket.end(payload, () => complete()));
    socket.once('timeout', () => complete(new Error(`Tiempo de espera agotado al conectar con ${config.host}:${config.port}.`)));
    socket.once('error', complete);
  });
}

async function sendRawTicketToTarget(payload, targetPrinter = 'auto', defaultFallback = 'caja') {
  const configs = loadDualPrinterConfig();
  let targets = [];

  if (targetPrinter === 'cocina') {
    targets.push({ key: 'cocina', config: configs.cocina });
  } else if (targetPrinter === 'caja') {
    targets.push({ key: 'caja', config: configs.caja });
  } else if (targetPrinter === 'ambas') {
    targets.push({ key: 'cocina', config: configs.cocina });
    targets.push({ key: 'caja', config: configs.caja });
  } else if (targetPrinter === 'ninguna') {
    return { printed: false, reason: 'skipped_by_user', results: [] };
  } else {
    // 'auto': defaultFallback determines primary
    if (defaultFallback === 'cocina') {
      targets.push({ key: 'cocina', config: configs.cocina });
    } else {
      targets.push({ key: 'caja', config: configs.caja });
    }
  }

  const results = [];
  for (const { key, config } of targets) {
    if (!config.enabled) {
      results.push({ printer: key, printed: false, reason: 'disabled' });
      continue;
    }
    if (config.connectionType === 'lan') {
      if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        results.push({ printer: key, printed: false, reason: 'invalid_host_port' });
        continue;
      }
    } else if (config.connectionType === 'usb') {
      if (!config.usbDeviceName) {
        results.push({ printer: key, printed: false, reason: 'invalid_usb_device_name' });
        continue;
      }
    }
    try {
      for (let copy = 0; copy < config.copies; copy += 1) {
        await sendRawTicket(payload, config);
      }
      results.push({ printer: key, printed: true, copies: config.copies });
    } catch (err) {
      console.warn(`⚠️ [IMPRESORA ${key.toUpperCase()}] Error al enviar ticket: ${err.message}`);
      results.push({ printer: key, printed: false, error: err.message });
    }
  }

  const printedAny = results.some(r => r.printed);
  return {
    printed: printedAny,
    results,
    copies: targets[0]?.config?.copies || 1,
  };
}

function buildTestTicket(printerName, config) {
  const is58mm = config.paperWidth === '58mm';
  const width = is58mm ? 20 : 28;
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('MUGROSITO', width),
    centered('--- PRUEBA DE CONEXION ---', width),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('=', width),
    `IMPRESORA: ${printableText(printerName)}`,
    config.connectionType === 'usb'
      ? `CONEXION: USB (${printableText(config.usbDeviceName || 'Directo')})`
      : `DESTINO: ${printableText(config.host)}:${config.port}`,
    `FORMATO: PAPEL ${config.paperWidth || '80mm'}`,
    `FECHA: ${new Date().toLocaleString('es-VE')}`,
    divider('-', width),
    '\x1Ba\x01',
    'CONEXION EXITOSA',
    'IMPRESORA OPERATIVA Y LISTA',
    '\x1Ba\x00',
    PRINT_FORMAT_RESET,
    '\n\n\n\x1DV\x00',
  ];
  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printTestTicket(targetPrinter = 'caja') {
  const configs = loadDualPrinterConfig();
  const targets = targetPrinter === 'ambas' ? ['cocina', 'caja'] : [targetPrinter];
  const results = [];

  for (const t of targets) {
    const cfg = configs[t] || configs.caja;
    if (cfg.connectionType === 'lan' && (!cfg.host || !Number.isInteger(cfg.port))) {
      throw new Error(`La impresora de ${t} no tiene IP o puerto válido configurado.`);
    }
    if (cfg.connectionType === 'usb' && !cfg.usbDeviceName) {
      throw new Error(`La impresora de ${t} no tiene nombre de dispositivo USB configurado.`);
    }
    const payload = buildTestTicket(cfg.name, cfg);
    await sendRawTicket(payload, cfg);
    results.push({ printer: t, printed: true, host: cfg.host, port: cfg.port, connectionType: cfg.connectionType, paperWidth: cfg.paperWidth });
  }

  return { success: true, results };
}

async function sendKitchenTicketWithFallback(payloadNormal, payloadFallback, targetPrinter = 'cocina', order = {}, io = null) {
  const configs = loadDualPrinterConfig();
  const shouldPrintKitchen = targetPrinter === 'cocina' || targetPrinter === 'ambas' || targetPrinter === 'auto';
  const shouldPrintCajaExplicit = targetPrinter === 'caja' || targetPrinter === 'ambas';

  let kitchenSuccess = false;
  let kitchenError = null;

  // 1. Intento primario en impresora de cocina (LAN / Wi-Fi)
  if (shouldPrintKitchen && configs.cocina.enabled) {
    try {
      if (configs.cocina.connectionType === 'lan' && (!configs.cocina.host || !Number.isInteger(configs.cocina.port))) {
        throw new Error('Impresora de cocina sin IP o puerto válido configurado.');
      }
      for (let copy = 0; copy < configs.cocina.copies; copy++) {
        await sendRawTicket(payloadNormal, configs.cocina);
      }
      kitchenSuccess = true;
      console.log(`🖨️ [COCINA OK] Comanda #${order.orderNumber || ''} impresa en cocina (${configs.cocina.copies} copia(s))`);
    } catch (err) {
      kitchenError = err;
      console.warn(`⚠️ [COCINA FALLÓ] Comanda #${order.orderNumber || ''} no pudo imprimirse en cocina: ${err.message}. Activando respaldo inmediato en CAJA...`);
    }
  }

  // 2. Si cocina falló (por conectividad/timeout/desconexión) y el destino incluía cocina:
  // RESPALDO INMEDIATO EN IMPRESORA DE CAJA (CON CABLE) CON AVISO PARA COCINA
  let fallbackSuccess = false;
  let fallbackError = null;
  if (!kitchenSuccess && shouldPrintKitchen) {
    if (configs.caja.enabled) {
      try {
        for (let copy = 0; copy < configs.caja.copies; copy++) {
          await sendRawTicket(payloadFallback, configs.caja);
        }
        fallbackSuccess = true;
        console.log(`🚨 [RESPALDO CAJA OK] Comanda #${order.orderNumber || ''} impresa en impresora de CAJA por fallo de cocina. Alerta visible incluida.`);
        // Cancelación y purga de cola: Al marcar fallbackSuccess como true, NO se programa ningún reintento hacia cocina.
        // Se emite alerta por WebSocket para cajera y mesonero.
        if (io) {
          io.emit('order:kitchen_fallback', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            reason: `Fallo de conexión en cocina (${kitchenError ? kitchenError.message : 'desconectada'}). Imprimiendo respaldo en caja.`,
          });
        }
      } catch (err) {
        fallbackError = err;
        console.error(`❌ [FALLBACK CAJA FALLÓ] No se pudo imprimir respaldo en caja: ${err.message}`);
      }
    } else {
      console.warn(`⚠️ [CAJA DESHABILITADA] No se pudo imprimir respaldo en caja porque está deshabilitada.`);
    }
  }

  // 3. Si el usuario solicitó explícitamente imprimir en 'ambas' o 'caja' y no se hizo fallback previo
  let cajaSuccess = false;
  if (shouldPrintCajaExplicit && !fallbackSuccess && configs.caja.enabled) {
    try {
      for (let copy = 0; copy < configs.caja.copies; copy++) {
        await sendRawTicket(payloadNormal, configs.caja);
      }
      cajaSuccess = true;
    } catch (err) {
      console.warn(`⚠️ [CAJA EXPLÍCITO ERROR]: ${err.message}`);
    }
  }

  const printedAny = kitchenSuccess || fallbackSuccess || cajaSuccess;
  return {
    printed: printedAny,
    fallback: fallbackSuccess,
    kitchenPrinted: kitchenSuccess,
    cajaPrinted: fallbackSuccess || cajaSuccess,
    copies: configs.cocina.copies || 1,
    reason: !printedAny ? (kitchenError ? kitchenError.message : fallbackError ? fallbackError.message : 'no_printer_available') : undefined,
  };
}

async function printKitchenTicket(order, targetPrinter = 'cocina', io = null) {
  const payloadNormal = buildKitchenTicket(order, false);
  if (!payloadNormal) {
    return { printed: false, reason: 'no_kitchen_items' };
  }
  const payloadFallback = buildKitchenTicket(order, true);
  return sendKitchenTicketWithFallback(payloadNormal, payloadFallback, targetPrinter, order, io);
}

async function printKitchenAdditionTicket(order, addedItems, targetPrinter = 'cocina', io = null) {
  const payloadNormal = buildKitchenAdditionTicket(order, addedItems, false);
  if (!payloadNormal) {
    return { printed: false, reason: 'no_kitchen_items' };
  }
  const payloadFallback = buildKitchenAdditionTicket(order, addedItems, true);
  return sendKitchenTicketWithFallback(payloadNormal, payloadFallback, targetPrinter, order, io);
}

function buildReceiptTicket(order, rates = {}) {
  // Priorizar las tasas enviadas explícitamente desde el sistema / UI, luego las guardadas en la comanda, luego las del turno
  const copRate = Number(rates.COP || order.copRateAtPayment || order.copRate || 3100);
  const bsRate = Number(rates.Bs || order.bsRateAtPayment || order.bsRate || 3.2);
  const totalUSD = Number(order.totalUSD || 0);
  const cleanOrderNumber = printableText((order.orderNumber || '').toString().replace(/^#+/, ''));

  const srvType = order.type === 'mesa' && order.tableNumber
    ? `MESA #${order.tableNumber}`
    : order.type === 'delivery'
    ? 'DELIVERY'
    : 'PICKUP';

  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const lines = [
    '\x1B@',
    '\x1Bt\x10',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    'MUGROSITO',
    'PRE-CUENTA / CONSUMO',
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('-'),
    `COMANDA: #${cleanOrderNumber} | ${srvType}`,
    `FECHA: ${dateStr}`,
  ];

  if (order.customerName) {
    lines.push(`CLIENTE: ${printableText(order.customerName).substring(0, 32)}`);
  }

  lines.push(divider('-'));

  // Imprimir todos los ítems de la comanda de forma directa y compacta (excluyendo salsas, que no van en pre-cuenta)
  const receiptItems = (order.items || []).filter((it) => !isSalsaItem(it));
  for (const it of receiptItems) {
    const qty = it.quantity || 1;
    const cleanName = printableText((it.productName || it.product_name || 'Producto')
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '')
      .trim());
    const unitPrice = Number(it.price) || 0;
    const lineTotalCOP = unitPrice * qty;

    let packagingTag = '';
    if (order.type !== 'delivery') {
      if (it.isDelivery || it.is_delivery) {
        packagingTag = ' (DELIVERY)';
      } else if (it.isTakeaway || it.is_takeaway) {
        if (order.type === 'mesa' || (order.type === 'pickup' && orderHasSalonItem(order))) {
          packagingTag = ' (LLEVAR)';
        }
      }
    }

    const priceCol = `${Math.round(lineTotalCOP).toLocaleString('es-CO')}`;
    const maxLeft = Math.max(1, LINE_WIDTH - priceCol.length - 1);
    const combinedLine = `${qty}x ${cleanName}${packagingTag}`;
    if (packagingTag && combinedLine.length > maxLeft) {
      lines.push(formatTwoColumns(`${qty}x ${cleanName}`, priceCol));
      lines.push(`  * ${packagingTag.trim().replace(/^\(|\)$/g, '')}`);
    } else {
      lines.push(formatTwoColumns(combinedLine, priceCol));
    }

    // Si tiene sabor y no está en el nombre, listarlo indentado debajo
    if (it.flavor && !cleanName.toUpperCase().includes(String(it.flavor).toUpperCase())) {
      lines.push(`  * SABOR: ${printableText(String(it.flavor).toUpperCase())}`);
    }

    // Si tiene adicionales con costo, listarlos indentados debajo
    const extrasList = [];
    if (Array.isArray(it.extras)) extrasList.push(...it.extras);
    else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);
    else if (typeof it.extrasJson === 'string') {
      try {
        const parsed = JSON.parse(it.extrasJson);
        if (Array.isArray(parsed)) extrasList.push(...parsed);
      } catch (e) {}
    }

    for (const ex of extrasList) {
      const exPrice = Number(ex.price) || 0;
      const exQty = Number(ex.quantity) || 1;
      if (exPrice > 0) {
        const rawName = printableText(ex.name || 'Adicional');
        const cleanName = rawName.replace(/^\d+x\s*/i, '').trim();
        const label = exQty > 1 ? `${exQty}x ${cleanName}` : cleanName;
        lines.push(`  + ADD ${label} (${Math.round(exPrice * qty).toLocaleString('es-CO')})`);
      }
    }
  }

  let deliveryFeeCOP = Number(order.deliveryFeeCOP || order.delivery_fee_cop || 0);
  if (deliveryFeeCOP === 0) {
    const rawFee = Number(order.deliveryFeeUSD || order.delivery_fee_usd || 0);
    deliveryFeeCOP = rawFee >= 100 ? rawFee : rawFee * copRate;
  }
  if (deliveryFeeCOP > 0) {
    lines.push(formatTwoColumns('1x SERVICIO DELIVERY', `${Math.round(deliveryFeeCOP).toLocaleString('es-CO')}`));
  }

  const totalCOPVal = Number(order.totalCOP || order.total_cop || Math.round(totalUSD * copRate));
  const totalUSDVal = copRate > 0 ? (totalCOPVal / copRate) : totalUSD;
  const totalBsVal = bsRate > 0 ? (totalCOPVal / bsRate).toFixed(2) : '0.00';

  lines.push(divider('-'));
  // Montos gigantes tamaño comanda de cocina (Doble Alto + Doble Ancho + Negrita)
  lines.push('\x1B \x00\x1B3\x26\x1BM\x00\x1D!\x11\x1BE\x01');
  lines.push(formatTwoColumns('TOTAL COP:', `${Math.round(totalCOPVal).toLocaleString('es-CO')}`, KITCHEN_LINE_WIDTH));
  lines.push(formatTwoColumns('TOTAL USD:', `$${totalUSDVal.toFixed(2)}`, KITCHEN_LINE_WIDTH));
  lines.push(formatTwoColumns('TOTAL Bs:', `${totalBsVal}`, KITCHEN_LINE_WIDTH));
  lines.push('\x1D!\x00\x1BE\x00', PRINT_FORMAT_RESET, PRINT_FORMAT_SETUP);
  lines.push(divider('-'));
  lines.push('\x1Ba\x01');
  lines.push('¡GRACIAS POR SU PREFERENCIA!');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\x1DV\x00');

  const ticketText = lines.join('\n');
  return Buffer.from(ticketText.replace(/€/g, '\x80'), 'latin1');
}

async function printReceiptTicket(order, rates = {}, targetPrinter = 'caja') {
  const payload = buildReceiptTicket(order, rates);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

function buildCrispysCierreTicket(data) {
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('MUGROSITO CIERRE'),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
  ];

  // 1. Cabecera con fecha y cajero
  let fechaStr = '';
  if (data.dateRange?.from) {
    const dFrom = new Date(data.dateRange.from).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dTo = new Date(data.dateRange.to || data.dateRange.from).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    fechaStr = dFrom === dTo ? dFrom : `${dFrom} - ${dTo}`;
  } else {
    fechaStr = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  lines.push(`FECHA DE CAJA: ${fechaStr}`);
  lines.push(`CAJERO A CARGO: _________`);
  lines.push(divider('-'));

  // Calcular los totales de cada método de pago con la MISMA lógica exacta de Sección 3 del reporte digital (reportService.ts)
  const copRateGlobal = Number(data.exchangeRates?.COP) || 3100;
  const bsRateGlobal = Number(data.exchangeRates?.Bs) || 3.2;

  const methodNames = [
    'Efectivo USD',
    'Binance',
    'Zelle',
    'Efectivo COP',
    'Bancolombia',
    'Nequi',
    'Binance COP',
    'Pago Móvil',
    'Tarjeta de Débito',
    'Tarjeta de Crédito',
  ];

  const methodTotals = new Map(
    methodNames.map((name) => [
      name,
      {
        currency: reportPaymentCurrency(name),
        incomeNative: 0,
        changeNative: 0,
        netNative: 0,
        netUSD: 0,
        count: 0,
      },
    ])
  );

  const billedTotals = { usd: 0, cop: 0, bs: 0 };
  const payments = Array.isArray(data.payments) ? data.payments : [];

  for (const payment of payments) {
    const method = payment.paymentMethod || 'Efectivo USD';
    const curr = reportPaymentCurrency(method);
    const cRate = Number(payment.copRate) || copRateGlobal;
    const bRate = Number(payment.bsRate) || bsRateGlobal;

    const paidUSD = Number(payment.amountPaidUSD) || 0;
    let tenderUSD = Number(payment.cashTenderedUSD) || 0;
    let tenderCOP = Number(payment.cashTenderedCOP) || 0;
    let tenderBs = Number(payment.cashTenderedBs) || 0;

    // Si es un cobro y no vino el efectivo recibido explícito, calcular según el método
    if (tenderUSD === 0 && tenderCOP === 0 && tenderBs === 0 && paidUSD > 0) {
      if (curr === 'USD') tenderUSD = paidUSD;
      else if (curr === 'COP') tenderCOP = paidUSD * cRate;
      else if (curr === 'Bs') tenderBs = bRate > 0 ? (paidUSD * cRate) / bRate : 0;
    }

    const changeUSD = Number(payment.changeGivenUSD) || 0;
    const changeCOP = Number(payment.changeGivenCOP) || 0;
    const changeBs = Number(payment.changeGivenBs) || 0;

    let totals = methodTotals.get(method);
    if (!totals) {
      totals = {
        currency: curr,
        incomeNative: 0,
        changeNative: 0,
        netNative: 0,
        netUSD: 0,
        count: 0,
      };
      methodTotals.set(method, totals);
    }

    if (curr === 'USD') {
      totals.incomeNative += tenderUSD;
      billedTotals.usd += tenderUSD;
    } else if (curr === 'COP') {
      totals.incomeNative += tenderCOP;
      billedTotals.cop += tenderCOP;
    } else if (curr === 'Bs') {
      totals.incomeNative += tenderBs;
      billedTotals.bs += tenderBs;
    }

    if (paidUSD > 0 || tenderUSD > 0 || tenderCOP > 0 || tenderBs > 0) {
      totals.count += 1;
    }

    // Descontar vueltos estrictamente en su moneda nativa
    if (changeUSD > 0 || changeCOP > 0 || changeBs > 0) {
      if (paidUSD === 0) {
        // Fila de vuelto dedicada
        if (changeUSD > 0) {
          totals.changeNative += changeUSD;
          billedTotals.usd -= changeUSD;
        }
        if (changeCOP > 0) {
          totals.changeNative += changeCOP;
          billedTotals.cop -= changeCOP;
        }
        if (changeBs > 0) {
          totals.changeNative += changeBs;
          billedTotals.bs -= changeBs;
        }
      } else {
        // Fila mixta (cobro con excedente y vuelto en una sola fila)
        if (changeUSD > 0) {
          const usdM = methodTotals.get('Efectivo USD');
          if (usdM) usdM.changeNative += changeUSD;
          billedTotals.usd -= changeUSD;
        }
        if (changeCOP > 0) {
          const copM = methodTotals.get('Efectivo COP');
          if (copM) copM.changeNative += changeCOP;
          billedTotals.cop -= changeCOP;
        }
        if (changeBs > 0) {
          const bsM = methodTotals.get('Pago Móvil');
          if (bsM) bsM.changeNative += changeBs;
          billedTotals.bs -= changeBs;
        }
      }
    }
  }

  // Si payments está vacío pero data.paymentMethods o data.byMethod viene poblado (ej. desde cierre o resumen)
  if (payments.length === 0 && (Array.isArray(data.paymentMethods) || Array.isArray(data.byMethod))) {
    const list = Array.isArray(data.paymentMethods) ? data.paymentMethods : data.byMethod;
    for (const m of list) {
      const name = m.payment_method || m.method || m.paymentMethod;
      if (!name) continue;
      const curr = reportPaymentCurrency(name);
      let net = 0;
      if (curr === 'COP') net = parseFloat(m.total_cop ?? m.amountCOP) || (parseFloat(m.amountUSD ?? m.total_usd) ? parseFloat(m.amountUSD ?? m.total_usd) * copRateGlobal : 0);
      else if (curr === 'Bs') net = parseFloat(m.total_bs ?? m.amountBs) || (parseFloat(m.amountUSD ?? m.total_usd) && bsRateGlobal > 0 ? (parseFloat(m.amountUSD ?? m.total_usd) * copRateGlobal) / bsRateGlobal : 0);
      else net = parseFloat(m.total_usd ?? m.amountUSD) || 0;

      let totals = methodTotals.get(name);
      if (!totals) {
        totals = { currency: curr, incomeNative: net, changeNative: 0, netNative: net, netUSD: parseFloat(m.total_usd ?? m.amountUSD) || 0, count: parseInt(m.count, 10) || 1 };
        methodTotals.set(name, totals);
      } else {
        totals.incomeNative = net;
        totals.netNative = net;
        totals.count = parseInt(m.count, 10) || 1;
      }
    }
  }

  // Calcular netNative y netUSD para cada método
  for (const [, totals] of methodTotals) {
    totals.netNative = totals.incomeNative - totals.changeNative;
    if (totals.currency === 'USD') totals.netUSD = totals.netNative;
    else if (totals.currency === 'COP') totals.netUSD = totals.netNative / copRateGlobal;
    else if (totals.currency === 'Bs') totals.netUSD = copRateGlobal > 0 ? (totals.netNative * bsRateGlobal) / copRateGlobal : 0;
  }

  // 2. CIERRE: Efectivo que debe haber en gaveta física
  const openedUSD = Number(data.openedUSD ?? data.apertura?.usdCash ?? 0);
  const openedCOP = Number(data.openedCOP ?? data.apertura?.copCash ?? 0);

  let expectedUSD = (data.expectedUSD !== undefined && data.expectedUSD !== null) ? Number(data.expectedUSD) : null;
  let expectedCOP = (data.expectedCOP !== undefined && data.expectedCOP !== null) ? Number(data.expectedCOP) : null;

  if (expectedUSD === null || expectedCOP === null) {
    const manualCashTx = (data.transactions || []).filter((t) =>
      !t.orderId && !t.order_id && ['Efectivo USD', 'Efectivo COP'].includes(t.paymentMethod || t.payment_method)
    );
    const manualIngUSD = manualCashTx.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + (Number(t.amountUSD ?? t.amount_usd) || 0), 0);
    const manualIngCOP = manualCashTx.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + (Number(t.amountCOP ?? t.amount_cop) || 0), 0);
    const manualEgUSD = manualCashTx.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + (Number(t.amountUSD ?? t.amount_usd) || 0), 0);
    const manualEgCOP = manualCashTx.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + (Number(t.amountCOP ?? t.amount_cop) || 0), 0);

    const netCashUSD = methodTotals.get('Efectivo USD')?.netNative || 0;
    const netCashCOP = methodTotals.get('Efectivo COP')?.netNative || 0;

    if (expectedUSD === null) expectedUSD = openedUSD + netCashUSD + manualIngUSD - manualEgUSD;
    if (expectedCOP === null) expectedCOP = openedCOP + netCashCOP + manualIngCOP - manualEgCOP;
  }

  lines.push('\x1Ba\x01', '\x1BE\x01', 'CIERRE', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('MONEDA', 'MONTO'));
  lines.push(formatTwoColumns('USD', `${expectedUSD.toFixed(2)}$`));
  lines.push(formatTwoColumns('COP', `${Math.round(expectedCOP).toLocaleString('en-US')}COP`));
  lines.push(divider('-'));

  // 3. FONDO: Apertura de caja
  lines.push('\x1Ba\x01', '\x1BE\x01', 'FONDO', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('MONEDA', 'MONTO'));
  lines.push(formatTwoColumns('USD', `${openedUSD.toFixed(2)}$`));
  lines.push(formatTwoColumns('COP', `${Math.round(openedCOP).toLocaleString('en-US')}COP`));
  lines.push(divider('-'));

  // 4. VENTA: Desglose por tipo de pago (100% idéntico a Sección 3 del reporte digital)
  lines.push('\x1Ba\x01', '\x1BE\x01', 'VENTA', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('MONEDA', 'MONTO'));

  const activeMethods = Array.from(methodTotals.entries()).filter(
    ([, totals]) => totals.count > 0 || totals.netNative !== 0
  );

  if (activeMethods.length === 0) {
    lines.push(formatTwoColumns('SIN VENTAS', '0.00$'));
  } else {
    for (const [method, totals] of activeMethods) {
      let label = method.toUpperCase();
      let montoStr = '';
      if (['EFECTIVO COP', 'COP'].includes(label)) {
        label = 'COP';
        montoStr = `${Math.round(totals.netNative).toLocaleString('en-US')}COP`;
      } else if (['EFECTIVO USD', 'USD'].includes(label)) {
        label = 'USD';
        montoStr = `${totals.netNative.toFixed(2)}$`;
      } else if (label.includes('BANCOLOMBIA')) {
        label = 'BANCOLOM';
        montoStr = `${Math.round(totals.netNative).toLocaleString('en-US')}COP`;
      } else if (label.includes('BINANCE COP')) {
        label = 'BINANCE COP';
        montoStr = `${Math.round(totals.netNative).toLocaleString('en-US')}COP`;
      } else if (label.includes('BINANCE')) {
        label = 'BINANCE';
        montoStr = `${totals.netNative.toFixed(2)}$`;
      } else if (label.includes('ZELLE')) {
        label = 'ZELLE';
        montoStr = `${totals.netNative.toFixed(2)}$`;
      } else if (label.includes('NEQUI')) {
        label = 'NEQUI';
        montoStr = `${Math.round(totals.netNative).toLocaleString('en-US')}COP`;
      } else if (['PAGO MOVIL', 'PAGO MÓVIL'].includes(label)) {
        label = 'PGO MOVIL';
        montoStr = `${totals.netNative.toFixed(2)}BS`;
      } else if (['TARJETA DE DEBITO', 'TARJETA DE DÉBITO'].includes(label)) {
        label = 'PTO VENTA (DEB)';
        montoStr = `${totals.netNative.toFixed(2)}BS`;
      } else if (['TARJETA DE CREDITO', 'TARJETA DE CRÉDITO'].includes(label)) {
        label = 'PTO VENTA (CRE)';
        montoStr = `${totals.netNative.toFixed(2)}BS`;
      } else {
        if (totals.currency === 'COP') montoStr = `${Math.round(totals.netNative).toLocaleString('en-US')}COP`;
        else if (totals.currency === 'Bs') montoStr = `${totals.netNative.toFixed(2)}BS`;
        else montoStr = `${totals.netNative.toFixed(2)}$`;
      }
      lines.push(formatTwoColumns(label, montoStr));
    }
  }
  lines.push(divider('-'));

  // 5. BOLIVARES: PTO VENTA y PGO MOVIL
  lines.push('\x1Ba\x01', '\x1BE\x01', 'BOLIVARES', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('TIPO', 'MONTO'));

  const debitoBs = methodTotals.get('Tarjeta de Débito')?.netNative || 0;
  const creditoBs = methodTotals.get('Tarjeta de Crédito')?.netNative || 0;
  const ptoVentaBs = debitoBs + creditoBs;
  const pagoMovilBs = methodTotals.get('Pago Móvil')?.netNative || 0;

  lines.push(formatTwoColumns('PTO VENTA', `${ptoVentaBs.toFixed(2)}BS`));
  lines.push(formatTwoColumns('PGO MOVIL', `${pagoMovilBs.toFixed(2)}BS`));
  lines.push(divider('-'));

  // 6. BANCOLOMBIA: Desglose individual por comanda
  lines.push('\x1Ba\x01', '\x1BE\x01', 'BANCOLOMBIA', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('COMANDA', 'MONTO'));
  const bancolombiaPayments = (data.payments || []).filter((pm) => (pm.paymentMethod || '').toLowerCase().includes('bancolombia'));
  if (bancolombiaPayments.length === 0) {
    lines.push(formatTwoColumns('SIN PAGOS', '0.00COP'));
  } else {
    for (const pm of bancolombiaPayments) {
      const ordNum = String(pm.orderNumber || '?').replace(/^#+/, '');
      const tenderCOP = Number(pm.cashTenderedCOP) || 0;
      const changeCOP = Number(pm.changeGivenCOP) || 0;
      const cRate = Number(pm.copRate) || copRateGlobal;
      const copAmount = tenderCOP > 0 ? (tenderCOP - changeCOP) : (Number(pm.amountPaidUSD || 0) * cRate);
      lines.push(formatTwoColumns(`#${ordNum}`, `${Math.round(copAmount).toLocaleString('en-US')}COP`));
    }
  }
  lines.push(divider('-'));

  // 7. ZELLE: Desglose individual por comanda
  lines.push('\x1Ba\x01', '\x1BE\x01', 'ZELLE', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('COMANDA', 'MONTO'));
  const zellePayments = (data.payments || []).filter((pm) => (pm.paymentMethod || '').toLowerCase().includes('zelle'));
  if (zellePayments.length === 0) {
    lines.push(formatTwoColumns('SIN PAGOS', '0.00$'));
  } else {
    for (const pm of zellePayments) {
      const ordNum = String(pm.orderNumber || '?').replace(/^#+/, '');
      const tenderUSD = Number(pm.cashTenderedUSD) || 0;
      const changeUSD = Number(pm.changeGivenUSD) || 0;
      const usdAmount = tenderUSD > 0 ? (tenderUSD - changeUSD) : Number(pm.amountPaidUSD || 0);
      lines.push(formatTwoColumns(`#${ordNum}`, `${usdAmount.toFixed(2)}$`));
    }
  }
  lines.push(divider('-'));

  // 8. BINANCE: Desglose individual por comanda
  lines.push('\x1Ba\x01', '\x1BE\x01', 'BINANCE', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('COMANDA', 'MONTO'));
  const binancePayments = (data.payments || []).filter((pm) => (pm.paymentMethod || '').toLowerCase().includes('binance'));
  if (binancePayments.length === 0) {
    lines.push(formatTwoColumns('SIN PAGOS', '0.00$'));
  } else {
    for (const pm of binancePayments) {
      const ordNum = String(pm.orderNumber || '?').replace(/^#+/, '');
      const isCOP = (pm.paymentMethod || '').toLowerCase().includes('cop');
      if (isCOP) {
        const tenderCOP = Number(pm.cashTenderedCOP) || 0;
        const changeCOP = Number(pm.changeGivenCOP) || 0;
        const cRate = Number(pm.copRate) || copRateGlobal;
        const copAmount = tenderCOP > 0 ? (tenderCOP - changeCOP) : (Number(pm.amountPaidUSD || 0) * cRate);
        lines.push(formatTwoColumns(`#${ordNum}`, `${Math.round(copAmount).toLocaleString('en-US')}COP`));
      } else {
        const tenderUSD = Number(pm.cashTenderedUSD) || 0;
        const changeUSD = Number(pm.changeGivenUSD) || 0;
        const usdAmount = tenderUSD > 0 ? (tenderUSD - changeUSD) : Number(pm.amountPaidUSD || 0);
        lines.push(formatTwoColumns(`#${ordNum}`, `${usdAmount.toFixed(2)}$`));
      }
    }
  }
  lines.push(divider('-'));

  // 9. CREDITOS: Deudores
  lines.push('\x1Ba\x01', '\x1BE\x01', 'CREDITOS', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatTwoColumns('DEUDOR', 'MONTO'));
  const creditOrders = (Array.isArray(data.creditOrders) && data.creditOrders.length > 0)
    ? data.creditOrders
    : (data.orders || []).filter((o) => o.paymentStatus === 'credito');
  if (creditOrders.length === 0) {
    if (Number(data.creditsUSD) > 0) {
      lines.push(formatTwoColumns('CREDITOS TURNO', `${Number(data.creditsUSD).toFixed(2)}$`));
    } else {
      lines.push(formatTwoColumns('SIN CREDITOS', '0.00$'));
    }
  } else {
    for (const ord of creditOrders) {
      const deudor = printableText(ord.customerName || `Comanda #${ord.orderNumber}`).toUpperCase().substring(0, 16);
      const monto = Number(ord.totalUSD || 0);
      lines.push(formatTwoColumns(deudor, `${monto.toFixed(2)}$`));
    }
  }
  lines.push(divider('-'));

  // 10. CLASIFICACIÓN DE ITEMS FACTURADOS:
  // Categorías: COMIDAS, BEBIDAS, DELIVERYS, OTRO
  const comidasGroup = new Map();
  const bebidasGroup = new Map();
  const deliverysGroup = new Map();
  const otroGroup = new Map();

  let totalItemsUSD = 0;

  for (const item of (data.items || [])) {
    const ordCopRate = Number(item.copRate) || Number(data.exchangeRates?.COP) || copRateGlobal;
    const rawCat = (item.category || '').toLowerCase();
    const rawName = (item.productName || item.name || '').trim();
    const itQty = Number(item.quantity) || 1;
    const rawPrice = Number(item.price) || 0;

    // Extraer adicionales pagos de este item
    const extrasList = [];
    if (Array.isArray(item.extras)) extrasList.push(...item.extras);
    else if (item.extrasJson && Array.isArray(item.extrasJson)) extrasList.push(...item.extrasJson);
    else if (typeof item.extrasJson === 'string') {
      try {
        const parsed = JSON.parse(item.extrasJson);
        if (Array.isArray(parsed)) extrasList.push(...parsed);
      } catch (e) {}
    }

    let paidExtrasCostUSD = 0;
    for (const ex of extrasList) {
      const rawExPrice = Number(ex.price) || 0;
      const exQty = Number(ex.quantity) || 1;
      const rawName = (ex.name || 'Adicional').trim();
      const cleanBaseName = rawName.replace(/^\d+x\s*/i, '').trim().toUpperCase();
      if (rawExPrice > 0) {
        let exUSD = Number(ex.priceUSD);
        if (isNaN(exUSD) || exUSD === 0) {
          exUSD = rawExPrice >= 100 ? (ordCopRate > 0 ? rawExPrice / ordCopRate : 0) : rawExPrice;
        }
        paidExtrasCostUSD += exUSD;
        const extraKey = `ADD ${cleanBaseName}`;
        const currExtra = otroGroup.get(extraKey) || { name: extraKey, quantity: 0, totalUSD: 0 };
        currExtra.quantity += itQty * exQty;
        currExtra.totalUSD += exUSD * itQty;
        otroGroup.set(extraKey, currExtra);
        totalItemsUSD += exUSD * itQty;
      }
    }

    let itPriceUSD = Number(item.priceUSD);
    if (isNaN(itPriceUSD) || itPriceUSD === 0) {
      itPriceUSD = rawPrice >= 100 ? (ordCopRate > 0 ? rawPrice / ordCopRate : 0) : rawPrice;
    }

    const baseUnitPrice = Math.max(0, itPriceUSD - paidExtrasCostUSD);
    const itemTotalUSD = baseUnitPrice * itQty;
    totalItemsUSD += itemTotalUSD;

    const baseName = getReportBaseProductName(item).toUpperCase();
    const nameLower = rawName.toLowerCase();

    const isDrink = rawCat.includes('bebida') || rawCat.includes('drink') || rawCat.includes('refresco') || rawCat.includes('jugo') || rawCat.includes('licor') || rawCat.includes('cerveza') || rawCat.includes('agua') || !!item.drinkType || !!item.flavor || nameLower.includes('nestea') || nameLower.includes('refresco') || nameLower.includes('lipton') || nameLower.includes('pet') || nameLower.includes('yukery') || nameLower.includes('agua') || nameLower.includes('cerveza') || nameLower.includes('soda') || nameLower.includes('gatorade') || nameLower.includes('granizado');

    const isDelivery = rawCat.includes('delivery') || nameLower.includes('delivery');

    const isComida = rawCat.includes('hot dog') || rawCat.includes('perro') || rawCat.includes('mugrosito') || rawCat.includes('burger') || rawCat.includes('hamburguesa') || rawCat.includes('comida') || rawCat.includes('plato') || rawCat.includes('entrada') || rawCat.includes('acompañante') || rawCat.includes('combo') || (!isDrink && !isDelivery && !rawCat.includes('adicional') && !rawCat.includes('extra') && !rawCat.includes('topping'));

    if (isDelivery) {
      const curr = deliverysGroup.get(baseName) || { name: baseName, quantity: 0, totalUSD: 0 };
      curr.quantity += itQty;
      curr.totalUSD += itemTotalUSD;
      deliverysGroup.set(baseName, curr);
    } else if (isDrink) {
      const curr = bebidasGroup.get(baseName) || { name: baseName, quantity: 0, totalUSD: 0 };
      curr.quantity += itQty;
      curr.totalUSD += itemTotalUSD;
      bebidasGroup.set(baseName, curr);
    } else if (isComida) {
      const curr = comidasGroup.get(baseName) || { name: baseName, quantity: 0, totalUSD: 0 };
      curr.quantity += itQty;
      curr.totalUSD += itemTotalUSD;
      comidasGroup.set(baseName, curr);
    } else {
      const curr = otroGroup.get(baseName) || { name: baseName, quantity: 0, totalUSD: 0 };
      curr.quantity += itQty;
      curr.totalUSD += itemTotalUSD;
      otroGroup.set(baseName, curr);
    }
  }

  for (const ord of (data.orders || [])) {
    const ordCopRate = Number(ord.copRateAtPayment) || Number(data.exchangeRates?.COP) || copRateGlobal;
    let feeUSD = Number(ord.deliveryFeeUSD || ord.delivery_fee_usd || 0);
    const feeCOP = Number(ord.deliveryFeeCOP || ord.delivery_fee_cop || 0);
    if (feeCOP > 0 && (feeUSD === 0 || feeUSD >= 100)) {
      feeUSD = ordCopRate > 0 ? feeCOP / ordCopRate : 0;
    } else if (feeUSD >= 100) {
      feeUSD = ordCopRate > 0 ? feeUSD / ordCopRate : 0;
    }

    if (feeUSD > 0 || feeCOP > 0 || ord.type === 'delivery') {
      const delName = 'DELIVERY';
      const curr = deliverysGroup.get(delName) || { name: delName, quantity: 0, totalUSD: 0 };
      curr.quantity += 1;
      curr.totalUSD += feeUSD;
      deliverysGroup.set(delName, curr);
      totalItemsUSD += feeUSD;
    }
  }

  // 10.1 COMIDAS
  lines.push('\x1Ba\x01', '\x1BE\x01', 'COMIDAS', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatThreeColumns('ITEM', 'CANT', 'MONTO'));
  if (comidasGroup.size === 0) {
    lines.push(formatThreeColumns('SIN COMIDAS', '0', '$0.00'));
  } else {
    for (const it of comidasGroup.values()) {
      lines.push(formatThreeColumns(it.name, String(it.quantity), `$${it.totalUSD.toFixed(2)}`));
    }
  }
  lines.push(divider('-'));

  // 10.2 BEBIDAS
  lines.push('\x1Ba\x01', '\x1BE\x01', 'BEBIDAS', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatThreeColumns('ITEM', 'CANT', 'MONTO'));
  if (bebidasGroup.size === 0) {
    lines.push(formatThreeColumns('SIN BEBIDAS', '0', '$0.00'));
  } else {
    for (const it of bebidasGroup.values()) {
      lines.push(formatThreeColumns(it.name, String(it.quantity), `$${it.totalUSD.toFixed(2)}`));
    }
  }
  lines.push(divider('-'));

  // 10.3 DELIVERYS
  lines.push('\x1Ba\x01', '\x1BE\x01', 'DELIVERYS', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatThreeColumns('ITEM', 'CANT', 'MONTO'));
  if (deliverysGroup.size === 0) {
    lines.push(formatThreeColumns('SIN DELIVERYS', '0', '$0.00'));
  } else {
    for (const it of deliverysGroup.values()) {
      lines.push(formatThreeColumns(it.name, String(it.quantity), `$${it.totalUSD.toFixed(2)}`));
    }
  }
  lines.push(divider('-'));

  // 10.4 OTRO
  lines.push('\x1Ba\x01', '\x1BE\x01', 'OTRO', '\x1BE\x00', '\x1Ba\x00');
  lines.push(formatThreeColumns('ITEM', 'CANT', 'MONTO'));
  if (otroGroup.size === 0) {
    lines.push(formatThreeColumns('SIN OTROS', '0', '$0.00'));
  } else {
    for (const it of otroGroup.values()) {
      lines.push(formatThreeColumns(it.name, String(it.quantity), `$${it.totalUSD.toFixed(2)}`));
    }
  }
  lines.push(divider('='));

  // TOTAL GENERAL ITEMS
  lines.push('\x1BE\x01');
  lines.push(formatTwoColumns('TOTAL GENERAL:', `$${totalItemsUSD.toFixed(2)} USD`));
  lines.push('\x1BE\x00');
  lines.push(divider('='));

  // Pie de ticket
  lines.push('\x1Ba\x01');
  lines.push('TURNO CERRADO EXITOSAMENTE');
  lines.push('MUGROSITO POS');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function buildMugrositoCierreTicket(data) {
  return buildCrispysCierreTicket(data);
}

function buildCierreShiftTicket(data) {
  return buildCrispysCierreTicket(data);
}

async function printReportTicket(reportType, data, targetPrinter = 'caja') {
  const payload = buildReportTicket(reportType, data);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

async function printCierreShiftTicket(cierreData, targetPrinter = 'caja') {
  const payload = buildCierreShiftTicket(cierreData);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

module.exports = {
  LINE_WIDTH,
  PRINT_FORMAT_SETUP,
  KITCHEN_LINE_WIDTH,
  KITCHEN_FORMAT_SETUP,
  isKitchenItem,
  isSalsaItem,
  buildKitchenTicket,
  buildKitchenAdditionTicket,
  buildReceiptTicket,
  buildReportTicket,
  buildCrispysCierreTicket,
  buildMugrositoCierreTicket,
  buildCierreShiftTicket,
  loadDualPrinterConfig,
  saveDualPrinterConfig,
  loadPrinterConfig,
  printKitchenTicket,
  printKitchenAdditionTicket,
  printReceiptTicket,
  printReportTicket,
  printCierreShiftTicket,
  printTestTicket,
  sendRawTicket,
  sendRawTicketToTarget,
};