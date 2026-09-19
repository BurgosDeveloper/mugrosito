import React, { useState, useEffect } from 'react';
import { IoClose, IoSwapHorizontal, IoBicycleOutline, IoBagHandleOutline, IoRestaurantOutline, IoCheckmarkCircle, IoWarning } from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order } from '../data/mockData';
import { DeliveryFeeSelector } from './DeliveryFeeSelector';

interface OrderServiceTransferModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedOrder: Order) => void;
}

type TransferTab = 'mesa' | 'delivery' | 'pickup';

export const OrderServiceTransferModal: React.FC<OrderServiceTransferModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { tables, orders, transferOrderService, exchangeRates } = useApp();

  const [activeTab, setActiveTab] = useState<TransferTab>('mesa');
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [deliveryCustomerName, setDeliveryCustomerName] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(1.0);
  const [deliveryMode, setDeliveryMode] = useState<'all' | 'items'>('all');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order) {
      setError('');
      setSelectedTableNumber(order.type === 'mesa' ? order.tableNumber || null : null);
      setDeliveryCustomerName(order.customerName || '');
      setDeliveryFeeUSD(order.deliveryFeeUSD && order.deliveryFeeUSD > 0 ? order.deliveryFeeUSD : 1.0);
      setDeliveryMode('all');
      setSelectedItemIds(order.items?.filter((i) => i.isDelivery).map((i) => i.id) || []);

      // Default active tab to something other than current type if applicable
      if (order.type === 'mesa') {
        setActiveTab('mesa');
      } else if (order.type === 'pickup') {
        setActiveTab('delivery');
      } else {
        setActiveTab('mesa');
      }
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  // Active occupied tables (excluding this order's current table)
  const occupiedTableNumbers = new Set(
    orders
      .filter(
        (o) =>
          o.type === 'mesa' &&
          o.tableNumber &&
          o.id !== order.id &&
          o.status !== 'cancelado' &&
          o.status !== 'fusionada' &&
          o.status !== 'entregada' &&
          o.paymentStatus !== 'pagado' &&
          o.paymentStatus !== 'credito'
      )
      .map((o) => o.tableNumber!)
  );

  const handleToggleSelectItem = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleConfirmTransfer = async () => {
    setError('');

    if (activeTab === 'mesa') {
      if (!selectedTableNumber) {
        setError('⚠️ Por favor seleccione una mesa de destino.');
        return;
      }
      if (order.type === 'mesa' && selectedTableNumber === order.tableNumber) {
        setError('⚠️ La comanda ya se encuentra en esta mesa.');
        return;
      }
    }

    if (activeTab === 'delivery') {
      if (!deliveryCustomerName.trim()) {
        setError('⚠️ El nombre del cliente es obligatorio para el servicio Delivery.');
        return;
      }
      if (deliveryFeeUSD <= 0) {
        setError('⚠️ El costo de envío del Delivery debe ser mayor a $0.00.');
        return;
      }
      if (deliveryMode === 'items' && selectedItemIds.length === 0) {
        setError('⚠️ Debe seleccionar al menos un producto para asignarle Delivery.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let action: 'change-table' | 'to-mesa' | 'to-delivery' | 'to-pickup' | 'assign-delivery-items' = 'change-table';
      let payload: any = {};

      if (activeTab === 'mesa') {
        action = order.type === 'mesa' ? 'change-table' : 'to-mesa';
        payload = { action, newTableNumber: selectedTableNumber };
      } else if (activeTab === 'delivery') {
        if (deliveryMode === 'items' && order.type === 'mesa') {
          action = 'assign-delivery-items';
          payload = {
            action,
            customerName: deliveryCustomerName.trim(),
            deliveryFeeUSD,
            selectedItemIds,
          };
        } else {
          action = 'to-delivery';
          payload = {
            action,
            customerName: deliveryCustomerName.trim(),
            deliveryFeeUSD,
          };
        }
      } else if (activeTab === 'pickup') {
        action = 'to-pickup';
        payload = { action };
      }

      const updated = await transferOrderService(order.id, payload);
      if (onSuccess) onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al procesar el traslado de servicio de la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-xl bg-white border border-gray-300 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2.5 text-black font-black text-base sm:text-lg">
            <div className="w-10 h-10 rounded-2xl bg-yellow-400 border border-yellow-500 flex items-center justify-center text-xl shadow-xs">
              <IoSwapHorizontal className="text-black" />
            </div>
            <div>
              <span className="tracking-tight block">GESTIÓN DE SERVICIO Y MESA</span>
              <span className="text-xs font-bold text-gray-500 block">
                Comanda #{order.orderNumber} ({order.customerName || 'Cliente General'})
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-black hover:bg-gray-100 transition-all cursor-pointer border border-gray-200"
          >
            <IoClose size={22} />
          </button>
        </div>

        {/* Info Estado Actual */}
        <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-bold uppercase tracking-wider text-[11px]">Servicio Actual:</span>
            <span className={`px-2.5 py-0.5 rounded-lg font-black uppercase text-xs border shadow-2xs ${
              order.type === 'mesa'
                ? 'bg-yellow-400 border-yellow-500 text-black'
                : order.type === 'delivery'
                ? 'bg-blue-100 border-blue-300 text-blue-950'
                : 'bg-emerald-100 border-emerald-300 text-emerald-950'
            }`}>
              {order.type === 'mesa' ? `🍽️ Mesa #${order.tableNumber}` : order.type === 'delivery' ? '🛵 Delivery' : '🛍️ PickUp'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-bold uppercase tracking-wider text-[11px]">Total:</span>
            <span className="font-black text-black text-sm">${(order.totalUSD || 0).toFixed(2)} USD</span>
          </div>
        </div>

        {/* Pestañas de Selección de Destino */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-2xl border border-gray-200">
          <button
            type="button"
            onClick={() => { setActiveTab('mesa'); setError(''); }}
            className={`py-2 px-2 text-center rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'mesa'
                ? 'bg-white text-black shadow-xs font-black'
                : 'text-gray-600 hover:text-black hover:bg-white/50'
            }`}
          >
            <IoRestaurantOutline className="text-base" />
            <span>Mesa Salón</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('delivery'); setError(''); }}
            className={`py-2 px-2 text-center rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'delivery'
                ? 'bg-white text-blue-900 shadow-xs font-black'
                : 'text-gray-600 hover:text-black hover:bg-white/50'
            }`}
          >
            <IoBicycleOutline className="text-base" />
            <span>Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('pickup'); setError(''); }}
            className={`py-2 px-2 text-center rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'pickup'
                ? 'bg-white text-emerald-900 shadow-xs font-black'
                : 'text-gray-600 hover:text-black hover:bg-white/50'
            }`}
          >
            <IoBagHandleOutline className="text-base" />
            <span>PickUp</span>
          </button>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <IoWarning className="text-base shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* CONTENIDO SEGÚN PESTAÑA */}
        <div className="flex-1 space-y-4">
          {/* TAB 1: MESA DE SALÓN */}
          {activeTab === 'mesa' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-gray-800 uppercase tracking-wider block">
                  {order.type === 'mesa' ? 'Seleccione la Nueva Mesa de Destino:' : 'Seleccione la Mesa donde se ubicará el Cliente:'}
                </label>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {tables
                  .sort((a, b) => a.number - b.number)
                  .map((table) => {
                    const isCurrentTable = order.type === 'mesa' && table.number === order.tableNumber;
                    const isOccupiedByOther = occupiedTableNumbers.has(table.number);
                    const isSelected = selectedTableNumber === table.number;

                    return (
                      <button
                        key={table.id || table.number}
                        type="button"
                        disabled={isCurrentTable || isOccupiedByOther}
                        onClick={() => {
                          setSelectedTableNumber(table.number);
                          setError('');
                        }}
                        className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                          isCurrentTable
                            ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed'
                            : isOccupiedByOther
                            ? 'bg-red-50 border-red-200 text-red-600 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-yellow-400 text-black border-yellow-500 font-black shadow-xs scale-[1.02]'
                            : 'bg-white border-gray-300 text-gray-900 hover:bg-yellow-50 hover:border-yellow-400'
                        }`}
                      >
                        <span className="text-sm font-black">Mesa #{table.number}</span>
                        <span className="text-[10px] font-bold">
                          {isCurrentTable
                            ? '(Actual)'
                            : isOccupiedByOther
                            ? 'Ocupada'
                            : `${table.capacity || 2} pers.`}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {selectedTableNumber && (
                <div className="p-3 rounded-2xl bg-yellow-50 border border-yellow-300 text-xs font-bold text-gray-800 flex items-center justify-between">
                  <span>Mesa seleccionada:</span>
                  <span className="font-black text-black bg-yellow-400 px-2 py-0.5 rounded-lg border border-yellow-500">
                    Mesa #{selectedTableNumber}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SERVICIO DELIVERY */}
          {activeTab === 'delivery' && (
            <div className="space-y-3.5">
              {/* Opción de Modo: Todo el Pedido vs Solo Ítems Seleccionados (si es mesa) */}
              {order.type === 'mesa' && (
                <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('all')}
                    className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
                      deliveryMode === 'all'
                        ? 'bg-white text-black shadow-2xs font-black'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    📦 Cambiar Comanda Completa a Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('items')}
                    className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
                      deliveryMode === 'items'
                        ? 'bg-white text-black shadow-2xs font-black'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    🛵 Asignar Delivery Solo a Ciertos Ítems
                  </button>
                </div>
              )}

              {/* Nombre de Cliente */}
              <div>
                <label className="text-xs font-black text-gray-800 uppercase tracking-wider block mb-1">
                  Nombre del Cliente / Receptor: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={deliveryCustomerName}
                  onChange={(e) => setDeliveryCustomerName(e.target.value)}
                  placeholder="Ej: Juan Pérez / Apto 4B..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-xl text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-bold shadow-2xs"
                />
              </div>

              {/* Selector de Costo de Envío */}
              <DeliveryFeeSelector
                value={deliveryFeeUSD}
                onChange={setDeliveryFeeUSD}
                exchangeRates={exchangeRates}
              />

              {/* Selección de Ítems Específicos si es modo 'items' */}
              {deliveryMode === 'items' && order.items && order.items.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-gray-200">
                  <label className="text-xs font-black text-gray-800 uppercase tracking-wider block">
                    Seleccione los productos para Delivery:
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {order.items.map((it) => {
                      const isChecked = selectedItemIds.includes(it.id);
                      return (
                        <label
                          key={it.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-yellow-50 border-yellow-400 shadow-2xs font-black'
                              : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectItem(it.id)}
                              className="w-4 h-4 rounded text-yellow-500 focus:ring-yellow-400"
                            />
                            <span className="text-xs">{it.quantity}x {it.productName}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-700">
                            {it.price >= 100
                              ? `${Math.round(it.price * it.quantity).toLocaleString('es-CO')} COP`
                              : `$${(it.price * it.quantity).toFixed(2)}`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {deliveryMode === 'all' && order.type === 'mesa' && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-yellow-300 text-xs text-amber-900 font-bold flex items-center gap-2">
                  <IoWarning className="text-base shrink-0 text-yellow-600" />
                  <span>Al convertir la comanda completa a Delivery, la Mesa #{order.tableNumber} se liberará en el salón.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PICKUP (PARA LLEVAR) */}
          {activeTab === 'pickup' && (
            <div className="space-y-3 p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
              <div className="flex items-center gap-2 text-stone-900 font-black text-sm">
                <IoBagHandleOutline className="text-lg text-emerald-700" />
                <span>Conversión a Pedido PickUp (Para Llevar)</span>
              </div>
              <p className="text-gray-600 font-bold">
                La comanda se empaquetará para ser retirada directamente en el mostrador por el cliente.
              </p>

              {order.type === 'mesa' && (
                <div className="p-2.5 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 font-bold flex items-center gap-2">
                  <IoWarning className="text-base shrink-0 text-amber-700" />
                  <span>La Mesa #{order.tableNumber} quedará libre en el salón automáticamente.</span>
                </div>
              )}

              {order.type === 'delivery' && (order.deliveryFeeUSD || 0) > 0 && (
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-950 font-bold">
                  <span>Se removerá la tarifa actual de envío (${(order.deliveryFeeUSD || 0).toFixed(2)} USD).</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-all border border-gray-300 cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmTransfer}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-xs font-black bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Procesando...</span>
            ) : (
              <>
                <IoCheckmarkCircle className="text-base" />
                <span>
                  {activeTab === 'mesa'
                    ? `Confirmar a Mesa #${selectedTableNumber || '...'}`
                    : activeTab === 'delivery'
                    ? 'Confirmar Delivery'
                    : 'Confirmar PickUp'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
