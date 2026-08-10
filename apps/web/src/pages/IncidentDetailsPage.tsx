import { useParams } from 'react-router-dom';

export function IncidentDetailsPage() {
  const { incidentId } = useParams<{ incidentId: string }>();

  return (
    <section aria-labelledby="incident-details-heading">
      <h1 id="incident-details-heading">Incident details</h1>
      {incidentId ? (
        <p>
          Incident ID: <code>{incidentId}</code>
        </p>
      ) : (
        <p>No incident selected.</p>
      )}
    </section>
  );
}
