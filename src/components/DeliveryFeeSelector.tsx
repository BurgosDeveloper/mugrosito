import React from 'react';
import { IoBicycleOutline } from 'react-icons/io5';

interface DeliveryFeeSelectorProps {
  value?: number;
  valueUSD?: number;
  onChange: (fee: number) => void;
  exchangeRates?: { COP: number; Bs: number };
  label?: string;
  required?: boolean;
  className?: string;
  suggestedFees?: number[];
}

const DEFAULT_SUGGESTIONS = [2000, 3000, 4000, 5000];

export const DeliveryFeeSelector: React.FC<DeliveryFeeSelectorProps> = ({
  value,
  valueUSD,
  onChange,
  exchangeRates = { COP: 3100, Bs: 3.2 },
  label = 'Costo de Envío Delivery (COP):',
  required = true,
  className = '',
  suggestedFees = DEFAULT_SUGGESTIONS,
}) => {
  const copRate = exchangeRates?.COP || 3100;
  const bsRate = exchangeRates?.Bs || 3.2;
  const currentVal = value !== undefined 
    ? value 
    : (valueUSD !== undefined 
        ? (valueUSD >= 100 ? valueUSD : Math.round(valueUSD * copRate)) 
        : 0);

  // Estado local para permitir escritura fluida de números enteros en COP
  const [customText, setCustomText] = React.useState<string>(() =>
    currentVal > 0 ? String(currentVal) : ''
  );

  // Sincronizar si cambia externamente
  React.useEffect(() => {
    const parsed = parseFloat(customText.replace(',', '.'));
    if (isNaN(parsed) && currentVal === 0) return;
    if (parsed !== currentVal) {
      setCustomText(currentVal > 0 ? String(currentVal) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVal]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permitir dígitos
    if (!/^[\d]*$/.test(raw)) return;
    setCustomText(raw);

    if (raw === '') {
      onChange(0);
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val >= 0) {
      onChange(val);
    }
  };

  const handleSelectSuggested = (fee: number) => {
    setCustomText(String(fee));
    onChange(fee);
  };

  const equivUSD = copRate > 0 ? (currentVal / copRate).toFixed(2) : '0.00';
  const equivBs = bsRate > 0 ? (currentVal / bsRate).toFixed(2) : '0.00';

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header con monto y conversiones */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <IoBicycleOutline className="text-yellow-600 text-base shrink-0" />
          <span className="text-xs font-black uppercase text-gray-800 tracking-wide">
            {label}
          </span>
          {required && <span className="text-red-500 font-black text-xs">*</span>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 hidden sm:inline">
            ≈ ${equivUSD} USD | {equivBs} Bs
          </span>
          <span className="text-xs font-black text-black bg-yellow-400 px-2.5 py-1 rounded-xl border border-yellow-500 shadow-2xs">
            {currentVal.toLocaleString('es-CO')} COP
          </span>
        </div>
      </div>

      {/* Botones sugeridos + Input editable manual */}
      <div className="flex flex-wrap items-center gap-1.5">
        {suggestedFees.map((fee) => {
          const isSelected = currentVal === fee;
          return (
            <button
              key={fee}
              type="button"
              onClick={() => handleSelectSuggested(fee)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-yellow-400 border-yellow-500 text-black shadow-xs scale-[1.03]'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
              }`}
            >
              {fee.toLocaleString('es-CO')} COP
            </button>
          );
        })}

        {/* Input para monto manual personalizado */}
        <div className="relative flex items-center">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Otro COP..."
            value={customText}
            onChange={handleInputChange}
            className={`w-28 px-2.5 py-1 text-xs font-black rounded-xl border outline-none transition-all ${
              currentVal > 0 && !suggestedFees.includes(currentVal)
                ? 'bg-yellow-100/60 border-yellow-500 text-black font-black ring-1 ring-yellow-400'
                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400'
            }`}
            title="Ingrese un monto manual personalizado en Pesos COP a preferencia del usuario"
          />
        </div>
      </div>
    </div>
  );
};
