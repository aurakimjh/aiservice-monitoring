'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-button)] text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]',
  secondary:
    'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] border border-[var(--border-default)]',
  ghost:
    'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
  danger:
    'bg-[var(--status-critical)] text-white hover:brightness-110 active:brightness-90',
  outline:
    'border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-[var(--radius-md)]',
  lg: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  icon: 'h-8 w-8 rounded-[var(--radius-md)] flex items-center justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'transition-all duration-[var(--transition-fast)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          'cursor-pointer select-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
