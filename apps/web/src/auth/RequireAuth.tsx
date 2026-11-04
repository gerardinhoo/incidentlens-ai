import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status !== 'signed-in') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
