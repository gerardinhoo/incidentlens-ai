import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMemoryAuthClient } from '../auth/memory-auth-client';
import { renderWithRouter } from '../test/renderWithRouter';

describe('LoginPage', () => {
  it('signs in and shows the incidents console', async () => {
    const user = userEvent.setup();
    const authClient = createMemoryAuthClient({ signedIn: false });

    renderWithRouter(<App />, {
      initialEntries: ['/login'],
      authClient,
    });

    await user.type(screen.getByLabelText('Email'), 'operator@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
  });

  it('shows an error for invalid credentials', async () => {
    const user = userEvent.setup();
    const authClient = createMemoryAuthClient({ signedIn: false });

    renderWithRouter(<App />, {
      initialEntries: ['/login'],
      authClient,
    });

    await user.type(screen.getByLabelText('Email'), 'operator@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect username or password.',
    );
  });

  it('prompts for a new password when Cognito requires it', async () => {
    const user = userEvent.setup();
    const authClient = createMemoryAuthClient({
      signedIn: false,
      users: { 'operator@example.com': 'temporary-pass1!' },
    });

    renderWithRouter(<App />, {
      initialEntries: ['/login'],
      authClient,
    });

    await user.type(screen.getByLabelText('Email'), 'operator@example.com');
    await user.type(screen.getByLabelText('Password'), 'temporary-pass1!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(/A new password is required/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('New password'), 'Replacement12!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
  });
});
