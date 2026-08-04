import { useState } from 'react';
import { Check } from 'lucide-react';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  loading?: boolean;
  error?: string;
}

const MAX_LENGTH = 8;
const MIN_LENGTH = 4;

export function PinPad({ onSubmit, loading, error }: PinPadProps) {
  const [pin, setPin] = useState('');

  const handleDigit = (digit: string) => {
    if (pin.length >= MAX_LENGTH) return;
    setPin(pin + digit);
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const canSubmit = pin.length >= MIN_LENGTH && !loading;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onSubmit(pin);
    setTimeout(() => setPin(''), 500);
  };

  const dots = Array.from({ length: Math.max(pin.length, MIN_LENGTH) }, (_, i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full border-2 transition-colors ${
        i < pin.length ? 'bg-primary border-primary' : 'border-slate-300'
      }`}
    />
  ));

  const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'OK'];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3 flex-wrap justify-center max-w-64">{dots}</div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-64">
        {buttons.map((btn, i) => {
          if (btn === 'DEL') {
            return (
              <button
                key={i}
                onClick={handleDelete}
                disabled={loading}
                className="h-16 w-full rounded-xl bg-white border border-slate-200 text-sm font-semibold
                  hover:bg-slate-50 active:bg-slate-200 active:scale-95 transition-all
                  disabled:opacity-50 shadow-sm"
              >
                Löschen
              </button>
            );
          }
          if (btn === 'OK') {
            return (
              <button
                key={i}
                onClick={handleConfirm}
                disabled={!canSubmit}
                className="h-16 w-full rounded-xl bg-primary text-white flex items-center justify-center
                  hover:bg-primary/90 active:scale-95 transition-all
                  disabled:opacity-40 shadow-sm"
              >
                <Check size={22} />
              </button>
            );
          }
          return (
            <button
              key={btn}
              onClick={() => handleDigit(btn)}
              disabled={loading}
              className="h-16 w-full rounded-xl bg-white border border-slate-200 text-xl font-semibold
                hover:bg-slate-50 active:bg-slate-200 active:scale-95 transition-all
                disabled:opacity-50 shadow-sm"
            >
              {btn}
            </button>
          );
        })}
      </div>
    </div>
  );
}
