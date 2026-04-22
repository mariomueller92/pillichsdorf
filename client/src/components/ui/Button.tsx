import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-light active:bg-blue-900',
  success: 'bg-success text-white hover:bg-success-light active:bg-green-800',
  danger: 'bg-danger text-white hover:bg-danger-light active:bg-red-800',
  warning: 'bg-warning text-white hover:bg-warning-light active:bg-amber-800',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-200 active:bg-slate-300',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm min-h-9',
  md: 'px-4 py-2.5 text-base min-h-12',
  lg: 'px-6 py-3.5 text-lg min-h-14',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
