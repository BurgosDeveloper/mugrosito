import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useSearchParams } from 'react-router-dom';
import { Order } from '../data/mockData';
import { areProteinsDefault, getCleanItemNote, formatRemovedIngredients } from '../utils/burgerProteins';
import { isSalsaItem } from '../utils/productClassifier';
import {
  IoFlame,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoReaderOutline,
  IoCheckmarkDone,
  IoBagOutline,
  IoPersonOutline,
  IoDocumentTextOutline,
  IoCloseCircleOutline,
  IoAddCircleOutline,
  IoTimerOutline,
} from 'react-icons/io5';

export const isKitchenProduct = (it: any) => {
  const nameLower = (it.productName || it.name || '').toLowerCase();
  const category = (it.category || '').toLowerCase();
  const drinkType = (it.drinkType || it.drink_type || '').toLowerCase();
  const isJuiceOrShake = (
    drinkType === 'jugo' ||
    drinkType === 'merengada' ||
    drinkType === 'malteada' ||
    drinkType === 'batido' ||
    nameLower.includes('jugo') ||
    nameLower.includes('merengada') ||
    nameLower.includes('malteada') ||
    nameLower.includes('batido')
  );
  if (['bebidas', 'bebida', 'licores', 'licor', 'cervezas', 'cerveza', 'gaseosas', 'refrescos', 'bebidas comerciales', 'bebida comercial'].includes(category)) {
    return isJuiceOrShake;
  }
  const isSoda =
    nameLower.includes('coca') ||
    nameLower.includes('pepsi') ||
    nameLower.includes('refresco') ||
    nameLower.includes('gaseosa') ||
    nameLower.includes('nestea') ||
    nameLower.includes('agua') ||
    nameLower.includes('7up') ||
    nameLower.includes('sprite') ||
    ['refresco', 'gaseosa', 'licor', 'cerveza', 'comercial', 'soda', 'agua', 'te'].includes(drinkType);
  return !isSoda;
};

export const requiresKitchenPrep = (order: Order): boolean => {
  if (!order || !order.items || order.items.length === 0) return false;
  if (order.type === 'delivery' || order.type === 'pickup') return true;
  return order.items.some(isKitchenProduct);
};

