import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import styles from './LoginPage.module.css';

type LocationState = { from?: string };

export function LoginPage() {
  const { status, configured, signIn, completeNewPassword } = useAuth();
  const location = useLocation();
  const from =
    (location.state as LocationState | null)?.from &&
    (location.state as LocationState).from !== '/login'
      ? (location.state as LocationState).from
      : '/incidents';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeSession, setChallengeSession] = useState<
    string | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'signed-in') {
    return <Navigate to={from ?? '/incidents'} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      if (challengeSession !== undefined) {
        await completeNewPassword(email, newPassword, challengeSession);
        return;
      }
      const result = await signIn(email, password);
      if (result.status === 'new-password-required') {
        setChallengeSession(result.challengeSession);
        setPassword('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.wrap} aria-labelledby="login-heading">
      <h1 id="login-heading">Sign in</h1>
      <p className={styles.lead}>
        Operator access for IncidentLens. Accounts are created by an
        administrator — there is no public sign-up.
      </p>

      {!configured ? (
        <p className={styles.notice} role="status">
          Cognito is not configured in this build. Set VITE_COGNITO_USER_POOL_ID
          and VITE_COGNITO_CLIENT_ID, then rebuild.
        </p>
      ) : null}

      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <label className={styles.label} htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className={styles.input}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {challengeSession === undefined ? (
          <>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </>
        ) : (
          <>
            <p className={styles.notice} role="status">
              A new password is required before you can continue.
            </p>
            <label className={styles.label} htmlFor="login-new-password">
              New password
            </label>
            <input
              id="login-new-password"
              className={styles.input}
              type="password"
              name="new-password"
              autoComplete="new-password"
              required
              minLength={12}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </>
        )}

        {error !== undefined ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
