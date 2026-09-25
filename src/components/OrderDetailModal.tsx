import React, { useState } from 'react';
import { Order } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { areProteinsDefault, getCleanItemNote, formatRemovedIngredients } from '../utils/burgerProteins';
import { PrinterSelectModal } from './PrinterSelectModal';
import {
  IoClose,
  IoReceiptOutline,
  IoPersonOutline,
  IoCheckmarkCircleOutline,
  IoBicycleOutline,
  IoPrintOutline,
  IoCashOutline,
  IoAdd,
  IoTrashOutline,
  IoSwapHorizontal,
  IoCheckmarkDone,
  IoLockClosedOutline,
  IoPeopleOutline,
} from 'react-icons/io5';

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  exchangeRates: { COP: number; Bs: number };
  isSelectableMode?: boolean;
  selectedItemIds?: string[];
  onToggleSelectItem?: (itemId: string) => void;
  onConfirmItemSelection?: () => void;
  onPayOrder?: (order: Order) => void;
  onAppendOrder?: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  onChangeTable?: (order: Order) => void;
  onSplitPayment?: (order: Order) => void;
  onToggleDelivered?: (order: Order) => void;
  onCancelOrder?: (order: Order) => void;
  onPrintReceipt?: (order: Order) => void;
  onReprintKitchen?: (order: Order) => void;
  userRole?: 'admin' | 'caja' | 'mesero' | 'cocina';
}

