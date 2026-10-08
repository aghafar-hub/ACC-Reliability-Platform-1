// The four vibration severity levels used by the redesigned pages
// (docs/design-reference.md §5): Normal / Caution / Alert / Danger.
// Colour comes from the active theme; every level also has a shape so
// colour is never the only signal (● ▲ ◆ ■).

export const LEVELS = ["Normal", "Caution", "Alert", "Danger"];
export const LEVEL_RANK = { Normal: 1, Caution: 2, Alert: 3, Danger: 4 };

// Theme token for a level's colour and its pale background.
export function levelColor(T, level) {
  return { Normal: T.success, Caution: T.warning, Alert: T.alert || T.danger, Danger: T.danger }[level] || T.textMuted;
}
export function levelBg(T, level) {
  return { Normal: T.successBg, Caution: T.warningBg, Alert: T.alertBg || T.dangerBg, Danger: T.dangerBg }[level] || T.cardSubBg;
}

// Older words (Good / Acceptable / Alarm, ISO zones, contractor report
// words, Compliance Tracker marks) mapped onto the four levels.
const WORDS = {
  normal: "Normal", good: "Normal", ok: "Normal", yes: "",
  caution: "Caution", acceptable: "Caution", satisfactory: "Caution", "under observation": "Caution", observation: "Caution", comment: "Caution",
  alert: "Alert", alarm: "Alert", unsatisfactory: "Alert",
  danger: "Danger", unacceptable: "Danger", unpermissible: "Danger",
};
export function toLevel(word) {
  if (!word) return "";
  const w = String(word).trim().toLowerCase();
  if (LEVEL_RANK[word]) return word;
  return WORDS[w] ?? "";
}

export function worstLevel(levels) {
  let best = "";
  levels.forEach((l) => {
    if ((LEVEL_RANK[l] || 0) > (LEVEL_RANK[best] || 0)) best = l;
  });
  return best;
}

// Band a number against three limits (a < b < c): below a Normal, below b
// Caution, below c Alert, otherwise Danger. Missing value or limits → "".
export function band(value, limits) {
  const n = parseFloat(value);
  if (isNaN(n) || !limits) return "";
  const [a, b, c] = limits.map((x) => parseFloat(x));
  if ([a, b, c].some((x) => isNaN(x))) return "";
  if (n < a) return "Normal";
  if (n < b) return "Caution";
  if (n < c) return "Alert";
  return "Danger";
}
