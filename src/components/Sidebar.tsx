import React, { useState } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoRestaurant,
  IoFlame,
  IoCard,
  IoSwapHorizontal,
  IoGridOutline,
  IoReaderOutline,
  IoClose,
  IoFastFood,
  IoCashOutline,
  IoLogOutOutline,
  IoLayersOutline,
  IoCheckmarkCircle,
  IoChevronBack,
  IoChevronForward,
  IoTimeOutline,
  IoBarChartOutline,
} from 'react-icons/io5';

interface SidebarProps {
  onOpenExchangeModal?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenExchangeModal,
  isMobileOpen,
  onCloseMobile,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'default';

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mugrosito_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mugrosito_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const { orders, exchangeRates, isConnected, userSession, logout } = useApp();

  const pendingKdsCount = orders.filter((o) => o.status === 'en_preparacion').length;
  const readyKdsCount = orders.filter((o) => o.status === 'preparada').length;
  const unpaidCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;

  const setSubTab = (tabName: string) => {
    setSearchParams({ tab: tabName });
    if (onCloseMobile) onCloseMobile();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    if (onCloseMobile) onCloseMobile();
  };

  const roleLabel = userSession?.role ? userSession.role.toUpperCase() : 'INVITADO';
  const isAdmin = userSession?.role === 'admin';

