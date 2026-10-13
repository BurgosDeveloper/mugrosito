import React, { useState, useEffect, useMemo } from 'react';
import {
  IoClose,
  IoSearchOutline,
  IoPrintOutline,
  IoReceiptOutline,
  IoRestaurantOutline,
  IoBicycleOutline,
  IoBagHandleOutline,
  IoCashOutline,
  IoDocumentTextOutline,
  IoAlertCircleOutline,
  IoEyeOutline,
} from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order, OrderItem } from '../data/mockData';
import { formatRemovedIngredients } from '../utils/burgerProteins';

interface HistoricalOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoricalOrdersModal: React.FC<HistoricalOrdersModalProps> = ({ isOpen, onClose }) => {
  const { fetchHistoricalOrders, printOrderReceipt, reprintKitchenOrder } = useApp();

  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Filtros
  const [fromInput, setFromInput] = useState<string>('');
  const [toInput, setToInput] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('todos');

  // Comanda seleccionada para vista detallada al 100%
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printStatus, setPrintStatus] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Inicializar con últimos 7 días al abrir
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const past = new Date();
      past.setDate(past.getDate() - 7);

      const pastStr = past.toISOString().slice(0, 10) + 'T00:00';
      const nowStr = now.toISOString().slice(0, 10) + 'T23:59';

      setFromInput(pastStr);
      setToInput(nowStr);
      loadOrders(pastStr, nowStr, '', 'todos', 'todos');
    } else {
      setSelectedOrder(null);
      setError('');
      setPrintStatus('');
    }
  }, [isOpen]);

  const loadOrders = async (
    fromVal = fromInput,
    toVal = toInput,
    searchVal = searchInput,
    typeVal = typeFilter,
    statusVal = paymentStatusFilter
  ) => {
    setIsLoading(true);
    setError('');
    try {
      const orders = await fetchHistoricalOrders({
        from: fromVal || undefined,
        to: toVal || undefined,
        search: searchVal || undefined,
        type: typeVal !== 'todos' ? typeVal : undefined,
        paymentStatus: statusVal !== 'todos' ? statusVal : undefined,
        limit: 200,
      });
      setOrdersList(orders || []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar las comandas históricas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyQuickRange = (rangeType: 'hoy' | 'ayer' | 'semana' | 'mes' | 'todos') => {
    const now = new Date();
    let fStr = '';
    let tStr = '';

    if (rangeType === 'hoy') {
      const today = now.toISOString().slice(0, 10);
      fStr = `${today}T00:00`;
      tStr = `${today}T23:59`;
    } else if (rangeType === 'ayer') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      fStr = `${yStr}T00:00`;
      tStr = `${yStr}T23:59`;
    } else if (rangeType === 'semana') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      fStr = `${w.toISOString().slice(0, 10)}T00:00`;
      tStr = `${now.toISOString().slice(0, 10)}T23:59`;
    } else if (rangeType === 'mes') {
      const m = new Date();
      m.setDate(1);
      fStr = `${m.toISOString().slice(0, 10)}T00:00`;
      tStr = `${now.toISOString().slice(0, 10)}T23:59`;
    } else {
      fStr = '';
      tStr = '';
    }

    setFromInput(fStr);
    setToInput(tStr);
    loadOrders(fStr, tStr, searchInput, typeFilter, paymentStatusFilter);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  const handlePrintReceipt = async (orderId: string) => {
    setIsPrinting(true);
    setPrintStatus('');
    try {
      await printOrderReceipt(orderId, 'caja');
      setPrintStatus('✅ Recibo enviado a la impresora térmica de CAJA.');
      setTimeout(() => setPrintStatus(''), 4000);
    } catch (err: any) {
      setPrintStatus(`❌ Error de impresión: ${err?.message || 'Fallo de impresora'}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintKitchen = async (orderId: string) => {
    setIsPrinting(true);
    setPrintStatus('');
    try {
      await reprintKitchenOrder(orderId, 'cocina');
      setPrintStatus('✅ Comanda enviada a la impresora de COCINA.');
      setTimeout(() => setPrintStatus(''), 4000);
    } catch (err: any) {
      setPrintStatus(`❌ Error de impresión en cocina: ${err?.message || 'Fallo de impresora'}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // Resumen acumulado de los resultados mostrados
  const stats = useMemo(() => {
    let totalCOP = 0;
    let totalUSD = 0;
    let totalItems = 0;
    ordersList.forEach((ord) => {
      totalCOP += Number(ord.totalCOP || 0);
      totalUSD += Number(ord.totalUSD || 0);
      ord.items?.forEach((it) => {
        totalItems += Number(it.quantity || 1);
      });
    });
    return { count: ordersList.length, totalCOP, totalUSD, totalItems };
  }, [ordersList]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-6xl max-h-[96vh] bg-white rounded-3xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden text-gray-900">
        {/* Cabecera Principal */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900 text-white shrink-0 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-black flex items-center justify-center text-xl font-black shadow-md">
              <IoSearchOutline />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide flex items-center gap-2">
                <span>HISTÓRICO Y BÚSQUEDA DE COMANDAS DE DÍAS ANTERIORES</span>
                <span className="text-[10px] bg-yellow-400/20 text-yellow-300 font-bold px-2 py-0.5 rounded-full border border-yellow-400/30 uppercase tracking-widest">
                  Auditoría 100%
                </span>
              </h2>
              <p className="text-xs text-gray-400 font-medium">
                Consulta cualquier pedido archivado con todos sus productos, modificadores, pagos y vueltos registrados.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Cerrar ventana"
          >
            <IoClose className="text-xl" />
          </button>
        </div>

        {/* Panel de Filtros y Búsqueda */}
        <div className="p-4 sm:p-5 bg-gray-50 border-b border-gray-200 shrink-0 space-y-3">
          {/* Accesos rápidos de rango */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider mr-1">Rango rápido:</span>
              <button
                type="button"
                onClick={() => handleApplyQuickRange('hoy')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200 hover:border-yellow-400 transition-all cursor-pointer"
              >
                📅 Hoy
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickRange('ayer')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200 hover:border-yellow-400 transition-all cursor-pointer"
              >
                ⏪ Ayer
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickRange('semana')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200 hover:border-yellow-400 transition-all cursor-pointer"
              >
                🗓️ Últimos 7 Días
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickRange('mes')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200 hover:border-yellow-400 transition-all cursor-pointer"
              >
                📆 Este Mes
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickRange('todos')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 transition-all cursor-pointer"
              >
                🔄 Ver Todo
              </button>
            </div>

            {/* Estadísticas rápidas */}
            <div className="flex items-center gap-4 bg-white px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-bold shadow-xs">
              <span className="text-gray-500">
                Comandas: <strong className="text-black font-black">{stats.count}</strong>
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500">
                Ítems: <strong className="text-black font-black">{stats.totalItems}</strong>
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500">
                Total:{' '}
                <strong className="text-yellow-700 font-black">
                  {Math.round(stats.totalCOP).toLocaleString('es-CO')} COP
                </strong>
                <span className="text-gray-400 ml-1">(${stats.totalUSD.toFixed(2)})</span>
              </span>
            </div>
          </div>

          {/* Formulario de búsqueda detallada */}
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5">
                Buscar por # Comanda, Cliente o Deudor
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ej: #12, Maria, Pedro..."
                  className="w-full pl-8 pr-3 py-2 bg-white rounded-xl text-xs font-bold border border-gray-300 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-400 transition-all"
                />
                <IoSearchOutline className="absolute left-2.5 top-2.5 text-gray-400 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5">
                Desde (Fecha y Hora)
              </label>
              <input
                type="datetime-local"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="w-full px-2.5 py-2 bg-white rounded-xl text-xs font-semibold border border-gray-300 focus:outline-none focus:border-yellow-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5">
                Hasta (Fecha y Hora)
              </label>
              <input
                type="datetime-local"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="w-full px-2.5 py-2 bg-white rounded-xl text-xs font-semibold border border-gray-300 focus:outline-none focus:border-yellow-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5">
                Tipo de Servicio
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-2.5 py-2 bg-white rounded-xl text-xs font-bold border border-gray-300 focus:outline-none focus:border-yellow-500 cursor-pointer"
              >
                <option value="todos">Todos los servicios</option>
                <option value="mesa">Mesa / Salón</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup / Llevar</option>
                <option value="credito">Crédito</option>
              </select>
            </div>

            <div className="flex items-end gap-1.5">
              <div className="flex-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5">
                  Estado Pago
                </label>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="w-full px-2 py-2 bg-white rounded-xl text-xs font-bold border border-gray-300 focus:outline-none focus:border-yellow-500 cursor-pointer"
                >
                  <option value="todos">Todos</option>
                  <option value="pagado">Pagado</option>
                  <option value="credito">Crédito</option>
                  <option value="no_pagado">Pendiente</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs rounded-xl border border-yellow-500 shadow-xs transition-all cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isLoading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </form>
        </div>

        {/* Mensaje de error si ocurre */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <IoAlertCircleOutline className="text-base shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabla / Lista de Comandas Históricas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[300px]">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
              <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold">Consultando comandas históricas en la base de datos...</p>
            </div>
          ) : ordersList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400 text-center">
              <IoDocumentTextOutline className="text-4xl text-gray-300" />
              <p className="text-sm font-bold text-gray-600">No se encontraron comandas con los filtros seleccionados.</p>
              <p className="text-xs text-gray-400">Prueba ajustando el rango de fechas o limpiando el buscador.</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-700 text-[10px] font-black uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Comanda #</th>
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Servicio</th>
                    <th className="py-3 px-4">Cliente / Deudor</th>
                    <th className="py-3 px-3 text-center">Ítems</th>
                    <th className="py-3 px-4 text-right">Total COP</th>
                    <th className="py-3 px-4 text-right">Equiv. USD</th>
                    <th className="py-3 px-4 text-center">Estado Pago</th>
                    <th className="py-3 px-4 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-semibold text-gray-800">
                  {ordersList.map((ord) => {
                    const cleanOrderNumber = ord.orderNumber ? String(ord.orderNumber).replace(/^#+/, '') : ord.id;
                    const itemsCount = (ord.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
                    const isCredit = ord.paymentStatus === 'credito' || ord.type === 'credito';
                    const isPaid = ord.paymentStatus === 'pagado';
                    const debtor = ord.debtorName || ord.customerName;

                    return (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedOrder(ord)}
                        className="hover:bg-yellow-50/70 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-black text-black">
                          <span className="text-yellow-600">#</span>
                          {cleanOrderNumber}
                          {ord.archivedAt && (
                            <span className="ml-1.5 text-[9px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-bold">
                              Archivada
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                          {new Date(ord.createdAt).toLocaleString('es-CO', {
                            month: '2-digit',
                            day: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </td>
                        <td className="py-3 px-4">
                          {ord.type === 'mesa' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-gray-800">
                              <IoRestaurantOutline className="text-yellow-600" />
                              Mesa #{ord.tableNumber || '?'}
                            </span>
                          ) : ord.type === 'delivery' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-blue-700">
                              <IoBicycleOutline className="text-blue-500 text-sm" />
                              Delivery
                            </span>
                          ) : ord.type === 'credito' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-red-700">
                              <IoDocumentTextOutline className="text-red-500 text-sm" />
                              Crédito
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-green-700">
                              <IoBagHandleOutline className="text-green-500 text-sm" />
                              Pickup
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[160px] truncate">
                          {isCredit ? (
                            <span className="font-black text-red-600">📝 {debtor || 'Deudor sin nombre'}</span>
                          ) : (
                            ord.customerName || <span className="text-gray-400 italic">Cliente General</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-gray-700">
                          <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-[11px]">
                            {itemsCount}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-black">
                          {Math.round(ord.totalCOP || 0).toLocaleString('es-CO')} COP
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-gray-600">
                          ${Number(ord.totalUSD || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isCredit ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-200">
                              CRÉDITO
                            </span>
                          ) : isPaid ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-green-100 text-green-800 border border-green-200">
                              PAGADO
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-800 border border-yellow-200">
                              PENDIENTE
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrder(ord);
                            }}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-yellow-400 text-gray-700 hover:text-black transition-all cursor-pointer"
                            title="Ver todo el detalle de esta comanda"
                          >
                            <IoEyeOutline className="text-base" />
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

        {/* Modal de Detalle Completo al 100% */}
        {selectedOrder && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs animate-in fade-in">
            <div className="relative w-full max-w-3xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden text-gray-900">
              {/* Header Modal Detalle */}
              <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-black flex items-center justify-center text-xl font-black">
                    <IoReceiptOutline />
                  </div>
                  <div>
                    <h3 className="text-base font-black flex items-center gap-2">
                      <span>DETALLE COMPLETO COMANDA #{String(selectedOrder.orderNumber).replace(/^#+/, '')}</span>
                      {selectedOrder.archivedAt && (
                        <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-bold uppercase">
                          Archivada
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-400">
                      Creada el {new Date(selectedOrder.createdAt).toLocaleString('es-CO')} | Mesero:{' '}
                      {selectedOrder.waiterName || 'Mesero'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <IoClose className="text-lg" />
                </button>
              </div>

              {/* Mensaje de estado de impresión si ocurrió */}
              {printStatus && (
                <div className="mx-6 mt-3 p-3 bg-gray-100 border border-gray-300 text-gray-900 text-xs font-bold rounded-xl flex items-center gap-2 animate-in fade-in">
                  <span>{printStatus}</span>
                </div>
              )}

              {/* Cuerpo del Detalle */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Metadatos de la Comanda */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                  <div>
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Servicio</span>
                    <strong className="text-gray-900 capitalize font-black">
                      {selectedOrder.type === 'mesa' ? `Mesa #${selectedOrder.tableNumber}` : selectedOrder.type}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Cliente</span>
                    <strong className="text-gray-900 font-black">
                      {selectedOrder.customerName || 'Cliente General'}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Estado de Pago</span>
                    <strong
                      className={`font-black ${
                        selectedOrder.paymentStatus === 'pagado'
                          ? 'text-green-700'
                          : selectedOrder.paymentStatus === 'credito'
                          ? 'text-red-700'
                          : 'text-yellow-700'
                      }`}
                    >
                      {String(selectedOrder.paymentStatus || 'no_pagado').toUpperCase()}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Turno</span>
                    <strong className="text-gray-900 capitalize font-black">{selectedOrder.shift || 'ambos'}</strong>
                  </div>
                </div>

                {/* Si es crédito: deudor */}
                {(selectedOrder.paymentStatus === 'credito' || selectedOrder.type === 'credito' || selectedOrder.debtorName) && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-1">
                    <div className="flex items-center gap-2 font-black text-red-800">
                      <IoDocumentTextOutline className="text-base" />
                      <span>CUENTA CERRADA A CRÉDITO</span>
                    </div>
                    <p className="text-red-900">
                      Deudor responsable: <strong>{selectedOrder.debtorName || selectedOrder.customerName}</strong>
                    </p>
                    {selectedOrder.notes && (
                      <p className="text-red-700 text-[11px] italic">Notas del crédito: {selectedOrder.notes}</p>
                    )}
                  </div>
                )}

                {/* Ítems y Modificadores de la Comanda */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <IoRestaurantOutline className="text-yellow-600 text-sm" />
                    <span>Productos e Ítems Detallados ({selectedOrder.items?.length || 0})</span>
                  </h4>
                  <div className="border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-wider border-b border-gray-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center">Cant.</th>
                          <th className="py-2.5 px-3">Producto / Modificaciones</th>
                          <th className="py-2.5 px-3 text-right">Precio Unit.</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-semibold">
                        {selectedOrder.items?.map((it: OrderItem, idx: number) => {
                          const unitPrice = Number(it.price) || 0;
                          const qty = Number(it.quantity) || 1;
                          const subtotal = unitPrice * qty;
                          const extrasList = Array.isArray(it.extras) ? it.extras : [];

                          return (
                            <tr key={it.id || idx} className="hover:bg-gray-50/60 transition-colors">
                              <td className="py-2.5 px-3 text-center font-black text-black">{qty}x</td>
                              <td className="py-2.5 px-3 space-y-1">
                                <div className="font-black text-gray-900 text-xs">
                                  {it.productName}
                                  {it.size && (it.size as string) !== 'Estándar' && (
                                    <span className="ml-1 text-[10px] text-gray-500 font-normal">({it.size})</span>
                                  )}
                                  {it.isTakeaway && (
                                    <span className="ml-1.5 text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-black">
                                      LLEVAR
                                    </span>
                                  )}
                                  {it.isDelivery && (
                                    <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-black">
                                      DELIVERY
                                    </span>
                                  )}
                                  {it.isCut && (
                                    <span className="ml-1.5 text-[9px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-black">
                                      🔪 PICADA
                                    </span>
                                  )}
                                </div>

                                {/* Proteínas */}
                                {it.proteins && it.proteins.length > 0 && (
                                  <div className="text-[11px] text-gray-600">
                                    🥩 Proteínas: <span className="font-bold">{it.proteins.join(', ')}</span>
                                  </div>
                                )}

                                {/* Ingredientes Retirados */}
                                {it.removedIngredients && it.removedIngredients.length > 0 && (
                                  <div className="text-[11px] text-red-600 font-bold">
                                    🚫 SIN: {formatRemovedIngredients(it.removedIngredients).join(', ')}
                                  </div>
                                )}

                                {/* Adicionales Pagos */}
                                {extrasList.length > 0 && (
                                  <div className="text-[11px] text-green-700 space-y-0.5 font-medium">
                                    {extrasList.map((ex: any, eIdx: number) => (
                                      <div key={eIdx}>
                                        + ADD {ex.name} ({Math.round(Number(ex.price) || 0).toLocaleString('es-CO')} COP)
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Sabor o Preferencias */}
                                {it.flavor && (
                                  <div className="text-[11px] text-purple-700">Sabor: {it.flavor}</div>
                                )}
                                {it.notes && (
                                  <div className="text-[10px] text-gray-500 italic">Nota: "{it.notes}"</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-gray-600 font-mono">
                                {Math.round(unitPrice).toLocaleString('es-CO')} COP
                              </td>
                              <td className="py-2.5 px-3 text-right font-black text-black font-mono">
                                {Math.round(subtotal).toLocaleString('es-CO')} COP
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Nota de cocina general si existió */}
                {selectedOrder.kitchenNotes && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs">
                    <span className="font-black text-yellow-800 block mb-0.5">Nota general de comanda:</span>
                    <p className="text-gray-800">{selectedOrder.kitchenNotes}</p>
                  </div>
                )}

                {/* Desglose Financiero */}
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Subtotal de Productos:</span>
                    <span className="font-bold">
                      {Math.round(
                        (selectedOrder.totalCOP || 0) - (selectedOrder.deliveryFeeCOP || 0)
                      ).toLocaleString('es-CO')}{' '}
                      COP
                    </span>
                  </div>

                  {(Number(selectedOrder.deliveryFeeCOP) > 0 || Number(selectedOrder.deliveryFeeUSD) > 0) && (
                    <div className="flex justify-between text-xs text-blue-700 font-bold">
                      <span>Servicio de Delivery:</span>
                      <span>
                        +{Math.round(selectedOrder.deliveryFeeCOP || 0).toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <span className="text-xs text-gray-500 font-bold">Total Final:</span>
                      <div className="text-lg font-black text-black">
                        {Math.round(selectedOrder.totalCOP || 0).toLocaleString('es-CO')} COP
                      </div>
                    </div>
                    <div className="text-right sm:text-right">
                      <div className="text-xs text-gray-600 font-black">
                        Equivalente: ${Number(selectedOrder.totalUSD || 0).toFixed(2)} USD
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Bs:{' '}
                        {selectedOrder.bsRateAtPayment && Number(selectedOrder.totalCOP) > 0
                          ? (Number(selectedOrder.totalCOP) / Number(selectedOrder.bsRateAtPayment)).toFixed(2)
                          : '0.00'}{' '}
                        Bs
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desglose de Pagos Registrados (Ledger) */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <IoCashOutline className="text-green-600 text-sm" />
                    <span>Desglose de Pagos Registrados en el Sistema</span>
                  </h4>

                  {selectedOrder.paymentHistory && selectedOrder.paymentHistory.length > 0 ? (
                    <div className="border border-gray-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-wider border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-3">Método de Pago</th>
                            <th className="py-2.5 px-3">Moneda</th>
                            <th className="py-2.5 px-3 text-right">Monto Recibido</th>
                            <th className="py-2.5 px-3 text-right">Monto Pagado</th>
                            <th className="py-2.5 px-3 text-right">Vuelto Dado</th>
                            <th className="py-2.5 px-3 text-center">Hora</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-semibold">
                          {selectedOrder.paymentHistory.map((pm, pIdx) => {
                            const method = pm.paymentMethod || pm.method || 'Pago';
                            const tenderCOP = Number(pm.cashTenderedCOP || 0);
                            const tenderUSD = Number(pm.cashTenderedUSD || 0);
                            const tenderBs = Number(pm.cashTenderedBs || 0);

                            const changeCOP = Number(pm.changeGivenCOP || 0);
                            const changeUSD = Number(pm.changeGivenUSD || 0);
                            const changeBs = Number(pm.changeGivenBs || 0);

                            const paidUSD = Number(pm.amountPaidUSD || 0);
                            const pCopRate = Number(pm.copRate || selectedOrder.copRateAtPayment || 3100);

                            return (
                              <tr key={pm.id || pIdx} className="hover:bg-gray-50/60">
                                <td className="py-2.5 px-3 font-black text-gray-900">{method}</td>
                                <td className="py-2.5 px-3">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                                    {pm.currency || 'COP'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                                  {tenderCOP > 0
                                    ? `${Math.round(tenderCOP).toLocaleString('es-CO')} COP`
                                    : tenderUSD > 0
                                    ? `$${tenderUSD.toFixed(2)} USD`
                                    : tenderBs > 0
                                    ? `${tenderBs.toFixed(2)} Bs`
                                    : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-black text-black">
                                  {pm.currency === 'COP' || method.includes('COP') || method.includes('Bancolombia') || method.includes('Nequi')
                                    ? `${Math.round(paidUSD * pCopRate).toLocaleString('es-CO')} COP`
                                    : pm.currency === 'Bs' || method.includes('Bs') || method.includes('Movil')
                                    ? `${(paidUSD * (Number(pm.bsRate) || 3.2)).toFixed(2)} Bs`
                                    : `$${paidUSD.toFixed(2)} USD`}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-orange-600 font-bold">
                                  {changeCOP > 0
                                    ? `${Math.round(changeCOP).toLocaleString('es-CO')} COP`
                                    : changeUSD > 0
                                    ? `$${changeUSD.toFixed(2)} USD`
                                    : changeBs > 0
                                    ? `${changeBs.toFixed(2)} Bs`
                                    : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-center text-gray-500 font-mono text-[10px]">
                                  {pm.createdAt ? new Date(pm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600">
                      Método registrado:{' '}
                      <strong>{selectedOrder.paymentMethod || 'No especificado (o Comanda Abierta)'}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Botones de Pie de Modal */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-800 font-bold text-xs border border-gray-300 transition-all cursor-pointer"
                >
                  Volver al Listado
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPrinting}
                    onClick={() => handlePrintKitchen(selectedOrder.id)}
                    className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    title="Imprimir ticket para cocina"
                  >
                    <IoRestaurantOutline className="text-sm" />
                    <span>Imprimir Cocina</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPrinting}
                    onClick={() => handlePrintReceipt(selectedOrder.id)}
                    className="px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center gap-1.5 border border-yellow-500 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    title="Imprimir recibo térmico con métodos de pago y vuelto"
                  >
                    <IoPrintOutline className="text-base" />
                    <span>🖨️ Imprimir Recibo Térmico</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
