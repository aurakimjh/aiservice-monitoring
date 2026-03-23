'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'h-8 w-full rounded-[var(--radius-md)]',
            'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
            'text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
            'focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
            'transition-colors',
            icon ? 'pl-8 pr-3' : 'px-3',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
Input.displayName = 'Input';

export function SearchInput({ className, ...props }: Omit<InputProps, 'icon'>) {
  return (
    <Input
      icon={<Search size={14} />}
      placeholder="Search..."
      className={className}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { label: string; value: string }[];
}

export function Select({ options, className, 'aria-label': ariaLabel, ...props }: SelectProps) {
  return (
    <select
      aria-label={ariaLabel ?? 'Select option'}
      className={cn(
        'h-8 rounded-[var(--radius-md)]',
        'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
        'text-[13px] text-[var(--text-primary)]',
        'focus:outline-none focus:border-[var(--accent-primary)]',
        'px-2.5 pr-7 cursor-pointer appearance-none',
        'bg-[length:12px] bg-[center_right_8px] bg-no-repeat',
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B949E' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
      }}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