  // Render sub-navigation options
  const renderRoleSidebarContent = () => {
    switch (location.pathname) {
      case '/mesonero':
        return (
          <div className="space-y-3">
            {!isCollapsed && (
              <div className="flex items-center gap-2 px-2 text-gray-800 font-black text-xs uppercase tracking-wider">
                <IoRestaurant className="text-yellow-600 text-base" /> MESERO
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setSubTab('pedidos')}
                title="Tomar Pedidos (Mesas, Delivery y PickUp)"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'pedidos' || activeTab === 'default'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoGridOutline className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Pedidos</div>
                      <div className="text-[10px] text-gray-500 font-normal">Mesas, Delivery y PickUp</div>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setSubTab('comandas')}
                title="Mis Comandas (Estado en cocina)"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'comandas'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoReaderOutline className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Mis Comandas</div>
                      <div className="text-[10px] text-gray-500 font-normal">Estado de pedidos enviados</div>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        );

      case '/caja':
        return (
          <div className="space-y-3">
            {!isCollapsed && (
              <div className="flex items-center gap-2 px-2 text-gray-800 font-black text-xs uppercase tracking-wider">
                <IoCard className="text-yellow-600 text-base" /> CAJA POS
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setSubTab('comandas')}
                title="Comandas Activas (Cobranza y Entrega)"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3 relative' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'comandas' || activeTab === 'default'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoCard className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Comandas</div>
                      <div className="text-[10px] text-gray-500 font-normal">Cobro y entrega a clientes</div>
                    </div>
                  )}
                </div>
                {unpaidCount > 0 && (
                  <span
                    className={`${
                      isCollapsed
                        ? 'absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px]'
                        : 'px-2 py-0.5 text-xs'
                    } bg-yellow-400 text-black border border-yellow-500 rounded-full font-black shadow-sm`}
                  >
                    {unpaidCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setSubTab('cajachica')}
                title="Caja Chica (Apertura y Arqueo)"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'cajachica'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoCashOutline className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Caja Chica</div>
                      <div className="text-[10px] text-gray-500 font-normal">Apertura USD/COP & Arqueo</div>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setSubTab('historico')}
                title="Histórico de Cobros"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'historico'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoTimeOutline className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Histórico</div>
                      <div className="text-[10px] text-gray-500 font-normal">Cobros y entregas del día</div>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setSubTab('reportes')}
                title="Reportes & Cierre de Turno"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'reportes'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoBarChartOutline className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Reportes & Cierre</div>
                      <div className="text-[10px] text-gray-500 font-normal">Cierre de caja y estadísticas</div>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        );

      case '/cocina':
        return (
          <div className="space-y-3">
            {!isCollapsed && (
              <div className="flex items-center gap-2 px-2 text-slate-700 font-black text-xs uppercase tracking-wider">
                <IoFlame className="text-amber-600 text-base" /> COCINA KDS
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setSubTab('pendientes')}
                title="Comandas en Cocina (Pendientes)"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3 relative' : 'justify-between p-3.5'
                } rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab !== 'listas'
                    ? 'bg-white border-amber-400 shadow-md text-amber-950 font-black scale-[1.02]'
                    : 'bg-slate-100/80 border-slate-200 text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoFlame className="text-amber-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">En Cocina</div>
                      <div className="text-[10px] text-slate-500 font-normal">Pendientes en preparación</div>
                    </div>
                  )}
                </div>
                {pendingKdsCount > 0 && (
                  <span
                    className={`${
                      isCollapsed
                        ? 'absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px]'
                        : 'px-2.5 py-0.5 text-xs'
                    } bg-amber-500 text-black border border-amber-300 rounded-full font-black animate-pulse`}
                  >
                    {pendingKdsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setSubTab('listas')}
                title="Comandas Listas (Finalizadas)"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3 relative' : 'justify-between p-3.5'
                } rounded-xl border transition-all duration-200 ${
                  activeTab === 'listas'
                    ? 'bg-yellow-400/15 border-yellow-400 shadow-sm text-black font-black scale-[1.01]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoCheckmarkCircle className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Listas</div>
                      <div className="text-[10px] text-gray-500 font-normal">Preparadas y listas</div>
                    </div>
                  )}
                </div>
                {readyKdsCount > 0 && (
                  <span
                    className={`${
                      isCollapsed
                        ? 'absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px]'
                        : 'px-2 py-0.5 text-xs'
                    } bg-yellow-400 text-black border border-yellow-500 rounded-full font-black`}
                  >
                    {readyKdsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        );

      case '/menu-admin':
        return (
          <div className="space-y-3">
            {!isCollapsed && (
              <div className="flex items-center gap-2 px-2 text-gray-800 font-black text-xs uppercase tracking-wider">
                <IoLayersOutline className="text-yellow-600 text-base" /> MENÚ ADMIN
              </div>
            )}
            <div className="space-y-2">
              <button
                title="Gestión del Menú"
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between p-3.5'
                } rounded-xl bg-white border border-yellow-400 text-gray-900 font-black shadow-sm`}
              >
                <div className="flex items-center gap-3">
                  <IoFastFood className="text-yellow-600 text-xl shrink-0" />
                  {!isCollapsed && (
                    <div className="text-left">
                      <div className="text-sm font-black">Gestión Menú</div>
                      <div className="text-[10px] text-gray-500 font-normal">Hot Dogs, Bebidas y Precios</div>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 p-3 sm:p-4 text-gray-900 overflow-y-auto">
      {/* Top Header & Collapse Toggle Button */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-400 border border-yellow-500 p-0.5 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
            <img src="/logo_default.png" alt="Mugrosito" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png'; }} />
          </div>
          {!isCollapsed && (
            <span className="font-black text-sm tracking-wider text-black">
              MUGROSITO POS
            </span>
          )}
        </div>

        {/* Mobile close button */}
        <div className="md:hidden">
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg bg-gray-100 border border-gray-200 text-gray-700"
            >
              <IoClose size={20} />
            </button>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          onClick={toggleCollapse}
          className="hidden md:flex items-center justify-center p-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm transition-all"
          title={isCollapsed ? 'Expandir menú lateral' : 'Colapsar menú (solo iconos)'}
        >
          {isCollapsed ? <IoChevronForward size={16} /> : <IoChevronBack size={16} />}
        </button>
      </div>

      {/* Connection & Active Role Status */}
      {!isCollapsed ? (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 mb-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            <div>
              <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">ESTADO</div>
              <div className="text-xs font-black text-black">En línea ({roleLabel})</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center mb-3" title={`En línea (${roleLabel})`}>
          <div className="p-2 rounded-lg bg-gray-100 border border-gray-200">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
          </div>
        </div>
      )}

      {/* Quick Access Menu Switcher (Visible for Admin only) */}
      {isAdmin && (
        <div className={`mb-4 p-2 rounded-xl bg-gray-50 border border-gray-200 ${isCollapsed ? 'space-y-1.5' : 'space-y-2'}`}>
          {!isCollapsed && (
            <div className="text-[9px] font-black text-gray-700 uppercase tracking-widest px-1">
              PANEL ADMIN
            </div>
          )}
          <div className={`grid ${isCollapsed ? 'grid-cols-1 gap-1.5' : 'grid-cols-2 gap-1.5'}`}>
            <button
              onClick={() => { navigate('/mesonero'); if (onCloseMobile) onCloseMobile(); }}
              title="Mesero - Tomar Pedidos"
              className={`p-2 rounded-lg text-xs font-black transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-1.5'} ${
                location.pathname === '/mesonero'
                  ? 'bg-yellow-400 text-black border border-yellow-500 shadow-sm'
                  : 'bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200'
              }`}
            >
              <span>🍽️</span>
              {!isCollapsed && <span>Mesero</span>}
            </button>
            <button
              onClick={() => { navigate('/caja'); if (onCloseMobile) onCloseMobile(); }}
              title="Caja POS - Cobranza"
              className={`p-2 rounded-lg text-xs font-black transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-1.5'} ${
                location.pathname === '/caja'
                  ? 'bg-yellow-400 text-black border border-yellow-500 shadow-sm'
                  : 'bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200'
              }`}
            >
              <span>💳</span>
              {!isCollapsed && <span>Caja POS</span>}
            </button>
            <button
              onClick={() => { navigate('/cocina'); if (onCloseMobile) onCloseMobile(); }}
              title="Cocina KDS"
              className={`p-2 rounded-lg text-xs font-black transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-1.5'} ${
                location.pathname === '/cocina'
                  ? 'bg-amber-400 text-black border border-amber-500 shadow-sm'
                  : 'bg-white hover:bg-amber-50 text-gray-800 border border-gray-200'
              }`}
            >
              <span>🔥</span>
              {!isCollapsed && <span>Cocina</span>}
            </button>
            <button
              onClick={() => { navigate('/menu-admin'); if (onCloseMobile) onCloseMobile(); }}
              title="Menú y Configuración Admin"
              className={`p-2 rounded-lg text-xs font-black transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-1.5'} ${
                location.pathname === '/menu-admin'
                  ? 'bg-yellow-400 text-black border border-yellow-500 shadow-sm'
                  : 'bg-white hover:bg-yellow-50 text-gray-800 border border-gray-200'
              }`}
            >
              <span>🌭</span>
              {!isCollapsed && <span>Menú</span>}
            </button>
          </div>
        </div>
      )}

      {/* Sub-navigation Menu per Role */}
      <div className="flex-1 space-y-4">
        {renderRoleSidebarContent()}
      </div>

      {/* Exchange Rates & Logout Footer */}
      <div className="mt-auto pt-3 space-y-2.5 border-t border-gray-200">
        {!isCollapsed ? (
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-black">
                <IoSwapHorizontal className="text-yellow-600" />
                <span>TASAS DE CAMBIO</span>
              </div>
              {onOpenExchangeModal && (
                <button
                  onClick={onOpenExchangeModal}
                  className="text-[10px] bg-yellow-400 text-black border border-yellow-500 px-2 py-0.5 rounded font-black hover:bg-yellow-500"
                >
                  EDITAR
                </button>
              )}
            </div>
            <div className="text-xs text-gray-800 space-y-0.5">
              <div className="flex justify-between font-bold">
                <span className="text-gray-500">COP:</span>
                <span className="text-black font-extrabold">${exchangeRates.COP.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-gray-500">Bs:</span>
                <span className="text-black font-extrabold">{exchangeRates.Bs.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={onOpenExchangeModal}
            className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-center cursor-pointer hover:bg-yellow-50 transition-all"
            title={`Tasas del Día: 1 USD = ${exchangeRates.COP} COP | ${exchangeRates.Bs} Bs`}
          >
            <IoSwapHorizontal className="text-yellow-600 text-lg mx-auto" />
            <span className="text-[9px] font-black text-gray-700 block mt-0.5">TASAS</span>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          title={`Cerrar Sesión (${userSession?.username})`}
          className={`w-full p-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-black text-xs flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-center gap-2'
          } transition-all shadow-sm`}
        >
          <IoLogOutOutline className="text-lg shrink-0" />
          {!isCollapsed && <span>CERRAR SESIÓN ({userSession?.username})</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden md:block transition-all duration-300 h-[calc(100vh-64px)] sticky top-16 z-30 ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        {sidebarContent}
      </aside>

      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-80 max-w-[85vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
