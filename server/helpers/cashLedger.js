const { paymentHistoryTotals } = require('./paymentLedger');

function paymentCurrency(paymentMethod) {
  if (['Efectivo COP', 'Bancolombia', 'Nequi'].includes(paymentMethod)) return 'COP';
  if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(paymentMethod)) return 'Bs';
  return 'USD';
}

function paymentMovementAmounts(payment) {
  let incomeUSD = Number(payment.cash_tendered_usd) || 0;
  let incomeCOP = Number(payment.cash_tendered_cop) || 0;
  let incomeBs = Number(payment.cash_tendered_bs) || 0;
  const amountPaidUSD = Number(payment.amount_paid_usd) || 0;

  // Compatibilidad con movimientos antiguos que no guardaron el efectivo recibido.
  if (incomeUSD === 0 && incomeCOP === 0 && incomeBs === 0 && amountPaidUSD > 0) {
    const currency = paymentCurrency(payment.payment_method);
    const copR = Number(payment.cop_rate) || 3100;
    const bsR = Number(payment.bs_rate) || 3.2;
    if (currency === 'USD') incomeUSD = amountPaidUSD;
    if (currency === 'COP') incomeCOP = amountPaidUSD * copR;
    if (currency === 'Bs') incomeBs = bsR > 0 ? (amountPaidUSD * copR) / bsR : 0;
  }

  return {
    paymentMethod: payment.payment_method,
    incomeUSD,
    incomeCOP,
    incomeBs,
    changeUSD: Number(payment.change_given_usd) || 0,
    changeCOP: Number(payment.change_given_cop) || 0,
    changeBs: Number(payment.change_given_bs) || 0,
  };
}

async function insertCashMovement(client, { id, orderId, shift, type, amountUSD, amountCOP, amountBs, paymentMethod, description }) {
  if (amountUSD <= 0 && amountCOP <= 0 && amountBs <= 0) return false;

  const { rows: existingRows } = await client.query(
    `SELECT 1 FROM caja_chica_transactions
     WHERE order_id = $1 AND type = $2 AND description LIKE $3
     LIMIT 1`,
    [orderId, type, `%[${id}]%`]
  );
  if (existingRows.length > 0) return false;

  await client.query(
    `INSERT INTO caja_chica_transactions
      (id, type, amount_usd, amount_cop, amount_bs, payment_method, description, order_id, shift)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      `cash-${type}-${id}`,
      type,
      amountUSD,
      amountCOP,
      amountBs,
      paymentMethod,
      description,
      orderId,
      shift,
    ]
  );
  return true;
}

async function postCompletedOrderCashMovements(client, orderId) {
  const { rows: orderRows } = await client.query(
    `SELECT id, order_number, status, payment_status, total_usd, shift
     FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId]
  );
  const order = orderRows[0];
  if (!order) return { eligible: false, posted: false };

  const { rows: payments } = await client.query(
    `SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at ASC`,
    [orderId]
  );
  const totals = paymentHistoryTotals(payments);
  const totalUSD = Number(order.total_usd) || 0;
  const pendingDebtUSD = Math.max(0, totalUSD - totals.paidUSD);
  const pendingChangeUSD = Math.max(0, totals.tenderedUSD - totalUSD - totals.changeGivenUSD);
  const hasCopPayment = payments.some((p) => Number(p.cash_tendered_cop) > 0 || Number(p.change_given_cop) > 0);
  const copRateFinalize = Number(order.cop_rate_at_payment) || 3100;
  const copToleranceUSD = (hasCopPayment && copRateFinalize > 0) ? (1000 / copRateFinalize) : 0.05;
  const maxToleranceUSD = Math.max(0.05, copToleranceUSD);

  const isPaid = order.payment_status === 'pagado' || (pendingDebtUSD <= maxToleranceUSD && pendingChangeUSD <= maxToleranceUSD);
  const isNotCancelled = order.status !== 'cancelado' && order.status !== 'fusionada';
  const eligible = isPaid && isNotCancelled;

  if (!eligible) {
    const deletion = await client.query(
      `DELETE FROM caja_chica_transactions
       WHERE order_id = $1
         AND (description LIKE 'Cobro de comanda finalizada %' OR description LIKE 'Vuelto de comanda finalizada %')`,
      [orderId]
    );
    return { eligible: false, posted: false, removed: deletion.rowCount > 0 };
  }

  let posted = false;
  for (const payment of payments) {
    const amounts = paymentMovementAmounts(payment);

    posted = (await insertCashMovement(client, {
      id: payment.id,
      orderId,
      shift: order.shift || 'ambos',
      type: 'ingreso',
      amountUSD: amounts.incomeUSD,
      amountCOP: amounts.incomeCOP,
      amountBs: amounts.incomeBs,
      paymentMethod: amounts.paymentMethod,
      description: `Cobro de comanda finalizada ${order.order_number} [${payment.id}]`,
    })) || posted;

    posted = (await insertCashMovement(client, {
      id: payment.id,
      orderId,
      shift: order.shift || 'ambos',
      type: 'egreso',
      amountUSD: amounts.changeUSD,
      amountCOP: amounts.changeCOP,
      amountBs: amounts.changeBs,
      paymentMethod: amounts.paymentMethod,
      description: `Vuelto de comanda finalizada ${order.order_number} [${payment.id}]`,
    })) || posted;
  }

  return { eligible: true, posted, removed: false };
}

module.exports = { paymentMovementAmounts, postCompletedOrderCashMovements };