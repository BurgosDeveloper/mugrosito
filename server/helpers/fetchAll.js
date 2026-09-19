const { query } = require('../db');

function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val !== 'string') return Array.isArray(val) ? val : fallback;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeJsonParseObj(val) {
  if (!val || val === 'null') return undefined;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val !== 'string') return undefined;
  try {
    const parsed = JSON.parse(val);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : undefined;
  } catch (e) {
    return undefined;
  }
}

function normalizeImageUrl(url) {
  if (!url) return '';
  if (typeof url === 'string' && url.includes('/uploads/')) {
    const filename = url.split('/uploads/')[1];
    return `/uploads/${filename}`;
  }
  return url;
}

async function fetchAllOrders() {
  const { rows: orders } = await query(`SELECT * FROM orders WHERE archived_at IS NULL ORDER BY created_at DESC`);
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return [];

  const { rows: items } = await query(
    `SELECT oi.*, p.default_proteins 
     FROM order_items oi 
     LEFT JOIN products p ON (oi.product_id = p.id OR LOWER(oi.product_name) = LOWER(p.name))
     WHERE oi.order_id = ANY($1::text[])`,
    [orderIds]
  );
  const { rows: payments } = await query(`SELECT * FROM order_payments WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC`, [orderIds]);

  return orders.map((ord) => ({
    id: ord.id,
    orderNumber: ord.order_number,
    type: ord.type,
    tableNumber: ord.table_number,
    customerName: ord.customer_name,
    status: ord.status,
    paymentStatus: ord.payment_status,
    paymentMethod: ord.payment_method,
    totalUSD: parseFloat(ord.total_usd) || 0,
    totalCOP: parseFloat(ord.total_cop) || (parseFloat(ord.total_usd) > 0 ? Math.round(parseFloat(ord.total_usd) * (parseFloat(ord.cop_rate_at_payment) || 3100)) : 0),
    paidAmountUSD: parseFloat(ord.paid_amount_usd) || (ord.payment_status === 'pagado' || ord.payment_status === 'credito' ? parseFloat(ord.total_usd) : 0),
    copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || 3100,
    bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || 3.2,
    waiterName: ord.waiter_name || 'Mesero',
    kitchenNotes: ord.kitchen_notes,
    notes: ord.notes || undefined,
    isEdited: !!ord.is_edited,
    mergedFromOrders: ord.merged_from_orders || [],
    deliveryFeeUSD: parseFloat(ord.delivery_fee_usd) || 0,
    deliveryFeeCOP: parseFloat(ord.delivery_fee_cop) || (parseFloat(ord.delivery_fee_usd) > 0 ? (parseFloat(ord.delivery_fee_usd) >= 100 ? parseFloat(ord.delivery_fee_usd) : Math.round(parseFloat(ord.delivery_fee_usd) * (parseFloat(ord.cop_rate_at_payment) || 3100))) : 0),
    shift: 'ambos',
    createdAt: ord.created_at,
    paymentHistory: payments
      .filter((pm) => pm.order_id === ord.id)
      .map((pm) => ({
        id: pm.id,
        orderId: pm.order_id,
        payerName: pm.payer_name || 'Cliente General',
        paymentMethod: pm.payment_method,
        method: pm.payment_method,
        entryType: (parseFloat(pm.change_given_usd || 0) > 0 || parseFloat(pm.change_given_cop || 0) > 0 || parseFloat(pm.change_given_bs || 0) > 0) ? 'change' : 'payment',
        currency: (parseFloat(pm.cash_tendered_cop || 0) > 0 || parseFloat(pm.change_given_cop || 0) > 0 || (pm.payment_method && (pm.payment_method.includes('COP') || pm.payment_method.includes('Bancolombia') || pm.payment_method.includes('Nequi'))))
          ? 'COP'
          : (parseFloat(pm.cash_tendered_bs || 0) > 0 || parseFloat(pm.change_given_bs || 0) > 0 || (pm.payment_method && (pm.payment_method.includes('Bs') || pm.payment_method.includes('Movil') || pm.payment_method.includes('Debito') || pm.payment_method.includes('Tarjeta de Crédito'))))
          ? 'Bs'
          : 'USD',
        amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
        cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
        cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
        cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
        changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
        changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
        changeGivenBs: parseFloat(pm.change_given_bs) || 0,
        copRate: parseFloat(pm.cop_rate) || 3100,
        bsRate: parseFloat(pm.bs_rate) || 3.2,
        itemIds: pm.item_ids || [],
        createdAt: pm.created_at,
      })),
    items: items
      .filter((it) => it.order_id === ord.id)
      .map((it) => ({
        id: it.id,
        productId: it.product_id,
        productName: it.product_name,
        price: parseFloat(it.price) || 0,
        quantity: it.quantity,
        size: it.size || 'Estándar',
        isHalfHalf: !!it.is_half_half,
        halfDetails: safeJsonParseObj(it.half_details),
        removedIngredients: it.removed_ingredients || [],
        proteins: it.proteins || [],
        defaultProteins: it.default_proteins || [],
        extras: safeJsonParse(it.extras_json),
        sugarPreference: it.sugar_preference || undefined,
        drinkType: it.drink_type || undefined,
        category: it.category || undefined,
        isTakeaway: !!it.is_takeaway,
        isDelivery: !!it.is_delivery,
        isCut: !!it.is_cut,
        cutPreference: it.cut_preference || (it.is_cut ? 'Picada' : 'Entera'),
        isNewOrModified: !!it.is_new_or_modified,
        isPaidIndividually: !!it.is_paid_individually,
        paidByName: it.paid_by_name || undefined,
        flavor: it.flavor || undefined,
        notes: it.notes || '',
      })),
  }));
}

