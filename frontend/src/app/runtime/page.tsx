'use client';

import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui';
import { Blocks, ChevronRight } from 'lucide-react';

const RUNTIMES = [
  {
    name: 'Python',
    version: '3.11 – 3.13 (Free-Threaded)',
    href: '/runtime/python',
    color: '#3776AB',
    description: 'GIL 경합률, Free-Thread 활용률, asyncio Task 큐, GC Generation별 수집',
    features: ['GIL Contention', 'Free-Threaded Mode', 'asyncio Tasks', 'GC Profiling'],
  },
  {
    name: '.NET',
    version: '8.0 / 9.0 (Native AOT)',
    href: '/runtime/dotnet',
    color: '#512BD4',
    description: 'ThreadPool Starvation 감지, GC Suspension Time, AOT 제한사항 자동 감지',
    features: ['ThreadPool Starvation', 'GC Suspension', 'Native AOT', 'Trimming Warnings'],
  },
  {
    name: 'Go',
    version: '1.22 – 1.24',
    href: '/runtime/go',
    color: '#00ADD8',
    description: 'Scheduler Latency 히스토그램, GC STW Pause, Goroutine Scheduling Wait 분포',
    features: ['Scheduler Latency', 'GC STW Pause', 'Goroutine Profiling', 'CGo Calls'],
  },
];

export default function RuntimePage() {
  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Runtime Monitor', icon: <Blocks size={14} /> },
        ]}
      />

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Runtime Monitor</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          언어별 런타임 메트릭 모니터링 — GIL/Free-Thread, ThreadPool, Scheduler Latency
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {RUNTIMES.map((rt) => (
          <Link key={rt.href} href={rt.href}>
            <Card className="h-full hover:border-[var(--accent-primary)] transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-base font-semibold" style={{ color: rt.color }}>
                    {rt.name}
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{rt.version}</p>
                </div>
                <ChevronRight size={16} className="text-[var(--text-muted)] mt-1" />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{rt.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {rt.features.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ backgroundColor: rt.color + '18', color: rt.color }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
