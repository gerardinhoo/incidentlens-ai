import { describe, expect, it } from 'vitest';

import { parseEnableFlag } from './env.js';

describe('parseEnableFlag / ENABLE_TEST_ERROR_ENDPOINT', () => {
  it('defaults to false when unset', () => {
    expect(parseEnableFlag(undefined)).toBe(false);
  });

  it('enables for true / 1 / yes (case-insensitive)', () => {
    expect(parseEnableFlag('true')).toBe(true);
    expect(parseEnableFlag('TRUE')).toBe(true);
    expect(parseEnableFlag('1')).toBe(true);
    expect(parseEnableFlag('yes')).toBe(true);
  });

  it('disables for other values', () => {
    expect(parseEnableFlag('false')).toBe(false);
    expect(parseEnableFlag('0')).toBe(false);
    expect(parseEnableFlag('no')).toBe(false);
    expect(parseEnableFlag('')).toBe(false);
    expect(parseEnableFlag('  ')).toBe(false);
  });
});
