import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Route guard: no session -> /login; must-change-password -> /change-password. */
export default function RequireAuth() {
  const { sessionToken, mustChangePassword } = useAuth();
  const location = useLocation();

  if (!sessionToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
