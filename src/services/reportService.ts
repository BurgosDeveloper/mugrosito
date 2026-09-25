// Report Service - Generador de Reportes Auditables en PDF e Impresión Profesional para Mugrosito POS

import { Order, ExchangeRates, CajaChicaTransaction } from '../data/mockData';
import { roundCOP } from '../utils/currencyRounding';
import { isSalsaItem } from '../utils/productClassifier';

export interface ReporteIntervaloData {
  dateRange: { from: string; to: string };
  orders: any[];
  items: any[];
  payments: any[];
  transactions: any[];
  edits: any[];
  shiftCierres?: any[];
  exchangeRates: { COP: number; Bs: number };
}

export class ReportService {
  private openPrintWindow(title: string, htmlContent: string) {
    const printWin = window.open('', '_blank', 'width=450,height=700');
    if (!printWin) {
      alert('Por favor, permite las ventanas emergentes (pop-ups) para ver el reporte imprimible.');
      return;
    }

    const fullDoc = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${title} - Mugrosito POS</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
          @page {
            size: 80mm auto;
            margin: 3mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            margin: 0;
            padding: 0;
            width: 74mm;
            color: #111827;
            background: #ffffff;
            font-size: 9px;
          }
          .header {
            display: block;
            border-bottom: 2px solid #111827;
            padding-bottom: 7px;
            margin-bottom: 10px;
          }
          .logo-title {
            font-size: 15px;
            font-weight: 900;
            color: #070707;
            letter-spacing: 0;
          }
          .logo-sub {
            font-size: 8px;
            color: #374151;
            font-weight: 800;
            text-transform: uppercase;
          }
          .doc-meta {
            text-align: left;
            font-size: 10px;
            color: #374151;
            margin-top: 5px;
          }
          .section-title {
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0;
            color: #111827;
            margin-top: 14px;
            margin-bottom: 6px;
            padding-left: 6px;
            border-left: 3px solid #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-bottom: 10px;
            font-size: 10.5px;
            word-break: break-word;
          }
          th {
            background-color: #f3f4f6;
            color: #1f2937;
            font-weight: 900;
            text-transform: uppercase;
            font-size: 9.5px;
            padding: 5px 4px;
            text-align: left;
            border-bottom: 1.5px solid #6b7280;
          }
          td {
            padding: 5px 4px;
            border-bottom: 1px solid #e5e7eb;
            color: #1f2937;
            vertical-align: top;
          }
          .total-box {
            background-color: #ecfdf5;
            border: 1.5px solid #a7f3d0;
            border-radius: 4px;
            padding: 9px;
            display: block;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
          }
          .total-label {
            font-size: 10px;
            font-weight: 900;
            color: #065f46;
            text-transform: uppercase;
          }
          .total-val {
            font-size: 16px;
            font-weight: 900;
            color: #047857;
          }
          .no-print {
            position: fixed;
            bottom: 12px;
            right: 12px;
            background: #10b981;
            color: white;
            padding: 9px 12px;
            border: none;
            border-radius: 4px;
            font-weight: 900;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
          }
          @media print {
            .no-print { display: none; }
            body { width: 74mm; font-size: 10.5px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">🌭 MUGROSITO POS</div>
            <div class="logo-sub">Sistema de Gestión & Auditoría de Ventas</div>
          </div>
          <div class="doc-meta">
            <div><strong>REPORTE:</strong> ${title}</div>
            <div><strong>FECHA EMISIÓN:</strong> ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            <div><strong>HORA:</strong> ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        ${htmlContent}

        <button class="no-print" onclick="window.print()">🖨️ IMPRIMIR / GUARDAR EN PDF</button>
      </body>
      </html>
    `;

    printWin.document.write(fullDoc);
    printWin.document.close();
  }

  private reportDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  private escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[character] || character));
  }

  private paymentMethodLabel(method: string) {
    const labels: Record<string, string> = {
      'Efectivo USD': 'Divisas efectivo',
      Binance: 'Binance USD',
      Zelle: 'Zelle',
      'Efectivo COP': 'COP efectivo',
      Bancolombia: 'Bancolombia',
      Nequi: 'Nequi',
      'Binance COP': 'Binance COP',
      'Pago Móvil': 'Pago Móvil',
      'Tarjeta de Débito': 'Tarjeta Débito',
      'Tarjeta de Crédito': 'Tarjeta Crédito',
      Crédito: 'Crédito',
    };
    return labels[method] || method || 'Sin método';
  }

  private paymentCurrency(method: string): 'USD' | 'COP' | 'Bs' {
    if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(method)) return 'COP';
    if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(method)) return 'Bs';
    return 'USD';
  }

  private registeredPaymentAmounts(payment: ReporteIntervaloData['payments'][number]) {
    let usd = payment.cashTenderedUSD || 0;
    let cop = payment.cashTenderedCOP || 0;
    let bs = payment.cashTenderedBs || 0;
    const curr = this.paymentCurrency(payment.paymentMethod);
    const copR = payment.copRate || 3100;
    const bsR = payment.bsRate || 3.2;
    if (usd === 0 && cop === 0 && bs === 0 && payment.amountPaidUSD > 0) {
      if (curr === 'USD') usd = payment.amountPaidUSD;
      if (curr === 'COP') cop = payment.amountPaidUSD * copR;
      if (curr === 'Bs') bs = bsR > 0 ? (payment.amountPaidUSD * copR) / bsR : 0;
    }
    const nativeAmount = curr === 'USD' ? usd : curr === 'COP' ? cop : bs;
    return {
      currency: curr,
      nativeAmount,
      usd,
      cop,
      bs,
      equivalentUSD: usd + (cop / copR) + (bsR > 0 && copR > 0 ? (bs * bsR) / copR : 0),
    };
  }

  private registeredSaleAmounts(payment: ReporteIntervaloData['payments'][number]) {
    const paidUSD = Number(payment.amountPaidUSD) || 0;
    const curr = this.paymentCurrency(payment.paymentMethod);
    const tenderUSD = Number(payment.cashTenderedUSD) || 0;
    const tenderCOP = Number(payment.cashTenderedCOP) || 0;
    const tenderBs = Number(payment.cashTenderedBs) || 0;
    const changeUSD = Number(payment.changeGivenUSD) || 0;
    const changeCOP = Number(payment.changeGivenCOP) || 0;
    const changeBs = Number(payment.changeGivenBs) || 0;

    const copR = payment.copRate || 3100;
    const bsR = payment.bsRate || 3.2;

    let usd = 0;
    let cop = 0;
    let bs = 0;

    if (curr === 'USD') {
      usd = tenderUSD > 0 ? (tenderUSD - changeUSD) : paidUSD;
    } else if (curr === 'COP') {
      cop = tenderCOP > 0 ? (tenderCOP - changeCOP) : (paidUSD * copR);
    } else if (curr === 'Bs') {
      bs = tenderBs > 0 ? (tenderBs - changeBs) : (bsR > 0 ? (paidUSD * copR) / bsR : 0);
    }

    const nativeAmount = curr === 'USD' ? usd : curr === 'COP' ? cop : bs;
    return {
      currency: curr,
      nativeAmount,
      usd,
      cop,
      bs,
      equivalentUSD: paidUSD,
    };
  }

  private intervalTitle(data: ReporteIntervaloData) {
    return `Desde ${this.reportDate(data.dateRange.from)} hasta ${this.reportDate(data.dateRange.to)}`;
  }

  // Normaliza y unifica el nombre del producto base para reportes (agrupando todos los sabores de una bebida bajo su producto base)
  public getReportBaseProductName(it: any): string {
    let raw = (it.productName || it.name || 'Producto').trim();
    raw = raw.replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '').trim();

    if (it.flavor) {
      const escaped = String(it.flavor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      raw = raw.replace(new RegExp(`\\s*\\(${escaped}\\)\\s*$`, 'i'), '').trim();
    }

    const cat = (it.category || '').toLowerCase();
    const isDrink = cat.includes('bebida') || cat.includes('drink') || cat.includes('refresco') || cat.includes('jugo') || cat.includes('licor') || cat.includes('cerveza') || cat.includes('agua') || !!it.drinkType || !!it.flavor;
    if (isDrink) {
      raw = raw.replace(/\s*\([^)]+\)\s*$/g, '').trim();
    }
    return raw || (it.productName || it.name || 'Producto').trim();
  }

  // 1. Reporte de Hot Dogs e Ítems Vendidos
  generateProductsSoldReport(orders: Order[], rates: ExchangeRates) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado' || o.paymentStatus === 'credito');
    const tally: Record<string, { qty: number; revenueUSD: number; revenueCOP: number; category: string }> = {};

    paidOrders.forEach((o) => {
      const itCopRate = Number(o.copRateAtPayment) || rates.COP || 3100;

      // 1. Productos y Adicionales
      o.items.forEach((it) => {
        const catLower = (it.category || '').toLowerCase();
        const cleanName = this.getReportBaseProductName(it);
        const isComida = catLower.includes('burger') || catLower.includes('hamburguesa') || catLower.includes('hot dog') || catLower.includes('perro') || catLower.includes('mugrosito') || cleanName.toLowerCase().includes('burger') || cleanName.toLowerCase().includes('hot dog') || cleanName.toLowerCase().includes('perro') || cleanName.toLowerCase().includes('mugrosito');
        const displayName = cleanName;
        const itQty = it.quantity || 1;

        // Extraer adicionales pagos
        const extrasList: any[] = [];
        if (Array.isArray(it.extras)) extrasList.push(...it.extras);
        else if ((it as any).extrasJson && Array.isArray((it as any).extrasJson)) extrasList.push(...(it as any).extrasJson);
        else if (typeof (it as any).extrasJson === 'string') {
          try {
            const parsed = JSON.parse((it as any).extrasJson);
            if (Array.isArray(parsed)) extrasList.push(...parsed);
          } catch (e) {}
        }

        let paidExtrasUnitCostUSD = 0;
        let paidExtrasUnitCostCOP = 0;
        extrasList.forEach((extra) => {
          const rawPrice = Number(extra.price) || 0;
          const exQty = Number(extra.quantity) || 1;
          const rawName = (extra.name || 'Adicional').trim();
          const cleanBaseName = rawName.replace(/^\d+x\s*/i, '').trim();
          if (rawPrice > 0) {
            const isCOP = rawPrice >= 100;
            const exCOP = isCOP ? rawPrice : Math.round(rawPrice * itCopRate);
            const exUSD = isCOP ? (itCopRate > 0 ? rawPrice / itCopRate : 0) : rawPrice;
            paidExtrasUnitCostUSD += exUSD;
            paidExtrasUnitCostCOP += exCOP;
            const extraDisplayName = `ADD ${cleanBaseName}`;
            if (!tally[extraDisplayName]) {
              tally[extraDisplayName] = {
                qty: 0,
                revenueUSD: 0,
                revenueCOP: 0,
                category: 'Adicionales',
              };
            }
            tally[extraDisplayName].qty += itQty * exQty;
            tally[extraDisplayName].revenueUSD += exUSD * itQty;
            tally[extraDisplayName].revenueCOP += exCOP * itQty;
          }
        });

        // Producto a precio base
        const rawPrice = Number(it.price) || 0;
        const isCOP = rawPrice >= 100;
        const itemPriceCOP = isCOP ? rawPrice : Math.round(rawPrice * itCopRate);
        const itemPriceUSD = isCOP ? (itCopRate > 0 ? rawPrice / itCopRate : 0) : rawPrice;

        const baseUnitPriceUSD = Math.max(0, itemPriceUSD - paidExtrasUnitCostUSD);
        const baseUnitPriceCOP = Math.max(0, itemPriceCOP - paidExtrasUnitCostCOP);
        if (!tally[displayName]) {
          tally[displayName] = {
            qty: 0,
            revenueUSD: 0,
            revenueCOP: 0,
            category: isComida ? 'Hamburguesas y Comidas' : (it.category || 'Bebidas/Otros'),
          };
        }
        tally[displayName].qty += itQty;
        tally[displayName].revenueUSD += baseUnitPriceUSD * itQty;
        tally[displayName].revenueCOP += baseUnitPriceCOP * itQty;
      });

      // 2. Servicios de Delivery Facturados (tanto pedidos Delivery como mesas con delivery)
      let deliveryFeeUSD = Number(o.deliveryFeeUSD) || 0;
      let deliveryFeeCOP = Number(o.deliveryFeeCOP) || 0;
      if (deliveryFeeCOP === 0 && deliveryFeeUSD > 0) deliveryFeeCOP = deliveryFeeUSD >= 100 ? deliveryFeeUSD : Math.round(deliveryFeeUSD * itCopRate);
      if (deliveryFeeUSD === 0 && deliveryFeeCOP > 0) deliveryFeeUSD = itCopRate > 0 ? deliveryFeeCOP / itCopRate : 0;
      if (deliveryFeeUSD >= 100 && deliveryFeeCOP > 0) deliveryFeeUSD = itCopRate > 0 ? deliveryFeeCOP / itCopRate : 0;

      if (deliveryFeeUSD > 0 || deliveryFeeCOP > 0 || o.type === 'delivery') {
        const dName = deliveryFeeCOP > 0 ? `Servicio Delivery (${Math.round(deliveryFeeCOP).toLocaleString('es-CO')} COP)` : 'Servicio Delivery';
        if (!tally[dName]) {
          tally[dName] = {
            qty: 0,
            revenueUSD: 0,
            revenueCOP: 0,
            category: 'Delivery',
          };
        }
        tally[dName].qty += 1;
        tally[dName].revenueUSD += deliveryFeeUSD;
        tally[dName].revenueCOP += deliveryFeeCOP;
      }
    });

    const entries = Object.entries(tally).sort((a, b) => b[1].qty - a[1].qty);
    const totalItems = entries.reduce((sum, e) => sum + e[1].qty, 0);
    const totalRevenueUSD = entries.reduce((sum, e) => sum + e[1].revenueUSD, 0);
    const totalRevenueCOP = entries.reduce((sum, e) => sum + e[1].revenueCOP, 0);

    const rows = entries
      .map(
        ([name, data], idx) => `
      <tr>
        <td>#${idx + 1}</td>
        <td><strong>${name}</strong></td>
        <td><span style="background:#f3f4f6; padding:2px 8px; border-radius:6px; font-weight:700;">${data.category}</span></td>
        <td style="text-align:center;"><strong>${data.qty}</strong> u.</td>
        <td style="text-align:right; font-weight:700;">
          ${Math.round(data.revenueCOP).toLocaleString('es-CO')} COP
          <span style="font-size:9.5px; font-weight:normal; color:#4b5563; display:block;">
            (≈ $${data.revenueUSD.toFixed(2)} USD)
          </span>
        </td>
      </tr>
    `
      )
      .join('');

    const content = `
      <div class="section-title">DESGLOSE DE ÍTEMS Y COMIDAS VENDIDAS</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Producto / Especialidad</th>
            <th>Categoría</th>
            <th style="text-align:center;">Unidades</th>
            <th style="text-align:right;">Subtotal COP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">No se registran productos facturados en el sistema aún.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box">
        <div>
          <div class="total-label">TOTAL UNIDADES VENDIDAS:</div>
          <div style="font-size: 14px; font-weight: 800;">${totalItems} Unidades</div>
        </div>
        <div style="text-align:right; margin-top:5px;">
          <div class="total-label">RECAUDACIÓN TOTAL PRODUCTOS (PESOS):</div>
          <div class="total-val">${Math.round(totalRevenueCOP).toLocaleString('es-CO')} COP</div>
          <div style="font-size:10px; font-weight:700; color:#065f46; margin-top:2px;">(≈ $${totalRevenueUSD.toFixed(2)} USD)</div>
        </div>
      </div>
    `;

    this.openPrintWindow('Reporte_Ventas_Productos', content);
  }

  // Alias para compatibilidad
  generateHotDogsSoldReport(orders: Order[], rates: ExchangeRates) {
    return this.generateProductsSoldReport(orders, rates);
  }

  generatePizzasSoldReport(orders: Order[], rates: ExchangeRates) {
    return this.generateProductsSoldReport(orders, rates);
  }

  // 2. Reporte de Ingresos y Cobros
  generateIncomeReport(orders: Order[], rates: ExchangeRates) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
    const creditOrders = orders.filter((o) => o.paymentStatus === 'credito');
    const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
    const totalCreditUSD = creditOrders.reduce((sum, o) => sum + o.totalUSD, 0);

    const byCurrency: Record<string, number> = {
      USD: 0,
      COP: 0,
      Bs: 0,
    };

    paidOrders.forEach((o) => {
      if (o.paymentHistory && o.paymentHistory.length > 0) {
        o.paymentHistory.forEach((p) => {
          const pCurr = this.paymentCurrency(p.paymentMethod);
          const tenderUSD = Number(p.cashTenderedUSD) || 0;
          const tenderCOP = Number(p.cashTenderedCOP) || 0;
          const tenderBs = Number(p.cashTenderedBs) || 0;
          const changeUSD = Number(p.changeGivenUSD) || 0;
          const changeCOP = Number(p.changeGivenCOP) || 0;
          const changeBs = Number(p.changeGivenBs) || 0;
          const pUSD = Number(p.amountPaidUSD) || 0;

          const cRate = p.copRate || rates.COP || 3100;
          const bRate = p.bsRate || rates.Bs || 3.2;

          if (pCurr === 'USD') {
            byCurrency.USD += tenderUSD > 0 ? (tenderUSD - changeUSD) : pUSD;
          } else if (pCurr === 'COP') {
            byCurrency.COP += tenderCOP > 0 ? (tenderCOP - changeCOP) : (pUSD * cRate);
          } else if (pCurr === 'Bs') {
            byCurrency.Bs += tenderBs > 0 ? (tenderBs - changeBs) : (bRate > 0 ? (pUSD * cRate) / bRate : 0);
          }
        });
      } else {
        const curr = this.paymentCurrency(o.paymentMethod || 'Efectivo USD');
        const cRate = o.copRateAtPayment || rates.COP || 3100;
        const bRate = o.bsRateAtPayment || rates.Bs || 3.2;
        const ordCOP = (o as any).totalCOP || (o.totalUSD * cRate);
        if (curr === 'USD') byCurrency.USD += (cRate > 0 ? ordCOP / cRate : o.totalUSD);
        if (curr === 'COP') byCurrency.COP += ordCOP;
        if (curr === 'Bs') byCurrency.Bs += (bRate > 0 ? ordCOP / bRate : 0);
      }
    });

    const rows = paidOrders
      .map((o) => {
        let orderCOP = 0;
        let orderBs = 0;
        let orderUSD = 0;
        const methodsUsed: string[] = [];

        if (o.paymentHistory && o.paymentHistory.length > 0) {
          o.paymentHistory.forEach((p) => {
            const pCurr = this.paymentCurrency(p.paymentMethod);
            const tenderUSD = Number(p.cashTenderedUSD) || 0;
            const tenderCOP = Number(p.cashTenderedCOP) || 0;
            const tenderBs = Number(p.cashTenderedBs) || 0;
            const changeUSD = Number(p.changeGivenUSD) || 0;
            const changeCOP = Number(p.changeGivenCOP) || 0;
            const changeBs = Number(p.changeGivenBs) || 0;
            const pUSD = Number(p.amountPaidUSD) || 0;
            const cRate = p.copRate || rates.COP || 3100;
            const bRate = p.bsRate || rates.Bs || 3.2;

            if (pCurr === 'USD') {
              orderUSD += tenderUSD > 0 ? (tenderUSD - changeUSD) : pUSD;
            } else if (pCurr === 'COP') {
              orderCOP += tenderCOP > 0 ? (tenderCOP - changeCOP) : (pUSD * cRate);
            } else if (pCurr === 'Bs') {
              orderBs += tenderBs > 0 ? (tenderBs - changeBs) : (bRate > 0 ? (pUSD * cRate) / bRate : 0);
            }
            if (p.paymentMethod && !methodsUsed.includes(p.paymentMethod)) {
              methodsUsed.push(p.paymentMethod);
            }
          });
        } else {
          const curr = this.paymentCurrency(o.paymentMethod || 'Efectivo USD');
          const cRate = o.copRateAtPayment || rates.COP || 3100;
          const bRate = o.bsRateAtPayment || rates.Bs || 3.2;
          const ordCOP = (o as any).totalCOP || (o.totalUSD * cRate);
          if (curr === 'USD') orderUSD = (cRate > 0 ? ordCOP / cRate : o.totalUSD);
          if (curr === 'COP') orderCOP = ordCOP;
          if (curr === 'Bs') orderBs = (bRate > 0 ? ordCOP / bRate : 0);
          if (o.paymentMethod) methodsUsed.push(o.paymentMethod);
        }

        const methodStr = methodsUsed.join(' + ') || o.paymentMethod || 'Efectivo USD';
        const displayParts: string[] = [];
        if (orderUSD > 0) displayParts.push(`$${orderUSD.toFixed(2)} USD`);
        if (orderCOP > 0) displayParts.push(`$${Math.round(orderCOP).toLocaleString()} COP`);
        if (orderBs > 0) displayParts.push(`Bs ${orderBs.toFixed(2)}`);
        const formattedAmount = displayParts.length > 0 ? displayParts.join(' / ') : `$${o.totalUSD.toFixed(2)}`;

        const mainCurr = orderCOP > 0 && orderUSD === 0 && orderBs === 0 ? 'COP' : orderBs > 0 && orderUSD === 0 && orderCOP === 0 ? 'Bs' : orderUSD > 0 && orderCOP === 0 && orderBs === 0 ? 'USD' : 'MIXTO';

        return `
        <tr>
          <td><strong>${o.orderNumber}</strong></td>
          <td>${(o.type || 'mesa').toUpperCase()}</td>
          <td>${this.escapeHtml(o.customerName || 'Cliente General')}</td>
          <td>${this.escapeHtml(methodStr)}</td>
          <td>${mainCurr}</td>
          <td style="text-align:right; font-weight:700;">${formattedAmount}</td>
        </tr>
      `;
      })
      .join('');

    const copRateGlobal = Number(rates.COP) || 3100;
    const bsRateGlobal = Number(rates.Bs) || 3.2;
    const totalRecaudadoCOP = byCurrency.COP + (byCurrency.USD * copRateGlobal) + (bsRateGlobal > 0 ? (byCurrency.Bs * bsRateGlobal) : 0);
    const totalRecaudadoUSD = copRateGlobal > 0 ? (totalRecaudadoCOP / copRateGlobal) : totalUSD;

    const content = `
      <div class="section-title">TOTALES POR MONEDA</div>
      <table>
        <thead>
          <tr>
            <th>Moneda</th>
            <th style="text-align:right;">Monto Recibido</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>🇨🇴 Pesos Colombianos (COP)</td>
            <td style="text-align:right; font-weight:900; color:#047857;">$${Math.round(byCurrency.COP).toLocaleString('es-CO')} COP</td>
          </tr>
          <tr>
            <td>💵 Dólares (USD)</td>
            <td style="text-align:right; font-weight:700;">$${byCurrency.USD.toFixed(2)} USD</td>
          </tr>
          <tr>
            <td>🇻🇪 Bolívares (Bs)</td>
            <td style="text-align:right; font-weight:700;">Bs ${byCurrency.Bs.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">DETALLE DE COMANDAS COBRADAS</div>
      <table>
        <thead>
          <tr>
            <th>Comanda</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Método</th>
            <th>Moneda</th>
            <th style="text-align:right;">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="6" style="text-align:center; color:#9ca3af;">No hay cobros registrados.</td></tr>'}
        </tbody>
      </table>

      ${creditOrders.length > 0 ? `
        <div class="section-title">DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR</div>
        <table>
          <thead>
            <tr>
              <th>Comanda</th>
              <th>Cliente / Deudor</th>
              <th style="text-align:right;">Monto Deuda COP</th>
            </tr>
          </thead>
          <tbody>
            ${creditOrders.map((o) => {
              const oCop = (o as any).totalCOP || Math.round((o.totalUSD || 0) * (o.copRateAtPayment || copRateGlobal));
              return `<tr><td><strong>#${o.orderNumber}</strong></td><td>${this.escapeHtml(o.customerName || 'Deudor')}</td><td style="text-align:right; font-weight:900; color:#b45309;">${Math.round(oCop).toLocaleString('es-CO')} COP <div style="font-size:9.5px; font-weight:normal; color:#78350f;">(≈ $${o.totalUSD.toFixed(2)} USD)</div></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : ''}

      <div class="total-box">
        <div class="total-label">TOTAL BRUTO RECAUDADO EN PESOS:</div>
        <div class="total-val">${Math.round(totalRecaudadoCOP).toLocaleString('es-CO')} COP</div>
        <div style="font-size:11px; font-weight:800; color:#047857; margin-top:2px;">(≈ $${totalRecaudadoUSD.toFixed(2)} USD)</div>
        ${totalCreditUSD > 0 ? `<div style="font-size:11px; font-weight:800; color:#b45309; margin-top:4px;">Total cuentas a crédito: ${Math.round(totalCreditUSD * copRateGlobal).toLocaleString('es-CO')} COP (≈ $${totalCreditUSD.toFixed(2)} USD)</div>` : ''}
      </div>
    `;

    this.openPrintWindow('Reporte_Ingresos_y_Cobros', content);
  }

  // 3. Reporte de Vueltos y Egresos de Caja Chica
  generateExpensesReport(transactions: CajaChicaTransaction[]) {
    const egresos = transactions.filter((t) => t.type === 'egreso');
    const totalEgresosUSD = egresos.reduce((sum, t) => sum + t.amountUSD, 0);
    const totalEgresosCOP = egresos.reduce((sum, t) => {
      if (t.amountCOP > 0) return sum + t.amountCOP;
      if (t.amountUSD > 0) return sum + (t.amountUSD * 3100);
      if (t.amountBs > 0) return sum + (t.amountBs * 3.2);
      return sum;
    }, 0);

    const rows = egresos
      .map((t) => {
        const curr = t.amountUSD > 0 ? 'USD' : t.amountCOP > 0 ? 'COP' : 'Bs';
        const amount = curr === 'USD' ? `$${t.amountUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(t.amountCOP).toLocaleString()}` : `Bs ${t.amountBs.toFixed(2)}`;
        return `
        <tr>
          <td>${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td><strong>${t.description}</strong></td>
          <td>${t.paymentMethod}</td>
          <td>${curr}</td>
          <td style="text-align:right; color:#dc2626; font-weight:800;">-${amount}</td>
        </tr>
      `;
      })
      .join('');

    const content = `
      <div class="section-title">HISTORIAL DE VUELTOS Y EGRESOS DE CAJA CHICA</div>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Descripción / Motivo</th>
            <th>Método</th>
            <th>Moneda</th>
            <th style="text-align:right;">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">No hay egresos o vueltos registrados.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box" style="background:#fef2f2; border-color:#fecaca;">
        <div class="total-label" style="color:#991b1b;">TOTAL EGRESOS / VUELTOS (PESOS):</div>
        <div class="total-val" style="color:#dc2626;">-${Math.round(totalEgresosCOP).toLocaleString('es-CO')} COP</div>
        <div style="font-size:11px; font-weight:800; color:#dc2626; margin-top:2px;">(≈ -$${totalEgresosUSD.toFixed(2)} USD)</div>
      </div>
    `;

    this.openPrintWindow('Reporte_Vueltos_y_Egresos', content);
  }

  // Helper centralizado para categorizar y convertir ítems facturados en ambas monedas (USD y COP)
  private categorizeReportItems(
    cashItems: any[],
    billedOrders: any[],
    copRateGlobal: number,
    bsRateGlobal: number
  ) {
    const ordersById = new Map<string, any>(billedOrders.map((o) => [o.id, o]));

    const paidExtrasMap = new Map<string, { name: string; quantity: number; subtotalUSD: number; subtotalCOP: number; unitPriceUSD: number; unitPriceCOP: number }>();
    let freeToppingsCount = 0;
    const foodMap = new Map<string, { name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }>();
    const drinkMap = new Map<string, { name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }>();
    const othersProductMap = new Map<string, { name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }>();

    // 1. Deliverys de Comandas Facturadas
    const deliveryTierMap = new Map<number, { name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }>();
    billedOrders.forEach((ord) => {
      const ordCopRate = Number(ord.copRateAtPayment) || copRateGlobal;
      let feeUSD = Number(ord.deliveryFeeUSD) || 0;
      let feeCOP = Number(ord.deliveryFeeCOP) || 0;
      if (feeCOP === 0 && feeUSD > 0) feeCOP = Math.round(feeUSD * ordCopRate);
      if (feeUSD === 0 && feeCOP > 0) feeUSD = ordCopRate > 0 ? feeCOP / ordCopRate : 0;

      if (ord.type === 'delivery' || feeUSD > 0 || feeCOP > 0) {
        const tierKey = feeCOP > 0 ? feeCOP : Math.round(feeUSD * ordCopRate);
        const name = feeCOP > 0 ? `Delivery ($${feeUSD.toFixed(2)})` : 'Delivery';
        const existing = deliveryTierMap.get(tierKey) || { name, quantity: 0, subtotalUSD: 0, subtotalCOP: 0 };
        existing.quantity += 1;
        existing.subtotalUSD += feeUSD;
        existing.subtotalCOP += feeCOP;
        deliveryTierMap.set(tierKey, existing);
      }
    });

    // 2. Items
    cashItems.forEach((it: any) => {
      const itQty = Number(it.quantity) || 1;
      const cleanName = this.getReportBaseProductName(it);
      const parentOrder = ordersById.get(it.orderId);
      const itemCopRate = Number(parentOrder?.copRateAtPayment) || Number(it.copRate) || copRateGlobal;

      const extrasList: any[] = [];
      if (Array.isArray(it.extras)) {
        extrasList.push(...it.extras);
      } else if (it.extrasJson && Array.isArray(it.extrasJson)) {
        extrasList.push(...it.extrasJson);
      } else if (typeof it.extrasJson === 'string') {
        try {
          const parsed = JSON.parse(it.extrasJson);
          if (Array.isArray(parsed)) extrasList.push(...parsed);
        } catch (e) {}
      }

      let paidExtrasUnitCostUSD = 0;
      let paidExtrasUnitCostCOP = 0;

      extrasList.forEach((extra) => {
        const rawExPrice = Number(extra.price) || 0;
        const exQty = Number(extra.quantity) || 1;
        const rawName = (extra.name || 'Adicional').trim();
        const cleanBaseName = rawName.replace(/^\d+x\s*/i, '').trim();

        if (rawExPrice > 0) {
          const exIsCOP = rawExPrice >= 100;
          const exCOP = exIsCOP ? rawExPrice : Math.round(rawExPrice * itemCopRate);
          const exUSD = exIsCOP ? (itemCopRate > 0 ? rawExPrice / itemCopRate : 0) : rawExPrice;

          paidExtrasUnitCostUSD += exUSD;
          paidExtrasUnitCostCOP += exCOP;

          const unitPriceUSD = exUSD / exQty;
          const unitPriceCOP = exCOP / exQty;

          const current = paidExtrasMap.get(cleanBaseName) || {
            name: `ADD ${cleanBaseName}`,
            quantity: 0,
            subtotalUSD: 0,
            subtotalCOP: 0,
            unitPriceUSD,
            unitPriceCOP,
          };
          current.quantity += itQty * exQty;
          current.subtotalUSD += exUSD * itQty;
          current.subtotalCOP = (current.subtotalCOP || 0) + exCOP * itQty;
          paidExtrasMap.set(cleanBaseName, current);
        } else {
          freeToppingsCount += itQty * exQty;
        }
      });

      const rawPrice = Number(it.price) || 0;
      const isCOP = rawPrice >= 100;
      const itemPriceCOP = isCOP ? rawPrice : Math.round(rawPrice * itemCopRate);
      const itemPriceUSD = isCOP ? (itemCopRate > 0 ? rawPrice / itemCopRate : 0) : rawPrice;

      const baseUnitPriceUSD = Math.max(0, itemPriceUSD - paidExtrasUnitCostUSD);
      const baseUnitPriceCOP = Math.max(0, itemPriceCOP - paidExtrasUnitCostCOP);
      const baseSubtotalUSD = baseUnitPriceUSD * itQty;
      const baseSubtotalCOP = baseUnitPriceCOP * itQty;

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

      const targetMap = isDrink ? drinkMap : isOther ? othersProductMap : foodMap;
      const prevProd = targetMap.get(cleanName) || { name: cleanName, quantity: 0, subtotalUSD: 0, subtotalCOP: 0 };
      prevProd.quantity += itQty;
      prevProd.subtotalUSD += baseSubtotalUSD;
      prevProd.subtotalCOP += baseSubtotalCOP;
      targetMap.set(cleanName, prevProd);
    });

    const comidasItems = Array.from(foodMap.values()).filter((p) => p.quantity > 0).sort((a, b) => a.name.localeCompare(b.name));
    const bebidasItems = Array.from(drinkMap.values()).filter((p) => p.quantity > 0).sort((a, b) => a.name.localeCompare(b.name));

    const adicionalesItems: Array<{ name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }> = [];
    const sortedExtras = Array.from(paidExtrasMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    sortedExtras.forEach((extra) => {
      if (extra.quantity > 0) {
        adicionalesItems.push({
          name: extra.name,
          quantity: extra.quantity,
          subtotalUSD: extra.subtotalUSD,
          subtotalCOP: extra.subtotalCOP,
        });
      }
    });
    if (freeToppingsCount > 0) {
      adicionalesItems.push({
        name: 'Toppings Gratis',
        quantity: freeToppingsCount,
        subtotalUSD: 0,
        subtotalCOP: 0,
      });
    }

    const otrosItems: Array<{ name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }> = [];
    const sortedFees = Array.from(deliveryTierMap.values()).sort((a, b) => a.subtotalCOP - b.subtotalCOP);
    sortedFees.forEach((tier) => {
      if (tier.quantity > 0) {
        otrosItems.push({
          name: tier.name,
          quantity: tier.quantity,
          subtotalUSD: tier.subtotalUSD,
          subtotalCOP: tier.subtotalCOP,
        });
      }
    });
    Array.from(othersProductMap.values()).filter((p) => p.quantity > 0).sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => otrosItems.push(p));

    const unifiedItems = [...comidasItems, ...bebidasItems, ...adicionalesItems, ...otrosItems];
    const totalUnits = unifiedItems.reduce((total, item) => total + item.quantity, 0);
    const totalRevenueUSD = unifiedItems.reduce((sum, it) => sum + it.subtotalUSD, 0);
    const totalRevenueCOP = unifiedItems.reduce((sum, it) => sum + it.subtotalCOP, 0);
    const totalRevenueBs = bsRateGlobal > 0 ? (totalRevenueCOP / bsRateGlobal) : 0;

    return {
      comidasItems,
      bebidasItems,
      adicionalesItems,
      otrosItems,
      totalUnits,
      totalRevenueUSD,
      totalRevenueCOP,
      totalRevenueBs,
    };
  }

  // 4. Reporte de Hamburguesas e Ítems Vendidos por Intervalo
  generateProductsSoldIntervalReport(data: ReporteIntervaloData) {
    const billedOrders = (data.orders || []).filter((o) => o.paymentStatus === 'pagado' || o.paymentStatus === 'credito');
    const billedOrderIds = new Set(billedOrders.map((o) => o.id));
    const cashItems = (data.items || []).filter((it) => billedOrderIds.has(it.orderId));

    const copRateGlobal = Number(data.exchangeRates?.COP) || 3100;
    const bsRateGlobal = Number(data.exchangeRates?.Bs) || 3.2;

    const cat = this.categorizeReportItems(cashItems, billedOrders, copRateGlobal, bsRateGlobal);

    const renderRows = (items: Array<{ name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }>, emptyMsg: string) => {
      if (items.length === 0) return `<tr><td colspan="3" style="text-align:center; color:#9ca3af; padding:5px;">${emptyMsg}</td></tr>`;
      return items.map((item) => `
        <tr>
          <td><strong>${this.escapeHtml(item.name)}</strong></td>
          <td style="text-align:center; width:60px;">${item.quantity}</td>
          <td style="text-align:right; width:150px; font-weight:700;">
            ${Math.round(item.subtotalCOP).toLocaleString('es-CO')} COP
            <span style="font-size:9.5px; font-weight:normal; color:#4b5563; display:block;">
              (≈ $${item.subtotalUSD.toFixed(2)} USD)
            </span>
          </td>
        </tr>
      `).join('');
    };

    this.openPrintWindow('Hamburguesas_Vendidas_Intervalo', `
      <div class="section-title">HAMBURGUESAS E ÍTEMS VENDIDOS (DESGLOSE COMPLETO)</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>

      <!-- 1. COMIDAS -->
      <div style="font-size:10px; font-weight:900; margin:10px 0 3px; padding:3px 8px; background:#fef3c7; color:#92400e; border-left:3px solid #f59e0b;">
        1. COMIDAS (Hamburguesas, Hot Dogs y Platos)
      </div>
      <table>
        <thead><tr><th>Producto</th><th style="text-align:center; width:60px;">Cant.</th><th style="text-align:right; width:150px;">Total COP</th></tr></thead>
        <tbody>${renderRows(cat.comidasItems, 'Sin comidas facturadas en el intervalo.')}</tbody>
      </table>

      <!-- 2. BEBIDAS -->
      <div style="font-size:10px; font-weight:900; margin:14px 0 3px; padding:3px 8px; background:#e0f2fe; color:#075985; border-left:3px solid #0284c7;">
        2. BEBIDAS (Refrescos, Jugos, Cervezas, Aguas)
      </div>
      <table>
        <thead><tr><th>Bebida (Unificada)</th><th style="text-align:center; width:60px;">Cant.</th><th style="text-align:right; width:150px;">Total COP</th></tr></thead>
        <tbody>${renderRows(cat.bebidasItems, 'Sin bebidas facturadas en el intervalo.')}</tbody>
      </table>

      <!-- 3. ADICIONALES -->
      <div style="font-size:10px; font-weight:900; margin:14px 0 3px; padding:3px 8px; background:#f3e8ff; color:#6b21a8; border-left:3px solid #9333ea;">
        3. ADICIONALES (Pagos y Toppings Gratis)
      </div>
      <table>
        <thead><tr><th>Adicional / Topping</th><th style="text-align:center; width:60px;">Cant.</th><th style="text-align:right; width:150px;">Total COP</th></tr></thead>
        <tbody>${renderRows(cat.adicionalesItems, 'Sin adicionales facturados en el intervalo.')}</tbody>
      </table>

      <!-- 4. OTROS -->
      <div style="font-size:10px; font-weight:900; margin:14px 0 3px; padding:3px 8px; background:#f1f5f9; color:#334155; border-left:3px solid #64748b;">
        4. SERVICIOS Y DELIVERY
      </div>
      <table>
        <thead><tr><th>Concepto</th><th style="text-align:center; width:60px;">Cant.</th><th style="text-align:right; width:150px;">Total COP</th></tr></thead>
        <tbody>${renderRows(cat.otrosItems, 'Sin servicios de delivery facturados.')}</tbody>
      </table>

      <div class="total-box" style="margin-top:14px; background:#ecfdf5; border-color:#059669;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="total-label" style="color:#065f46; font-size:10px;">UNIDADES FACTURADAS:</div>
            <div style="font-size:14px; font-weight:900; color:#111827;">${cat.totalUnits} unidades</div>
          </div>
          <div style="text-align:right;">
            <div class="total-label" style="color:#065f46; font-size:10px;">TOTAL FACTURADO EN ÍTEMS (PESOS):</div>
            <div class="total-val" style="color:#047857; font-size:16px;">${Math.round(cat.totalRevenueCOP).toLocaleString('es-CO')} COP</div>
            <div style="font-size:10px; font-weight:800; color:#065f46; margin-top:2px;">
              (≈ $${cat.totalRevenueUSD.toFixed(2)} USD / ${cat.totalRevenueBs.toFixed(2)} Bs)
            </div>
          </div>
        </div>
      </div>
    `);
  }

  // Alias para compatibilidad
  generateHotDogsSoldIntervalReport(data: ReporteIntervaloData) {
    return this.generateProductsSoldIntervalReport(data);
  }

  generatePizzasSoldIntervalReport(data: ReporteIntervaloData) {
    return this.generateProductsSoldIntervalReport(data);
  }

  // 5. Reporte de Ingresos y Cobros por Intervalo
  generateIncomeIntervalReport(data: ReporteIntervaloData) {
    const orderIncomes = (data.payments || []).filter((payment) => (payment.amountPaidUSD > 0 || payment.cashTenderedUSD > 0 || payment.cashTenderedCOP > 0 || payment.cashTenderedBs > 0) && payment.paymentMethod !== 'Crédito');
    const manualIncomes = (data.transactions || []).filter((t) => t.type === 'ingreso' && !t.orderId);

    const totals = { usd: 0, cop: 0, bs: 0 };

    const orderRows = orderIncomes.map((payment) => {
      const amounts = this.registeredPaymentAmounts(payment);
      totals.usd += amounts.usd;
      totals.cop += amounts.cop;
      totals.bs += amounts.bs;
      const formattedAmount = amounts.currency === 'USD' ? `$${amounts.usd.toFixed(2)}` : amounts.currency === 'COP' ? `$${Math.round(amounts.cop).toLocaleString()} COP` : `Bs ${amounts.bs.toFixed(2)}`;
      return `<tr><td>${this.reportDate(payment.createdAt)}</td><td>#${this.escapeHtml(payment.orderNumber)}</td><td>${this.escapeHtml(this.paymentMethodLabel(payment.paymentMethod))}</td><td>${this.escapeHtml(payment.payerName)}</td><td>${amounts.currency}</td><td style="text-align:right; font-weight:700; color:#047857;">+${formattedAmount}</td></tr>`;
    });

    const manualRows = manualIncomes.map((t) => {
      const curr = t.amountUSD > 0 ? 'USD' : t.amountCOP > 0 ? 'COP' : 'Bs';
      if (curr === 'USD') totals.usd += t.amountUSD;
      if (curr === 'COP') totals.cop += t.amountCOP;
      if (curr === 'Bs') totals.bs += t.amountBs;
      const formattedAmount = curr === 'USD' ? `$${t.amountUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(t.amountCOP).toLocaleString()} COP` : `Bs ${t.amountBs.toFixed(2)}`;
      return `<tr><td>${this.reportDate(t.timestamp)}</td><td>Ingreso Manual</td><td>${this.escapeHtml(t.paymentMethod || 'Efectivo')}</td><td>${this.escapeHtml(t.description || 'Caja Chica')}</td><td>${curr}</td><td style="text-align:right; font-weight:700; color:#047857;">+${formattedAmount}</td></tr>`;
    });

    const allRows = [...orderRows, ...manualRows].join('');

    const copRateGlobal = Number(data.exchangeRates?.COP) || 3100;
    const bsRateGlobal = Number(data.exchangeRates?.Bs) || 3.2;
    const totalRecaudadoCOP = totals.cop + (totals.usd * copRateGlobal) + (bsRateGlobal > 0 ? (totals.bs * bsRateGlobal) : 0);
    const totalRecaudadoUSD = copRateGlobal > 0 ? (totalRecaudadoCOP / copRateGlobal) : totals.usd;

    this.openPrintWindow('Ingresos_y_Cobros_Intervalo', `
      <div class="section-title">INGRESOS Y COBROS POR MÉTODO DE PAGO</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Fecha / Hora</th><th>Comanda / Origen</th><th>Método</th><th>Pagador / Concepto</th><th>Moneda</th><th style="text-align:right;">Monto</th></tr></thead><tbody>${allRows || '<tr><td colspan="6" style="text-align:center;">Sin cobros ni ingresos en el intervalo.</td></tr>'}</tbody></table>
      <div class="total-box" style="background:#ecfdf5; border-color:#a7f3d0; margin-top:16px;">
        <div style="font-size:11px; font-weight:900; color:#065f46; margin-bottom:4px;">TOTAL INGRESOS RECIBIDOS (PESOS):</div>
        <div style="font-size:18px; font-weight:900; color:#047857; margin-bottom:6px;">
          ${Math.round(totalRecaudadoCOP).toLocaleString('es-CO')} COP <span style="font-size:11px; font-weight:700; color:#065f46;">(≈ $${totalRecaudadoUSD.toFixed(2)} USD)</span>
        </div>
        <div style="font-size:10px; font-weight:800; color:#065f46; margin-bottom:4px;">DESGLOSE POR MONEDA:</div>
        <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:12px; font-weight:900; color:#047857;">
          ${totals.cop > 0 ? `<span>🇨🇴 $${Math.round(totals.cop).toLocaleString('es-CO')} COP</span>` : ''}
          ${totals.usd > 0 ? `<span>💵 $${totals.usd.toFixed(2)} USD</span>` : ''}
          ${totals.bs > 0 ? `<span>🇻🇪 Bs ${totals.bs.toFixed(2)}</span>` : ''}
          ${totals.usd === 0 && totals.cop === 0 && totals.bs === 0 ? '<span>$0 COP</span>' : ''}
        </div>
      </div>
    `);
  }

  // 6. Reporte de Vueltos y Egresos por Intervalo
  generateExpensesIntervalReport(data: ReporteIntervaloData) {
    const expenses = (data.transactions || []).filter((transaction) => transaction.type === 'egreso');
    const totals = { usd: 0, cop: 0, bs: 0 };
    const rows = expenses.map((transaction) => {
      const curr = transaction.amountUSD > 0 ? 'USD' : transaction.amountCOP > 0 ? 'COP' : 'Bs';
      if (curr === 'USD') totals.usd += transaction.amountUSD;
      if (curr === 'COP') totals.cop += transaction.amountCOP;
      if (curr === 'Bs') totals.bs += transaction.amountBs;
      const amount = curr === 'USD' ? `$${transaction.amountUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(transaction.amountCOP).toLocaleString()} COP` : `Bs ${transaction.amountBs.toFixed(2)}`;
      return `<tr><td>${this.reportDate(transaction.timestamp)}</td><td>${this.escapeHtml(transaction.description)}</td><td>${this.escapeHtml(this.paymentMethodLabel(transaction.paymentMethod))}</td><td>${curr}</td><td style="text-align:right; color:#dc2626; font-weight:700;">-${amount}</td></tr>`;
    }).join('');

    const copRateGlobal = Number(data.exchangeRates?.COP) || 3100;
    const bsRateGlobal = Number(data.exchangeRates?.Bs) || 3.2;
    const totalEgresosCOP = totals.cop + (totals.usd * copRateGlobal) + (bsRateGlobal > 0 ? (totals.bs * bsRateGlobal) : 0);
    const totalEgresosUSD = copRateGlobal > 0 ? (totalEgresosCOP / copRateGlobal) : totals.usd;

    this.openPrintWindow('Vueltos_y_Egresos_Intervalo', `
      <div class="section-title">VUELTOS Y EGRESOS DE CAJA CHICA</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Fecha / Hora</th><th>Descripción</th><th>Método</th><th>Moneda</th><th style="text-align:right;">Monto</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Sin egresos en el intervalo.</td></tr>'}</tbody></table>
      <div class="total-box" style="background:#fef2f2; border-color:#fecaca; margin-top:16px;">
        <div style="font-size:11px; font-weight:900; color:#991b1b; margin-bottom:4px;">TOTAL VUELTOS Y EGRESOS ENTREGADOS (PESOS):</div>
        <div style="font-size:18px; font-weight:900; color:#dc2626; margin-bottom:6px;">
          -${Math.round(totalEgresosCOP).toLocaleString('es-CO')} COP <span style="font-size:11px; font-weight:700; color:#991b1b;">(≈ -$${totalEgresosUSD.toFixed(2)} USD)</span>
        </div>
        <div style="font-size:10px; font-weight:800; color:#991b1b; margin-bottom:4px;">DESGLOSE POR MONEDA:</div>
        <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:12px; font-weight:900; color:#dc2626;">
          ${totals.cop > 0 ? `<span>🇨🇴 -$${Math.round(totals.cop).toLocaleString('es-CO')} COP</span>` : ''}
          ${totals.usd > 0 ? `<span>💵 -$${totals.usd.toFixed(2)} USD</span>` : ''}
          ${totals.bs > 0 ? `<span>🇻🇪 -Bs ${totals.bs.toFixed(2)}</span>` : ''}
          ${totals.usd === 0 && totals.cop === 0 && totals.bs === 0 ? '<span>$0 COP</span>' : ''}
        </div>
      </div>
    `);
  }

  // 7. Reporte de Cocina y Preparación por Intervalo
  generateKitchenTimesIntervalReport(data: ReporteIntervaloData) {
    const rows = data.orders.map((order) => `<tr><td><strong>#${this.escapeHtml(order.orderNumber)}</strong></td><td>${this.escapeHtml(order.type)}</td><td>${this.reportDate(order.createdAt)}</td><td>${this.escapeHtml(order.status)}</td><td style="text-align:center;">Completada</td></tr>`).join('');
    this.openPrintWindow('Tiempos_Cocina_Intervalo', `
      <div class="section-title">TIEMPOS COCINA Y AUDITORÍA DE PREPARACIÓN</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Comanda</th><th>Tipo</th><th>Hora recibida</th><th>Estado</th><th style="text-align:center;">Preparación</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Sin comandas facturadas en el intervalo.</td></tr>'}</tbody></table>
    `);
  }

  // 8. Reporte Contable Consolidado con Desglose de Monedas y Créditos
  generateReporteContable(data: ReporteIntervaloData) {
    const methodNames = ['Efectivo USD', 'Binance', 'Zelle', 'Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP', 'Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito', 'Crédito'];
    const methodTotals = new Map(methodNames.map((method) => [
      method,
      {
        currency: this.paymentCurrency(method),
        incomeNative: 0,
        changeNative: 0,
        netNative: 0,
        netUSD: 0,
        count: 0,
      }
    ]));

    const billedTotals = { usd: 0, cop: 0, bs: 0 };
    const paymentsByOrder = new Map<string, ReporteIntervaloData['payments']>();

    data.payments.forEach((payment) => {
      const method = payment.paymentMethod || 'Efectivo USD';
      const curr = this.paymentCurrency(method);
      const cRate = Number(payment.copRate) || Number(data.exchangeRates?.COP) || 3100;
      const bRate = Number(payment.bsRate) || Number(data.exchangeRates?.Bs) || 3.2;

      const paidUSD = Number(payment.amountPaidUSD) || 0;
      let tenderUSD = Number(payment.cashTenderedUSD) || 0;
      let tenderCOP = Number(payment.cashTenderedCOP) || 0;
      let tenderBs = Number(payment.cashTenderedBs) || 0;

      // Si es un pago y no vino el efectivo recibido explícito, calcular según el método
      if (tenderUSD === 0 && tenderCOP === 0 && tenderBs === 0 && paidUSD > 0) {
        if (curr === 'USD') tenderUSD = paidUSD;
        else if (curr === 'COP') tenderCOP = paidUSD * cRate;
        else if (curr === 'Bs') tenderBs = bRate > 0 ? (paidUSD * cRate) / bRate : 0;
      }

      // Obtener vueltos registrados en este movimiento
      const changeUSD = Number(payment.changeGivenUSD) || 0;
      const changeCOP = Number(payment.changeGivenCOP) || 0;
      const changeBs = Number(payment.changeGivenBs) || 0;

      // 1. Acumular Ingresos al método
      const totals = methodTotals.get(method) || {
        currency: curr,
        incomeNative: 0,
        changeNative: 0,
        netNative: 0,
        netUSD: 0,
        count: 0,
      };

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
      methodTotals.set(method, totals);

      // 2. Descontar Vueltos estrictamente en su moneda nativa y método
      if (changeUSD > 0 || changeCOP > 0 || changeBs > 0) {
        if (paidUSD === 0) {
          // Fila de vuelto dedicada: descontar de su método registrado
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
          methodTotals.set(method, totals);
        } else {
          // Fila mixta (cobro con excedente y vuelto en una sola fila)
          if (changeUSD > 0) {
            const usdM = methodTotals.get('Efectivo USD');
            if (usdM) { usdM.changeNative += changeUSD; methodTotals.set('Efectivo USD', usdM); }
            billedTotals.usd -= changeUSD;
          }
          if (changeCOP > 0) {
            const copM = methodTotals.get('Efectivo COP');
            if (copM) { copM.changeNative += changeCOP; methodTotals.set('Efectivo COP', copM); }
            billedTotals.cop -= changeCOP;
          }
          if (changeBs > 0) {
            const bsM = methodTotals.get('Pago Móvil');
            if (bsM) { bsM.changeNative += changeBs; methodTotals.set('Pago Móvil', bsM); }
            billedTotals.bs -= changeBs;
          }
        }
      }

      paymentsByOrder.set(payment.orderId, [...(paymentsByOrder.get(payment.orderId) || []), payment]);
    });

    // Calcular Venta Neta por método y equivalente USD
    const copRateGlobal = Number(data.exchangeRates?.COP) || 3100;
    const bsRateGlobal = Number(data.exchangeRates?.Bs) || 3.2;

    methodTotals.forEach((val) => {
      val.netNative = val.incomeNative - val.changeNative;
      if (val.currency === 'USD') val.netUSD = val.netNative;
      else if (val.currency === 'COP') val.netUSD = val.netNative / copRateGlobal;
      else if (val.currency === 'Bs') val.netUSD = (val.netNative * bsRateGlobal) / copRateGlobal;
    });


    // Separación Estricta de Contado y Crédito
    const creditOrders = data.orders.filter((order) => order.paymentStatus === 'credito' || order.paymentMethod === 'Crédito');
    const cashOrders = data.orders.filter((order) => order.paymentStatus === 'pagado' && order.paymentMethod !== 'Crédito');
    const billedOrders = data.orders.filter((order) => order.paymentStatus === 'pagado' || order.paymentStatus === 'credito');
    const billedOrderIds = new Set(billedOrders.map((o) => o.id));
    const cashItems = data.items.filter((item) => billedOrderIds.has(item.orderId));

    // Categorización unificada de ítems y deliverys facturados
    const cat = this.categorizeReportItems(cashItems, billedOrders, copRateGlobal, bsRateGlobal);

    const renderCategoryRows = (items: Array<{ name: string; quantity: number; subtotalUSD: number; subtotalCOP: number }>, emptyMsg: string) => {
      if (items.length === 0) {
        return `<tr><td colspan="3" style="text-align:center; color:#9ca3af; padding:5px;">${emptyMsg}</td></tr>`;
      }
      return items.map((item) => `
        <tr>
          <td><strong>${this.escapeHtml(item.name)}</strong></td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:right; font-weight:700;">
            ${Math.round(item.subtotalCOP).toLocaleString('es-CO')} COP
            <span style="font-size:9.5px; font-weight:normal; color:#4b5563; display:block;">
              (≈ $${item.subtotalUSD.toFixed(2)} USD)
            </span>
          </td>
        </tr>
      `).join('');
    };

    const comidasRows = renderCategoryRows(cat.comidasItems, 'Sin comidas facturadas en el intervalo.');
    const bebidasRows = renderCategoryRows(cat.bebidasItems, 'Sin bebidas facturadas en el intervalo.');
    const adicionalesRows = renderCategoryRows(cat.adicionalesItems, 'Sin adicionales facturados en el intervalo.');
    const otrosRows = renderCategoryRows(cat.otrosItems, 'Sin otros conceptos facturados en el intervalo.');
    const totalItemsUSD = cat.totalRevenueUSD;
    const totalItemsCOP = cat.totalRevenueCOP;
    const totalItemsBs = cat.totalRevenueBs;
    const totalVentaFacturadaCOP = billedTotals.cop + (billedTotals.usd * copRateGlobal) + (bsRateGlobal > 0 ? (billedTotals.bs * bsRateGlobal) : 0);
    const totalVentaFacturadaUSD = copRateGlobal > 0 ? (totalVentaFacturadaCOP / copRateGlobal) : billedTotals.usd;

    const firstOrder = data.orders[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders[data.orders.length - 1]?.orderNumber || 'N/A';

    // Desglose por Tipo de Pago (Columna de Moneda y Monto Facturado Neto)
    const methodRows = Array.from(methodTotals.entries())
      .filter(([, totals]) => totals.count > 0 || totals.netNative !== 0)
      .map(([method, totals]) => {
        const formattedAmount = totals.currency === 'USD'
          ? `$${totals.netNative.toFixed(2)}`
          : totals.currency === 'COP'
          ? `$${Math.round(totals.netNative).toLocaleString()} COP`
          : `Bs ${totals.netNative.toFixed(2)}`;
        return `
          <tr>
            <td><strong>${this.escapeHtml(this.paymentMethodLabel(method))}</strong></td>
            <td>${totals.currency}</td>
            <td style="text-align:center;">${totals.count}</td>
            <td style="text-align:right; font-weight:700;">${formattedAmount}</td>
          </tr>
        `;
      }).join('');

    // Desglose de Créditos y Cuentas por Cobrar
    const totalCreditUSD = creditOrders.reduce((sum, o) => sum + (o.totalUSD || 0), 0);
    const creditRows = creditOrders.map((ord) => {
      const orderItems = data.items
        .filter((it) => it.orderId === ord.id)
        .map((it) => `${it.quantity}x ${this.escapeHtml(it.productName.replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar)\)/gi, '').trim())}`)
        .join(', ');
      const ordCop = ord.totalCOP || roundCOP(ord.totalUSD * (ord.copRateAtPayment || copRateGlobal));
      const copEquiv = ordCop.toLocaleString('es-CO');
      const bRate = ord.bsRateAtPayment || bsRateGlobal;
      const bsEquiv = bRate > 0 ? (ordCop / bRate).toFixed(2) : '0.00';
      return `
        <tr>
          <td><strong>#${this.escapeHtml(ord.orderNumber)}</strong></td>
          <td>${this.reportDate(ord.createdAt)}</td>
          <td><strong>${this.escapeHtml(ord.customerName || 'Cliente Deudor')}</strong></td>
          <td style="font-size:7.5px;">${orderItems || 'Consumo general'}</td>
          <td style="text-align:right; font-weight:900; color:#b45309;">
            ${copEquiv} COP
            <div style="font-size:7px; color:#78350f; font-weight:normal;">(≈ $${ord.totalUSD.toFixed(2)} USD / ${bsEquiv} Bs)</div>
          </td>
        </tr>
      `;
    }).join('');
    // Historial por Método de Pago (Moneda y Monto Facturado) - Excluye Efectivo USD, Efectivo COP y Crédito (este último ya detallado en Sección 4)
    const historyByMethod = Array.from(methodTotals.keys())
      .filter((method) => method !== 'Efectivo COP' && method !== 'Efectivo USD' && method !== 'Efectivo' && method !== 'Crédito')
      .map((method) => {
      const entries = data.payments.filter((payment) => payment.paymentMethod === method && (payment.amountPaidUSD > 0 || payment.changeGivenUSD > 0 || payment.changeGivenCOP > 0 || payment.changeGivenBs > 0));
      if (entries.length === 0) return '';
      return `
        <h4 style="font-size:10px; font-weight:900; margin:12px 0 4px; padding:3px 6px; background:#f3f4f6;">${this.escapeHtml(this.paymentMethodLabel(method))}</h4>
        <table>
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Comanda</th>
              <th>Pagador</th>
              <th>Moneda</th>
              <th style="text-align:right;">Monto Facturado</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((payment) => {
              const amounts = this.registeredSaleAmounts(payment);
              const changeAmounts = {
                usd: Number(payment.changeGivenUSD) || 0,
                cop: Number(payment.changeGivenCOP) || 0,
                bs: Number(payment.changeGivenBs) || 0,
              };
              const isChangeOnly = (payment.amountPaidUSD || 0) === 0 && (changeAmounts.usd > 0 || changeAmounts.cop > 0 || changeAmounts.bs > 0);
              let formatted = '';
              if (isChangeOnly) {
                if (changeAmounts.usd > 0) formatted = `-$${changeAmounts.usd.toFixed(2)} (Vuelto)`;
                else if (changeAmounts.cop > 0) formatted = `-$${Math.round(changeAmounts.cop).toLocaleString()} COP (Vuelto)`;
                else if (changeAmounts.bs > 0) formatted = `-Bs ${changeAmounts.bs.toFixed(2)} (Vuelto)`;
              } else {
                formatted = amounts.currency === 'USD'
                  ? `$${amounts.usd.toFixed(2)}`
                  : amounts.currency === 'COP'
                  ? `$${Math.round(amounts.cop).toLocaleString()} COP`
                  : `Bs ${amounts.bs.toFixed(2)}`;
              }
              return `
                <tr>
                  <td>${this.reportDate(payment.createdAt)}</td>
                  <td>#${this.escapeHtml(payment.orderNumber)}</td>
                  <td>${this.escapeHtml(payment.payerName)}</td>
                  <td>${amounts.currency}</td>
                  <td style="text-align:right; font-weight:700; ${isChangeOnly ? 'color:#dc2626;' : ''}">${formatted}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }).join('');

    const content = `
      <div class="section-title">SECCIÓN 1 — DATOS DEL INTERVALO</div>
      <table>
        <tbody>
          <tr><td><strong>Rango Fecha / Hora:</strong></td><td>${this.intervalTitle(data)}</td></tr>
          <tr><td><strong>Comanda inicial:</strong></td><td>#${this.escapeHtml(firstOrder)}</td></tr>
          <tr><td><strong>Comanda final:</strong></td><td>#${this.escapeHtml(lastOrder)}</td></tr>
        </tbody>
      </table>

      <div class="section-title">SECCIÓN 2 — TOTAL FACTURADO POR MONEDA</div>
      <table>
        <thead>
          <tr>
            <th>Moneda</th>
            <th style="text-align:right;">Monto Facturado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>🇨🇴 Pesos Colombianos (COP)</td>
            <td style="text-align:right; font-weight:900; color:#047857;">$${Math.round(billedTotals.cop).toLocaleString('es-CO')} COP</td>
          </tr>
          <tr>
            <td>💵 Dólares (USD)</td>
            <td style="text-align:right; font-weight:700;">$${billedTotals.usd.toFixed(2)} USD</td>
          </tr>
          <tr>
            <td>🇻🇪 Bolívares (Bs)</td>
            <td style="text-align:right; font-weight:700;">Bs ${billedTotals.bs.toFixed(2)}</td>
          </tr>
          <tr style="background:#ecfdf5; border-top:2px solid #059669;">
            <td><strong style="color:#065f46; font-size:11.5px;">VENTA TOTAL EN PESOS (FACTURADO):</strong></td>
            <td style="text-align:right; font-weight:900; color:#047857; font-size:14px;">
              ${Math.round(totalVentaFacturadaCOP).toLocaleString('es-CO')} COP
              <div style="font-size:10px; font-weight:700; color:#065f46;">(≈ $${totalVentaFacturadaUSD.toFixed(2)} USD)</div>
            </td>
          </tr>
          <tr style="background:#f9fafb;">
            <td><strong>Total Comandas Atendidas:</strong></td>
            <td style="text-align:right;"><strong>${data.orders.length}</strong></td>
          </tr>
          <tr>
            <td>Comandas al Contado:</td>
            <td style="text-align:right;">${cashOrders.length}</td>
          </tr>
          <tr>
            <td>Comandas a Crédito (Cuentas por Cobrar):</td>
            <td style="text-align:right; font-weight:700; color:#b45309;">${creditOrders.length}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">SECCIÓN 3 — DESGLOSE POR TIPO DE PAGO</div>
      <table>
        <thead>
          <tr>
            <th>Método de Pago</th>
            <th>Moneda</th>
            <th style="text-align:center;">Mov.</th>
            <th style="text-align:right;">Monto Facturado</th>
          </tr>
        </thead>
        <tbody>
          ${methodRows || '<tr><td colspan="4" style="text-align:center; color:#9ca3af;">Sin cobros registrados.</td></tr>'}
        </tbody>
      </table>

      ${creditOrders.length > 0 ? `
        <div class="section-title">SECCIÓN 4 — DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR</div>
        <table>
          <thead>
            <tr>
              <th>Comanda</th>
              <th>Fecha / Hora</th>
              <th>Cliente / Deudor</th>
              <th>Ítems</th>
              <th style="text-align:right;">Monto Deuda</th>
            </tr>
          </thead>
          <tbody>
            ${creditRows}
          </tbody>
        </table>
        <div class="total-box" style="background:#fffbeb; border-color:#fde68a;">
          <div class="total-label" style="color:#92400e;">TOTAL CUENTAS A CRÉDITO POR COBRAR (PESOS):</div>
          <div class="total-val" style="color:#b45309;">${Math.round(totalCreditUSD * copRateGlobal).toLocaleString('es-CO')} COP</div>
          <div style="font-size:10px; font-weight:700; color:#92400e;">(≈ $${totalCreditUSD.toFixed(2)} USD)</div>
        </div>
      ` : `
        <div class="section-title">SECCIÓN 4 — DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR</div>
        <table>
          <tbody>
            <tr><td style="text-align:center; color:#9ca3af; padding:8px;">Sin comandas a crédito en el intervalo.</td></tr>
          </tbody>
        </table>
      `}

      <div class="section-title">SECCIÓN 5 — HISTORIAL POR MÉTODO DE PAGO</div>
      ${historyByMethod || '<p style="font-size:10px; color:#6b7280; text-align:center;">Sin pagos en el intervalo.</p>'}

      <div class="section-title">SECCIÓN 6 — ÍTEMS FACTURADOS POR CATEGORÍA</div>

      <!-- 6.1 COMIDAS -->
      <div style="font-size:10px; font-weight:900; margin:10px 0 3px; padding:3px 8px; background:#fef3c7; color:#92400e; border-left:3px solid #f59e0b;">
        6.1 COMIDAS (Hot Dogs, Raciones y Acompañantes)
      </div>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th style="text-align:center; width:60px;">Cant.</th>
            <th style="text-align:right; width:130px;">Total COP</th>
          </tr>
        </thead>
        <tbody>
          ${comidasRows}
        </tbody>
      </table>

      <!-- 6.2 BEBIDAS -->
      <div style="font-size:10px; font-weight:900; margin:14px 0 3px; padding:3px 8px; background:#e0f2fe; color:#075985; border-left:3px solid #0284c7;">
        6.2 BEBIDAS (Refrescos, Jugos, Cervezas, Granizados, Aguas)
      </div>
      <table>
        <thead>
          <tr>
            <th>Producto (Unificado)</th>
            <th style="text-align:center; width:60px;">Cant.</th>
            <th style="text-align:right; width:130px;">Total COP</th>
          </tr>
        </thead>
        <tbody>
          ${bebidasRows}
        </tbody>
      </table>

      <!-- 6.3 ADICIONALES -->
      <div style="font-size:10px; font-weight:900; margin:14px 0 3px; padding:3px 8px; background:#f3e8ff; color:#6b21a8; border-left:3px solid #9333ea;">
        6.3 ADICIONALES (Adicionales Pagos y Toppings Gratis)
      </div>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th style="text-align:center; width:60px;">Cant.</th>
            <th style="text-align:right; width:130px;">Total COP</th>
          </tr>
        </thead>
        <tbody>
          ${adicionalesRows}
        </tbody>
      </table>

      <!-- 6.4 OTROS -->
      <div style="font-size:10px; font-weight:900; margin:14px 0 3px; padding:3px 8px; background:#f1f5f9; color:#334155; border-left:3px solid #64748b;">
        6.4 OTROS (Servicios de Delivery y Otros Conceptos)
      </div>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th style="text-align:center; width:60px;">Cant.</th>
            <th style="text-align:right; width:130px;">Total COP</th>
          </tr>
        </thead>
        <tbody>
          ${otrosRows}
        </tbody>
      </table>

      <div class="total-box" style="margin-top:14px; background:#ecfdf5; border-color:#059669;">
        <div class="total-label" style="color:#065f46; font-size:11px;">TOTAL GENERAL FACTURADO EN ÍTEMS (PESOS):</div>
        <div class="total-val" style="color:#047857; font-size:15px;">${Math.round(totalItemsCOP).toLocaleString('es-CO')} COP</div>
        <div style="font-size:10px; font-weight:800; color:#065f46; margin-top:2px;">
          (≈ $${totalItemsUSD.toFixed(2)} USD / ${totalItemsBs.toFixed(2)} Bs)
        </div>
      </div>
    `;

    this.openPrintWindow('Reporte_Contable_Intervalo', content);
  }

  public generatePreCuentaTicket(order: Order, rates: ExchangeRates) {
    const copRate = order.copRateAtPayment || rates.COP || 3100;
    const bsRate = order.bsRateAtPayment || rates.Bs || 3.2;
    const totalCOP = (order as any).totalCOP || roundCOP((order.totalUSD || 0) * copRate);
    const totalUSD = copRate > 0 ? totalCOP / copRate : (order.totalUSD || 0);
    const totalBs = bsRate > 0 ? (totalCOP / bsRate).toFixed(2) : '0.00';
    const cleanOrderNumber = (order.orderNumber || '').toString().replace(/^#+/, '');

    // Renderizar cada ítem del pedido de forma sencilla y directa (excluyendo salsas, que no van en pre-cuenta)
    const billableItems = (order.items || []).filter((it) => !isSalsaItem(it));
    const itemsHtml = billableItems.map((it) => {
      const qty = it.quantity || 1;
      const cleanName = (it.productName || 'Producto')
        .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '')
        .trim();
      const lineTotalCOP = (Number(it.price) || 0) * qty;

      let extrasDetail = '';
      const extrasList: any[] = [];
      if (Array.isArray(it.extras)) extrasList.push(...it.extras);
      else if ((it as any).extrasJson && Array.isArray((it as any).extrasJson)) extrasList.push(...(it as any).extrasJson);
      else if (typeof (it as any).extrasJson === 'string') {
        try {
          const parsed = JSON.parse((it as any).extrasJson);
          if (Array.isArray(parsed)) extrasList.push(...parsed);
        } catch (e) {}
      }

      const paidExtras = extrasList.filter((e) => Number(e.price) > 0);
      if (paidExtras.length > 0) {
        extrasDetail = `<div style="font-size: 10px; color: #4b5563; font-weight: 600; padding-left: 6px;">` +
          paidExtras.map((e) => {
            const q = Number(e.quantity) || 1;
            const cleanName = (e.name || 'Adicional').replace(/^\d+x\s*/i, '').trim();
            const label = q > 1 ? `${q}x ${cleanName}` : cleanName;
            return `+ ADD ${this.escapeHtml(label)} (${Math.round(Number(e.price) * qty).toLocaleString('es-CO')} COP)`;
          }).join(', ') +
          `</div>`;
      }

      let flavorDetail = '';
      if (it.flavor && !cleanName.toLowerCase().includes(String(it.flavor).toLowerCase())) {
        flavorDetail = `<div style="font-size: 10px; color: #b45309; font-weight: 700; padding-left: 6px;">🍹 Sabor: ${this.escapeHtml(it.flavor)}</div>`;
      }

      let deliveryBadge = '';
      if (order.type !== 'delivery') {
        if ((it as any).isDelivery) {
          deliveryBadge = ` <span style="background: #dbeafe; color: #1e40af; font-size: 10px; padding: 1px 4px; border-radius: 4px;">🛵 Delivery</span>`;
        } else if ((it as any).isTakeaway) {
          const hasSalon = (order.items || []).some(item => !(item as any).isTakeaway && !(item as any).isDelivery);
          if (order.type === 'mesa' || (order.type === 'pickup' && hasSalon)) {
            deliveryBadge = ` <span style="background: #fef3c7; color: #92400e; font-size: 10px; padding: 1px 4px; border-radius: 4px;">🛍️ Llevar</span>`;
          }
        }
      }

      return `
        <tr>
          <td style="padding: 4px 0; font-weight: 800; font-size: 12px; color: #111827; border-bottom: 1px dashed #e5e7eb;">
            ${qty}x ${this.escapeHtml(cleanName)}${deliveryBadge}
            ${flavorDetail}
            ${extrasDetail}
          </td>
          <td style="padding: 4px 0; text-align: right; font-weight: 800; font-size: 12px; vertical-align: top; border-bottom: 1px dashed #e5e7eb;">
            ${Math.round(lineTotalCOP).toLocaleString('es-CO')} COP
          </td>
        </tr>
      `;
    }).join('');

    const deliveryFeeCOP = (order as any).deliveryFeeCOP || ((Number(order.deliveryFeeUSD) || 0) * copRate);
    const deliveryHtml = deliveryFeeCOP > 0 ? `
      <tr>
        <td style="padding: 4px 0; font-weight: 800; font-size: 12px; color: #111827; border-bottom: 1px dashed #e5e7eb;">1x Servicio Delivery</td>
        <td style="padding: 4px 0; text-align: right; font-weight: 800; font-size: 12px; border-bottom: 1px dashed #e5e7eb;">${Math.round(deliveryFeeCOP).toLocaleString('es-CO')} COP</td>
      </tr>
    ` : '';

    const content = `
      <div class="header" style="text-align: center; border-bottom: 2px solid #111827; padding-bottom: 4px;">
        <div class="logo-title" style="font-size: 16px; font-weight: 900; color: #111827;">MUGROSITO</div>
        <div style="font-size: 11px; font-weight: 900; color: #b45309; margin-top: 1px;">PRE-CUENTA / CONSUMO</div>
      </div>

      <div class="meta-card" style="font-size: 11px; margin: 6px 0; padding: 6px; background: #f9fafb; border: 1.5px solid #d1d5db; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: 900; color: #111827; font-size: 12px;">
          <span>COMANDA: #${cleanOrderNumber}</span>
          <span style="background: #fef08a; padding: 1px 6px; border-radius: 4px; border: 1px solid #facc15; font-size: 10px;">
            ${order.type === 'mesa' ? `MESA #${order.tableNumber}` : order.type === 'delivery' ? 'DELIVERY' : 'PICKUP'}
          </span>
        </div>
        <div style="margin-top: 4px; font-weight: 700; font-size: 11px;"><strong>Cliente:</strong> ${this.escapeHtml(order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General'))}</div>
        <div style="font-size: 10px; color: #4b5563;"><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleString('es-VE')}</div>
      </div>

      <div class="section-title" style="font-size: 11px; font-weight: 900; border-bottom: 1.5px solid #111827; padding-bottom: 2px; margin-bottom: 4px;">DETALLE DE CONSUMO</div>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #9ca3af; font-size: 10px; color: #4b5563;">
            <th style="text-align: left; padding-bottom: 2px;">DESCRIPCIÓN</th>
            <th style="text-align: right; padding-bottom: 2px;">TOTAL COP</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          ${deliveryHtml}
        </tbody>
      </table>

      <!-- CAJA TOTALIZADORA CON LAS 3 MONEDAS SIMULTÁNEAS -->
      <div class="total-box" style="margin-top: 12px; padding: 10px; background: #fffbeb; border: 2px solid #facc15; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 900; color: #78350f; text-transform: uppercase;">TOTAL A PAGAR:</div>
        <div style="font-size: 24px; font-weight: 900; color: #111827; text-align: right; line-height: 1.1;">
          ${Math.round(totalCOP).toLocaleString('es-CO')} <span style="font-size: 13px; font-weight: 800;">COP</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; margin-top: 8px; padding-top: 6px; border-top: 1.5px dashed #facc15;">
          <span style="color: #0369a1;">🇺🇸 USD: $${totalUSD.toFixed(2)}</span>
          <span style="color: #111827;">🇻🇪 Bs: ${totalBs}</span>
        </div>
      </div>

      <div class="footer" style="text-align: center; margin-top: 12px; border-top: 1px dashed #9ca3af; padding-top: 8px; font-size: 10px; font-weight: 900;">
        ¡GRACIAS POR SU PREFERENCIA!<br>
        <span style="font-size: 8.5px; font-weight: 700; color: #4b5563;">MUGROSITO POS</span>
      </div>
    `;

    this.openPrintWindow(`PreCuenta_Comanda_${order.orderNumber}`, content);
  }
}

export const reportService = new ReportService();