export const CocinaPage: React.FC = () => {
  const { orders, updateOrderStatus, isConnected, userSession } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pendientes';
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const getElapsedMinutes = (createdAt?: string) => {
    if (!createdAt) return 0;
    const createdMs = new Date(createdAt).getTime();
    if (isNaN(createdMs)) return 0;
    const diffMs = now - createdMs;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 0 || mins > 300) return 0;
    return mins;
  };

  const kitchenOrders = orders.filter((o) => requiresKitchenPrep(o) && o.status !== 'fusionada' && o.status !== 'cancelado' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift));
  const pendingOrders = kitchenOrders.filter((o) => o.status === 'en_preparacion');
  const readyOrders = kitchenOrders.filter((o) => o.status === 'preparada');

  const displayedOrders = activeTab === 'listas' ? readyOrders : pendingOrders;

  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);

  const handleMarkReady = async (orderId: string) => {
    if (submittingOrderId === orderId) return;
    setSubmittingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, 'preparada');
      setSearchParams({ tab: 'listas' });
    } finally {
      setSubmittingOrderId(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-slate-900">
      {/* Offline Status Warning Banner */}
      {!isConnected && (
        <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-300 text-amber-700 font-black text-xs flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center gap-2">
            <IoTimeOutline className="text-xl shrink-0" />
            <span>⚠️ SIN CONEXIÓN LAN DIRECTA — Intentando reconectar con la PC servidor...</span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-black text-[10px] uppercase font-black">
            MODO RECONEXIÓN
          </span>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-white via-slate-50 to-slate-100 border border-amber-200 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-amber-200 flex items-center justify-center shadow-lg">
            <IoFlame className="text-3xl text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Cocina & Horno</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 border border-amber-200 text-[10px] font-black uppercase tracking-wider">
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-700/70 mt-1">
              Monitoreo en tiempo real de pizzas, jugos naturales y preparación de pedidos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
          <button
            onClick={() => setSearchParams({ tab: 'pendientes' })}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab !== 'listas'
                ? 'bg-amber-500 text-black shadow-lg'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <IoFlame />
            <span>COMANDAS EN COCINA ({pendingOrders.length})</span>
          </button>

          <button
            onClick={() => setSearchParams({ tab: 'listas' })}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'listas'
                ? 'bg-emerald-500 text-black shadow-lg'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <IoCheckmarkCircle />
            <span>COMANDAS LISTAS ({readyOrders.length})</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <IoReaderOutline className="text-amber-600 text-xl" />
            <span>{activeTab === 'listas' ? 'COMANDAS LISTAS EN COCINA' : 'COMANDAS EN PREPARACIÓN'}</span>
          </h2>
          <span className="text-xs text-slate-500 font-bold">Total: {displayedOrders.length} en pantalla</span>
        </div>

        {displayedOrders.length === 0 ? (
          <div className="p-16 text-center rounded-3xl bg-slate-100 border border-slate-200 space-y-3">
            <IoCheckmarkDone className="text-5xl text-emerald-700 mx-auto" />
            <h3 className="text-lg font-black text-slate-900">
              {activeTab === 'listas' ? 'No hay comandas listas sin entregar en este momento.' : 'Cocina Despejada'}
            </h3>
            <p className="text-xs text-slate-500">
              {activeTab === 'listas'
                ? 'Las comandas marcadas como preparadas aparecerán aquí.'
                : 'Las nuevas comandas tomadas por el mesero aparecerán aquí en vivo.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedOrders.map((ord) => {
              const isPrepared = ord.status === 'preparada';
              const isOrderEdited = ord.isEdited || (ord as any).is_edited;
              const elapsedMins = getElapsedMinutes(ord.createdAt);

              return (
                <div
                  key={ord.id}
                  className={`p-6 rounded-3xl border backdrop-blur-xl shadow-2xl flex flex-col justify-between space-y-6 transition-all duration-300 ${
                    isOrderEdited
                      ? 'bg-gradient-to-br from-cyan-950 via-slate-50 to-blue-950 border-cyan-400 shadow-2xl shadow-cyan-500/40 ring-4 ring-cyan-400/80 animate-pulse'
                      : isPrepared
                      ? 'bg-gradient-to-br from-emerald-50 via-slate-50 to-emerald-950/40 border-emerald-300 shadow-emerald-950/60'
                      : 'bg-gradient-to-br from-white via-slate-50 to-slate-100 border-amber-200 shadow-amber-950/40'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-slate-900">{ord.orderNumber}</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 font-black uppercase text-amber-700 border border-amber-200">
                            {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : (ord.type || 'mesa').toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs text-emerald-700 font-bold mt-1.5 flex items-center gap-1.5 break-words">
                          <IoPersonOutline />
                          <span>👤 Cliente: {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Para Llevar' : 'Delivery')}</span>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1.5">
                        {isOrderEdited && (
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-cyan-400 text-black border border-cyan-200 shadow-xl shadow-cyan-500/50 animate-bounce flex items-center gap-1">
                            🚨 COMANDA CORREGIDA / EDITADA
                          </span>
                        )}
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                            isPrepared
                              ? 'bg-emerald-100 text-emerald-950 border-emerald-300 shadow-lg'
                              : 'bg-amber-100 text-amber-950 border-amber-300 shadow-lg animate-pulse'
                          }`}
                        >
                          {isPrepared ? <IoCheckmarkCircle /> : <IoTimeOutline />}
                          <span>{isPrepared ? '🔥 PREPARADA (LISTA)' : '⏳ EN COCINA'}</span>
                        </span>
                      </div>
                    </div>

                    {getCleanItemNote(ord.kitchenNotes) && (
                      <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-200 text-amber-200 text-xs font-bold space-y-0.5">
                        <div className="text-[9px] uppercase tracking-wider text-amber-600 font-black flex items-center gap-1">
                          <IoDocumentTextOutline /> 📝 NOTA GENERAL PARA COCINA:
                        </div>
                        <p className="break-words">{getCleanItemNote(ord.kitchenNotes)}</p>
                      </div>
                    )}

                    <div className="space-y-3 bg-white/60 p-4 rounded-2xl border border-slate-200">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1">
                        DETALLE DE PREPARACIÓN
                      </div>
                      {((ord.type === 'delivery' || ord.type === 'pickup')
                        ? [...(ord.items || [])]
                        : (ord.items || []).filter(isKitchenProduct)
                      )
                        .sort((a, b) => {
                          const aSalsa = isSalsaItem(a);
                          const bSalsa = isSalsaItem(b);
                          if (aSalsa && !bSalsa) return 1;
                          if (!aSalsa && bSalsa) return -1;
                          return 0;
                        })
                        .map((it) => (
                        <div
                          key={it.id}
                          className={`space-y-1.5 p-2.5 rounded-xl border transition-all ${
                            it.isNewOrModified
                              ? 'bg-blue-500/20 border-blue-500 text-blue-200 shadow-lg shadow-blue-950/50'
                              : 'bg-slate-100 border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 text-sm font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-700 border border-amber-200 flex items-center justify-center text-xs font-black shrink-0">
                                {it.quantity}x
                              </span>
                              <div className="break-words">
                                <span className="font-black text-slate-900">{it.productName}</span>
                                {it.size && <span className="ml-2 text-xs font-bold text-emerald-700">({it.size})</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                              {it.isTakeaway && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 border border-amber-200 text-[9px] font-black flex items-center gap-1">
                                  <IoBagOutline /> 📦 PARA LLEVAR
                                </span>
                              )}
                              {isSalsaItem(it) ? (
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black">
                                  🥣 SALSA
                                </span>
                              ) : (it.isCut || it.cutPreference === 'Picada') ? (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-300 text-[9px] font-black">
                                  🔪 PICADA
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 border border-slate-300 text-[9px] font-black">
                                  🌭 ENTERO
                                </span>
                              )}
                            </div>
                          </div>

                          {it.isHalfHalf && it.halfDetails && (
                            <div className="ml-8 text-xs font-black text-amber-700 bg-amber-500/20 px-2.5 py-1.5 rounded-lg border border-amber-200 space-y-1">
                              <div>🌓 PIZZA MITAD Y MITAD ({it.size}):</div>
                              <div className="text-slate-900 font-bold">
                                • 1ra Mitad: {it.halfDetails.half1Name}
                                {it.halfDetails.half1Removed && it.halfDetails.half1Removed.length > 0 && (
                                  <span className="text-red-600 font-extrabold ml-1.5">(🚫 SIN: {it.halfDetails.half1Removed.join(', ')})</span>
                                )}
                                {it.halfDetails.half1Extras && it.halfDetails.half1Extras.length > 0 && (
                                  <span className="text-emerald-700 font-extrabold ml-1.5">(➕ EXTRAS: {it.halfDetails.half1Extras.map((e) => e.name).join(', ')})</span>
                                )}
                              </div>
                              <div className="text-slate-900 font-bold">
                                • 2da Mitad: {it.halfDetails.half2Name}
                                {it.halfDetails.half2Removed && it.halfDetails.half2Removed.length > 0 && (
                                  <span className="text-red-600 font-extrabold ml-1.5">(🚫 SIN: {it.halfDetails.half2Removed.join(', ')})</span>
                                )}
                                {it.halfDetails.half2Extras && it.halfDetails.half2Extras.length > 0 && (
                                  <span className="text-emerald-700 font-extrabold ml-1.5">(➕ EXTRAS: {it.halfDetails.half2Extras.map((e) => e.name).join(', ')})</span>
                                )}
                              </div>
                            </div>
                          )}

                          {!it.isHalfHalf && it.proteins && it.proteins.length > 0 && !areProteinsDefault(it.productName, it.proteins) && (
                            <div className="ml-8 text-xs font-black text-amber-900 bg-amber-400/20 px-2 py-1 rounded-lg border border-yellow-400 flex items-center gap-1">
                              🥩 PROTEÍNA: {it.proteins.join(' + ')}
                            </div>
                          )}

                          {!it.isHalfHalf && it.removedIngredients && it.removedIngredients.length > 0 && (
                            <div className="ml-8 text-xs font-black text-red-600 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20 flex items-center gap-1">
                              <IoCloseCircleOutline /> 🚫 SIN: {formatRemovedIngredients(it.removedIngredients).join(', ')}
                            </div>
                          )}

                          {!it.isHalfHalf && it.extras && it.extras.length > 0 && (
                            <div className="ml-8 text-xs font-black text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                              <IoAddCircleOutline /> ➕ ADD: {it.extras.map((e) => e.name).join(', ')}
                            </div>
                          )}

                          {it.sugarPreference && (
                            <div className="ml-8 text-xs font-bold text-sky-700 bg-sky-500/10 px-2 py-1 rounded-lg border border-sky-500/20">
                              🥤 Preferencia: {it.sugarPreference}
                            </div>
                          )}

                          {it.flavor && (
                            <div className="ml-8 text-xs font-black text-amber-900 bg-amber-400/20 px-2 py-1 rounded-lg border border-yellow-400 flex items-center gap-1">
                              🍹 SABOR: {it.flavor}
                            </div>
                          )}

                          {getCleanItemNote(it.notes) && (
                            <div className="ml-8 text-xs font-bold text-amber-900 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                              📝 NOTA: {getCleanItemNote(it.notes)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <div className="flex items-center gap-1 font-bold text-slate-700">
                        <IoTimeOutline className="text-amber-600" />
                        <span>Enviada: {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      </div>

                      {!isPrepared && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 border border-amber-200 text-[11px] font-black flex items-center gap-1">
                          <IoTimerOutline /> ⏱️ {elapsedMins === 0 ? '< 1 min' : `${elapsedMins} min`} en horno
                        </span>
                      )}
                    </div>

                    {!isPrepared ? (
                      <button
                        onClick={() => handleMarkReady(ord.id)}
                        disabled={submittingOrderId === ord.id}
                        className={`w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/80 transition-all transform ${
                          submittingOrderId === ord.id ? 'opacity-50 pointer-events-none' : 'hover:scale-[1.02]'
                        }`}
                      >
                        <IoCheckmarkCircle className="text-xl" />
                        <span>{submittingOrderId === ord.id ? 'MARCANDO LISTA...' : 'MARCAR COMO LISTA'}</span>
                      </button>
                    ) : (
                      <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-200 text-emerald-800 font-black text-xs text-center flex items-center justify-center gap-2">
                        <IoCheckmarkCircle className="text-lg" />
                        <span>COMANDA LISTA (NOTIFICADO)</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

