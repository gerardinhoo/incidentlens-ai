import { describe, expect, it } from 'vitest';

import { isInvalidIncidentStatusTransitionError } from './is-invalid-incident-status-transition-error.js';

describe('isInvalidIncidentStatusTransitionError', () => {
  it('detects domain lifecycle transition errors', () => {
    expect(
      isInvalidIncidentStatusTransitionError(
        new Error('Invalid incident status transition: open -> open'),
      ),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(
      isInvalidIncidentStatusTransitionError(
        new Error('Incident repository save failed'),
      ),
    ).toBe(false);
    expect(isInvalidIncidentStatusTransitionError('not-an-error')).toBe(false);
  });
});
