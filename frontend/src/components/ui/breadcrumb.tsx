'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
            )}
            {isLast || !item.href ? (
              <span
                className={cn(
                  'flex items-center gap-1.5',
                  isLast
                    ? 'text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-muted)]',
                )}
              >
                {item.icon}
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
