'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, DataSourceBadge } from '@/components/ui';
import { Badge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { useCopilotStore } from '@/stores/copilot-store';
import { getCopilotSuggestions } from '@/lib/demo-data';
import {
  MessageSquareText,
  Send,
  Bot,
  User,
  ChevronRight,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import type { CopilotMessage, Severity } from '@/types/monitoring';

// ── Demo data for context panel ──────────────────────────────────────────

const DEMO_ALERTS: { id: string; title: string; severity: Severity; time: string }[] = [
  { id: 'a1', title: 'rag-service error rate > 1.0%', severity: 'critical', time: '15m ago' },
  { id: 'a2', title: 'GPU-2 VRAM usage > 90%', severity: 'warning', time: '32m ago' },
  { id: 'a3', title: 'api-gateway P95 latency > 300ms', severity: 'warning', time: '1h ago' },
];

const DEMO_SERVICES: { name: string; status: 'healthy' | 'warning' | 'critical' }[] = [
  { name: 'api-gateway', status: 'healthy' },
  { name: 'auth-service', status: 'healthy' },
  { name: 'rag-service', status: 'warning' },
  { name: 'embedding-svc', status: 'healthy' },
  { name: 'guardrail', status: 'healthy' },
  { name: 'Qdrant', status: 'healthy' },
];

// ── Message bubble component ─────────────────────────────────────────────

function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div className={cn('flex gap-2 mb-4', isUser ? 'justify-end' : 'justify-start')}>
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--accent-primary)] flex items-center justify-center mt-0.5">
          <Bot size={14} className="text-white" />
        </div>
      )}

      <div className={cn('max-w-[80%] space-y-2', isUser ? 'items-end' : 'items-start')}>
        {/* Text content */}
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
            isUser
              ? 'bg-[var(--accent-primary)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
          )}
        >
          {message.content}
        </div>

        {/* PromQL block */}
        {message.promql && (
          <div className="relative bg-black/30 rounded p-2 font-mono text-xs text-[var(--text-secondary)]">
            <button
              onClick={() => handleCopy(message.promql!)}
              className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-white/10 transition-colors"
              title="Copy PromQL"
            >
              <Copy size={12} className={copied ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]'} />
            </button>
            <code className="block pr-6 break-all">{message.promql}</code>
          </div>
        )}

        {/* Chart */}
        {message.chartData && message.chartData.length > 0 && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-2">
            <TimeSeriesChart
              series={message.chartData.map((cd) => ({
                name: cd.label,
                data: cd.data,
              }))}
              height={200}
            />
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] flex items-center justify-center mt-0.5">
          <User size={14} className="text-[var(--text-secondary)]" />
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function CopilotPage() {
  const { messages, isProcessing, sendMessage, clearMessages } = useCopilotStore();
  const demoSuggestions = useCallback(() => getCopilotSuggestions(), []);
  const { data: suggestionsData, source } = useDataSource('/copilot/suggestions', demoSuggestions, { refreshInterval: 30_000 });
  const suggestions = suggestionsData ?? [];
  const [inputText, setInputText] = useState('');
  const [contextOpen, setContextOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || isProcessing) return;
    sendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputText, isProcessing, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      if (!isProcessing) {
        sendMessage(text);
      }
    },
    [isProcessing, sendMessage],
  );

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Copilot', icon: <MessageSquareText size={14} /> },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">AI Copilot</h1>
            <DataSourceBadge source={source} />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Ask about metrics, alerts, and service analysis in natural language
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors px-2 py-1 rounded hover:bg-[var(--bg-tertiary)]"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Main layout: chat + context panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── Chat area (left) ── */}
        <div className={cn('flex flex-col min-h-0', contextOpen ? 'w-3/4' : 'flex-1')}>
          <Card padding="none" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Suggestion chips — shown when no messages */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <Bot size={24} />
                    <span className="text-sm">What would you like to know?</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSuggestionClick(s.text)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-colors',
                          'border-[var(--border-default)] text-[var(--text-secondary)]',
                          'hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]',
                          'hover:bg-[var(--accent-primary)]/5',
                        )}
                      >
                        {s.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message list */}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex gap-2 mb-4 justify-start">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--accent-primary)] flex items-center justify-center mt-0.5">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="bg-[var(--bg-tertiary)] rounded-lg px-3 py-2 text-sm text-[var(--text-muted)]">
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">.</span>
                      <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                      <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-[var(--border-default)] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about TTFT, GPU, errors, costs..."
                  disabled={isProcessing}
                  rows={1}
                  className={cn(
                    'flex-1 resize-none bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg px-3 py-2',
                    'text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                    'focus:outline-none focus:border-[var(--accent-primary)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                />
                <button
                  onClick={handleSend}
                  disabled={isProcessing || !inputText.trim()}
                  className={cn(
                    'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                    inputText.trim() && !isProcessing
                      ? 'bg-[var(--accent-primary)] text-white hover:opacity-90'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed',
                  )}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Context panel (right) ── */}
        <div className={cn('transition-all duration-200', contextOpen ? 'w-1/4 min-w-[220px]' : 'w-8')}>
          {/* Toggle button */}
          <button
            onClick={() => setContextOpen(!contextOpen)}
            className={cn(
              'mb-2 p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors',
            )}
            title={contextOpen ? 'Collapse panel' : 'Expand panel'}
          >
            <ChevronRight
              size={16}
              className={cn('transition-transform', contextOpen ? 'rotate-180' : '')}
            />
          </button>

          {contextOpen && (
            <div className="space-y-3">
              {/* Active Alerts */}
              <Card padding="sm">
                <CardHeader className="mb-2">
                  <CardTitle>
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={13} />
                      Active Alerts
                    </span>
                  </CardTitle>
                </CardHeader>
                <div className="space-y-2">
                  {DEMO_ALERTS.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <Badge variant="severity" severity={alert.severity} className="shrink-0 mt-0.5">
                        {alert.severity}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-[var(--text-primary)] truncate">{alert.title}</p>
                        <p className="text-[var(--text-muted)]">{alert.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Services */}
              <Card padding="sm">
                <CardHeader className="mb-2">
                  <CardTitle>Services</CardTitle>
                </CardHeader>
                <div className="space-y-1.5">
                  {DEMO_SERVICES.map((svc) => (
                    <div
                      key={svc.name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--text-secondary)] truncate">{svc.name}</span>
                      <Badge variant="status" status={svc.status} className="shrink-0">
                        {svc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
