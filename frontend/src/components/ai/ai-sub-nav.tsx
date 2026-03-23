'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Bot, FlaskConical, BookOpen, DollarSign, Cpu } from 'lucide-react';

const AI_TABS = [
  { label: 'AI Services', href: '/ai', icon: Bot },
  { label: 'Evaluation', href: '/ai/evaluation', icon: FlaskConical },
  { label: 'Prompt Hub', href: '/ai/prompts', icon: BookOpen },
  { label: 'Cost Optimization', href: '/ai/costs', icon: DollarSign },
  { label: 'GPU Cluster', href: '/ai/gpu', icon: Cpu },
];

export function AISubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-[var(--border-default)] mb-4 overflow-x-auto">
      {AI_TABS.map((tab) => {
        const isActive = tab.href === '/ai'
          ? pathname === '/ai'
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap',
              'border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-emphasis)]',
            )}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
