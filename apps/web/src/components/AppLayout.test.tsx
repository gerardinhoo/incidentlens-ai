import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
