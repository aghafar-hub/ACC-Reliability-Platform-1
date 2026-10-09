// Phone tables as cards (mobile app design M3). A table marked
// `data-phone-cards` shows each row as a card on a phone (CSS in App.jsx):
// the first cell is the card title and every other cell a "Label  value"
// line. The labels come from the table's own header, copied onto each cell
// here, so a page only adds the attribute — its rows and cells stay as they
// are (desktop unchanged).
function labelTable(table) {
  const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  if (!heads.length) return;
  for (const row of table.tBodies[0]?.rows || []) {
    let col = 0;
    for (const cell of row.cells) {
      const label = heads[col] || "";
      if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      col += cell.colSpan || 1;
    }
  }
}

function labelAll(root) {
  root.querySelectorAll("table[data-phone-cards]").forEach(labelTable);
}

let installed = false;
export function installPhoneCardTables() {
  if (installed || typeof MutationObserver === "undefined") return;
  installed = true;
  let queued = false;
  const run = () => {
    queued = false;
    labelAll(document);
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
