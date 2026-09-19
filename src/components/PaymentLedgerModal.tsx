import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IoClose,
  IoEyeOutline,
  IoTrashOutline,
  IoCheckmark,
  IoWarningOutline,
  IoReceiptOutline,
} from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order, PaymentMethod } from '../data/mockData';
import { roundCOPPayment } from '../utils/currencyRounding';

type Currency = 'USD' | 'COP' | 'Bs';
type EntryType = 'payment' | 'change';

const methodsByCurrency: Record<Currency, { value: PaymentMethod; label: string }[]> = {
  USD: [
    { value: 'Efectivo USD', label: 'EFECTIVO DÓLARES' },
    { value: 'Binance', label: 'BINANCE USDT' },
    { value: 'Zelle', label: 'ZELLE' },
  ],
  COP: [
    { value: 'Efectivo COP', label: 'EFECTIVO PESOS' },
    { value: 'Bancolombia', label: 'BANCOLOMBIA' },
    { value: 'Nequi', label: 'NEQUI' },
  ],
  Bs: [
    { value: 'Pago Móvil', label: 'PAGO MÓVIL' },
    { value: 'Tarjeta de Débito', label: 'PUNTO DÉBITO' },
    { value: 'Tarjeta de Crédito', label: 'PUNTO CRÉDITO' },
  ],
};

function asUSD(amount: number, currency: Currency, copRate: number, bsRate: number) {
  if (currency === 'COP') return copRate > 0 ? amount / copRate : 0;
  if (currency === 'Bs') return (copRate > 0 && bsRate > 0) ? (amount * bsRate) / copRate : 0;
  return amount;
}

interface PaymentLedgerModalProps {
  order: Order | null;
  onClose: () => void;
  onViewOrder: (order: Order) => void;
  paymentScope?: {
    payerName: string;
    itemIds: string[];
  };
  onEditPaymentScope?: (order: Order) => void;
}

