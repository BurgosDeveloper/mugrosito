/**
 * Redondeo Comercial Contable para Mugrosito POS (Tarea 13)
 *
 * Reglas de Moneda:
 * - COP (Pesos Colombianos): En operaciones comerciales en efectivo no se manejan fracciones inferiores a mil pesos.
 *   Por lo tanto, los montos en COP se redondean al millar comercial superior (múltiplos de 1.000 COP).
 * - Bs (Bolívares Digitales / Físicos): Se redondean con precisión contable de 2 decimales.
 * - USD (Dólares Estadounidenses): Se calculan y redondean con 2 decimales.
 */

export function roundCOPPayment(amountCOP: number): number {
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

export function roundCOP(amountCOP: number): number {
  return roundCOPPayment(amountCOP);
}

export function roundBs(amountBs: number): number {
  if (!amountBs || amountBs <= 0 || isNaN(amountBs)) return 0;
  return Math.round(amountBs * 100) / 100;
}

export function roundUSD(amountUSD: number): number {
  if (!amountUSD || amountUSD <= 0 || isNaN(amountUSD)) return 0;
  return Math.round(amountUSD * 100) / 100;
}

export function formatCOP(amountCOP: number): string {
  const rounded = roundCOP(amountCOP);
  return rounded.toLocaleString('es-CO');
}

export function formatBs(amountBs: number): string {
  return roundBs(amountBs).toFixed(2);
}

export function formatUSD(amountUSD: number): string {
  return roundUSD(amountUSD).toFixed(2);
}
