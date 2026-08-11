import { ErrorState } from '../components/PageState';

export function NotFoundPage() {
  return (
    <section>
      <ErrorState
        title="Page not found"
        description="The page you requested does not exist."
        backToIncidents
      />
    </section>
  );
}
