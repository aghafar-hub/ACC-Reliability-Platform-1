import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useEmbeddedNav } from "../embeddedNav";
import { useModuleAccess } from "../moduleAccess";
import { useQuickActions } from "../quickActions";

// /quick/:key — where the installed app's shortcuts land (PWA item 24):
// opens the same entry as the matching ＋ item, then steps aside.
export default function QuickLink() {
  const { key } = useParams();
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const { settled } = useModuleAccess();
  const item = useQuickActions().find((q) => q.key === key);

  useEffect(() => {
    if (!item) return;
    embeddedNav.navigateTo(item.moduleId, item.page, item.record);
    navigate(item.route, { replace: true });
  }, [item, embeddedNav, navigate]);

  if (!item && settled) return <Navigate to="/" replace />;
  return null;
}