export const PaymentLedgerModal: React.FC<PaymentLedgerModalProps> = ({
  order,
  onClose,
  onViewOrder,
  paymentScope,
  onEditPaymentScope,
}) => {
  const {
    orders,
    exchangeRates,
    registerLedgerEntry,
    deletePaymentEntry,
    finalizeOrder,
    closeOrderAsCredit,
    printOrderReceipt,
  } = useApp();

  // Form Fields
  const [entryType, setEntryType] = useState<EntryType>('payment');
  const [currency, setCurrency] = useState<Currency>('COP');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo COP');
  const [amountLocal, setAmountLocal] = useState('');
  const [payerName, setPayerName] = useState('Cliente General');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Credit Modal States
  const [isCreditPromptOpen, setIsCreditPromptOpen] = useState(false);
  const [creditDebtorInput, setCreditDebtorInput] = useState('');
  const [creditNotesInput, setCreditNotesInput] = useState('');
  const [creditError, setCreditError] = useState('');

  // Prompt de confirmación de impresión de recibo (Tarea 10)
  const [showReceiptPrompt, setShowReceiptPrompt] = useState(false);

  // Autofocus en monto (Tarea 14)
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!order) return;
    setPayerName(
      paymentScope?.payerName ||
        order.customerName ||
        (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')
    );
    setEntryType('payment');
    setCurrency('COP');
    setPaymentMethod('Efectivo COP');
    setAmountLocal('');
    setError('');
    setIsCreditPromptOpen(false);
    setCreditError('');
    setShowReceiptPrompt(false);

    // Auto-enfocar campo de monto al abrir
    setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 120);
  }, [order, paymentScope?.payerName]);

  const liveOrder = orders.find((o: Order) => o.id === order?.id) || order;
  const [localHistory, setLocalHistory] = useState<Order['paymentHistory']>(order?.paymentHistory || []);

  useEffect(() => {
    if (liveOrder?.paymentHistory) {
      setLocalHistory(liveOrder.paymentHistory);
    }
  }, [liveOrder?.paymentHistory]);

  const history = localHistory || [];
  const currentItems = liveOrder?.items || order?.items || [];
  const scopedItems = paymentScope
    ? currentItems.filter((item: Order['items'][number]) => paymentScope.itemIds.includes(item.id))
    : currentItems;

  const currentTotalUSD = liveOrder?.totalUSD ?? order?.totalUSD ?? 0;
  const currentTotalCOP = liveOrder?.totalCOP ?? order?.totalCOP ?? Math.round(currentTotalUSD * exchangeRates.COP);
  const scopedItemsCOP = scopedItems.reduce(
    (total: number, item: Order['items'][number]) => total + (item.price || 0) * (item.quantity || 1),
    0
  );
  const scopeTotalCOP = paymentScope ? scopedItemsCOP : currentTotalCOP;
  const scopeTotalUSD = paymentScope
    ? (exchangeRates.COP > 0 ? scopedItemsCOP / exchangeRates.COP : 0)
    : currentTotalUSD;

  const scopedHistory = paymentScope
    ? history.filter((entry: Order['paymentHistory'][number]) => entry.itemIds?.some((itemId: string) => paymentScope.itemIds.includes(itemId)))
    : history;

  const getEntryTenderedUSD = (item: Order['paymentHistory'][number]) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    let usd = item.cashTenderedUSD || 0;
    if ((item.cashTenderedCOP || 0) > 0) {
      if ((item.amountPaidUSD || 0) > 0 && rateCOP > 0) {
        const requiredCOP = roundCOPPayment((item.amountPaidUSD || 0) * rateCOP);
        const excessCOP = Math.max(0, (item.cashTenderedCOP || 0) - requiredCOP);
        usd += (item.amountPaidUSD || 0) + (excessCOP / rateCOP);
      } else if (rateCOP > 0) {
        usd += (item.cashTenderedCOP || 0) / rateCOP;
      }
    }
    if ((item.cashTenderedBs || 0) > 0 && rateBs > 0 && rateCOP > 0) {
      usd += ((item.cashTenderedBs || 0) * rateBs) / rateCOP;
    }
    return usd;
  };

  const getEntryChangeUSD = (item: Order['paymentHistory'][number]) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return (
      (item.changeGivenUSD || 0) +
      (rateCOP > 0 ? (item.changeGivenCOP || 0) / rateCOP : 0) +
      (rateBs > 0 && rateCOP > 0 ? ((item.changeGivenBs || 0) * rateBs) / rateCOP : 0)
    );
  };

  const paidUSD = scopedHistory.reduce((total, item) => total + (item.amountPaidUSD || 0), 0);
  const tenderedUSD = scopedHistory.reduce((total, item) => total + getEntryTenderedUSD(item), 0);
  const changeGivenUSD = scopedHistory.reduce((total, item) => total + getEntryChangeUSD(item), 0);

  // Totales nativos en cada moneda para evitar desvíos o errores de redondeo al convertir de ida y vuelta
  const totalTenderedCOP = scopedHistory.reduce((sum, it) => {
    if ((it.cashTenderedCOP || 0) > 0) return sum + (it.cashTenderedCOP || 0);
    const rate = it.copRate || exchangeRates.COP;
    if ((it.cashTenderedUSD || 0) > 0) return sum + (it.cashTenderedUSD || 0) * rate;
    if ((it.cashTenderedBs || 0) > 0) {
      const rateBs = it.bsRate || exchangeRates.Bs;
      return sum + (it.cashTenderedBs || 0) * rateBs;
    }
    return sum + (it.amountPaidUSD || 0) * rate;
  }, 0);

  const totalChangeGivenCOP = scopedHistory.reduce((sum, it) => {
    if ((it.changeGivenCOP || 0) > 0) return sum + (it.changeGivenCOP || 0);
    const rate = it.copRate || exchangeRates.COP;
    if ((it.changeGivenUSD || 0) > 0) return sum + (it.changeGivenUSD || 0) * rate;
    if ((it.changeGivenBs || 0) > 0) {
      const rateBs = it.bsRate || exchangeRates.Bs;
      return sum + (it.changeGivenBs || 0) * rateBs;
    }
    return sum;
  }, 0);

  const totalTenderedBs = scopedHistory.reduce((sum, it) => {
    if ((it.cashTenderedBs || 0) > 0) return sum + (it.cashTenderedBs || 0);
    const rateBs = it.bsRate || exchangeRates.Bs;
    const rateCOP = it.copRate || exchangeRates.COP;
    if ((it.cashTenderedUSD || 0) > 0) return sum + (rateBs > 0 ? ((it.cashTenderedUSD || 0) * rateCOP) / rateBs : 0);
    if ((it.cashTenderedCOP || 0) > 0) {
      return sum + (rateBs > 0 ? (it.cashTenderedCOP || 0) / rateBs : 0);
    }
    return sum + (rateBs > 0 ? ((it.amountPaidUSD || 0) * rateCOP) / rateBs : 0);
  }, 0);

  const totalChangeGivenBs = scopedHistory.reduce((sum, it) => {
    if ((it.changeGivenBs || 0) > 0) return sum + (it.changeGivenBs || 0);
    const rateBs = it.bsRate || exchangeRates.Bs;
    const rateCOP = it.copRate || exchangeRates.COP;
    if ((it.changeGivenUSD || 0) > 0) return sum + (rateBs > 0 ? ((it.changeGivenUSD || 0) * rateCOP) / rateBs : 0);
    if ((it.changeGivenCOP || 0) > 0) {
      return sum + (rateBs > 0 ? (it.changeGivenCOP || 0) / rateBs : 0);
    }
    return sum;
  }, 0);

  const pendingDebtUSD = Math.max(0, scopeTotalUSD - paidUSD);
  const pendingChangeUSD = Math.max(0, tenderedUSD - scopeTotalUSD - changeGivenUSD);

  const fullOrderPaidUSD = history.reduce((total, item) => total + (item.amountPaidUSD || 0), 0);
  const fullOrderTenderedUSD = history.reduce((total, item) => total + getEntryTenderedUSD(item), 0);
  const fullOrderChangeUSD = history.reduce((total, item) => total + getEntryChangeUSD(item), 0);

  const entryUSD = asUSD(Number(amountLocal) || 0, currency, exchangeRates.COP, exchangeRates.Bs);

  const copToleranceUSD = exchangeRates.COP > 0 ? (1000 / exchangeRates.COP) : 0.05;
  const isReadyToClose =
    Math.max(0, (order?.totalUSD || 0) - fullOrderPaidUSD) <= 0.05 &&
    Math.max(0, fullOrderTenderedUSD - (order?.totalUSD || 0) - fullOrderChangeUSD) <= Math.max(0.05, copToleranceUSD);

  // Auto-switch to change if debt is settled but change is owed
  useEffect(() => {
    if (!order) return;
    if (pendingDebtUSD <= 0.01 && pendingChangeUSD > 0.01 && entryType === 'payment') {
      setEntryType('change');
      setAmountLocal('');
    }
  }, [order, pendingDebtUSD, pendingChangeUSD, entryType]);

  const hasSplitPayments = !paymentScope && (
    history.some((p) => Array.isArray(p.itemIds) && p.itemIds.length > 0) ||
    currentItems.some((it) => it.isPaidIndividually)
  );

  if (!order) return null;

  const changeCurrency = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    setPaymentMethod(methodsByCurrency[nextCurrency][0].value);
    setError('');
  };

  const fillExactAmount = () => {
    const debtInCOP = pendingDebtUSD * exchangeRates.COP;
    const changeInCOP = Math.max(0, totalTenderedCOP - scopeTotalCOP - totalChangeGivenCOP);
    if (entryType === 'payment') {
      if (currency === 'USD') setAmountLocal(pendingDebtUSD.toFixed(2));
      if (currency === 'COP') setAmountLocal(String(roundCOPPayment(debtInCOP)));
      if (currency === 'Bs') setAmountLocal((exchangeRates.Bs > 0 ? debtInCOP / exchangeRates.Bs : 0).toFixed(2));
    } else {
      if (currency === 'USD') setAmountLocal(pendingChangeUSD.toFixed(2));
      if (currency === 'COP') setAmountLocal(String(Math.round(changeInCOP)));
      if (currency === 'Bs') setAmountLocal((exchangeRates.Bs > 0 ? changeInCOP / exchangeRates.Bs : 0).toFixed(2));
    }
  };

  const handleRegisterEntry = async () => {
    if (hasSplitPayments) {
      setError('Esta comanda se está cobrando por personas. Cierra esta ventana y usa la opción "👥 X PERSONAS" para registrar los cobros individuales.');
      return;
    }
    const val = Number(amountLocal);
    if (!val || val <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const updated = await registerLedgerEntry(order.id, {
        entryType,
        currency,
        amountLocal: val,
        paymentMethod,
        payerName: payerName.trim() || 'Cliente General',
        itemIds: paymentScope?.itemIds,
      });
      if (updated && updated.paymentHistory) {
        setLocalHistory(updated.paymentHistory);
      }
      setAmountLocal('');
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEntry = async (paymentId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    // Actualización inmediata para que el pago no se quede dibujado en la modal
    setLocalHistory((prev) => (prev || []).filter((p) => p.id !== paymentId));
    try {
      const updated = await deletePaymentEntry(order.id, paymentId);
      if (updated && updated.paymentHistory) {
        setLocalHistory(updated.paymentHistory);
      }
    } catch (err: any) {
      if (liveOrder?.paymentHistory) {
        setLocalHistory(liveOrder.paymentHistory);
      }
      setError(err?.message || 'Error al anular el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!isReadyToClose || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await finalizeOrder(order.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al finalizar la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreditConfirm = async () => {
    if (!creditDebtorInput.trim()) {
      setCreditError('⚠️ Es OBLIGATORIO ingresar el nombre del cliente o deudor.');
      return;
    }
    setIsSubmitting(true);
    setCreditError('');
    try {
      await closeOrderAsCredit(order.id, creditDebtorInput.trim(), creditNotesInput.trim() || undefined);
      setIsCreditPromptOpen(false);
      onClose();
    } catch (err: any) {
      setCreditError(err?.message || 'Error al cerrar comanda a crédito.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-white w-full h-full max-h-screen overflow-hidden text-gray-900 select-none">
      <div className="w-full h-full flex flex-col overflow-hidden text-gray-900 border-none rounded-none shadow-none">
        {/* Top Title Bar - CLARO OFICIAL MUGROSITO */}
        <div className="bg-white text-gray-900 px-6 py-3 flex items-center justify-between shrink-0 border-b-2 border-yellow-400 shadow-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-yellow-600 font-black text-xl">≡</span>
            <h2 className="font-black text-base sm:text-xl tracking-wide text-gray-900 flex items-center gap-2">
              <span>FORMAS DE PAGO</span>
              <span className="bg-yellow-400 text-black px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-black">
                Comanda #{order.orderNumber.replace(/^#+/, '')}
              </span>
            </h2>
            {order.customerName && (
              <span className="text-xs sm:text-sm bg-stone-100 text-gray-900 px-3 py-1 rounded-lg font-black border border-gray-300">
                👤 {order.customerName}
              </span>
            )}
            {order.type === 'mesa' && (
              <span className="text-xs sm:text-sm bg-stone-100 text-gray-900 px-3 py-1 rounded-lg font-black border border-gray-300">
                🍽️ Mesa #{order.tableNumber}
              </span>
            )}
            {((order.deliveryFeeUSD || 0) > 0 || ((order as any).deliveryFeeCOP || 0) > 0 || order.type === 'delivery') && (() => {
              const delCOP = (order as any).deliveryFeeCOP || (order.deliveryFeeUSD && order.deliveryFeeUSD >= 100 ? order.deliveryFeeUSD : Math.round((order.deliveryFeeUSD || 0) * (order.copRateAtPayment || exchangeRates.COP || 3100)));
              return (
                <span className="text-xs sm:text-sm bg-blue-50 text-blue-900 px-3 py-1 rounded-lg font-black border border-blue-200">
                  🛵 Delivery: {delCOP > 0 ? `+${Math.round(delCOP).toLocaleString('es-CO')} COP` : 'Sin recargo'}
                </span>
              );
            })()}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => (paymentScope && onEditPaymentScope ? onEditPaymentScope(order) : onViewOrder(order))}
              className="px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-yellow-400 hover:text-black text-gray-800 text-xs sm:text-sm font-black border border-gray-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <IoEyeOutline className="text-base" />
              <span>Ver Comanda</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-200 text-gray-600 hover:text-black transition-all cursor-pointer"
            >
              <IoClose className="text-2xl" />
            </button>
          </div>
        </div>

        {/* 3-COLUMN TOTALS (LARGE, HIGH CONTRAST) */}
        <div className="bg-stone-50 border-b border-gray-200 p-4 sm:p-6 shrink-0">
          {(() => {
            const scopeTotalBs = exchangeRates.Bs > 0 ? (scopeTotalCOP / exchangeRates.Bs) : 0;
            const pendingDebtCOP = roundCOPPayment(pendingDebtUSD * exchangeRates.COP);
            const pendingDebtBs = exchangeRates.Bs > 0 ? (pendingDebtUSD * exchangeRates.COP) / exchangeRates.Bs : 0;
            const pendingChangeCOP = Math.max(0, totalTenderedCOP - scopeTotalCOP - totalChangeGivenCOP);
            const pendingChangeBs = exchangeRates.Bs > 0 ? (pendingChangeCOP / exchangeRates.Bs) : 0;

            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* COLUMN 1: PESOS (DESTACADO PRINCIPAL) */}
                  <div className="p-4 sm:p-6 rounded-2xl bg-yellow-50/60 border-2 border-yellow-400 ring-2 ring-yellow-400/40 shadow-sm space-y-2">
                    <div className="flex justify-between items-baseline font-bold text-gray-700">
                      <span className="text-base sm:text-lg font-black text-gray-900">Total en pesos (COP):</span>
                      <span className="text-2xl sm:text-3xl font-black text-black">{scopeTotalCOP.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-bold">
                      <span className="text-sm sm:text-base text-gray-700 font-bold">Abonado / Recibido:</span>
                      <span className="text-lg sm:text-xl font-black text-blue-700">{Math.round(totalTenderedCOP).toLocaleString('es-CO')}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-bold">
                      <span className="text-sm sm:text-base text-gray-700 font-bold">
                        {pendingChangeUSD > 0.005 ? 'Vuelto por dar:' : 'Vueltos en pesos:'}
                      </span>
                      <span className={`text-lg sm:text-xl font-black ${pendingChangeUSD > 0.005 ? 'text-amber-700' : 'text-gray-700'}`}>
                        {(pendingChangeUSD > 0.005 ? pendingChangeCOP : totalChangeGivenCOP).toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>

                  {/* COLUMN 2: DOLARES */}
                  <div className="p-4 sm:p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-sm space-y-2">
                    <div className="flex justify-between items-baseline font-bold text-gray-700">
                      <span className="text-base sm:text-lg font-black text-gray-800">Total en dólares (USD):</span>
                      <span className="text-2xl sm:text-3xl font-black text-black">${scopeTotalUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-bold">
                      <span className="text-sm sm:text-base text-gray-600 font-bold">Abonado / Recibido:</span>
                      <span className="text-lg sm:text-xl font-black text-blue-700">${(tenderedUSD > 0 ? tenderedUSD : paidUSD).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-bold">
                      <span className="text-sm sm:text-base text-gray-600 font-bold">
                        {pendingChangeUSD > 0.005 ? 'Vuelto por dar:' : 'Vueltos en dólares:'}
                      </span>
                      <span className={`text-lg sm:text-xl font-black ${pendingChangeUSD > 0.005 ? 'text-amber-700' : 'text-gray-700'}`}>
                        ${(pendingChangeUSD > 0.005 ? pendingChangeUSD : changeGivenUSD).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* COLUMN 3: BOLIVARES */}
                  <div className="p-4 sm:p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-sm space-y-2">
                    <div className="flex justify-between items-baseline font-bold text-gray-700">
                      <span className="text-base sm:text-lg font-black text-gray-800">Total en bolívares (Bs):</span>
                      <span className="text-2xl sm:text-3xl font-black text-black">{scopeTotalBs.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-bold">
                      <span className="text-sm sm:text-base text-gray-600 font-bold">Abonado / Recibido:</span>
                      <span className="text-lg sm:text-xl font-black text-blue-700">{totalTenderedBs.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-bold">
                      <span className="text-sm sm:text-base text-gray-600 font-bold">
                        {pendingChangeUSD > 0.005 ? 'Vuelto por dar:' : 'Vueltos en bolívares:'}
                      </span>
                      <span className={`text-lg sm:text-xl font-black ${pendingChangeUSD > 0.005 ? 'text-amber-700' : 'text-gray-700'}`}>
                        {((pendingChangeUSD > 0.005 ? pendingChangeBs : totalChangeGivenBs)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pending / Settled Status Alert */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  {pendingDebtUSD > 0.01 ? (
                    <span className="text-base sm:text-lg font-black text-red-700 bg-red-50 border-2 border-red-300 px-5 py-2.5 rounded-2xl shadow-xs">
                      ⚠️ Pendiente por cobrar: {pendingDebtCOP.toLocaleString('es-CO')} COP (≈ ${pendingDebtUSD.toFixed(2)} USD / {pendingDebtBs.toFixed(2)} Bs)
                    </span>
                  ) : pendingChangeUSD > 0.01 ? (
                    <span className="text-base sm:text-lg font-black text-amber-900 bg-amber-100 border-2 border-amber-300 px-5 py-2.5 rounded-2xl animate-pulse shadow-xs">
                      💵 Vuelto pendiente por entregar: {pendingChangeCOP.toLocaleString('es-CO')} COP (≈ ${pendingChangeUSD.toFixed(2)} USD / {pendingChangeBs.toFixed(2)} Bs)
                    </span>
                  ) : (
                    <span className="text-base sm:text-lg font-black text-green-800 bg-green-50 border-2 border-green-300 px-5 py-2.5 rounded-2xl shadow-xs">
                      ✅ Cuenta completamente cubierta y balanceada
                    </span>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {((order.deliveryFeeUSD || 0) > 0 || ((order as any).deliveryFeeCOP || 0) > 0 || order.type === 'delivery') && (() => {
                      const delCOP = (order as any).deliveryFeeCOP || (order.deliveryFeeUSD && order.deliveryFeeUSD >= 100 ? order.deliveryFeeUSD : Math.round((order.deliveryFeeUSD || 0) * (order.copRateAtPayment || exchangeRates.COP || 3100)));
                      const totalCOP = (order as any).totalCOP || Math.round(order.totalUSD * (order.copRateAtPayment || exchangeRates.COP || 3100));
                      const itemsCOP = Math.max(0, totalCOP - delCOP);
                      return (
                        <div className="text-xs sm:text-sm text-blue-950 font-bold bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                          📦 Ítems: {itemsCOP.toLocaleString('es-CO')} COP + 🛵 Delivery: {Math.round(delCOP).toLocaleString('es-CO')} COP
                        </div>
                      );
                    })()}
                    <div className="text-sm sm:text-base text-gray-700 font-extrabold bg-gray-100 px-4 py-2 rounded-2xl border border-gray-200">
                      Tasa USD: 1 USD = {exchangeRates.COP.toLocaleString()} COP | Tasa Bs: 1 BS = {exchangeRates.Bs.toFixed(2)} COP
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Scrollable Middle: Fast Payment Entry Form & History */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-2xl bg-red-100 text-red-800 text-base font-bold flex items-center gap-2 border-2 border-red-300">
              <IoWarningOutline className="text-2xl shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {hasSplitPayments && (
            <div className="p-4 rounded-2xl bg-amber-100 text-amber-950 text-sm sm:text-base font-bold flex items-center justify-between gap-3 border-2 border-amber-300 shadow-sm">
              <div className="flex items-center gap-2">
                <IoWarningOutline className="text-2xl text-amber-700 shrink-0" />
                <span>⚠️ Esta comanda tiene cobros individuales por personas en curso. Para evitar inconsistencias contables, debes cobrar los ítems restantes desde la opción &quot;👥 X PERSONAS&quot;.</span>
              </div>
              {onEditPaymentScope && (
                <button
                  type="button"
                  onClick={() => onEditPaymentScope(order)}
                  className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs sm:text-sm rounded-xl border border-yellow-500 shadow-xs shrink-0 cursor-pointer"
                >
                  IR A X PERSONAS
                </button>
              )}
            </div>
          )}

          {/* Action Row: REGISTRAR LÍNEA DE PAGO / VUELTO */}
          <div className="bg-stone-50 p-5 sm:p-6 rounded-2xl border-2 border-gray-200 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-base sm:text-lg font-black uppercase text-black tracking-wider flex items-center gap-2">
                <IoReceiptOutline className="text-yellow-600 text-2xl" />
                <span>REGISTRAR LÍNEA DE PAGO / VUELTO:</span>
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Denomination Quick Buttons */}
                {(currency === 'COP'
                  ? [10000, 20000, 50000, 100000]
                  : currency === 'USD'
                  ? [5, 10, 20, 50]
                  : [100, 200, 500, 1000]
                ).map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => setAmountLocal(String(bill))}
                    className="text-xs sm:text-sm bg-stone-200 hover:bg-stone-300 text-stone-900 px-2.5 py-1.5 rounded-xl font-black border border-stone-300 transition-colors shadow-2xs cursor-pointer"
                    title={`Fijar monto en ${bill} ${currency}`}
                  >
                    +{bill >= 1000 ? `${bill / 1000}k` : bill}
                  </button>
                ))}

                {((entryType === 'payment' && pendingDebtUSD > 0.01) ||
                  (entryType === 'change' && pendingChangeUSD > 0.01)) && (
                  <button
                    type="button"
                    onClick={fillExactAmount}
                    className="text-sm sm:text-base bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 rounded-xl font-black border border-yellow-500 transition-colors shadow-xs cursor-pointer"
                  >
                    ⚡ Saldo Exacto
                  </button>
                )}
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              {/* Monto input */}
              <div className="sm:col-span-3">
                <label className="block text-sm font-black text-gray-700 uppercase mb-1">Monto:</label>
                <input
                  ref={amountInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountLocal}
                  onChange={(e) => setAmountLocal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRegisterEntry();
                    }
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-yellow-400 bg-white font-black text-2xl sm:text-3xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              {/* Moneda select */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-black text-gray-700 uppercase mb-1">Moneda:</label>
                <select
                  value={currency}
                  onChange={(e) => changeCurrency(e.target.value as Currency)}
                  className="w-full px-3 py-3.5 rounded-2xl border-2 border-gray-300 bg-white font-black text-sm sm:text-base text-black focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                >
                  <option value="USD">DÓLARES (USD)</option>
                  <option value="COP">PESOS (COP)</option>
                  <option value="Bs">BOLÍVARES (Bs)</option>
                </select>
              </div>

              {/* Metodo select */}
              <div className="sm:col-span-3">
                <label className="block text-sm font-black text-gray-700 uppercase mb-1">Tipo de Pago:</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-3.5 rounded-2xl border-2 border-gray-300 bg-white font-black text-sm sm:text-base text-black focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                >
                  {methodsByCurrency[currency].map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Checkbox Vueltos */}
              <div className="sm:col-span-2 flex items-center gap-2 pt-2 sm:pt-6">
                <label className="flex items-center gap-2 cursor-pointer select-none text-base font-black text-gray-800">
                  <input
                    type="checkbox"
                    checked={entryType === 'change'}
                    onChange={(e) => setEntryType(e.target.checked ? 'change' : 'payment')}
                    className="w-5 h-5 rounded text-yellow-500 focus:ring-yellow-400 accent-yellow-500"
                  />
                  <span>Vueltos</span>
                </label>
              </div>

              {/* Action Buttons: Confirm & Clear */}
              <div className="sm:col-span-2 flex items-center gap-2 pt-2 sm:pt-6">
                <button
                  type="button"
                  disabled={!Number(amountLocal) || isSubmitting}
                  onClick={handleRegisterEntry}
                  className="flex-1 py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-base sm:text-lg flex items-center justify-center gap-1.5 transition-all border-2 border-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                  title="Confirmar y agregar línea de pago"
                >
                  <IoCheckmark className="text-2xl font-black" />
                  <span>{isSubmitting ? '...' : 'AGREGAR'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAmountLocal('')}
                  className="p-3.5 rounded-xl bg-gray-200 hover:bg-red-100 text-gray-700 hover:text-red-600 transition-colors cursor-pointer"
                  title="Limpiar monto"
                >
                  <IoTrashOutline className="text-2xl" />
                </button>
              </div>
            </div>

            {/* Equivalent live calculation */}
            {Number(amountLocal) > 0 && (
              <div className="text-sm sm:text-base text-gray-700 font-extrabold pt-2 border-t border-gray-200 flex items-center gap-2">
                <span>Equivalente: ${entryUSD.toFixed(2)} USD</span>
                <span>•</span>
                <span>{entryType === 'change' ? '🟠 Se registrará como Vuelto entregado al cliente' : '🟢 Se registrará como Pago recibido'}</span>
              </div>
            )}
          </div>

          {/* Movements History Table */}
          <div className="space-y-3">
            <h4 className="text-sm sm:text-base font-black uppercase text-gray-800 tracking-wider">
              Movimientos Registrados ({scopedHistory.length}):
            </h4>

            {scopedHistory.length === 0 ? (
              <div className="p-8 rounded-2xl border-2 border-dashed border-gray-300 text-center text-base text-gray-400 font-bold bg-white">
                No hay movimientos registrados para esta comanda.
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-gray-200 overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left text-base border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-800 font-black uppercase text-xs sm:text-sm border-b border-gray-200">
                      <th className="p-3.5">Tipo</th>
                      <th className="p-3.5">Método</th>
                      <th className="p-3.5">Moneda Original</th>
                      <th className="p-3.5">Equivalente USD</th>
                      <th className="p-3.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold">
                    {scopedHistory.map((mov) => {
                      const isChange =
                        mov.entryType === 'change' ||
                        (mov.changeGivenUSD || 0) > 0 ||
                        (mov.changeGivenCOP || 0) > 0 ||
                        (mov.changeGivenBs || 0) > 0;
                      const methodName = mov.paymentMethod || mov.method || 'Efectivo';
                      const isCOP =
                        mov.currency === 'COP' ||
                        (mov.cashTenderedCOP || 0) > 0 ||
                        (mov.changeGivenCOP || 0) > 0 ||
                        methodName.includes('COP') ||
                        methodName.includes('Bancolombia') ||
                        methodName.includes('Nequi');
                      const isBs =
                        mov.currency === 'Bs' ||
                        (mov.cashTenderedBs || 0) > 0 ||
                        (mov.changeGivenBs || 0) > 0 ||
                        methodName.includes('Bs') ||
                        methodName.includes('Móvil') ||
                        methodName.includes('Movil') ||
                        methodName.includes('Débito') ||
                        methodName.includes('Crédito');

                      const rateCOP = mov.copRate || exchangeRates.COP;
                      const rateBs = mov.bsRate || exchangeRates.Bs;

                      const originalAmountStr = isCOP
                        ? isChange
                          ? `${Math.round(mov.changeGivenCOP || 0).toLocaleString()} COP`
                          : `${Math.round(mov.cashTenderedCOP || (mov.amountPaidUSD * rateCOP)).toLocaleString()} COP`
                        : isBs
                        ? isChange
                          ? `${(mov.changeGivenBs || 0).toFixed(2)} Bs`
                          : `${(mov.cashTenderedBs || (mov.amountPaidUSD * rateBs)).toFixed(2)} Bs`
                        : isChange
                        ? `$${(mov.changeGivenUSD || 0).toFixed(2)} USD`
                        : `$${(mov.cashTenderedUSD || mov.amountPaidUSD || 0).toFixed(2)} USD`;

                      const usdEquiv = isChange
                        ? (mov.changeGivenUSD || 0) +
                          (rateCOP > 0 ? (mov.changeGivenCOP || 0) / rateCOP : 0) +
                          (rateBs > 0 ? (mov.changeGivenBs || 0) / rateBs : 0)
                        : (mov.cashTenderedUSD || 0) > 0
                        ? (mov.cashTenderedUSD || 0)
                        : (mov.cashTenderedCOP || 0) > 0 && rateCOP > 0
                        ? (mov.cashTenderedCOP || 0) / rateCOP
                        : (mov.cashTenderedBs || 0) > 0 && rateBs > 0 && rateCOP > 0
                        ? ((mov.cashTenderedBs || 0) * rateBs) / rateCOP
                        : (mov.amountPaidUSD || 0);

                      return (
                        <tr key={mov.id} className="hover:bg-gray-50">
                          <td className="p-3.5">
                            <span
                              className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-black uppercase ${
                                isChange
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-green-100 text-green-900 border border-green-300'
                              }`}
                            >
                              {isChange ? 'Vuelto' : 'Pago'}
                            </span>
                          </td>
                          <td className="p-3.5 font-black text-gray-900">{methodName}</td>
                          <td className="p-3.5 font-black text-black text-base sm:text-lg">
                            {originalAmountStr}
                          </td>
                          <td className="p-3.5 font-black text-black text-base sm:text-lg">
                            ${usdEquiv.toFixed(2)} USD
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleRemoveEntry(mov.id)}
                              className="p-2 rounded-xl text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                              title="Anular este movimiento"
                            >
                              <IoTrashOutline className="text-xl" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-stone-100 px-6 py-5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            {!paymentScope && (
              <button
                type="button"
                onClick={() => setIsCreditPromptOpen(true)}
                className="px-6 py-3.5 rounded-xl bg-white hover:bg-gray-50 text-black font-black text-sm sm:text-base border-2 border-gray-300 shadow-sm transition-all cursor-pointer"
              >
                📝 CERRAR A CRÉDITO
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 rounded-xl text-sm sm:text-base font-black text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              CANCELAR
            </button>

            {paymentScope ? (
              isReadyToClose ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleFinalize}
                  className="px-8 py-4 rounded-xl text-base sm:text-lg font-black uppercase tracking-wider bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  {isSubmitting ? 'PROCESANDO...' : 'FINALIZAR COMANDA COMPLETA'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pendingDebtUSD > 0.01 || pendingChangeUSD > 0.01 || isSubmitting}
                  onClick={() => {
                    onClose();
                    if (onEditPaymentScope && order) {
                      onEditPaymentScope(order);
                    }
                  }}
                  className={`px-8 py-4 rounded-xl text-base sm:text-lg font-black uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                    pendingDebtUSD <= 0.01 && pendingChangeUSD <= 0.01 && !isSubmitting
                      ? 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-95 animate-pulse'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed border-2 border-gray-300'
                  }`}
                  title={
                    pendingDebtUSD > 0.01
                      ? 'Aún falta cubrir la deuda de estos ítems'
                      : pendingChangeUSD > 0.01
                      ? 'Hay vuelto pendiente por entregar'
                      : 'Continuar cobrando a las siguientes personas'
                  }
                >
                  {isSubmitting
                    ? 'PROCESANDO...'
                    : pendingDebtUSD > 0.01
                    ? 'PAGO INCOMPLETO'
                    : pendingChangeUSD > 0.01
                    ? 'ENTREGAR VUELTO'
                    : '👥 LISTO / COBRAR SIGUIENTE PERSONA'}
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={!isReadyToClose || isSubmitting || hasSplitPayments}
                onClick={handleFinalize}
                className={`px-10 py-4 rounded-xl text-base sm:text-lg font-black uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                  isReadyToClose && !isSubmitting && !hasSplitPayments
                    ? 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-95'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed border-2 border-gray-300'
                }`}
              >
                {isSubmitting ? 'PROCESANDO...' : 'FINALIZAR COBRO'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL SECUNDARIO: CERRAR A CRÉDITO */}
      {isCreditPromptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 border border-gray-200 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="text-sm font-black text-gray-900">📝 CERRAR COMANDA A CRÉDITO</h3>
              <button
                type="button"
                onClick={() => setIsCreditPromptOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-black"
              >
                <IoClose className="text-lg" />
              </button>
            </div>

            {creditError && (
              <div className="p-2 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                {creditError}
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-gray-800 mb-1">
                Nombre del Cliente o Deudor <span className="text-red-600">(*Obligatorio)</span>:
              </label>
              <input
                type="text"
                value={creditDebtorInput}
                onChange={(e) => setCreditDebtorInput(e.target.value)}
                placeholder="Ej: Ing. Martínez / Teléfono"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-bold text-black focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-800 mb-1">
                Notas / Condiciones de Crédito (Opcional):
              </label>
              <input
                type="text"
                value={creditNotesInput}
                onChange={(e) => setCreditNotesInput(e.target.value)}
                placeholder="Ej: Cancela el viernes"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div className="text-[11px] text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-200">
              ℹ️ Las cuentas a crédito no ingresan dinero físico a la gaveta de caja chica y se reflejan en la sección contable de cuentas por cobrar.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsCreditPromptOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isSubmitting || !creditDebtorInput.trim()}
                onClick={handleCreditConfirm}
                className="px-4 py-1.5 text-xs font-black bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 rounded-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar Crédito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Impresión de Recibo (Tarea 10: Preguntar Siempre Antes de Imprimir) */}
      {showReceiptPrompt && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-5 shadow-2xl space-y-4 text-black animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center text-black text-xl font-black shrink-0">
                <IoReceiptOutline />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">¿Imprimir Recibo de Venta?</h3>
                <p className="text-[11px] text-gray-500 font-semibold">Comanda #{order.orderNumber}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 font-medium">
              El cobro se ha registrado correctamente en el sistema. ¿Deseas generar e imprimir el recibo físico para el cliente?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowReceiptPrompt(false);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs border border-gray-300 transition-all text-center"
              >
                ❌ No Imprimir
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowReceiptPrompt(false);
                  if (printOrderReceipt && liveOrder) {
                    try {
                      await printOrderReceipt(liveOrder.id, 'caja');
                    } catch (err) {
                      console.error('Error al imprimir recibo térmico:', err);
                    }
                  }
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-xs transition-all text-center"
              >
                🖨️ Sí, Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
