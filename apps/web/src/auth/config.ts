export type CognitoPublicConfig = {
  region: string;
  userPoolId: string;
  clientId: string;
};

function readTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Public Cognito SPA settings baked at build time (not secrets).
 */
export function readCognitoPublicConfig(
  env: ImportMetaEnv = import.meta.env,
): CognitoPublicConfig | undefined {
  const userPoolId = readTrimmed(env.VITE_COGNITO_USER_POOL_ID);
  const clientId = readTrimmed(env.VITE_COGNITO_CLIENT_ID);
  const region =
    readTrimmed(env.VITE_COGNITO_REGION) ??
    readTrimmed(env.VITE_AWS_REGION) ??
    'us-east-1';

  if (userPoolId === undefined || clientId === undefined) {
    return undefined;
  }

  return { region, userPoolId, clientId };
}
