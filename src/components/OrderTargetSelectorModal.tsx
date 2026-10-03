import React from 'react';
import { Table, Order } from '../data/mockData';
import { IoClose, IoCar, IoWalk, IoRestaurant } from 'react-icons/io5';

interface OrderTargetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: Table[];
  orders: Order[];
  onSelectTarget: (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => void;
}

export const OrderTargetSelectorModal: React.FC<OrderTargetSelectorModalProps> = ({
  isOpen,
  onClose,
  tables,
  orders,
  onSelectTarget,
}) => {
  if (!isOpen) return null;

  const isOrderSettled = (o: Order) =>
    o.paymentStatus === 'pagado' ||
    o.paymentStatus === 'credito' ||
    o.paymentMethod === 'Crédito' ||
    (o as any).type === 'credito' ||
    (Number(o.paidAmountUSD || 0) >= Number(o.totalUSD || 0) - 0.01 && Number(o.totalUSD || 0) > 0);

  // Identificar mesas con órdenes activas
  const activeOrders = orders.filter(
    (o) =>
      o.status !== 'cancelado' &&
      o.status !== 'fusionada' &&
      !(o.status === 'entregada' && isOrderSettled(o))
  );

  const occupiedTableNumbers = new Set(
    activeOrders.filter((o) => o.type === 'mesa' && o.tableNumber).map((o) => o.tableNumber!)
  );

  const handleSelect = (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => {
    onSelectTarget(type, tableNumber, title);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-yellow-400 border-b border-yellow-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            <h3 className="text-base sm:text-lg font-black text-black uppercase tracking-tight">
              Seleccionar Destino del Pedido
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/40 hover:bg-white text-black font-black transition-all cursor-pointer"
          >
            <IoClose className="text-xl" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Opciones Rápidas: Delivery & PickUp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelect('delivery', undefined, 'Nuevo Pedido Delivery 🛵')}
              className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <IoCar className="text-3xl" />
              <div className="text-center">
                <span className="text-sm block tracking-wider uppercase">NUEVO DELIVERY</span>
                <span className="text-[10px] text-blue-100 font-bold block mt-0.5">Orden con entrega a domicilio</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelect('pickup', undefined, 'Nuevo Pedido PickUp 🛍️')}
              className="p-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <IoWalk className="text-3xl" />
              <div className="text-center">
                <span className="text-sm block tracking-wider uppercase">NUEVO PICK UP</span>
                <span className="text-[10px] text-stone-900 font-bold block mt-0.5">Retiro en mostrador / Para llevar</span>
              </div>
            </button>
          </div>

          {/* Mesas de Salón */}
          <div className="space-y-2.5 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <IoRestaurant className="text-yellow-600 text-sm" />
                <span>Mesas de Salón:</span>
              </span>
              <span className="text-[11px] font-bold text-gray-500">
                {tables.length - occupiedTableNumbers.size} libres de {tables.length}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {tables.map((table) => {
                const isOccupied = occupiedTableNumbers.has(table.number);
                return (
                  <button
                    key={table.id || table.number}
                    type="button"
                    onClick={() => handleSelect('mesa', table.number, `Mesa #${table.number}`)}
                    className={`py-3 px-2 rounded-2xl text-center font-black transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      isOccupied
                        ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                        : 'bg-green-50 text-green-950 border-green-300 hover:bg-green-100 hover:scale-[1.02] shadow-xs'
                    }`}
                  >
                    <span className="text-xs sm:text-sm leading-none">Mesa {table.number}</span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                        isOccupied ? 'bg-amber-200 text-amber-900' : 'bg-green-200 text-green-900'
                      }`}
                    >
                      {isOccupied ? 'Ocupada' : 'Libre'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-800 text-xs font-black border border-gray-200 cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
