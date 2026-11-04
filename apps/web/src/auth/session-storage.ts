import type { AuthSession } from './types';

export const AUTH_SESSION_STORAGE_KEY = 'incidentlens.auth.session';

export function readStoredSession(
  storage: Storage = sessionStorage,
): AuthSession | undefined {
  try {
    const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (raw === null) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.email !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.idToken !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      storage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return undefined;
    }
    return {
      email: parsed.email,
      accessToken: parsed.accessToken,
      idToken: parsed.idToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return undefined;
  }
}

export function writeStoredSession(
  session: AuthSession,
  storage: Storage = sessionStorage,
): void {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(storage: Storage = sessionStorage): void {
  storage.removeItem(AUTH_SESSION_STORAGE_KEY);
}
