import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router';
import { api } from './api.js';

// null = signed out. A 401 is an answer, not an error.
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me').then((d) => d.user, (e) => (e.status === 401 ? null : Promise.reject(e))),
    staleTime: 60_000,
  });

export function RequireAuth({ children }) {
  const { data: user, isPending, error } = useMe();
  const location = useLocation();
  if (isPending) return null;
  if (error) return <p className="p-8 text-muted">{error.message}</p>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}
