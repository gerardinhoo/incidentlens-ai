import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { createMemoryAuthClient } from '../auth/memory-auth-client';
import type { AuthClient } from '../auth/types';

interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  authClient?: AuthClient;
}

export function renderWithRouter(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    authClient = createMemoryAuthClient({ signedIn: true }),
    ...options
  }: RenderWithRouterOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider client={authClient}>{children}</AuthProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
