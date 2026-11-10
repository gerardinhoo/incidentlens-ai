import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AUTH_SESSION_EXPIRED_EVENT } from '../api/http-client';
import {
  createCognitoAuthClient,
  createUnconfiguredAuthClient,
} from './cognito-auth-client';
import { readCognitoPublicConfig } from './config';
import { isIdTokenExpired } from './decode-id-token';
import type { AuthClient, AuthSession } from './types';

export type AuthStatus = 'signed-out' | 'signed-in';

type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | undefined;
  configured: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<
    | { status: 'signed-in' }
    | { status: 'new-password-required'; challengeSession: string }
  >;
  completeNewPassword: (
    email: string,
    newPassword: string,
    challengeSession: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createDefaultAuthClient(): AuthClient {
  const config = readCognitoPublicConfig();
  if (config === undefined) {
    return createUnconfiguredAuthClient();
  }
  return createCognitoAuthClient(config);
}

export function AuthProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: AuthClient;
}) {
  const authClient = useMemo(
    () => client ?? createDefaultAuthClient(),
    [client],
  );
  const [session, setSession] = useState<AuthSession | undefined>(() =>
    authClient.getSession(),
  );

  useEffect(() => {
    const onExpired = () => {
      setSession(undefined);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  useEffect(() => {
    const current = authClient.getSession();
    if (current === undefined || !isIdTokenExpired(current.idToken)) {
      return;
    }
    let cancelled = false;
    void authClient
      .refreshSession()
      .then((next) => {
        if (!cancelled) {
          setSession(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn(email, password);
      if (result.status === 'signed-in') {
        setSession(result.session);
        return { status: 'signed-in' as const };
      }
      return result;
    },
    [authClient],
  );

  const completeNewPassword = useCallback(
    async (email: string, newPassword: string, challengeSession: string) => {
      const next = await authClient.completeNewPassword(
        email,
        newPassword,
        challengeSession,
      );
      setSession(next);
    },
    [authClient],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setSession(undefined);
  }, [authClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session === undefined ? 'signed-out' : 'signed-in',
      session,
      configured: authClient.isConfigured(),
      signIn,
      completeNewPassword,
      signOut,
    }),
    [authClient, completeNewPassword, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
