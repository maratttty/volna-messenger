import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="h-full bg-bg" />;
  }
  // Preserve where the user was headed (e.g. an /invite/:token link) so
  // Login/Register can send them back here once they're authenticated.
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  if (!profile) return <Navigate to="/setup-profile" replace />;

  return <>{children}</>;
}
