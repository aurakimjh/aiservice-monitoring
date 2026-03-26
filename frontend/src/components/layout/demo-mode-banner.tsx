'use client';

import { useUIStore } from '@/stores/ui-store';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// DemoModeBanner — Demo Mode일 때 상단에 노란 배너 표시
//
// Auto 모드에서 demo 데이터가 사용되고 있을 때도 표시.
// 닫기 버튼으로 숨길 수 있으나 상태바에는 계속 표시.
// ═══════════════════════════════════════════════════════════════

export function DemoModeBanner() {
  const mode = useUIStore((s) => s.dataSourceMode);
  const dismissed = useUIStore((s) => s.demoBannerDismissed);
  const dismiss = useUIStore((s) => s.dismissDemoBanner);

  // Live 모드에서는 표시하지 않음
  if (mode === 'live') return null;
  // 닫은 상태
  if (dismissed) return null;

  return (
    <div className="fixed top-[var(--topbar-height)] left-0 right-0 z-50 bg-[#D29922]/15 border-b border-[#D29922]/30 px-4 py-1.5 flex items-center justify-between text-[12px]">
      <div className="flex items-center gap-2 text-[#D29922]">
        <AlertTriangle size={14} />
        <span>
          <strong>{mode === 'demo' ? 'Demo Mode' : 'Auto Mode'}</strong>
          {' '}— {mode === 'demo'
            ? '표시된 데이터는 샘플입니다. 실데이터를 보려면 Agent를 설치하세요.'
            : 'API 연결이 안 된 항목은 샘플 데이터로 표시됩니다.'}
        </span>
        <a
          href="https://github.com/aurakimjh/aiservice-monitoring/blob/master/DOCS/manual/INSTALLATION_GUIDE.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline hover:text-[#E5AC30]"
        >
          Agent 설치 가이드 <ExternalLink size={10} />
        </a>
      </div>
      <button
        onClick={dismiss}
        className="p-0.5 rounded hover:bg-[#D29922]/20 text-[#D29922]"
        aria-label="Close demo mode banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}
