import { describe, expect, it } from 'vitest';
import {
  canTransitionStatus,
  getAllowedStatusTransitions,
  STATUS_TRANSITION_LABELS,
} from './status-transitions';

describe('status-transitions', () => {
  it('allows open → investigating and open → resolved', () => {
    expect(getAllowedStatusTransitions('open')).toEqual([
      'investigating',
      'resolved',
    ]);
    expect(canTransitionStatus('open', 'investigating')).toBe(true);
    expect(canTransitionStatus('open', 'resolved')).toBe(true);
  });

  it('allows investigating → resolved only', () => {
    expect(getAllowedStatusTransitions('investigating')).toEqual(['resolved']);
    expect(canTransitionStatus('investigating', 'resolved')).toBe(true);
    expect(canTransitionStatus('investigating', 'open')).toBe(false);
  });

  it('exposes no transitions from resolved', () => {
    expect(getAllowedStatusTransitions('resolved')).toEqual([]);
    expect(canTransitionStatus('resolved', 'open')).toBe(false);
    expect(canTransitionStatus('resolved', 'investigating')).toBe(false);
  });

  it('provides Mark Investigating / Mark Resolved action labels', () => {
    expect(STATUS_TRANSITION_LABELS.investigating).toBe('Mark Investigating');
    expect(STATUS_TRANSITION_LABELS.resolved).toBe('Mark Resolved');
  });
});
