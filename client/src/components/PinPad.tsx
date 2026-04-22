import { useState } from 'react';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  loading?: boolean;
  error?: string;
}

export function PinPad({ onSubmit, loading, error }: PinPadProps) {
  const [pin, setPin] = useState('');

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      onSubmit(newPin);
      setTimeout(() => setPin(''), 500);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const dots = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full border-2 transition-colors ${
        i < pin.length ? 'bg-primary border-primary' : 'border-slate-300'
      }`}
    />
  ));

  const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3">{dots}</div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-64">
        {buttons.map((btn, i) =>
          btn === '' ? (
            <div key={i} />
          ) : (
            <button
              key={btn}
              onClick={() => btn === 'DEL' ? handleDelete() : handleDigit(btn)}
              disabled={loading}
              className="h-16 w-full rounded-xl bg-white border border-slate-200 text-xl font-semibold
                hover:bg-slate-50 active:bg-slate-200 active:scale-95 transition-all
                disabled:opacity-50 shadow-sm"
            >
              {btn}
            </button>
          )
        )}
      </div>
    </div>
  );
}
