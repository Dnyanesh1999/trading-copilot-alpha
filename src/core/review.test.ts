import { describe, expect, it } from 'vitest';
import { sampleSession } from './fixtures';
import { entryInfo, positionStatus, reviewSession, reviewSummary, timestampInfo, validRules } from './review';
import type { ConfirmedRules, Position, Session } from './types';

const rules = (changes: Partial<ConfirmedRules> = {}): ConfirmedRules => ({
  id: 'confirmed-rules', maxPositions: 3, cutoff: '11:00', timezone: 'Asia/Kolkata',
  confirmedAt: '2026-10-07T08:00:00Z', comparison: 'sample-plan', ...changes,
});
const position = (id: string, timestamp: string | null): Position => ({
  id, instrument: `SAMPLE-${id}`, firstEntryCovered: true,
  executions: [{ id: `${id}-entry`, side: 'entry', timestamp, quantity: 1, price: 100 }],
});
const session = (positions: Position[], recordsComplete = true): Session => ({
  id: 'test-session', date: '2026-09-23', positions, recordsComplete,
});
const finding = (review: ReturnType<typeof reviewSession>, id: string, rule: 'daily-limit' | 'entry-cutoff') =>
  review.findings.find(f => f.positionId === id && f.ruleId === rule)!;

describe('rule validation and execution timestamps', () => {
  it.each([[0, '11:00'], [1.5, '11:00'], [NaN, '11:00'], [3, '24:00'], [3, '11:60'], [3, '9:00']])('rejects invalid rule pair %s / %s', (max, cutoff) => {
    expect(validRules(max as number, cutoff as string)).toBe(false);
    expect(() => reviewSession(rules({ maxPositions: max as number, cutoff: cutoff as string }), sampleSession())).toThrow();
  });
  it('requires explicit confirmation and supported timezone', () => {
    expect(() => reviewSession(rules({ id: '' }), sampleSession())).toThrow();
    expect(() => reviewSession(rules({ confirmedAt: '' }), sampleSession())).toThrow();
    expect(() => reviewSession({ ...rules(), timezone: 'UTC' } as unknown as ConfirmedRules, sampleSession())).toThrow();
  });
  it.each([null, '', '11:00', '2026-09-23T09:00:00', '2026-02-30T09:00:00+05:30', '2026-09-23T25:00:00Z', '2026-09-23T09:60:00Z', '2026-09-23T09:00:60Z', '2026-09-23T09:00:00+99:00'])('rejects invalid timestamp %s', value => {
    expect(timestampInfo(value)).toBeNull();
  });
  it('converts offsets and UTC into the same IST timestamp and date', () => {
    expect(timestampInfo('2026-09-22T23:45:30.125Z')).toMatchObject({ day: '2026-09-23', clock: '05:15', seconds: 18930.125 });
    expect(timestampInfo('2026-09-23T05:15:30.125+05:30')).toEqual(timestampInfo('2026-09-22T23:45:30.125Z'));
  });
});