function formatOrderTime(dateValue?: string | Date): string {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  exchangeRates,
  isSelectableMode = false,
  selectedItemIds = [],
  onToggleSelectItem,
  onConfirmItemSelection,
  onPayOrder,
  onAppendOrder,
  onEditOrder,
  onChangeTable,
  onSplitPayment,
  onToggleDelivered,
  onCancelOrder,
  onPrintReceipt,
  onReprintKitchen,
  userRole,
}) => {
  const { reprintKitchenOrder, printOrderReceipt } = useApp();
  const [isReprinting, setIsReprinting] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [isKitchenPrinterModalOpen, setIsKitchenPrinterModalOpen] = useState(false);
  const [reprintMessage, setReprintMessage] = useState('');

  if (!isOpen || !order) return null;

  const handlePrintReceipt = async () => {
    if (onPrintReceipt) {
      onPrintReceipt(order);
      return;
    }
    setIsPrintingReceipt(true);
    setReprintMessage('');
    try {
      if (printOrderReceipt) {
        await printOrderReceipt(order.id, 'caja');
        setReprintMessage('✅ Pre-cuenta enviada a Caja');
        setTimeout(() => setReprintMessage(''), 3000);
      }
    } catch (e: any) {
      setReprintMessage(`⚠️ Error al imprimir (${e.message || 'Sin impresora térmica'})`);
      setTimeout(() => setReprintMessage(''), 4000);
    } finally {
      setIsPrintingReceipt(false);
    }
  };

  const handleReprint = () => {
    if (onReprintKitchen) {
      onReprintKitchen(order);
      return;
    }
    setIsKitchenPrinterModalOpen(true);
  };

  const copRate = order.copRateAtPayment || exchangeRates.COP || 3100;
  const bsRate = order.bsRateAtPayment || exchangeRates.Bs || 3.2;
  const totalCOP = order.totalCOP || Math.round((order.totalUSD || 0) * copRate);
  const totalUSD = order.totalUSD || (copRate > 0 ? totalCOP / copRate : 0);
  const paidAmountUSD = order.paidAmountUSD || 0;
  const remainingUSD = Math.max(0, totalUSD - paidAmountUSD);
  const remainingCOP = Math.round(remainingUSD * copRate);
  const totalBs = bsRate > 0 ? (totalCOP / bsRate).toFixed(2) : '0.00';

  const isPaid = order.paymentStatus === 'pagado';
  const isCredito = order.paymentStatus === 'credito';
  const isDelivered = order.status === 'entregada';
  const isPrepared = order.status === 'preparada';

  const hasSplitPayments = (order.paymentHistory || []).some(
    (p) => Array.isArray(p.itemIds) && p.itemIds.length > 0
  ) || (order.items || []).some((it) => it.isPaidIndividually);

  const hasGeneralPayments = (order.paymentHistory || []).some(
    (p) => (!Array.isArray(p.itemIds) || p.itemIds.length === 0) &&
           ((p.amountPaidUSD || 0) > 0 || (p.cashTenderedCOP || 0) > 0 || (p.cashTenderedUSD || 0) > 0 || (p.cashTenderedBs || 0) > 0)
  );

  // Calculate sum of currently selected items if in selectable mode
  const selectedTotalCOP = order.items
    .filter((it) => selectedItemIds.includes(it.id))
    .reduce((sum, it) => {
      const priceCOP = (Number(it.price) || 0) >= 100 ? (Number(it.price) || 0) : ((Number(it.price) || 0) * copRate);
      return sum + priceCOP * (Number(it.quantity) || 1);
    }, 0);
  const selectedTotalUSD = copRate > 0 ? selectedTotalCOP / copRate : 0;

  const cleanOrderNumber = order.orderNumber.toString().replace(/^#+/, '');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Plano Mugrosito */}
        <div className="bg-white border-b border-gray-200 text-black p-4 sm:p-5 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-yellow-100 border border-yellow-300 flex items-center justify-center font-black shrink-0 text-black">
              <IoReceiptOutline size={26} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-black">
                  {isSelectableMode ? 'Seleccionar Productos a Cobrar' : `Comanda #${cleanOrderNumber}`}
                </h3>
                <span className="px-3 py-1 rounded-xl bg-yellow-400 border border-yellow-500 text-xs font-black uppercase text-black tracking-wider shadow-xs">
                  {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : order.type}
                </span>
                {/* Badges de Estado */}
                <span
                  className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase border flex items-center gap-1 ${
                    isDelivered
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : isPrepared
                      ? 'bg-green-100 text-green-900 border-green-300'
                      : 'bg-yellow-100 text-yellow-900 border-yellow-300 animate-pulse'
                  }`}
                >
                  {isDelivered ? '📦 ENTREGADA' : isPrepared ? '🔥 LISTA' : '⏳ EN COCINA'}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase border ${
                    isPaid
                      ? 'bg-green-100 text-green-900 border-green-300'
                      : isCredito
                      ? 'bg-yellow-100 text-yellow-900 border-yellow-400'
                      : 'bg-red-100 text-red-900 border-red-300'
                  }`}
                >
                  {isPaid ? '💳 PAGADO' : isCredito ? '⚠️ A CRÉDITO' : '❌ PENDIENTE PAGO'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm font-bold text-gray-700 mt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <IoPersonOutline className="text-base" />
                  <span>Cliente: {order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')}</span>
                </span>
                {order.createdAt && (
                  <span className="text-gray-500">
                    🕒 {formatOrderTime(order.createdAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-700 transition-all cursor-pointer shrink-0 ml-2"
            title="Cerrar ventana"
          >
            <IoClose size={22} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          {isSelectableMode && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs md:text-sm font-bold flex items-center justify-between shadow-sm">
              <span className="text-emerald-950 font-bold">Selecciona los productos que pagará esta persona:</span>
              <span className="font-black px-3.5 py-1.5 rounded-xl text-xs md:text-sm bg-emerald-600 text-slate-900 border border-emerald-500 shadow-sm">
                Seleccionado: ${selectedTotalUSD.toFixed(2)} USD
              </span>
            </div>
          )}

          {/* List of Items */}
          <div className="space-y-3">
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-700 px-1">
              PRODUCTOS DEL PEDIDO ({order.items.length})
            </h4>
            {order.items.map((item, index) => {
              const itemUnitPriceCOP = (item.price || 0) >= 100 ? (item.price || 0) : ((item.price || 0) * copRate);
              const itemTotal = itemUnitPriceCOP * (item.quantity || 1);
              const isSelected = selectedItemIds.includes(item.id);
              const isPaidIndividually = item.isPaidIndividually;

              return (
                <div
                  key={item.id || index}
                  onClick={() => {
                    if (isSelectableMode && !isPaidIndividually && onToggleSelectItem) {
                      onToggleSelectItem(item.id);
                    }
                  }}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                    isPaidIndividually
                      ? 'bg-slate-100 border-slate-300 opacity-60'
                      : isSelected
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-md ring-2 ring-emerald-400/40'
                      : 'bg-white border-slate-200 hover:border-emerald-400 shadow-xs'
                  } ${isSelectableMode && !isPaidIndividually ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {isSelectableMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPaidIndividually}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (onToggleSelectItem && !isPaidIndividually) {
                              onToggleSelectItem(item.id);
                            }
                          }}
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 font-black text-xs sm:text-sm">
                            {item.quantity}x
                          </span>
                          <span className="font-black text-slate-900 text-base sm:text-lg">
                            {item.productName}
                          </span>
                          {item.isDelivery ? (
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-blue-100 border border-blue-300 text-blue-900">
                              🛵 Delivery
                            </span>
                          ) : item.isTakeaway ? (
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900">
                              🛍️ Llevar
                            </span>
                          ) : null}
                          {item.size && (
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-sky-100 border border-sky-300 text-sky-900">
                              {item.size}
                            </span>
                          )}
                          {isPaidIndividually && (
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900">
                              ✅ Pagado por {item.paidByName || 'Cliente'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="font-black text-base sm:text-lg text-emerald-700 shrink-0">
                      {Math.round(itemTotal).toLocaleString('es-CO')} COP
                    </span>
                  </div>

                  {/* Half and half details */}
                  {item.isHalfHalf && item.halfDetails && (
                    <div className="mt-2.5 pl-3 border-l-4 border-amber-500 bg-amber-50/90 rounded-r-xl p-2.5 space-y-1 text-xs sm:text-sm text-slate-900">
                      <div>
                        <span className="font-black text-amber-900">🍕 1ra Mitad:</span> <span className="font-bold text-slate-900">{item.halfDetails.half1Name || 'Mitad 1'}</span>
                        {item.halfDetails.half1Removed && item.halfDetails.half1Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-red-600">
                            🚫 Sin: {item.halfDetails.half1Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half1Extras && item.halfDetails.half1Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-emerald-700">
                            ➕ Extras: {item.halfDetails.half1Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="font-black text-amber-900">🍕 2da Mitad:</span> <span className="font-bold text-slate-900">{item.halfDetails.half2Name || 'Mitad 2'}</span>
                        {item.halfDetails.half2Removed && item.halfDetails.half2Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-red-600">
                            🚫 Sin: {item.halfDetails.half2Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half2Extras && item.halfDetails.half2Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-emerald-700">
                            ➕ Extras: {item.halfDetails.half2Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Regular item extras & removed ingredients */}
                  {!item.isHalfHalf && (
                    <>
                      {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                        <div className="text-xs sm:text-sm font-black pl-2 mt-1.5 text-amber-900 bg-yellow-100 px-2.5 py-0.5 rounded-lg border border-yellow-300 inline-block">
                          🥩 Proteína(s): {item.proteins.join(' + ')}
                        </div>
                      )}
                      {item.removedIngredients && item.removedIngredients.length > 0 && (
                        <div className="text-xs sm:text-sm font-bold pl-2 mt-1 text-red-600">
                          🚫 Sin: {formatRemovedIngredients(item.removedIngredients).join(', ')}
                        </div>
                      )}
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-xs sm:text-sm font-bold pl-2 mt-1 text-emerald-700">
                          {item.category && item.category !== 'Pizzas' && item.category !== 'Hamburguesas' && item.category !== 'Hot Dogs' ? '🥗 Contorno(s):' : '➕ ADD:'}{' '}
                          {item.extras.map((e) => {
                            const extraCOP = (e.price || 0) >= 100 ? (e.price || 0) : ((e.price || 0) * copRate);
                            return `${(e.quantity && e.quantity > 1) ? `${e.quantity}x ` : ''}${e.name}${e.price > 0 ? ` (+${Math.round(extraCOP).toLocaleString('es-CO')} COP)` : ''}`;
                          }).join(', ')}
                        </div>
                      )}
                    </>
                  )}

                  {item.sugarPreference && (
                    <div className="text-xs sm:text-sm font-black pl-2 mt-1 text-sky-800">
                      🥤 Preferencia: {item.sugarPreference}
                    </div>
                  )}

                  {item.flavor && (
                    <div className="text-xs sm:text-sm font-black pl-2 mt-1 text-amber-800">
                      🍹 Sabor: {item.flavor}
                    </div>
                  )}

                  {getCleanItemNote(item.notes) && (
                    <div className="text-xs sm:text-sm font-semibold italic pl-2 mt-1 text-slate-600">
                      📝 Nota: "{getCleanItemNote(item.notes)}"
                    </div>
                  )}
                </div>
              );
            })}

            {/* Servicio de Delivery */}
            {((order.deliveryFeeUSD || 0) > 0 || order.items.some((i) => i.isDelivery)) && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-sky-100 border border-sky-300 text-sky-900 font-black text-xs sm:text-sm flex items-center gap-1">
                    <IoBicycleOutline /> 1x
                  </span>
                  <span className="font-black text-slate-900 text-base sm:text-lg">Servicio Delivery</span>
                </div>
                <span className="font-black text-base sm:text-lg text-emerald-700">
                  {((order.deliveryFeeCOP || (order.deliveryFeeUSD ? Math.round(order.deliveryFeeUSD * copRate) : 0))).toLocaleString('es-CO')} COP
                </span>
              </div>
            )}
          </div>

          {/* Kitchen notes */}
          {order.kitchenNotes && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs sm:text-sm shadow-xs">
              <span className="font-black uppercase tracking-wider block mb-1 text-amber-900">
                📝 Observaciones Generales de Cocina:
              </span>
              <p className="font-bold text-slate-800">{order.kitchenNotes}</p>
            </div>
          )}

          {/* Resumen Financiero Claro y Limpio con 3 Monedas */}
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/40 border border-yellow-300 space-y-2 shadow-xs">
            <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-700">
              <span>Subtotal Productos:</span>
              <span className="text-black font-black">{Math.max(0, totalCOP - (order.deliveryFeeCOP || (order.deliveryFeeUSD ? Math.round(order.deliveryFeeUSD * copRate) : 0))).toLocaleString('es-CO')} COP</span>
            </div>
            {(order.deliveryFeeUSD || order.deliveryFeeCOP) ? (
              <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-700">
                <span>Servicio Delivery:</span>
                <span className="text-black font-black">+{(order.deliveryFeeCOP || (order.deliveryFeeUSD ? Math.round(order.deliveryFeeUSD * copRate) : 0)).toLocaleString('es-CO')} COP</span>
              </div>
            ) : null}
            <div className="border-t border-yellow-200 pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="font-black text-xs sm:text-sm uppercase text-gray-700 block">
                  Total de la Comanda:
                </span>
                <div className="text-2xl sm:text-3xl font-black text-black tracking-tight flex items-center gap-2">
                  <span>{totalCOP.toLocaleString('es-CO')}</span>
                  <span className="text-xs sm:text-sm font-black uppercase text-black bg-yellow-400 px-2 py-0.5 rounded-lg border border-yellow-500 shadow-xs">COP</span>
                  {paidAmountUSD > 0 && !isPaid && (
                    <span className="text-xs sm:text-sm font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                      Debe: {remainingCOP.toLocaleString('es-CO')} COP (~ ${remainingUSD.toFixed(2)} USD)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-gray-800 bg-white border border-gray-300 px-3 py-1 rounded-xl shadow-xs">
                  🇺🇸 ${totalUSD.toFixed(2)} USD
                </span>
                <span className="text-xs sm:text-sm font-black text-gray-800 bg-white border border-gray-300 px-3 py-1 rounded-xl shadow-xs">
                  🇻🇪 {totalBs} Bs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Barra de Acciones de Comanda */}
        <div className="p-3 sm:p-4 bg-white border-t border-gray-200 flex flex-col gap-2.5 shrink-0">
          {isSelectableMode ? (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs transition-all cursor-pointer border border-gray-300 shadow-xs"
              >
                CERRAR
              </button>

              {onConfirmItemSelection && (
                <button
                  onClick={() => {
                    onConfirmItemSelection();
                    onClose();
                  }}
                  disabled={selectedItemIds.length === 0}
                  className="px-5 py-2.5 rounded-xl font-black text-xs md:text-sm shadow-xs transition-all flex items-center gap-2 cursor-pointer bg-yellow-400 hover:bg-yellow-500 border border-yellow-500 text-black disabled:opacity-50"
                >
                  <IoCheckmarkCircleOutline className="text-xl" />
                  <span>CONTINUAR CON COBRO (${selectedTotalUSD.toFixed(2)} USD)</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* FILA 1: ACCIONES PRINCIPALES (COBRAR, ADICIONAR, X PERSONAS, ENTREGAR) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 1. COBRAR */}
                {onPayOrder && !isPaid ? (
                  <button
                    type="button"
                    disabled={hasSplitPayments}
                    onClick={() => {
                      onClose();
                      onPayOrder(order);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${
                      hasSplitPayments
                        ? "bg-stone-100 text-stone-400 border border-stone-300 cursor-not-allowed opacity-60 select-none"
                        : "bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 shadow-sm cursor-pointer active:scale-95"
                    }`}
                    title={
                      hasSplitPayments
                        ? "Comanda en cobro por personas. Usa el botón '👥 X PERSONAS'."
                        : "Proceder al cobro de la comanda"
                    }
                  >
                    <IoCashOutline className={`text-base ${hasSplitPayments ? 'text-stone-400' : ''}`} />
                    <span>
                      {hasSplitPayments
                        ? "COBRO BLOQUEADO"
                        : `COBRAR ($${remainingUSD > 0 ? remainingUSD.toFixed(2) : totalUSD.toFixed(2)})`}
                    </span>
                  </button>
                ) : isPaid ? (
                  <div className="py-2.5 px-3 rounded-xl bg-green-100 border border-green-300 text-green-900 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs">
                    <IoCashOutline className="text-base text-green-700" />
                    <span>PAGADO COMPLETO</span>
                  </div>
                ) : null}

                {/* 2. ADICIONAR PRODUCTOS */}
                {onAppendOrder && !isPaid && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAppendOrder(order);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-emerald-700 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Adicionar nuevos productos a esta comanda activa"
                  >
                    <IoAdd className="text-base" />
                    <span>➕ ADICIONAR</span>
                  </button>
                )}

                {/* 3. X PERSONAS (COBRO DIVIDIDO) */}
                {onSplitPayment && !isPaid && (
                  <button
                    type="button"
                    disabled={hasGeneralPayments}
                    onClick={() => {
                      onClose();
                      onSplitPayment(order);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 ${
                      hasGeneralPayments
                        ? "bg-stone-100 text-stone-400 border border-stone-300 cursor-not-allowed opacity-60 select-none"
                        : hasSplitPayments
                        ? "bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 cursor-pointer animate-pulse"
                        : "bg-blue-50 hover:bg-blue-100 text-blue-900 border-2 border-blue-300 cursor-pointer"
                    }`}
                    title={
                      hasGeneralPayments
                        ? "Esta comanda ya tiene abonos generales registrados. Continúa desde 'COBRAR'."
                        : "Cobro dividido por personas o ítems individuales"
                    }
                  >
                    <IoPeopleOutline className="text-base" />
                    <span>{hasSplitPayments ? '👥 CONTINUAR X PERSONAS' : '👥 X PERSONAS'}</span>
                  </button>
                )}

                {/* 4. MARCAR ENTREGADA / REACTIVAR */}
                {onToggleDelivered && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDelivered) {
                        onClose();
                      }
                      onToggleDelivered(order);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 ${
                      !isDelivered
                        ? isPaid
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700 animate-pulse'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300'
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                    }`}
                    title={!isDelivered ? 'Marcar orden como entregada al cliente' : 'Reactivar comanda'}
                  >
                    {!isDelivered ? (
                      <>
                        <IoCheckmarkDone className="text-base" />
                        <span>📦 ENTREGAR</span>
                      </>
                    ) : (
                      <>
                        <IoSwapHorizontal className="text-base" />
                        <span>↩️ REACTIVAR</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* FILA 2: GESTIÓN, PRE-CUENTA, COCINA, CAMBIO DE MESA Y ANULACIÓN */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs transition-all cursor-pointer border border-gray-300 shadow-xs"
                  >
                    CERRAR
                  </button>

                  {/* PRE-CUENTA CLIENTE */}
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    disabled={isPrintingReceipt}
                    className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title="Emitir ticket de pre-cuenta térmica con las 3 monedas para el cliente"
                  >
                    <IoPrintOutline className="text-base" />
                    <span>{isPrintingReceipt ? 'IMPRIMIENDO...' : '🧾 PRE-CUENTA'}</span>
                  </button>

                  {/* REIMPRIMIR COCINA */}
                  <button
                    type="button"
                    onClick={handleReprint}
                    disabled={isReprinting}
                    className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-black font-black text-xs flex items-center gap-1.5 border border-gray-300 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    title="Reenviar comanda a la impresora térmica de cocina"
                  >
                    <IoPrintOutline className="text-base" />
                    <span>{isReprinting ? 'ENVIANDO...' : '🖨️ COCINA'}</span>
                  </button>

                  {/* EDITAR COMANDA */}
                  {onEditOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditOrder(order);
                      }}
                      className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Editar productos o notas de la comanda activa"
                    >
                      <span>✏️ EDITAR</span>
                      {userRole === 'caja' && <IoLockClosedOutline className="text-amber-500 text-xs" />}
                    </button>
                  )}

                  {/* CAMBIAR SERVICIO / MESA */}
                  {onChangeTable && !isPaid && !isDelivered && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onChangeTable(order);
                      }}
                      className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Cambiar mesa, convertir a delivery/para llevar o asignar ítems a delivery"
                    >
                      <IoSwapHorizontal className="text-base" />
                      <span>🔄 SERVICIO / MESA</span>
                    </button>
                  )}

                  {reprintMessage && (
                    <span className="text-xs font-bold text-green-700 animate-in fade-in">
                      {reprintMessage}
                    </span>
                  )}
                </div>

                {/* ANULAR COMANDA */}
                {onCancelOrder && (
                  <button
                    type="button"
                    onClick={() => onCancelOrder(order)}
                    className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-700 border border-red-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    title="Anular y cancelar esta comanda"
                  >
                    <IoTrashOutline className="text-sm" />
                    <span>🗑️ ANULAR</span>
                    {userRole === 'caja' && <IoLockClosedOutline className="text-amber-400 text-xs" />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Selector de Impresora Térmica para Reimprimir Comanda de Cocina */}
      <PrinterSelectModal
        isOpen={isKitchenPrinterModalOpen}
        title={`🖨️ REIMPRIMIR COMANDA #${cleanOrderNumber}`}
        jobDescription="Selecciona a qué impresora térmica deseas enviar la comanda completa de cocina"
        defaultTarget="cocina"
        onClose={() => setIsKitchenPrinterModalOpen(false)}
        onSelectPrinter={async (target) => {
          setIsReprinting(true);
          setReprintMessage('');
          try {
            await reprintKitchenOrder(order.id, target);
            setReprintMessage(`✅ Enviado a ${target === 'ambas' ? 'ambas impresoras' : target}`);
            setTimeout(() => setReprintMessage(''), 4000);
          } catch (e: any) {
            setReprintMessage(`⚠️ ${e.message || 'Error al imprimir'}`);
            setTimeout(() => setReprintMessage(''), 4000);
          } finally {
            setIsReprinting(false);
          }
        }}
      />
    </div>
  );
};
