import { describe, expect, it } from 'vitest';
import { getApiBaseUrl, normalizeApiBaseUrl } from './config';

describe('normalizeApiBaseUrl', () => {
  it('strips a trailing slash from absolute URLs', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000/')).toBe(
      'http://localhost:3000',
    );
  });

  it('strips a trailing slash from relative paths', () => {
    expect(normalizeApiBaseUrl('/api/')).toBe('/api');
  });

  it('trims whitespace', () => {
    expect(normalizeApiBaseUrl('  /api  ')).toBe('/api');
  });

  it('rejects an empty value', () => {
    expect(() => normalizeApiBaseUrl('   ')).toThrow(
      'API base URL must not be empty',
    );
  });
});

describe('getApiBaseUrl', () => {
  it('defaults to the Vite proxy path when unset', () => {
    expect(getApiBaseUrl({})).toBe('/api');
  });

  it('defaults to the Vite proxy path when blank', () => {
    expect(getApiBaseUrl({ VITE_API_BASE_URL: '  ' })).toBe('/api');
  });

  it('uses and normalizes a configured absolute URL', () => {
    expect(
      getApiBaseUrl({ VITE_API_BASE_URL: 'https://api.example.com/' }),
    ).toBe('https://api.example.com');
  });

  it('uses and normalizes a configured relative path', () => {
    expect(getApiBaseUrl({ VITE_API_BASE_URL: '/api/' })).toBe('/api');
  });

  it('accepts an API Gateway-style production base URL', () => {
    expect(
      getApiBaseUrl({
        VITE_API_BASE_URL:
          'https://umkenp6pt1.execute-api.us-east-1.amazonaws.com/',
      }),
    ).toBe('https://umkenp6pt1.execute-api.us-east-1.amazonaws.com');
  });
});
