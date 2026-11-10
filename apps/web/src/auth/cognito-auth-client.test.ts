import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCognitoAuthClient } from './cognito-auth-client';
import { AUTH_SESSION_STORAGE_KEY } from './session-storage';

const config = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_abc',
  clientId: 'client123',
};

function encodePayload(payload: object): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('createCognitoAuthClient', () => {
  it('stores tokens after USER_PASSWORD_AUTH', async () => {
    const idToken = `h.${encodePayload({ email: 'ops@example.com' })}.s`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            AuthenticationResult: {
              AccessToken: 'access',
              IdToken: idToken,
              RefreshToken: 'refresh',
            },
          }),
      }),
    );

    const client = createCognitoAuthClient(config);
    const result = await client.signIn('ops@example.com', 'Secret12!ab');

    expect(result).toEqual({
      status: 'signed-in',
      session: {
        email: 'ops@example.com',
        accessToken: 'access',
        idToken,
        refreshToken: 'refresh',
      },
    });
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toContain(
      'ops@example.com',
    );
  });

  it('refreshes tokens and keeps the previous refresh token', async () => {
    const idToken = `h.${encodePayload({ email: 'ops@example.com' })}.s`;
    sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        email: 'ops@example.com',
        accessToken: 'old-access',
        idToken: 'old-id',
        refreshToken: 'refresh-keep',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            AuthenticationResult: {
              AccessToken: 'new-access',
              IdToken: idToken,
            },
          }),
      }),
    );

    const client = createCognitoAuthClient(config);
    await expect(client.refreshSession()).resolves.toEqual({
      email: 'ops@example.com',
      accessToken: 'new-access',
      idToken,
      refreshToken: 'refresh-keep',
    });
  });

  it('returns new-password-required when Cognito challenges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            Session: 'challenge-session',
          }),
      }),
    );

    const client = createCognitoAuthClient(config);
    await expect(
      client.signIn('ops@example.com', 'Temp12!temp12'),
    ).resolves.toEqual({
      status: 'new-password-required',
      challengeSession: 'challenge-session',
    });
  });
});