describe('evidence-based review', () => {
  it('flags only D for both default rules and retains supporting execution IDs', () => {
    const review = reviewSession(rules(), sampleSession());
    expect(review.findings).toHaveLength(8);
    expect(review.findings.filter(f => f.status === 'deviated').map(f => [f.positionId, f.ruleId])).toEqual([['D', 'daily-limit'], ['D', 'entry-cutoff']]);
    expect(finding(review, 'D', 'daily-limit').sourceIds).toEqual(['A-entry-01', 'A-entry-02', 'B-entry-01', 'C-entry-01', 'D-entry-01']);
    expect(finding(review, 'D', 'entry-cutoff').sourceIds).toEqual(['D-entry-01']);
    expect(positionStatus(review, 'D')).toBe('deviated');
    expect(positionStatus(review, 'A')).toBe('followed');
    expect(reviewSummary(review).title).toBe('One extra entry. Two rules to revisit.');
  });
  it('groups duplicate position records and does not count partial fills as positions', () => {
    const data = sampleSession();
    data.positions.push({ ...structuredClone(data.positions[0]), executions: [data.positions[0].executions[1], { ...data.positions[0].executions[1], id: 'A-entry-03', timestamp: '2026-09-23T09:27:00+05:30' }] });
    const review = reviewSession(rules(), data);
    expect(review.session.positions).toHaveLength(4);
    expect(review.session.positions[0].executions.map(e => e.id)).toEqual(['A-entry-01', 'A-entry-02', 'A-entry-03']);
    expect(finding(review, 'C', 'daily-limit').status).toBe('followed');
    expect(finding(review, 'D', 'daily-limit').status).toBe('deviated');
    expect(data.positions).toHaveLength(5);
  });
  it('orders entries by first-entry epoch regardless of input or fill order', () => {
    const data = sampleSession();
    data.positions.reverse();
    data.positions.find(p => p.id === 'A')!.executions.reverse();
    expect(finding(reviewSession(rules(), data), 'D', 'daily-limit').status).toBe('deviated');
    expect(entryInfo(data.positions.find(p => p.id === 'A')!)?.clock).toBe('09:25');
  });
  it('groups daily allowances by IST day instead of UTC day or session label', () => {
    const data = session([position('A', '2026-09-22T18:00:00Z'), position('B', '2026-09-22T18:40:00Z'), position('C', '2026-09-23T00:30:00Z')]);
    const review = reviewSession(rules({ maxPositions: 1, cutoff: '23:59' }), data);
    expect(finding(review, 'A', 'daily-limit').status).toBe('followed');
    expect(finding(review, 'B', 'daily-limit').status).toBe('followed');
    expect(finding(review, 'C', 'daily-limit').status).toBe('deviated');
  });
  it.each([['10:59:59.999', 'followed'], ['11:00:00', 'deviated'], ['11:00:00.001', 'deviated'], ['11:00:59', 'deviated']])('compares the strict cutoff including seconds at %s', (clock, expected) => {
    const review = reviewSession(rules(), session([position('A', `2026-09-23T${clock}+05:30`)]));
    expect(finding(review, 'A', 'entry-cutoff').status).toBe(expected);
  });
  it('keeps time checks independently usable when full daily records are missing', () => {
    const review = reviewSession(rules(), sampleSession(false));
    expect(review.findings.filter(f => f.ruleId === 'daily-limit').every(f => f.status === 'insufficient_evidence')).toBe(true);
    expect(finding(review, 'A', 'entry-cutoff').status).toBe('followed');
    expect(finding(review, 'D', 'entry-cutoff').status).toBe('deviated');
    expect(positionStatus(review, 'A')).toBe('insufficient_evidence');
    expect(reviewSummary(review).description).toContain('4 checks are unresolved');
  });
  it.each([null, '2026-02-30T09:00:00+05:30'])('does not infer first entry or daily order from invalid evidence %s', timestamp => {
    const data = sampleSession();
    data.positions[0].executions[0].timestamp = timestamp;
    const review = reviewSession(rules(), data);
    expect(finding(review, 'A', 'entry-cutoff').status).toBe('insufficient_evidence');
    expect(review.findings.filter(f => f.ruleId === 'daily-limit').every(f => f.status === 'insufficient_evidence')).toBe(true);
    expect(finding(review, 'D', 'entry-cutoff').status).toBe('deviated');
  });
  it('does not use a later fill when earliest entry coverage is unknown', () => {
    const data = sampleSession();
    data.positions[0].firstEntryCovered = false;
    const review = reviewSession(rules(), data);
    expect(finding(review, 'A', 'entry-cutoff').status).toBe('insufficient_evidence');
    expect(entryInfo(data.positions[0])).toBeNull();
  });
  it('requires an entry rather than using an exit timestamp', () => {
    const p = position('A', '2026-09-23T09:25:00+05:30');
    p.executions[0].side = 'exit';
    expect(entryInfo(p)).toBeNull();
    expect(reviewSession(rules(), session([p])).findings.every(f => f.status === 'insufficient_evidence')).toBe(true);
  });
  it('leaves tied entries at a daily-limit boundary unresolved', () => {
    const data = sampleSession();
    data.positions[3].executions[0].timestamp = data.positions[2].executions[0].timestamp;
    const review = reviewSession(rules(), data);
    expect(finding(review, 'B', 'daily-limit').status).toBe('followed');
    expect(finding(review, 'C', 'daily-limit').status).toBe('insufficient_evidence');
    expect(finding(review, 'D', 'daily-limit').status).toBe('insufficient_evidence');
  });
  it('does not invent a late entry when only the daily-limit rule is violated and tied entries are unresolved', () => {
    const data = session([
      position('A', '2026-09-23T09:00:00+05:30'),
      position('B', '2026-09-23T09:00:00+05:30'),
      position('C', '2026-09-23T10:00:00+05:30'),
    ]);
    const result = reviewSession(rules({ maxPositions: 1 }), data);
    expect(result.findings.filter(f => f.status === 'deviated').map(f => f.ruleId)).toEqual(['daily-limit']);
    expect(reviewSummary(result).title.toLowerCase()).not.toContain('late');
  });
  it('classifies ties entirely within or entirely beyond the daily limit', () => {
    const data = session(['A', 'B', 'C'].map(id => position(id, '2026-09-23T09:25:00+05:30')));
    expect(reviewSession(rules({ maxPositions: 3 }), data).findings.every(f => f.status === 'followed')).toBe(true);
    data.positions.unshift(position('first', '2026-09-23T09:00:00+05:30'));
    const review = reviewSession(rules({ maxPositions: 1 }), data);
    expect(['A', 'B', 'C'].map(id => finding(review, id, 'daily-limit').status)).toEqual(['deviated', 'deviated', 'deviated']);
  });
  it('recomputes changed rules without mutating original rules, session or earlier review', () => {
    const originalRules = rules();
    const data = sampleSession();
    const previous = reviewSession(originalRules, data);
    const relaxed = reviewSession(rules({ id: 'relaxed', maxPositions: 4, cutoff: '12:00', comparison: 'hypothetical' }), data);
    expect(relaxed.findings.every(f => f.status === 'followed' && f.rulesId === 'relaxed')).toBe(true);
    expect(reviewSummary(relaxed).description).toContain('All 4');
    originalRules.maxPositions = 20;
    data.positions[3].executions[0].timestamp = null;
    expect(previous.rules.maxPositions).toBe(3);
    expect(previous.session.positions[3].executions[0].timestamp).toBe('2026-09-23T11:20:00+05:30');
    expect(previous.findings.filter(f => f.status === 'deviated')).toHaveLength(2);
  });
});
