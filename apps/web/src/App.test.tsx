import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { renderWithRouter } from './test/renderWithRouter';

describe('App', () => {
  it('renders the application shell', () => {
    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(screen.getByText('IncidentLens AI')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument();
  });

  it('renders navigation to Incidents', () => {
    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(screen.getByRole('link', { name: 'Incidents' })).toBeInTheDocument();
  });

  it('renders the incidents route', () => {
    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Incident data will appear here.'),
    ).toBeInTheDocument();
  });

  it('redirects / to /incidents', () => {
    renderWithRouter(<App />, { initialEntries: ['/'] });

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
  });

  it('renders the incident details route with the id', () => {
    renderWithRouter(<App />, {
      initialEntries: ['/incidents/inc-123'],
    });

    expect(
      screen.getByRole('heading', { name: 'Incident details' }),
    ).toBeInTheDocument();
    expect(screen.getByText('inc-123')).toBeInTheDocument();
  });
});
