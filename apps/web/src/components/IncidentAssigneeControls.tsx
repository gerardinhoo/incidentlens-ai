import { useState } from 'react';
import { isApiError, updateIncidentAssignee } from '../api';
import type { IncidentDto } from '../types/incident';
import styles from './IncidentStatusControls.module.css';

export interface IncidentAssigneeControlsProps {
  incident: IncidentDto;
  currentUserId: string;
  onUpdated: (incident: IncidentDto) => void;
}

export function IncidentAssigneeControls({
  incident,
  currentUserId,
  onUpdated,
}: IncidentAssigneeControlsProps) {
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const assignedToCurrentUser =
    currentUserId.length > 0 && incident.assigneeId === currentUserId;
  const ownerLabel =
    incident.assigneeEmail ??
    (incident.assigneeId !== undefined ? 'Another operator' : 'Unassigned');

  async function handleAssignToMe() {
    if (updating || currentUserId.length === 0) {
      return;
    }

    setErrorMessage(null);
    setUpdating(true);

    try {
      const updated = await updateIncidentAssignee(incident.id);
      onUpdated(updated);
    } catch (error) {
      if (isApiError(error)) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Unable to assign this incident. Please try again.');
      }
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="assignee-heading">
      <h2 id="assignee-heading">Owner</h2>

      <div className={styles.current}>
        <span className={styles.currentLabel}>Assigned to</span>
        <span>{assignedToCurrentUser ? 'You' : ownerLabel}</span>
      </div>

      {assignedToCurrentUser ? (
        <p className={styles.resolvedNote}>You own this incident.</p>
      ) : (
        <div
          className={styles.actions}
          role="group"
          aria-label="Take ownership"
        >
          <button
            type="button"
            className={styles.actionButton}
            disabled={updating || currentUserId.length === 0}
            onClick={() => {
              void handleAssignToMe();
            }}
          >
            {updating ? 'Assigning…' : 'Assign to me'}
          </button>
        </div>
      )}

      {errorMessage !== null ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
