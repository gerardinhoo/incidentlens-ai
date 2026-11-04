import type { AuthClient, AuthSession, SignInResult } from './types';

export function createMemoryAuthClient(options?: {
  signedIn?: boolean;
  email?: string;
  users?: Record<string, string>;
}): AuthClient {
  const users = options?.users ?? {
    'operator@example.com': 'correct-password',
  };
  const defaultEmail = options?.email ?? 'operator@example.com';
  let session: AuthSession | undefined = options?.signedIn
    ? {
        email: defaultEmail,
        accessToken: 'memory-access',
        idToken: 'memory-id',
        refreshToken: 'memory-refresh',
      }
    : undefined;
  let challengeSession: string | undefined;

  return {
    isConfigured() {
      return true;
    },
    getSession() {
      return session;
    },
    signIn(email: string, password: string): Promise<SignInResult> {
      const expected = users[email];
      if (expected === undefined || expected !== password) {
        return Promise.reject(new Error('Incorrect username or password.'));
      }
      if (password === 'temporary-pass1!') {
        challengeSession = 'memory-challenge';
        return Promise.resolve({
          status: 'new-password-required',
          challengeSession,
        });
      }
      session = {
        email,
        accessToken: 'memory-access',
        idToken: 'memory-id',
        refreshToken: 'memory-refresh',
      };
      return Promise.resolve({ status: 'signed-in', session });
    },
    completeNewPassword(email, newPassword, incomingChallenge) {
      if (incomingChallenge !== challengeSession) {
        return Promise.reject(new Error('Password change session expired.'));
      }
      if (newPassword.length < 12) {
        return Promise.reject(
          new Error('Password must be at least 12 characters.'),
        );
      }
      session = {
        email,
        accessToken: 'memory-access',
        idToken: 'memory-id',
        refreshToken: 'memory-refresh',
      };
      challengeSession = undefined;
      return Promise.resolve(session);
    },
    signOut() {
      session = undefined;
      return Promise.resolve();
    },
  };
}
