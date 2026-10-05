import { T } from "../theme";
import { NAV } from "../nav";
import logo from "../assets/arabian-cement-logo.png";

// Platform-level two-tier nav — matches the real app's sidebar (see
// docs/visual-reference/NOTES.md). Active top-level item (or the one whose
// child is active) renders as a SOLID filled blue block, not a tint/border
// (confirmed against every real sidebar screenshot — this was wrong in the
// original Phase 1 pass, which copied the dark-theme source file's
// tint+left-border style instead).
//
// Known deferred ambiguity (see NOTES.md): some screenshots show a narrow
// icon-only collapsed rail: this build only implements the wide,
// full-label state (the one shown in the large majority of screenshots,
// and the one needed for the module-expand behavior this phase asks to be
// verified) — the narrow-rail variant's trigger isn't established from the
// screenshots and isn't built here.
export default function Sidebar({ page, expandedId, onNavigate, onToggleExpand }) {
  return (
    <>
      <div style={{ padding: "18px 16px 14px" }}>
        <img src={logo} alt="Arabian Cement Logo" style={{ width: 170, height: "auto", display: "block" }} />
      </div>
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {NAV.map((item) => {
          const hasChildren = !!item.children;
          const isExpanded = expandedId === item.id;
          const childActive = hasChildren && item.children.some((c) => c.id === page);
          const topActive = page === item.id || childActive;

          return (
            <div key={item.id}>
              <div
                role="button"
                tabIndex={0}
                aria-current={topActive ? "page" : undefined}
                onClick={() => (hasChildren ? onToggleExpand(item.id) : onNavigate(item.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    hasChildren ? onToggleExpand(item.id) : onNavigate(item.id);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  margin: "1px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: topActive ? 600 : 400,
                  color: topActive ? "#FFFFFF" : T.sidebarTextSecondary,
                  background: topActive ? T.accent : "transparent",
                }}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {hasChildren && (
                  <i className={`ti ti-chevron-${isExpanded ? "down" : "right"}`} style={{ fontSize: 13 }} aria-hidden="true" />
                )}
              </div>

              {hasChildren && isExpanded && (
                <div style={{ marginBottom: 2 }}>
                  {item.children.map((child) => {
                    const active = page === child.id;
                    return (
                      <div
                        key={child.id}
                        role="button"
                        tabIndex={0}
                        aria-current={active ? "page" : undefined}
                        onClick={() => onNavigate(child.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onNavigate(child.id);
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          padding: "8px 16px 8px 40px",
                          margin: "1px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12.5,
                          fontWeight: active ? 600 : 400,
                          color: active ? "#FFFFFF" : T.sidebarTextSecondary,
                          background: active ? T.accent : "transparent",
                        }}
                      >
                        <i className={`ti ${child.icon}`} style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true" />
                        <span>{child.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ fontSize: 10, color: T.sidebarTextSecondary }}>New frontend — Phase 1</span>
      </div>
    </>
  );
}
