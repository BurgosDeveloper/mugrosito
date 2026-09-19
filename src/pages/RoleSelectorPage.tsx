import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoArrowForward,
  IoRestaurant,
  IoFlame,
  IoCard,
  IoWifi,
} from 'react-icons/io5';

export const RoleSelectorPage: React.FC = () => {
  const navigate = useNavigate();
  const { orders, isConnected } = useApp();

  const pendingKdsCount = orders.filter((o) => o.status === 'en_preparacion').length;
  const unpaidCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;

  const roleCards = [
    {
      path: '/mesonero',
      title: 'Módulo Mesero',
      badgeTitle: 'Toma de Comandas',
      subtitle: 'Tarjetas táctiles de Mesas, Delivery y PickUp. Menú modal de hot dogs, bebidas y adicionales.',
      icon: <IoRestaurant className="text-4xl text-yellow-600" />,
      highlights: [
        'Selección directa de Mesa, Delivery o PickUp',
        'Configurador táctil de hot dogs con toppings',
        'Sincronización WebSocket en tiempo real',
      ],
    },
    {
      path: '/caja',
      title: 'Módulo Caja POS',
      badgeTitle: 'Facturación & Cobro',
      subtitle: 'Comandas con estados duales (Cocina y Cobro), caja chica contable y desglose multimoneda.',
      icon: <IoCard className="text-4xl text-yellow-600" />,
      badgeCount: unpaidCount,
      highlights: [
        'Cobro multimoneda: USD, COP, Bs, Binance',
        'Cálculo de vueltos exactos en las 3 monedas',
        'Impresión térmica de recibos y auditoría',
      ],
    },
    {
      path: '/cocina',
      title: 'Módulo Cocina KDS',
      badgeTitle: 'Kitchen Display',
      subtitle: 'Monitor visual de comandas de hot dogs sin cortes de texto, temporizador y alertas sonoras.',
      icon: <IoFlame className="text-4xl text-yellow-600" />,
      badgeCount: pendingKdsCount,
      highlights: [
        'Alertas de sonido por nuevas comandas',
        'Detalle de ingredientes y adicionales',
        'Notificación instantánea a Mesero y Caja al estar lista',
      ],
    },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-4 sm:p-8 bg-gray-50 text-gray-900">
      {/* Title, Logo & Connection Status */}
      <div className="text-center max-w-2xl mb-10 space-y-3">
        <div className="flex justify-center mb-1">
          <div className="w-24 h-24 rounded-3xl bg-white border-2 border-yellow-400 p-2 flex items-center justify-center shadow-lg transform hover:scale-105 transition-all overflow-hidden">
            <img
              src="/logo_default.png"
              alt="Mugrosito"
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png'; }}
            />
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/20 border border-yellow-500/40 text-black text-xs font-black uppercase tracking-widest shadow-xs">
          <span>MUGROSITO REALTIME POS</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-gray-900">
          Selecciona tu Módulo
        </h1>

        <p className="text-sm text-gray-600">
          Sistema 100% en tiempo real para Mesero, Caja POS y Cocina KDS en red local LAN.
        </p>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white border border-gray-200 text-xs text-gray-700 shadow-xs">
          <IoWifi className={isConnected ? 'text-green-600 animate-pulse' : 'text-amber-500'} />
          <span className="font-bold">{isConnected ? 'Servidor WebSocket Activo (LAN)' : 'Esperando Servidor Backend...'}</span>
        </div>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
        {roleCards.map((card) => (
          <div
            key={card.path}
            onClick={() => navigate(card.path)}
            className="group relative flex flex-col justify-between p-6 rounded-3xl bg-white border-2 border-gray-200 hover:border-yellow-400 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1.5 cursor-pointer"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-yellow-50 border border-yellow-200 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  {card.icon}
                </div>
                {card.badgeCount !== undefined && card.badgeCount > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-yellow-400 text-black border border-yellow-500 shadow-md animate-bounce">
                    {card.badgeCount} ACTIVAS
                  </span>
                )}
              </div>

              <span className="text-[10px] font-black text-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-yellow-100 border border-yellow-300">
                {card.badgeTitle}
              </span>

              <h2 className="text-2xl font-black text-gray-900 mt-2 group-hover:text-yellow-600 transition-colors">
                {card.title}
              </h2>

              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                {card.subtitle}
              </p>

              {/* Highlights */}
              <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                {card.highlights.map((h, i) => (
                  <li key={i} className="text-[11px] text-gray-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between font-bold text-xs text-yellow-700 group-hover:text-yellow-800">
              <span>INGRESAR AL MÓDULO</span>
              <IoArrowForward className="text-base group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
