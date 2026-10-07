import type { Session, Execution, ConfirmedRules } from './types';
const fill = (id: string, time: string, quantity: number, price: number): Execution => ({
  id, side: 'entry', timestamp: `2026-09-23T${time}:00+05:30`, quantity, price,
});
export const DEFAULT_RULES = { maxPositions: 3, cutoff: '11:00' };
export function createRules(maxPositions: number, cutoff: string): ConfirmedRules {
  return {
    id: crypto.randomUUID(), maxPositions, cutoff, timezone: 'Asia/Kolkata', confirmedAt: new Date().toISOString(),
    comparison: maxPositions === 3 && cutoff === '11:00' ? 'sample-plan' : 'hypothetical',
  };
}
export function sampleSession(recordsComplete = true): Session {
  return {
    id: 'fictional-2026-09-23', date: '2026-09-23', recordsComplete,
    positions: [
      { id: 'A', instrument: 'SAMPLE-ALPHA', firstEntryCovered: true, executions: [fill('A-entry-01', '09:25', 6, 210), fill('A-entry-02', '09:26', 4, 210.5)] },
      { id: 'B', instrument: 'SAMPLE-BETA', firstEntryCovered: true, executions: [fill('B-entry-01', '09:48', 10, 325)] },
      { id: 'C', instrument: 'SAMPLE-GAMMA', firstEntryCovered: true, executions: [fill('C-entry-01', '10:32', 5, 480)] },
      { id: 'D', instrument: 'SAMPLE-DELTA', firstEntryCovered: true, executions: [fill('D-entry-01', '11:20', 8, 150)] },
    ],
  };
}
export const FOCUS_LABELS = {
  'entry-check': 'Check before entry',
  'daily-limit': 'Keep to my daily limit',
  later: 'Choose later',
} as const;
