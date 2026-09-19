import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoFastFood,
  IoSwapHorizontal,
  IoRestaurant,
  IoCard,
  IoFlame,
  IoMenu,
  IoLogOutOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';

interface NavbarProps {
  onOpenExchangeModal?: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenExchangeModal,
  onToggleMobileSidebar,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { exchangeRates, isConnected, syncError, userSession, logout } = useApp();

  const getActiveUserBadge = () => {
    if (userSession?.role === 'admin') {
      return { label: 'ADMINISTRADOR', icon: <IoShieldCheckmarkOutline className="text-yellow-600 text-sm" /> };
    }
    switch (location.pathname) {
      case '/mesonero':
        return { label: 'MESERO', icon: <IoRestaurant className="text-yellow-600 text-sm" /> };
      case '/caja':
        return { label: 'CAJA POS', icon: <IoCard className="text-yellow-600 text-sm" /> };
      case '/cocina':
        return { label: 'COCINA KDS', icon: <IoFlame className="text-amber-500 text-sm" /> };
      default:
        return { label: 'MUGROSITO', icon: <IoFastFood className="text-yellow-600 text-sm" /> };
    }
  };

  const activeBadge = getActiveUserBadge();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">
        
        {/* Left Section: Mobile Menu Toggle + Brand Logo */}
        <div className="flex items-center gap-2.5">
          {onToggleMobileSidebar && location.pathname !== '/' && userSession && (
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden p-1.5 rounded-lg bg-gray-100 text-gray-800 border border-gray-200 hover:bg-yellow-400 hover:text-black transition-all"
              title="Abrir menú"
            >
              <IoMenu className="text-lg" />
            </button>
          )}

          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-yellow-400 border border-yellow-500 p-0.5 flex items-center justify-center shadow-sm group-hover:scale-105 transition-all overflow-hidden">
              <img src="/logo_default.png" alt="Mugrosito" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png'; }} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight text-black group-hover:text-yellow-600 transition-colors">
                  MUGROSITO
                </span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-400 text-black border border-yellow-500 uppercase">
                  POS
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Current Active Role Badge */}
        {userSession && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200">
              {activeBadge.icon}
              <span className="text-xs font-black tracking-wide text-gray-900 uppercase">
                {activeBadge.label}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 border border-gray-200 text-[10px] text-gray-600">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="font-bold">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
        )}

        {/* Right Section: Multi-Currency Rates Quick Widget & Logout */}
        <div className="flex items-center gap-2">
          {onOpenExchangeModal && userSession && (
            <button
              onClick={onOpenExchangeModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-yellow-50 border border-gray-200 hover:border-yellow-400 text-xs font-bold text-gray-800 transition-all"
              title="Cambiar tasas de cambio COP / Bs."
            >
              <IoSwapHorizontal className="text-yellow-600 text-sm" />
              <div className="hidden sm:flex items-center gap-1.5 text-xs">
                <span>COP: <strong className="text-black">${exchangeRates.COP.toLocaleString()}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Bs: <strong className="text-black">{exchangeRates.Bs.toFixed(2)}</strong></span>
              </div>
            </button>
          )}

          {userSession && (
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-700 border border-red-500/30 text-xs transition-all"
              title="Cerrar Sesión"
            >
              <IoLogOutOutline className="text-lg" />
            </button>
          )}
        </div>

      </div>
      {syncError && (
        <div role="alert" className="border-t border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-black text-amber-950">
          {syncError}
        </div>
      )}
    </header>
  );
};
