import { useState } from "react";
import { T } from "./theme";
import * as api from "./api";
import { PAGE_INDEX, parentIdOf } from "./nav";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import SampleTracker from "./pages/SampleTracker";
import Placeholder from "./pages/Placeholder";

// Simple page-state toggle (no router) — same pattern as the old app's own
// App.jsx (a `page` string in state, swapped with if-blocks).
export default function App() {
  const [user, setUser] = useState(() => api.getStoredUser());
  const [page, setPage] = useState("oil-dashboard");
  const [expandedId, setExpandedId] = useState(() => parentIdOf("oil-dashboard"));

  if (!user) {
    return (
      <Login
        onLoggedIn={(u) => {
          setUser(u);
        }}
      />
    );
  }

  function navigate(pageId) {
    setPage(pageId);
    const parent = parentIdOf(pageId);
    if (parent) setExpandedId(parent);
  }

  function toggleExpand(itemId) {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  }

  const pageInfo = PAGE_INDEX[page] || { label: page, parentLabel: null };
  const breadcrumb = { parent: pageInfo.parentLabel, page: pageInfo.label };

  function renderPage() {
    if (page === "oil-dashboard") return <Dashboard />;
    if (page === "oil-sampling-log") return <SampleTracker />;
    return <Placeholder title={pageInfo.label} />;
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter',sans-serif",
        background: T.appBg,
        color: T.textPrimary,
        overflow: "hidden",
      }}
    >
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${T.appBg}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
      `}</style>
      <div
        style={{
          width: 240,
          background: T.sidebarBg,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <Sidebar page={page} expandedId={expandedId} onNavigate={navigate} onToggleExpand={toggleExpand} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <TopBar
          breadcrumb={breadcrumb}
          user={user}
          onLogout={() => {
            api.logout();
            setUser(null);
          }}
        />
        <div style={{ flex: 1, overflowY: "auto", padding: 24, background: T.appBg }}>{renderPage()}</div>
      </div>
    </div>
  );
}
