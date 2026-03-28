'use client';

import Link from 'next/link';
import { SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
      <SearchX size={48} className="text-[var(--text-muted)]" />
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">404 — Page Not Found</h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
