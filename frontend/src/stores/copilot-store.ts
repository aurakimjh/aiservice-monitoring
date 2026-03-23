import { create } from 'zustand';
import type { CopilotMessage } from '@/types/monitoring';
import { processQuery } from '@/lib/copilot-engine';

interface CopilotState {
  messages: CopilotMessage[];
  isProcessing: boolean;
  sendMessage: (text: string) => void;
  clearMessages: () => void;
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  messages: [],
  isProcessing: false,

  sendMessage: (text: string) => {
    const userMessage: CopilotMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isProcessing: true,
    }));

    setTimeout(() => {
      const result = processQuery(text);
      const assistantMessage: CopilotMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
        promql: result.promql,
        chartData: result.chartData,
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isProcessing: false,
      }));
    }, 300);
  },

  clearMessages: () => set({ messages: [], isProcessing: false }),
}));
