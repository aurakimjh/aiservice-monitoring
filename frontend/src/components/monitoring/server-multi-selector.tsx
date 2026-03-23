'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ServerOption {
  id: string;
  label: string;
}

interface ServerMultiSelectorProps {
  servers: ServerOption[];
  selected: string[];
  serverColors: Record<string, string>;
  onChange: (selected: string[]) => void;
  maxSelect?: number;
  className?: string;
}

export function ServerMultiSelector({
  servers,
  selected,
  serverColors,
  onChange,
  maxSelect = 10,
  className,
}: ServerMultiSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = servers.filter((s) =>
    s.label.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (selected.length < maxSelect) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className={cn('relative', className)} ref={panelRef}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">서버:</span>

        {/* Selected server tags */}
        {selected.map((id) => {
          const srv = servers.find((s) => s.id === id);
          const color = serverColors[id] ?? '#8B949E';
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: `${color}22`,
                color,
                border: `1px solid ${color}55`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              {srv?.label ?? id}
              <button
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="hover:opacity-70 transition-opacity ml-0.5"
              >
                <X size={9} />
              </button>
            </span>
          );
        })}

        {/* Dropdown trigger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] transition-colors"
        >
          <Server size={11} />
          선택
          <ChevronDown
            size={10}
            className={cn('transition-transform duration-150', open && 'rotate-180')}
          />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-lg p-2">
          {/* Search */}
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <Search size={11} className="text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="서버 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 text-[11px] bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Server list */}
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtered.map((srv) => {
              const isSelected = selected.includes(srv.id);
              const color = serverColors[srv.id] ?? '#8B949E';
              return (
                <label
                  key={srv.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[11px] transition-colors',
                    isSelected
                      ? 'bg-[var(--accent-primary)]/10 text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(srv.id)}
                    className="w-3 h-3 shrink-0"
                  />
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {srv.label}
                </label>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)] px-2 py-2 text-center">
                일치하는 서버 없음
              </p>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-muted)]">
            <span className="text-[10px] text-[var(--text-muted)]">
              {selected.length}/{maxSelect} 선택
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => onChange(servers.slice(0, maxSelect).map((s) => s.id))}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] transition-colors"
              >
                전체
              </button>
              <button
                onClick={() => onChange([])}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] transition-colors"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
