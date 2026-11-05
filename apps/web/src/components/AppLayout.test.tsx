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

  it('centers the sign-in page in the main region', () => {
    renderWithRouter(
      <AppLayout>
        <span>login content</span>
      </AppLayout>,
      {
        initialEntries: ['/login'],
        authClient: createMemoryAuthClient({ signedIn: false }),
      },
    );

    expect(screen.getByRole('main').className).toMatch(/mainLogin/);
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

  it('shows the signed-in email next to Sign out', () => {
    renderWithRouter(
      <AppLayout>
        <span>page</span>
      </AppLayout>,
    );

    expect(screen.getByText('operator@example.com')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  it('hides operator identity when signed out', () => {
    renderWithRouter(
      <AppLayout>
        <span>page</span>
      </AppLayout>,
      { authClient: createMemoryAuthClient({ signedIn: false }) },
    );

    expect(screen.queryByText('operator@example.com')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
  });
});
