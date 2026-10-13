import { useLocation, useNavigate } from 'react-router-dom';
import StateCard from '../components/StateCard';

// The module pages have no <Route> of their own (App.tsx draws them below
// the routes), so their addresses must not count as "not found".
const MODULE_PATHS = ['/oil-lubrication', '/vibration-analysis'];

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (MODULE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;
  return (
    <StateCard
      testid="page-not-found"
      icon="compass"
      eyebrow="Page not found"
      title="We can't find that page"
      text="The link may be old or typed wrongly. Everything else is working."
      primary={{ label: 'Go to Plant overview', onClick: () => navigate('/') }}
      secondary={{ label: 'Go back', onClick: () => navigate(-1) }}
    />
  );
}
