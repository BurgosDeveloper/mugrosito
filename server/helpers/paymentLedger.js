const PAYMENT_METHODS_BY_CURRENCY = {
  USD: ['Efectivo USD', 'Binance', 'Zelle'],
  COP: ['Efectivo COP', 'Bancolombia', 'Nequi'],
  Bs: ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'],
};

function isValidPaymentMethod(currency, paymentMethod) {
  return PAYMENT_METHODS_BY_CURRENCY[currency]?.includes(paymentMethod) || false;
}

const { roundCOPPayment } = require('./currencyRounding');

function toUsd(amountLocal, currency, copRate, bsRate) {
  const amount = Number(amountLocal) || 0;
  if (currency === 'COP') return (copRate && copRate > 0) ? amount / copRate : 0;
  if (currency === 'Bs') {
    // Tasa frontera: 1 Bs = bsRate COP. Convertir a COP y luego a USD
    if (bsRate && bsRate > 0 && copRate && copRate > 0) {
      return (amount * bsRate) / copRate;
    }
    return 0;
  }
  return amount;
}

function toCop(amountLocal, currency, copRate, bsRate) {
  const amount = Number(amountLocal) || 0;
  if (currency === 'COP') return amount;
  if (currency === 'USD') return (copRate && copRate > 0) ? amount * copRate : 0;
  if (currency === 'Bs') return (bsRate && bsRate > 0) ? amount * bsRate : 0;
  return amount;
}

function toBs(amountLocal, currency, copRate, bsRate) {
  const amount = Number(amountLocal) || 0;
  if (currency === 'Bs') return amount;
  const cop = toCop(amountLocal, currency, copRate, bsRate);
  return (bsRate && bsRate > 0) ? cop / bsRate : 0;
}

function paymentAmounts(amountLocal, currency) {
  const amount = Number(amountLocal) || 0;
  return {
    cashTenderedUSD: currency === 'USD' ? amount : 0,
    cashTenderedCOP: currency === 'COP' ? amount : 0,
    cashTenderedBs: currency === 'Bs' ? amount : 0,
  };
}

function changeAmounts(amountLocal, currency) {
  const amount = Number(amountLocal) || 0;
  return {
    changeGivenUSD: currency === 'USD' ? amount : 0,
    changeGivenCOP: currency === 'COP' ? amount : 0,
    changeGivenBs: currency === 'Bs' ? amount : 0,
  };
}

function paymentHistoryTotals(payments) {
  return payments.reduce((totals, payment) => {
    const copRate = Number(payment.cop_rate) || 3100;
    const bsRate = Number(payment.bs_rate) || 3.2;
    const paidUSD = Number(payment.amount_paid_usd) || 0;
    totals.paidUSD += paidUSD;

    let tenderedUSD = Number(payment.cash_tendered_usd) || 0;
    const cashCOP = Number(payment.cash_tendered_cop) || 0;
    const cashBs = Number(payment.cash_tendered_bs) || 0;

    if (cashCOP > 0) {
      if (paidUSD > 0 && copRate > 0) {
        // En cobros COP se redondea según regla comercial (paso de 500 COP)
        const requiredCOP = roundCOPPayment(paidUSD * copRate);
        const excessCOP = Math.max(0, cashCOP - requiredCOP);
        tenderedUSD += paidUSD + (excessCOP / copRate);
      } else if (copRate > 0) {
        tenderedUSD += cashCOP / copRate;
      }
    }
    if (cashBs > 0 && bsRate > 0 && copRate > 0) {
      tenderedUSD += (cashBs * bsRate) / copRate;
    }
    totals.tenderedUSD += tenderedUSD;

    totals.changeGivenUSD +=
      (Number(payment.change_given_usd) || 0) +
      (copRate > 0 ? (Number(payment.change_given_cop) || 0) / copRate : 0) +
      (bsRate > 0 && copRate > 0 ? ((Number(payment.change_given_bs) || 0) * bsRate) / copRate : 0);
    return totals;
  }, { paidUSD: 0, tenderedUSD: 0, changeGivenUSD: 0 });
}

module.exports = {
  PAYMENT_METHODS_BY_CURRENCY,
  isValidPaymentMethod,
  toUsd,
  toCop,
  toBs,
  paymentAmounts,
  changeAmounts,
  paymentHistoryTotals,
};
