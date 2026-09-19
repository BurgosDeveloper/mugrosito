import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoPersonOutline,
  IoKeyOutline,
  IoArrowForward,
  IoWarningOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const res = await login(username, password);
    if (!res.success) {
      setErrorMessage(res.error || 'Credenciales inválidas');
    } else {
      const role = res.user?.role;
      if (role === 'caja') {
        navigate('/caja');
      } else if (role === 'mesero') {
        navigate('/mesonero');
      } else if (role === 'cocina') {
        navigate('/cocina');
      } else if (role === 'admin') {
        navigate('/caja');
      } else {
        navigate('/caja');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 text-gray-900 relative overflow-hidden">
      {/* Background Yellow Glow Accent */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Flat White Card */}
      <div className="relative w-full max-w-md p-8 rounded-2xl bg-white border border-gray-200 shadow-xl space-y-6">
        
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white border-2 border-yellow-400 p-1 flex items-center justify-center shadow-md transform hover:scale-105 transition-all overflow-hidden">
            <img src="/logo_default.png" alt="Mugrosito" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png'; }} />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 border border-yellow-300 text-black text-[10px] font-black uppercase tracking-widest mb-2">
              <IoShieldCheckmarkOutline />
              <span>SISTEMA DE CONTROL MUGROSITO</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">MUGROSITO POS</h1>
            <p className="text-xs text-gray-500 mt-1">Ingresa tus credenciales para acceder al sistema.</p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold space-y-1">
            <div className="flex items-center gap-2">
              <IoWarningOutline className="text-base shrink-0" />
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 block">Usuario:</label>
            <div className="relative">
              <IoPersonOutline className="absolute left-3.5 top-3 text-yellow-600 text-base" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-xs outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-all font-bold"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 block">Contraseña:</label>
            <div className="relative">
              <IoKeyOutline className="absolute left-3.5 top-3 text-yellow-600 text-base" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-xs outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-all font-bold"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-sm border border-yellow-500 transition-all shadow-sm flex items-center justify-center gap-2 transform active:scale-[0.99] cursor-pointer"
          >
            <span>INGRESAR AL SISTEMA</span>
            <IoArrowForward className="text-base" />
          </button>
        </form>

      </div>
    </div>
  );
};
