/**
 * Redondeo Comercial Contable para Mugrosito POS Backend (Tarea 13)
 */

function roundCOPPayment(amountCOP) {
  const num = Math.round(Number(amountCOP) * 100) / 100;
  if (!num || num <= 0 || isNaN(num)) return 0;
  const thousands = Math.floor(num / 1000) * 1000;
  const remainder = num - thousands;

  // Tolerancia de 10 COP en los múltiplos de 1000 para absorber ruido de conversión a 2 decimales en USD (ej. 42005 -> 42000)
  if (remainder <= 10) return thousands;
  if (remainder >= 990) return thousands + 1000;
  if (remainder <= 500) return thousands + 500;
  return thousands + 1000;
}

function roundCOP(amountCOP) {
  return roundCOPPayment(amountCOP);
}

function roundBs(amountBs) {
  const num = parseFloat(amountBs);
  if (!num || num <= 0 || isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

function roundUSD(amountUSD) {
  const num = parseFloat(amountUSD);
  if (!num || num <= 0 || isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

module.exports = {
  roundCOP,
  roundCOPPayment,
  roundBs,
  roundUSD,
};
