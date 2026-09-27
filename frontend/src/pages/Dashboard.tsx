import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { claims } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Signed in as {claims?.email}. Use the sidebar to open Vibration Analysis or Oil Analysis — each is a
        separate app, copied in as-is.
      </p>
    </div>
  );
}
