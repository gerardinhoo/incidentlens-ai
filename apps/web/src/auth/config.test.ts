import { describe, expect, it } from 'vitest';
import { readCognitoPublicConfig } from './config';

describe('readCognitoPublicConfig', () => {
  it('returns undefined when pool or client is missing', () => {
    expect(
      readCognitoPublicConfig({
        VITE_COGNITO_USER_POOL_ID: 'us-east-1_abc',
      } as ImportMetaEnv),
    ).toBeUndefined();
  });

  it('reads public SPA settings', () => {
    expect(
      readCognitoPublicConfig({
        VITE_COGNITO_USER_POOL_ID: 'us-east-1_abc',
        VITE_COGNITO_CLIENT_ID: 'client123',
        VITE_COGNITO_REGION: 'us-west-2',
      } as ImportMetaEnv),
    ).toEqual({
      region: 'us-west-2',
      userPoolId: 'us-east-1_abc',
      clientId: 'client123',
    });
  });
});
