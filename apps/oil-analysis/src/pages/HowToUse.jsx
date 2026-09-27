import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { HOWTO_TOPICS } from "../howtoTopics";

// Ported from the original app's `Gh` component: a side-nav of topics (each
// with its own icon/colour), an accordion of numbered steps per topic, and
// Previous/Next buttons that walk through every topic in order. Topic ids,
// titles, colours, and step titles/descriptions are copied verbatim from
// the original bundle. The original also renders a small custom-built
// "Visual Preview" mockup per step; those are decorative illustrations
// specific to each step (not real app screens) and are left out here to
// keep this page's own source maintainable — the step text itself, which is
// what a user actually reads, is reproduced in full.
export default function HowToUse() {
  const { T, s } = useTheme();
  const [topicId, setTopicId] = useState("overview");
  const [openStep, setOpenStep] = useState(0);
  const topic = HOWTO_TOPICS.find((t) => t.id === topicId);
  const topicIndex = HOWTO_TOPICS.findIndex((t) => t.id === topicId);

  function goTopic(id) {
    setTopicId(id);
    setOpenStep(0);
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: T.textPrimary }}>
          <i className="ti ti-help-circle" style={{ marginRight: 10, color: T.accent }} aria-hidden="true" /> How to Use
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: T.textSecondary }}>
          Arabian Cement Oil Analysis Management — complete guide to all features
        </p>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .howto-layout { flex-direction: column !important; }
          .howto-sidenav { width: 100% !important; }
          .howto-sidenav-inner { display: flex !important; flex-direction: row !important; overflow-x: auto !important; border-radius: 10px !important; }
          .howto-sidenav-inner > div { flex-shrink: 0 !important; border-left: none !important; border-bottom: 3px solid transparent !important; border-right: 1px solid ${T.border} !important; flex-direction: column !important; padding: 8px 12px !important; min-width: 80px !important; text-align: center !important; }
        }
      `}</style>

      <div className="howto-layout" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div className="howto-sidenav" style={{ width: 200, flexShrink: 0 }}>
          <div
            className="howto-sidenav-inner"
            style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}
          >
            {HOWTO_TOPICS.map((t) => {
              const active = topicId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => goTopic(t.id)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: active ? T.navActive : "transparent",
                    borderLeft: `3px solid ${active ? t.color : "transparent"}`,
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <i
                    className={`ti ${t.icon}`}
                    style={{ fontSize: 14, color: active ? t.color : T.textSecondary, flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: active ? 700 : 400,
                      color: active ? T.textPrimary : T.textSecondary,
                      lineHeight: 1.3,
                    }}
                  >
                    {t.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              background: T.cardBg,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: "14px 18px",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: topic.color + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <i className={`ti ${topic.icon}`} style={{ fontSize: 20, color: topic.color }} aria-hidden="true" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary }}>{topic.title}</div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>
                {topic.steps.length} topic{topic.steps.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {topic.steps.map((step, i) => {
              const open = openStep === i;
              return (
                <div
                  key={i}
                  style={{
                    background: T.cardBg,
                    border: `1px solid ${open ? topic.color + "88" : T.border}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    transition: "border-color 0.2s",
                  }}
                >
                  <div
                    style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                    onClick={() => setOpenStep(open ? -1 : i)}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: open ? topic.color : T.cardSubBg,
                        border: `2px solid ${open ? topic.color : T.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: open ? "#fff" : T.textSecondary,
                      }}
                    >
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, flex: 1 }}>{step.title}</span>
                    <i
                      className={`ti ti-chevron-${open ? "up" : "down"}`}
                      style={{ color: T.textMuted, fontSize: 14 }}
                      aria-hidden="true"
                    />
                  </div>
                  {open && (
                    <div style={{ padding: "0 18px 18px" }}>
                      <p style={{ margin: 0, fontSize: 13, color: T.textSecondary, lineHeight: 1.7 }}>{step.desc}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            {topicIndex > 0 ? (
              <button style={{ ...s.btn, fontSize: 12 }} onClick={() => goTopic(HOWTO_TOPICS[topicIndex - 1].id)}>
                <i className="ti ti-arrow-left" aria-hidden="true" /> Previous
              </button>
            ) : (
              <div />
            )}
            {topicIndex < HOWTO_TOPICS.length - 1 ? (
              <button style={{ ...s.btnPrimary, fontSize: 12 }} onClick={() => goTopic(HOWTO_TOPICS[topicIndex + 1].id)}>
                Next <i className="ti ti-arrow-right" aria-hidden="true" />
              </button>
            ) : (
              <div style={{ fontSize: 12, color: T.success, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-circle-check" aria-hidden="true" /> You've read everything!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
