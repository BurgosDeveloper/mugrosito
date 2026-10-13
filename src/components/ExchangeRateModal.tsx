import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { IoClose, IoSwapHorizontal, IoCheckmark } from 'react-icons/io5';

interface ExchangeRateModalProps {
  onClose: () => void;
}

export const ExchangeRateModal: React.FC<ExchangeRateModalProps> = ({ onClose }) => {
  const { exchangeRates, updateExchangeRates } = useApp();
  const [copRate, setCopRate] = useState<number>(exchangeRates.COP);
  const [bsRate, setBsRate] = useState<number>(exchangeRates.Bs);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleSave = async () => {
    if (!copRate || copRate <= 0 || !bsRate || bsRate <= 0) {
      setErrorMsg('Las tasas COP y Bs deben ser números mayores a cero.');
      return;
    }
    setIsSaving(true);
    setErrorMsg('');
    try {
      await updateExchangeRates({
        COP: copRate,
        Bs: bsRate,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar las tasas de cambio.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl border border-gray-200 flex flex-col">
        
        {/* Header */}
        <div className="bg-gray-50 px-5 py-4 text-gray-900 flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center text-black">
              <IoSwapHorizontal className="text-lg" />
            </div>
            <div>
              <h3 className="font-black text-sm text-gray-900">Tasas de Cambio</h3>
              <p className="text-[10px] text-gray-500">Actualización en tiempo real</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
            <IoClose className="text-xl" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4 text-gray-900">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-700">
                💵 TASA DÓLAR: 1 USD = X COP
              </label>
              <span className="text-[10px] font-bold text-gray-400">COP por $1</span>
            </div>
            <input
              type="number"
              value={copRate}
              onChange={(e) => setCopRate(parseFloat(e.target.value) || 0)}
              placeholder="Ej: 3100"
              className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-700">
                🇻🇪 TASA BOLÍVAR: 1 BS = X COP
              </label>
              <span className="text-[10px] font-bold text-gray-400">COP por 1 Bs</span>
            </div>
            <input
              type="number"
              step="0.01"
              value={bsRate}
              onChange={(e) => setBsRate(parseFloat(e.target.value) || 0)}
              placeholder="Ej: 3.20"
              className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
            />
          </div>

          {/* Caja explicativa de conversión */}
          <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-200 text-xs space-y-1">
            <span className="font-black text-yellow-950 block">📌 Ejemplo en vivo (Cuenta de 31.000 COP):</span>
            <div className="flex items-center justify-between font-bold text-gray-700 text-[11px]">
              <span>💵 En Dólares:</span>
              <span className="font-black text-black">
                ${copRate > 0 ? (31000 / copRate).toFixed(2) : '0.00'} USD
              </span>
            </div>
            <div className="flex items-center justify-between font-bold text-gray-700 text-[11px]">
              <span>🇻🇪 En Bolívares:</span>
              <span className="font-black text-black">
                {bsRate > 0 ? (31000 / bsRate).toFixed(2) : '0.00'} Bs
              </span>
            </div>
          </div>
          {/* Mensaje de error si ocurre */}
          {errorMsg && (
            <div className="p-2.5 bg-red-100 border border-red-300 rounded-xl text-red-800 text-xs font-bold">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-xs font-bold text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black border border-yellow-500 font-black px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
          >
            <IoCheckmark className="text-base" /> {isSaving ? 'Guardando...' : 'Guardar Tasas'}
          </button>
        </div>

      </div>
    </div>
  );
};
