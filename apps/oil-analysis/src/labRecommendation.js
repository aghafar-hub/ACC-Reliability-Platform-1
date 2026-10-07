// The lab's Recommendation/Comments text is long — every finding comes with
// a headline in capitals ("CAUTION - ELEVATED SILICON LEVEL.") followed by
// paragraphs of possible causes and boiler-plate. The app keeps it short:
// each headline with its first sentence, e.g.
//   "CAUTION - ELEVATED SILICON LEVEL. Determine source of Silicon (Si) and
//    take corrective action."
// The full text stays on the lab's own report.

const BOILERPLATE = /^contact your exxonmobil representative/i;

// Split into sentences at ". " followed by a capital or a digit, without
// breaking on list markers like "a. Defoamants" or "i.e. tank".
function sentences(text) {
  const out = [];
  let cur = "";
  const parts = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=\.)\s+(?=[A-Z0-9])/);
  for (const p of parts) {
    cur = cur ? `${cur} ${p}` : p;
    // "a." / "b." / "1." / "i.e." on their own are list markers, not ends
    if (/(?:^|\s)(?:[a-z]|\d{1,2}|i\.e|e\.g)\.$/i.test(cur) && !/[A-Z]{3,}\.$/.test(cur)) continue;
    out.push(cur.trim());
    cur = "";
  }
  if (cur) out.push(cur.trim());
  return out.filter(Boolean);
}

// A headline: capitals only (no lower-case letters), long enough to be one.
function isHeadline(s) {
  const body = s.replace(/\.$/, "");
  return body.length >= 8 && /[A-Z]{3}/.test(body) && !/[a-z]/.test(body);
}

// { lines: ["HEADLINE. First sentence.", …], alertType: "HEADLINE; HEADLINE" }
export function shortenRecommendation(text) {
  const list = sentences(text);
  const lines = [];
  const heads = [];
  let i = 0;
  while (i < list.length) {
    if (isHeadline(list[i])) {
      const head = list[i].replace(/\.$/, "");
      let j = i + 1;
      while (j < list.length && BOILERPLATE.test(list[j])) j++;
      const first = j < list.length && !isHeadline(list[j]) ? list[j] : "";
      lines.push(first ? `${head}. ${first}` : `${head}.`);
      heads.push(head);
      i = j + 1;
      while (i < list.length && !isHeadline(list[i])) i++;
    } else if (!lines.length) {
      // no headline at all: keep the first two real sentences
      const keep = list
        .filter((s) => !BOILERPLATE.test(s))
        .slice(0, 2)
        .join(" ");
      if (keep) lines.push(keep);
      break;
    } else {
      i++;
    }
  }
  // The alert type names the findings, not "no action" / admin notes —
  // unless there are no findings: then it says so ("NO ACTION REQUIRED…").
  const findings = heads.filter((h) => !/^NO ACTION REQUIRED/i.test(h) && !/^ADMINISTRATION\b/i.test(h));
  const noAction = heads.find((h) => /^NO ACTION REQUIRED/i.test(h)) || "";
  return { lines, alertType: findings.length ? findings.join("; ") : noAction };
}
