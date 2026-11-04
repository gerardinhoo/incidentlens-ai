import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryAuthClient } from '../auth/memory-auth-client';
import { renderWithRouter } from '../test/renderWithRouter';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('renders children in the main content region', () => {
    renderWithRouter(
      <AppLayout>
        <p>Child content</p>
      </AppLayout>,
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByText('Child content'),
    );
  });

  it('hides Incidents nav when signed out', () => {
    renderWithRouter(
      <AppLayout>
        <span>page</span>
      </AppLayout>,
      { authClient: createMemoryAuthClient({ signedIn: false }) },
    );

    expect(screen.getByText('IncidentLens AI')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Incidents' }),
    ).not.toBeInTheDocument();
  });

  it('renders the product name and Incidents nav link', () => {
    renderWithRouter(
      <AppLayout>
        <span>page</span>
      </AppLayout>,
    );

    expect(screen.getByText('IncidentLens AI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Incidents' })).toHaveAttribute(
      'href',
      '/incidents',
    );
  });
});
