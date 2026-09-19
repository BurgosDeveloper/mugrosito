import React from 'react';
import { OrderItem } from '../../data/mockData';
import { DeliveryFeeSelector } from '../../components/DeliveryFeeSelector';
import {
  IoCheckmarkCircle,
  IoArrowBack,
  IoTrashOutline,
} from 'react-icons/io5';

export interface DeliveryConfigPanelProps {
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  kitchenNotes: string;
  onKitchenNotesChange: (notes: string) => void;
  deliveryFeeUSD: number;
  onDeliveryFeeChange: (fee: number) => void;
  cartItems: OrderItem[];
  onSetItemPackaging: (itemId: string, packaging: 'salon' | 'llevar' | 'delivery') => void;
  onSetAllDelivery: (isDelivery: boolean) => void;
  exchangeRates?: { COP: number; Bs: number };
  onClose: () => void; // Minimizar / volver al catálogo
  onClearAllDelivery?: () => void; // Pasar todos a salón y cerrar
}

export const DeliveryConfigPanel: React.FC<DeliveryConfigPanelProps> = ({
  customerName,
  onCustomerNameChange,
  kitchenNotes,
  onKitchenNotesChange,
  deliveryFeeUSD,
  onDeliveryFeeChange,
  cartItems,
  onSetItemPackaging,
  onSetAllDelivery,
  exchangeRates = { COP: 3100, Bs: 3.2 },
  onClose,
  onClearAllDelivery,
}) => {
  const copRate = exchangeRates?.COP || 3100;
  const bsRate = exchangeRates?.Bs || 3.2;

  const deliveryItemsCount = cartItems.filter((i) => i.isDelivery).length;
  const totalItemsCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const itemsSubtotalUSD = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const grandTotalUSD = itemsSubtotalUSD + (deliveryItemsCount > 0 ? deliveryFeeUSD : 0);

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden select-none">
      {/* 1. HEADER */}
      <header className="bg-white text-gray-900 px-4 py-3 border-b-2 border-yellow-400 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <span className="text-2xl sm:text-3xl p-1.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-200">
            🛵
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-gray-950 uppercase tracking-wide">
                CONFIGURACIÓN DE SERVICIO DELIVERY
              </h2>
              <span className="bg-blue-600 text-white text-xs px-2.5 py-0.5 rounded-xl font-black shadow-xs">
                {deliveryItemsCount} {deliveryItemsCount === 1 ? 'ítem marcado' : 'ítems marcados'}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-bold mt-0.5">
              Define el cliente, dirección, costo de envío y qué productos van empaquetados para entrega
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black transition-colors cursor-pointer flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-xs border border-yellow-500"
          title="Minimizar esta sección para ver el menú y seguir agregando productos"
        >
          <IoArrowBack className="text-base" />
          <span>Minimizar / Ver Menú</span>
        </button>
      </header>

      {/* 2. BODY SCROLLABLE */}
      <main className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-stone-100/60">
        {/* CARD 1: DATOS DE CLIENTE Y DIRECCIÓN */}
        <section className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
              <span>👤</span>
              <span>DATOS DEL CLIENTE Y DIRECCIÓN (*OBLIGATORIO)</span>
            </span>
            <span className="text-[11px] font-bold text-gray-400">Se imprime en ticket de cocina y caja</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase text-gray-800 tracking-wider mb-1">
                Nombre del Cliente / Teléfono:
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                placeholder="Ej: Juan Pérez / 0414-1234567"
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-2xs placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-800 tracking-wider mb-1">
                Observación general / Nota de cocina:
              </label>
              <input
                type="text"
                value={kitchenNotes}
                onChange={(e) => onKitchenNotesChange(e.target.value)}
                placeholder="Ej: Sin cebolla, salsas aparte, cambio de $20..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-2xs placeholder-gray-400"
              />
            </div>
          </div>
        </section>

        {/* CARD 2: COSTO DE ENVÍO DELIVERY */}
        <section className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <DeliveryFeeSelector
            value={deliveryFeeUSD}
            onChange={onDeliveryFeeChange}
            exchangeRates={exchangeRates}
            label="COSTO DE ENVÍO DELIVERY (*OBLIGATORIO):"
            required={true}
          />
        </section>

        {/* CARD 3: LISTADO DE PRODUCTOS Y SELECCIÓN INDIVIDUAL / LOTE */}
        <section className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
                <span>📦</span>
                <span>DESTINO DE CADA PRODUCTO ({cartItems.length} ítems en comanda):</span>
              </span>
            </div>

            {/* Botones de lote para marcar o desmarcar todos */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onSetAllDelivery(true)}
                className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-300 font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                title="Marcar todos los productos del pedido como Delivery"
              >
                <span>🛵 Marcar Todos Delivery</span>
              </button>

              <button
                type="button"
                onClick={() => onSetAllDelivery(false)}
                className="px-3 py-1.5 rounded-xl bg-stone-100 text-gray-800 hover:bg-stone-200 border border-gray-300 font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                title="Pasar todos los productos del pedido a Salón / Mesa"
              >
                <span>🍽️ Pasar Todos a Salón</span>
              </button>
            </div>
          </div>

          {cartItems.length === 0 ? (
            <div className="text-center py-6 text-gray-400 font-bold text-xs">
              No hay productos en el carrito todavía. Minimiza esta sección para agregar productos desde el catálogo.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {cartItems.map((item) => {
                const isItemDelivery = Boolean(item.isDelivery);
                const isItemTakeaway = Boolean(item.isTakeaway && !item.isDelivery);
                const isItemSalon = !item.isTakeaway && !item.isDelivery;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                      isItemDelivery
                        ? 'bg-blue-50/70 border-blue-300 shadow-xs'
                        : 'bg-stone-50 border-gray-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-black text-gray-950 truncate block">
                          {item.quantity}x {item.productName}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-gray-500 mt-0.5">
                        {Math.round(item.price * item.quantity).toLocaleString('es-CO')} COP
                        {item.flavor && <span className="text-amber-700 ml-1.5">• {item.flavor}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSetItemPackaging(item.id, 'salon')}
                        className={`px-2 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                          isItemSalon
                            ? 'bg-yellow-400 border-yellow-500 text-black shadow-2xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                        title="Servir en Mesa / Salón"
                      >
                        🍽️ Salón
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetItemPackaging(item.id, 'llevar')}
                        className={`px-2 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                          isItemTakeaway
                            ? 'bg-amber-200 border-amber-400 text-amber-950 shadow-2xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                        title="Para Llevar (Pickup)"
                      >
                        🛍️ Llevar
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetItemPackaging(item.id, 'delivery')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                          isItemDelivery
                            ? 'bg-blue-600 border-blue-700 text-white shadow-xs scale-[1.02]'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                        title="Marcar para Delivery"
                      >
                        🛵 Delivery
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 3. FOOTER */}
      <footer className="bg-white text-gray-900 px-4 py-3 border-t-2 border-yellow-400 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            Total del pedido con Delivery ({totalItemsCount} productos):
          </span>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-xl sm:text-2xl font-black text-black">
              {grandTotalUSD.toLocaleString('es-CO')} <span className="text-xs sm:text-sm font-bold text-gray-500">COP</span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              💵 ${(copRate > 0 ? grandTotalUSD / copRate : 0).toFixed(2)} USD
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇻🇪 {(bsRate > 0 ? grandTotalUSD / bsRate : 0).toFixed(2)} Bs
            </span>
            {deliveryItemsCount > 0 && (
              <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 ml-1">
                (Incluye {deliveryFeeUSD.toLocaleString('es-CO')} COP de envío)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onClearAllDelivery && (
            <button
              type="button"
              onClick={onClearAllDelivery}
              className="px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Desmarcar todos los productos de delivery y regresar al pedido normal de mesa"
            >
              <IoTrashOutline className="text-base" />
              <span>Quitar Delivery a Todos</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs sm:text-sm border-2 border-yellow-500 flex items-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <IoCheckmarkCircle className="text-xl" />
            <span>LISTO / VOLVER AL MENÚ</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
