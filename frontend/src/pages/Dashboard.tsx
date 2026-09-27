import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { claims } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Signed in as {claims?.email}. Use the sidebar to open Oil Analysis — Vibration Analysis is still its own
        separate app for now.
      </p>
    </div>
  );
}