async function fetchAllProducts() {
  const { rows } = await query(`SELECT * FROM products ORDER BY name ASC`);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category || 'Hot Dogs',
    drinkType: p.drink_type || undefined,
    price: parseFloat(p.price) || 0,
    priceSmall: p.price_small ? parseFloat(p.price_small) : undefined,
    description: p.description || '',
    image: normalizeImageUrl(p.image),
    badge: p.badge || undefined,
    baseIngredients: p.base_ingredients || [],
    proteinCount: p.protein_count !== undefined && p.protein_count !== null ? Number(p.protein_count) : 1,
    defaultProteins: p.default_proteins || [],
    flavors: p.flavors || [],
    recipe: [],
    shift: 'ambos',
  }));
}

async function fetchAllIngredients() {
  const { rows } = await query(`SELECT * FROM ingredients ORDER BY name ASC`);
  return rows.map((i) => {
    const rawPriceUsd = parseFloat(i.price_usd) || 0;
    const ingType = i.ingredient_type || (i.category === 'Salsas' ? 'salsa' : (i.category === 'Gratis' ? 'gratis' : (i.category === 'Adicionales' ? 'adicional' : (i.is_base ? 'base' : 'adicional'))));
    return {
      id: i.id,
      name: i.name,
      ingredientType: ingType,
      priceUSD: rawPriceUsd,
      priceGrandeCompleta: rawPriceUsd,
      priceGrandeMitad: rawPriceUsd > 0 ? rawPriceUsd / 2 : 0,
      pricePequenaCompleta: rawPriceUsd,
      pricePequenaMitad: rawPriceUsd > 0 ? rawPriceUsd / 2 : 0,
      isBase: ingType === 'base' || ingType === 'proteina' || i.is_base !== false,
      isExtra: ingType === 'adicional' || ingType === 'gratis' || ingType === 'salsa' || i.is_extra !== false,
      isBaseForPizza: ingType === 'base' || ingType === 'proteina' || i.is_base !== false,
      isExtraForPizza: ingType === 'adicional' || ingType === 'gratis' || ingType === 'salsa' || i.is_extra !== false,
      category: i.category || (ingType === 'salsa' ? 'Salsas' : (ingType === 'gratis' ? 'Gratis' : (ingType === 'proteina' ? 'Proteínas' : (ingType === 'base' ? 'Ingredientes Base' : 'Adicionales')))),
      available: i.available !== false,
      shift: 'ambos',
    };
  });
}

async function fetchAllTables() {
  const { rows: tables } = await query(`SELECT * FROM tables_config ORDER BY number ASC`);

  let activeOccupiedTables = new Set();
  try {
    const { rows: activeOrders } = await query(
      `SELECT table_number FROM orders WHERE type = 'mesa' AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL`
    );
    activeOccupiedTables = new Set(activeOrders.map((o) => o.table_number).filter(Boolean));
  } catch (e) {}

  return tables.map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    capacity: t.capacity,
    status: activeOccupiedTables.has(t.number) ? 'ocupada' : 'libre',
    zone: t.zone,
  }));
}

module.exports = {
  safeJsonParse,
  safeJsonParseObj,
  normalizeImageUrl,
  fetchAllOrders,
  fetchAllProducts,
  fetchAllIngredients,
  fetchAllTables,
};
