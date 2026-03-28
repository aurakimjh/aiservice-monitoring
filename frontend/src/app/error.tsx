'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AITOP Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
      <AlertTriangle size={48} className="text-[var(--status-critical)]" />
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Something went wrong</h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-md">
        An unexpected error occurred. This has been logged for investigation.
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--text-muted)] font-mono">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity"
      >
        <RotateCcw size={14} />
        Try Again
      </button>
    </div>
  );
}
