import { describe, expect, it } from 'vitest';
import { getApiBaseUrl, normalizeApiBaseUrl } from './config';

describe('normalizeApiBaseUrl', () => {
  it('strips a trailing slash', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000/')).toBe(
      'http://localhost:3000',
    );
  });

  it('trims whitespace', () => {
    expect(normalizeApiBaseUrl('  http://localhost:3000  ')).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects an empty value', () => {
    expect(() => normalizeApiBaseUrl('   ')).toThrow(
      'API base URL must not be empty',
    );
  });
});

describe('getApiBaseUrl', () => {
  it('defaults to localhost when unset', () => {
    expect(getApiBaseUrl({})).toBe('http://localhost:3000');
  });

  it('defaults to localhost when blank', () => {
    expect(getApiBaseUrl({ VITE_API_BASE_URL: '  ' })).toBe(
      'http://localhost:3000',
    );
  });

  it('uses and normalizes a configured value', () => {
    expect(
      getApiBaseUrl({ VITE_API_BASE_URL: 'https://api.example.com/' }),
    ).toBe('https://api.example.com');
  });
});
