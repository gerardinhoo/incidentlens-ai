import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Small render-error boundary for the SPA shell.
 * Runtime data/API error states are owned by SCRUM-48.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main style={{ padding: '2rem', maxWidth: '40rem', margin: '0 auto' }}>
          <h1>Something went wrong</h1>
          <p>
            Reload the page to continue. If the problem persists, contact the
            platform team.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
