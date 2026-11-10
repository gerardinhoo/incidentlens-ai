export type AuthSession = {
  email: string;
  accessToken: string;
  idToken: string;
  refreshToken: string;
};

export type SignInResult =
  | { status: 'signed-in'; session: AuthSession }
  | { status: 'new-password-required'; challengeSession: string };

export interface AuthClient {
  isConfigured(): boolean;
  getSession(): AuthSession | undefined;
  signIn(email: string, password: string): Promise<SignInResult>;
  completeNewPassword(
    email: string,
    newPassword: string,
    challengeSession: string,
  ): Promise<AuthSession>;
  refreshSession(): Promise<AuthSession | undefined>;
  signOut(): Promise<void>;
}
