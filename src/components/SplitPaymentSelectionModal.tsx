import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoCheckmarkCircle, IoClose, IoPersonOutline, IoReceiptOutline } from 'react-icons/io5';
import { Order } from '../data/mockData';
import { formatRemovedIngredients } from '../utils/burgerProteins';

interface SplitPaymentSelectionModalProps {
  order: Order | null;
  initialPayerName?: string;
  initialItemIds?: string[];
  onCancel: () => void;
  onConfirm: (payerName: string, itemIds: string[]) => void;
  exchangeRates?: { COP: number; Bs: number };
}

export const SplitPaymentSelectionModal: React.FC<SplitPaymentSelectionModalProps> = ({
  order,
  initialPayerName = '',
  initialItemIds = [],
  onCancel,
  onConfirm,
  exchangeRates = { COP: 3100, Bs: 3.2 },
}) => {
  const [payerName, setPayerName] = useState(initialPayerName);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(initialItemIds);

  const copRate = exchangeRates?.COP || 3100;
  const bsRate = exchangeRates?.Bs || 3.2;

  const selectedTotalCOP = useMemo(() => {
    if (!order) return 0;
    return order.items
      .filter((item) => selectedItemIds.includes(item.id))
      .reduce((total, item) => total + (item.price || 0) * (item.quantity || 1), 0);
  }, [order, selectedItemIds]);

  const selectedTotalUSD = copRate > 0 ? selectedTotalCOP / copRate : 0;
  const selectedTotalBs = bsRate > 0 ? selectedTotalCOP / bsRate : 0;

  if (!order) return null;

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  };

  const selectAllUnpaid = () => {
    const unpaidIds = order.items.filter((it) => !it.isPaidIndividually).map((it) => it.id);
    setSelectedItemIds(unpaidIds);
  };

  const deselectAll = () => {
    setSelectedItemIds([]);
  };

  const normalizedPayerName = payerName.trim();
  const canContinue = normalizedPayerName.length > 0 && selectedItemIds.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-white text-gray-900 w-full h-full max-h-screen overflow-hidden select-none">
      {/* 1. TOP HEADER - CLARO OFICIAL MUGROSITO */}
      <header className="bg-white text-gray-900 px-5 py-3 flex items-center justify-between border-b-2 border-yellow-400 shrink-0 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl">👥</span>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-wide flex items-center gap-3">
              <span>COBRO DIVIDIDO POR PERSONA</span>
              <span className="bg-yellow-400 text-black px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-black">
                Comanda #{order.orderNumber.replace(/^#+/, '')}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Selecciona qué productos consumió este comensal para cobrar su cuenta por separado
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-600 hover:text-black transition-colors cursor-pointer"
          title="Cancelar división"
        >
          <IoClose className="text-2xl" />
        </button>
      </header>

      {/* 2. BODY SCROLLABLE - AMPLIO Y ESPACIOSO */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-5xl mx-auto w-full">
        {/* INPUT DE NOMBRE DE LA PERSONA */}
        <div className="bg-stone-50 p-5 rounded-3xl border-2 border-gray-200 shadow-xs space-y-2">
          <label className="block text-sm sm:text-base font-black uppercase text-gray-800 tracking-wider flex items-center gap-2">
            <IoPersonOutline className="text-yellow-600 text-xl" />
            <span>Nombre del comensal o persona que paga:</span>
          </label>
          <input
            autoFocus
            type="text"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Ej: Carlos, Ana, Persona 1..."
            maxLength={128}
            className="w-full px-5 py-3.5 text-lg sm:text-xl bg-white border-2 border-gray-300 rounded-2xl text-gray-900 font-black focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-xs"
          />
        </div>

        {/* CONTROLES DE SELECCIÓN RÁPIDA E INDICADOR */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-black text-gray-900 uppercase">
              Productos de la comanda:
            </span>
            <span className="text-xs sm:text-sm font-bold bg-yellow-100 text-yellow-900 border border-yellow-300 px-3 py-1 rounded-xl">
              {selectedItemIds.length} seleccionado(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllUnpaid}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 text-xs sm:text-sm font-black border border-gray-300 transition-all cursor-pointer"
            >
              Seleccionar Todos
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 text-xs sm:text-sm font-black border border-gray-300 transition-all cursor-pointer"
            >
              Deseleccionar
            </button>
          </div>
        </div>

        {/* LISTA DE ÍTEMS CON TAMAÑO GRANDE TÁCTIL */}
        <div className="space-y-3">
          {order.items.map((item) => {
            const isPaid = item.isPaidIndividually;
            const isSelected = selectedItemIds.includes(item.id);
            const itemTotalCOP = item.price * item.quantity;

            return (
              <button
                key={item.id}
                type="button"
                disabled={isPaid}
                onClick={() => toggleItem(item.id)}
                className={`w-full p-4 sm:p-5 rounded-2xl border-2 flex items-center justify-between gap-4 text-left transition-all cursor-pointer shadow-xs ${
                  isPaid
                    ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-75'
                    : isSelected
                    ? 'bg-yellow-50 border-yellow-400 text-black shadow-md scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-800 hover:border-yellow-400 hover:bg-yellow-50/20'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 transition-all ${
                      isSelected || isPaid
                        ? 'bg-yellow-400 border-yellow-500 text-black'
                        : 'bg-white border-gray-300 text-transparent'
                    }`}
                  >
                    {(isSelected || isPaid) && <IoCheckmarkCircle className="text-xl" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-lg bg-yellow-100 text-yellow-900 border border-yellow-300 font-black text-xs sm:text-sm">
                        {item.quantity}x
                      </span>
                      <span className="text-base sm:text-lg font-black text-gray-900">
                        {item.productName}
                      </span>
                      {item.isTakeaway && (
                        <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200">
                          📦 Llevar
                        </span>
                      )}
                      {(item.isCut || item.cutPreference === 'Picada') && (
                        <span className="text-xs font-bold text-red-800 bg-red-100 px-2 py-0.5 rounded-lg border border-red-200">
                          🔪 Picada
                        </span>
                      )}
                    </div>

                    {isPaid && (
                      <p className="text-xs font-black text-emerald-700 mt-1">
                        ✓ Ya pagado por {item.paidByName || 'Cliente previo'}
                      </p>
                    )}

                    {item.proteins && item.proteins.length > 0 && (
                      <p className="text-xs text-amber-800 font-bold mt-0.5">
                        🥩 {item.proteins.join(' + ')}
                      </p>
                    )}

                    {item.flavor && (
                      <p className="text-xs text-amber-800 font-bold mt-0.5">
                        🍹 Sabor: {item.flavor}
                      </p>
                    )}

                    {item.removedIngredients && item.removedIngredients.length > 0 && (
                      <p className="text-xs text-red-600 font-bold mt-0.5">
                        🚫 SIN: {formatRemovedIngredients(item.removedIngredients).join(', ')}
                      </p>
                    )}

                    {item.extras && item.extras.length > 0 && (
                      <p className="text-xs text-gray-600 font-bold mt-0.5">
                        ➕ {item.extras.map((e) => e.name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg sm:text-2xl font-black text-gray-900 block">
                    {Math.round(itemTotalCOP).toLocaleString('es-CO')} COP
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-gray-500">
                    {Math.round(item.price || 0).toLocaleString('es-CO')} c/u
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      {/* 3. FOOTER TOTALES Y BOTONES - CLARO OFICIAL MUGROSITO */}
      <footer className="bg-white text-gray-900 px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t-2 border-yellow-400 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-lg">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            Subtotal a cobrar a {normalizedPayerName || 'este comensal'}:
          </span>
          <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
            <span className="text-2xl sm:text-3xl font-black text-black">
              {Math.round(selectedTotalCOP).toLocaleString('es-CO')} COP
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇺🇸 ${selectedTotalUSD.toFixed(2)} USD
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇻🇪 {selectedTotalBs.toFixed(2)} Bs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black text-gray-700 hover:bg-stone-100 hover:text-black transition-colors cursor-pointer"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={() => onConfirm(normalizedPayerName, selectedItemIds)}
            disabled={!canContinue}
            className="px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-sm sm:text-base border-2 border-yellow-500 flex items-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:bg-gray-200 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <IoReceiptOutline className="text-xl" />
            <span>CONTINUAR AL COBRO</span>
          </button>
        </div>
      </footer>
    </div>,
    document.body
  );
};