import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './PageState.module.css';

export function LoadingState({ message }: { message: string }) {
  return (
    <p className={styles.loading} role="status">
      {message}
    </p>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={styles.panel}>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryDisabled = false,
  backToIncidents = false,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  backToIncidents?: boolean;
}) {
  let actions: ReactNode = null;
  if (onRetry !== undefined || backToIncidents) {
    actions = (
      <div className={styles.actions}>
        {onRetry !== undefined ? (
          <button
            type="button"
            className={styles.retryButton}
            onClick={onRetry}
            disabled={retryDisabled}
          >
            Retry
          </button>
        ) : null}
        {backToIncidents ? (
          <Link className={styles.secondaryLink} to="/incidents">
            Back to incidents
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.panel} role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      {actions}
    </div>
  );
}
