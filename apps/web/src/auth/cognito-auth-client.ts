import type { CognitoPublicConfig } from './config';
import { emailFromIdToken } from './decode-id-token';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from './session-storage';
import type { AuthClient, AuthSession } from './types';

type CognitoAuthResult = {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
};

type CognitoAuthResponse = {
  AuthenticationResult?: CognitoAuthResult;
  ChallengeName?: string;
  Session?: string;
  message?: string;
  __type?: string;
};

function cognitoEndpoint(region: string): string {
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

async function cognitoPost(
  config: CognitoPublicConfig,
  target: string,
  body: Record<string, unknown>,
): Promise<CognitoAuthResponse> {
  const response = await fetch(cognitoEndpoint(config.region), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': target,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as CognitoAuthResponse;
  if (!response.ok) {
    const message =
      typeof payload.message === 'string' && payload.message.length > 0
        ? payload.message
        : 'Sign-in failed';
    throw new Error(message);
  }
  return payload;
}

function sessionFromAuthResult(
  result: CognitoAuthResult,
  fallbackEmail: string,
): AuthSession {
  const accessToken = result.AccessToken;
  const idToken = result.IdToken;
  const refreshToken = result.RefreshToken;
  if (
    accessToken === undefined ||
    idToken === undefined ||
    refreshToken === undefined
  ) {
    throw new Error('Sign-in did not return tokens');
  }

  const email = emailFromIdToken(idToken) || fallbackEmail;
  return { email, accessToken, idToken, refreshToken };
}

export function createCognitoAuthClient(
  config: CognitoPublicConfig,
  storage: Storage = sessionStorage,
): AuthClient {
  return {
    isConfigured() {
      return true;
    },

    getSession() {
      return readStoredSession(storage);
    },

    async signIn(email: string, password: string) {
      const payload = await cognitoPost(
        config,
        'AWSCognitoIdentityProviderService.InitiateAuth',
        {
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: config.clientId,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        },
      );

      if (payload.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        if (
          typeof payload.Session !== 'string' ||
          payload.Session.length === 0
        ) {
          throw new Error(
            'Password change required but no session was returned',
          );
        }
        return {
          status: 'new-password-required',
          challengeSession: payload.Session,
        };
      }

      const result = payload.AuthenticationResult;
      if (result === undefined) {
        throw new Error('Sign-in did not complete');
      }
      const session = sessionFromAuthResult(result, email);
      writeStoredSession(session, storage);
      return { status: 'signed-in', session };
    },

    async completeNewPassword(email, newPassword, challengeSession) {
      const payload = await cognitoPost(
        config,
        'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
        {
          ClientId: config.clientId,
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          Session: challengeSession,
          ChallengeResponses: {
            USERNAME: email,
            NEW_PASSWORD: newPassword,
          },
        },
      );

      const result = payload.AuthenticationResult;
      if (result === undefined) {
        throw new Error('Password update did not complete sign-in');
      }
      const session = sessionFromAuthResult(result, email);
      writeStoredSession(session, storage);
      return session;
    },

    async signOut() {
      const session = readStoredSession(storage);
      clearStoredSession(storage);
      if (session === undefined) {
        return;
      }
      try {
        await cognitoPost(
          config,
          'AWSCognitoIdentityProviderService.GlobalSignOut',
          { AccessToken: session.accessToken },
        );
      } catch {
        // Local session is already cleared.
      }
    },
  };
}

export function createUnconfiguredAuthClient(): AuthClient {
  return {
    isConfigured() {
      return false;
    },
    getSession() {
      return undefined;
    },
    signIn() {
      return Promise.reject(
        new Error(
          'Sign-in is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.',
        ),
      );
    },
    completeNewPassword() {
      return Promise.reject(new Error('Sign-in is not configured.'));
    },
    signOut() {
      return Promise.resolve();
    },
  };
}
