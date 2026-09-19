import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, OrderItem } from '../../data/mockData';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoCheckmark,
  IoCopyOutline,
  IoRefreshOutline,
} from 'react-icons/io5';

export interface DrinkUnitConfig {
  unitIndex: number;
  flavor?: string;
  sugarPreference?: string;
  isTakeaway: boolean;
  isDelivery: boolean;
  notes?: string;
}

export interface DrinkOrderConfirmationItem {
  drink: Product;
  quantity: number;
  sugarPreference?: string;
  isTakeaway: boolean;
  isDelivery?: boolean;
  notes?: string;
  flavor?: string;
}

interface DrinkSelectorModalProps {
  drink: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: DrinkOrderConfirmationItem | DrinkOrderConfirmationItem[]) => void;
  defaultTakeaway?: boolean;
  defaultDelivery?: boolean;
  exchangeRates?: { COP: number; Bs: number };
  inline?: boolean;
  initialEditItem?: OrderItem | null;
}

const SUGAR_OPTIONS = ['Con azúcar', 'Sin azúcar', 'Poca azúcar'];

export const DrinkSelectorModal: React.FC<DrinkSelectorModalProps> = ({
  drink,
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  defaultDelivery = false,
  exchangeRates = { COP: 3100, Bs: 3.2 },
  inline = false,
  initialEditItem = null,
}) => {
  const isGranizado = drink ? (/granizado/i.test(drink.name) || drink.drinkType === 'granizado') : false;
  const isJugo = drink ? ((drink.drinkType === 'jugo' || /jugo/i.test(drink.name)) && !isGranizado) : false;

  const createInitialUnit = (index: number, pDrink: Product): DrinkUnitConfig => ({
    unitIndex: index,
    flavor: pDrink.flavors && pDrink.flavors.length > 0 ? pDrink.flavors[0] : undefined,
    sugarPreference: 'Con azúcar',
    isTakeaway: defaultTakeaway && !defaultDelivery,
    isDelivery: defaultDelivery,
    notes: '',
  });

  const [units, setUnits] = useState<DrinkUnitConfig[]>([]);
  const [activeUnitIndex, setActiveUnitIndex] = useState<number>(0);
  const [copyToast, setCopyToast] = useState<string>('');

  const activeDrinkKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && drink) {
      const key = initialEditItem ? `edit-${initialEditItem.id}` : `create-${drink.id}`;
      if (activeDrinkKeyRef.current !== key) {
        activeDrinkKeyRef.current = key;
        if (initialEditItem) {
          const qty = Math.max(1, initialEditItem.quantity || 1);
          const editUnits: DrinkUnitConfig[] = [];
          for (let i = 0; i < qty; i++) {
            editUnits.push({
              unitIndex: i,
              flavor: initialEditItem.flavor || (drink.flavors && drink.flavors.length > 0 ? drink.flavors[0] : undefined),
              sugarPreference: initialEditItem.sugarPreference || 'Con azúcar',
              isTakeaway: Boolean(initialEditItem.isTakeaway),
              isDelivery: Boolean(initialEditItem.isDelivery),
              notes: initialEditItem.notes || '',
            });
          }
          setUnits(editUnits);
        } else {
          setUnits([createInitialUnit(0, drink)]);
        }
        setActiveUnitIndex(0);
        setCopyToast('');
      }
    } else if (!isOpen) {
      activeDrinkKeyRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, drink?.id, initialEditItem?.id, defaultTakeaway, defaultDelivery]);

  if (!isOpen || !drink || units.length === 0) return null;

  const currentUnit = units[activeUnitIndex] || units[0] || createInitialUnit(0, drink);

  const updateCurrentUnit = (updater: (prev: DrinkUnitConfig) => DrinkUnitConfig) => {
    setUnits((prev) =>
      prev.map((u, idx) => (idx === activeUnitIndex ? updater(u) : u))
    );
  };

  const handleIncreaseQuantity = () => {
    setUnits((prev) => {
      const nextIdx = prev.length;
      const source = prev[activeUnitIndex] || prev[0];
      const newUnit: DrinkUnitConfig = {
        ...source,
        unitIndex: nextIdx,
      };
      return [...prev, newUnit];
    });
    setActiveUnitIndex(units.length);
  };

  const handleDecreaseQuantity = () => {
    if (units.length <= 1) return;
    setUnits((prev) => prev.slice(0, prev.length - 1));
    if (activeUnitIndex >= units.length - 1) {
      setActiveUnitIndex(Math.max(0, units.length - 2));
    }
  };

  const handleCopyActiveToAll = () => {
    const active = units[activeUnitIndex];
    if (!active) return;
    setUnits((prev) =>
      prev.map((u, idx) =>
        idx === activeUnitIndex
          ? u
          : {
              ...active,
              unitIndex: idx,
            }
      )
    );
    setCopyToast(`¡Opciones de #${activeUnitIndex + 1} (${active.flavor || 'Bebida'}) copiadas a las ${units.length} bebidas!`);
    setTimeout(() => setCopyToast(''), 2500);
  };

  const handleResetCurrentUnit = () => {
    if (!drink) return;
    const fresh = createInitialUnit(activeUnitIndex, drink);
    updateCurrentUnit(() => fresh);
    setCopyToast(`Bebida #${activeUnitIndex + 1} restablecida a sus opciones base.`);
    setTimeout(() => setCopyToast(''), 2000);
  };

  const copRate = exchangeRates?.COP || 3100;
  const bsRate = exchangeRates?.Bs || 3.2;
  const totalPrice = drink.price * units.length;
  const priceUSD = copRate > 0 ? drink.price / copRate : 0;
  const priceBs = bsRate > 0 ? drink.price / bsRate : 0;
  const totalUSD = copRate > 0 ? totalPrice / copRate : 0;
  const totalBs = bsRate > 0 ? totalPrice / bsRate : 0;
  const isFlavorRequired = Boolean(drink.flavors && drink.flavors.length > 0);
  const isAddDisabled = isFlavorRequired && units.some((u) => !u.flavor);

  const handleSave = () => {
    if (isAddDisabled) return;
    const groups = new Map<string, DrinkOrderConfirmationItem>();
    for (const u of units) {
      const key = `${u.flavor || ''}|${u.sugarPreference || ''}|${u.isTakeaway}|${u.isDelivery}|${u.notes || ''}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
      } else {
        groups.set(key, {
          drink,
          quantity: 1,
          flavor: isFlavorRequired ? u.flavor : undefined,
          sugarPreference: isJugo ? u.sugarPreference : undefined,
          isTakeaway: u.isTakeaway,
          isDelivery: u.isDelivery,
          notes: u.notes?.trim() || undefined,
        });
      }
    }
    const itemsToEmit = Array.from(groups.values());
    onConfirm(itemsToEmit.length === 1 ? itemsToEmit[0] : itemsToEmit);
    onClose();
  };

  const modalInner = (
    <div className={inline ? "flex flex-col h-full w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden select-none" : "bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl flex flex-col overflow-hidden"}>
      {/* 1. Header */}
      <header className={`bg-white text-gray-900 ${inline ? 'px-4 py-3' : 'px-5 py-3.5'} border-b-2 border-yellow-400 flex items-center justify-between shrink-0 shadow-xs`}>
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <span className={inline ? "text-2xl sm:text-3xl" : "text-2xl sm:text-3xl"}>
            {isGranizado ? '🍧' : '🥤'}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`${inline ? 'text-lg sm:text-xl font-black text-gray-950 tracking-wide' : 'text-base sm:text-lg font-black text-gray-950'} flex items-center gap-1.5`}>
                {initialEditItem && (
                  <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-md font-black tracking-wider uppercase">
                    ✏️ Editando
                  </span>
                )}
                <span>{drink.name.toUpperCase()}</span>
              </h2>
              <span className="bg-yellow-400 text-black text-xs px-2.5 py-0.5 rounded-xl font-black shadow-xs border border-yellow-500">
                {Math.round(drink.price).toLocaleString('es-CO')} COP
              </span>
              {units.length > 1 && (
                <span className="bg-stone-900 text-white text-xs px-2 py-0.5 rounded-xl font-black">
                  {units.length} UNIDADES
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs font-bold text-gray-700 flex-wrap">
              <span>🇺🇸 ${priceUSD.toFixed(2)} USD</span>
              <span className="text-gray-400">•</span>
              <span>🇻🇪 {priceBs.toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 hover:text-black transition-colors cursor-pointer flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-2xs border border-gray-300"
          title={inline ? "Volver al catálogo" : "Cerrar"}
        >
          <IoClose className={inline ? "text-xl text-gray-700" : "text-2xl"} />
          <span className="hidden sm:inline">Volver al Menú</span>
        </button>
      </header>

      {/* 2. Body Scrollable */}
      <main className={`flex-1 min-h-0 overflow-y-auto ${inline ? 'p-3 sm:p-4 space-y-3' : 'p-4 sm:p-5 space-y-4'}`}>
        {/* Cantidad y Destino (Salón / Llevar / Delivery) */}
        <section className="bg-stone-50 p-3 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">Cantidad Total:</span>
            <div className="flex items-center border-2 border-yellow-400 rounded-xl bg-white shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={handleDecreaseQuantity}
                className="px-3.5 py-1.5 hover:bg-yellow-100 text-gray-900 font-black text-sm cursor-pointer transition-colors"
                title="Disminuir unidades"
              >
                <IoRemove />
              </button>
              <span className="px-3.5 text-sm sm:text-base font-black text-black min-w-[2rem] text-center">{units.length}</span>
              <button
                type="button"
                onClick={handleIncreaseQuantity}
                className="px-3.5 py-1.5 hover:bg-yellow-100 text-gray-900 font-black text-sm cursor-pointer transition-colors"
                title="Agregar otra unidad para personalizar"
              >
                <IoAdd />
              </button>
            </div>
          </div>

          {/* Destino de la Bebida activa: Salón / Llevar / Delivery */}
          <div className="flex items-center border border-gray-300 rounded-xl bg-white p-1 shadow-xs">
            <button
              type="button"
              onClick={() =>
                updateCurrentUnit((prev) => ({
                  ...prev,
                  isTakeaway: false,
                  isDelivery: false,
                }))
              }
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                !currentUnit.isTakeaway && !currentUnit.isDelivery
                  ? 'bg-yellow-400 text-black shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              🍽️ SALÓN
            </button>
            <button
              type="button"
              onClick={() =>
                updateCurrentUnit((prev) => ({
                  ...prev,
                  isTakeaway: true,
                  isDelivery: false,
                }))
              }
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                currentUnit.isTakeaway && !currentUnit.isDelivery
                  ? 'bg-amber-400 text-black shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              🛍️ LLEVAR
            </button>
            <button
              type="button"
              onClick={() =>
                updateCurrentUnit((prev) => ({
                  ...prev,
                  isTakeaway: false,
                  isDelivery: true,
                }))
              }
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                currentUnit.isDelivery
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              🛵 DELIVERY
            </button>
          </div>
        </section>

        {/* PESTAÑAS MULTI-UNIDAD CUANDO HAY MÁS DE 1 BEBIDA */}
        {units.length > 1 && (
          <section className="bg-yellow-50/90 p-3 rounded-2xl border-2 border-yellow-300 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-black text-yellow-950 uppercase tracking-wide flex items-center gap-1.5">
                <span>🥤</span>
                <span>PERSONALIZAR UNIDAD ({units.length}):</span>
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyActiveToAll}
                  className="px-3 py-1 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black border border-yellow-500 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  title="Copiar sabor y opciones de esta unidad a todas las demás"
                >
                  <IoCopyOutline className="text-sm" />
                  <span>Copiar #{activeUnitIndex + 1} a todas</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetCurrentUnit}
                  className="px-3 py-1 rounded-xl bg-white hover:bg-stone-100 text-gray-800 text-xs font-bold border border-gray-300 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  title="Restablecer esta unidad al sabor inicial"
                >
                  <IoRefreshOutline className="text-sm" />
                  <span>Reset #{activeUnitIndex + 1}</span>
                </button>
              </div>
            </div>

            {copyToast && (
              <div className="text-xs font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl animate-in fade-in">
                {copyToast}
              </div>
            )}

            {/* Fila de Botones de Pestaña */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {units.map((u, idx) => {
                const isActive = idx === activeUnitIndex;
                const flavorLabel = u.flavor || 'Bebida';
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveUnitIndex(idx)}
                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all border-2 flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02] ring-2 ring-yellow-400'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-300 hover:bg-yellow-50/50'
                    }`}
                  >
                    <span>🥤 #{idx + 1}</span>
                    <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200 truncate max-w-[130px]">
                      {flavorLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Selector de Sabor / Subtipo de la unidad activa */}
        {drink.flavors && drink.flavors.length > 0 && (
          <section className="bg-stone-50 p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
                <span>🍹</span>
                <span>
                  {units.length > 1 ? `SABOR PARA LA BEBIDA #${activeUnitIndex + 1}:` : 'SELECCIONA EL SABOR (OBLIGATORIO):'}
                </span>
              </span>
              {currentUnit.flavor && (
                <span className="text-xs font-black text-yellow-950 bg-yellow-400 px-2.5 py-0.5 rounded-lg border border-yellow-500 shadow-2xs">
                  ✓ {currentUnit.flavor}
                </span>
              )}
            </div>

            <div className={`grid ${drink.flavors.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'} gap-2`}>
              {drink.flavors.map((flavor) => {
                const isSelected = currentUnit.flavor === flavor;
                return (
                  <button
                    key={flavor}
                    type="button"
                    onClick={() => updateCurrentUnit((prev) => ({ ...prev, flavor }))}
                    className={`py-3 px-3 text-center rounded-xl font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-md ring-2 ring-yellow-400 scale-[1.01]'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-yellow-50 hover:border-yellow-300'
                    }`}
                  >
                    {isSelected && <IoCheckmark className="text-base shrink-0" />}
                    <span className="truncate">{flavor}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Selector de Azúcar (SOLO PARA JUGOS NATURALES, NUNCA GRANIZADOS) */}
        {isJugo && (
          <section className="bg-stone-50 p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
            <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
              <span>🥄</span>
              <span>PREFERENCIA DE AZÚCAR ({units.length > 1 ? `#${activeUnitIndex + 1}` : ''}):</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {SUGAR_OPTIONS.map((opt) => {
                const isSelected = currentUnit.sugarPreference === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateCurrentUnit((prev) => ({ ...prev, sugarPreference: opt }))}
                    className={`py-2.5 px-2 text-center rounded-xl text-xs sm:text-sm font-black transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs font-black'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Indicaciones especiales / Notas */}
        <section className="bg-stone-50 p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1.5">
          <label className="block text-xs sm:text-sm font-black uppercase text-gray-900 tracking-wider">
            Indicaciones especiales ({units.length > 1 ? `Bebida #${activeUnitIndex + 1}` : 'opcional'}):
          </label>
          <input
            type="text"
            value={currentUnit.notes || ''}
            onChange={(e) => updateCurrentUnit((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Ej: Con bastante hielo, sin pitillo, bien frío..."
            className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-2xs placeholder-gray-400"
          />
        </section>
      </main>

      {/* 3. Footer */}
      <footer className={`bg-white text-gray-900 ${inline ? 'px-4 py-2.5' : 'p-4'} border-t-2 border-yellow-400 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg`}>
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            Total a sumar ({units.length} {units.length === 1 ? 'unidad' : 'unidades'}):
          </span>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className={`${inline ? 'text-xl sm:text-2xl' : 'text-xl'} font-black text-black`}>
              {Math.round(totalPrice).toLocaleString('es-CO')} <span className="text-xs sm:text-sm font-bold text-gray-500">COP</span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇺🇸 ${totalUSD.toFixed(2)} USD
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇻🇪 {totalBs.toFixed(2)} Bs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black text-gray-600 hover:bg-gray-100 hover:text-black transition-colors cursor-pointer"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isAddDisabled}
            className={`px-6 py-3 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all ${
              isAddDisabled
                ? 'bg-gray-200 text-gray-400 border-2 border-gray-300 cursor-not-allowed'
                : 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-[0.98] cursor-pointer'
            }`}
          >
            <IoCheckmark className="text-xl" />
            <span>{initialEditItem ? 'GUARDAR CAMBIOS' : `AGREGAR AL PEDIDO (${units.length})`}</span>
          </button>
        </div>
      </footer>
    </div>
  );

  if (inline) {
    return modalInner;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      {modalInner}
    </div>,
    document.body
  );
};
