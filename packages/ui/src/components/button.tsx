import * as React from 'react';
import { cn } from '../lib/utils.js';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50',
          variant === 'primary' && 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
          variant === 'secondary' && 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-500',
          variant === 'ghost' && 'bg-transparent text-slate-700 hover:bg-slate-100',
          variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
          size === 'sm' && 'h-8 px-3 text-sm',
          size === 'md' && 'h-10 px-4 text-sm',
          size === 'lg' && 'h-12 px-6 text-base',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
