import { describe, expect, it } from 'vitest';
import {
  ApiError,
  isApiError,
  isNotFoundError,
  normalizeApiErrorMessage,
  toApiError,
} from './api-error';

describe('normalizeApiErrorMessage', () => {
  it('uses a generic message for 400 validation payloads', () => {
    expect(
      normalizeApiErrorMessage(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'body/title must NOT have fewer than 3 characters',
      }),
    ).toBe('Request validation failed');
  });

  it('uses safe API messages for 404/409', () => {
    expect(
      normalizeApiErrorMessage(404, {
        status: 'error',
        message: 'Incident not found',
      }),
    ).toBe('Incident not found');
    expect(
      normalizeApiErrorMessage(409, {
        status: 'error',
        message: 'Invalid incident status transition',
      }),
    ).toBe('Invalid incident status transition');
  });

  it('does not expose HTML error bodies', () => {
    expect(
      normalizeApiErrorMessage(502, '<html><body>Bad Gateway</body></html>'),
    ).toBe('Something went wrong. Please try again.');
  });

  it('returns a generic message for 500 without a safe body', () => {
    expect(normalizeApiErrorMessage(500, undefined)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('toApiError', () => {
  it('preserves status and optional code', () => {
    const error = toApiError(404, {
      status: 'error',
      message: 'Incident not found',
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('error');
    expect(error.message).toBe('Incident not found');
  });
});

describe('isNotFoundError / isApiError', () => {
  it('detects typed 404 ApiErrors by status', () => {
    const notFound = new ApiError(404, 'Incident not found');
    const serverError = new ApiError(500, 'Something went wrong.');
    expect(isNotFoundError(notFound)).toBe(true);
    expect(isNotFoundError(serverError)).toBe(false);
    expect(isNotFoundError(new Error('nope'))).toBe(false);
    expect(isApiError(serverError)).toBe(true);
  });
});
