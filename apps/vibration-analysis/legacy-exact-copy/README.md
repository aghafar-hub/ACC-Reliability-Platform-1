# Legacy exact copy

This folder is a byte-for-byte copy of the original `Vibration-Analysis-App`
repo's compiled build: `index.html` + `assets/index-XLkmhznS.js` (a single
minified bundle with React and the whole app inlined) + `assets/desktop.ini`
(a stray Windows folder-settings file that shipped with the original repo —
kept here for exactness, not referenced by anything).

Nothing in this folder was edited — same markup, same bundle bytes, same
inline `<style>` block. It exists purely as a reference and rollback point:
ground truth to diff the reconstructed source under `src/` against, and a way
to run the original app exactly as it shipped (`python3 -m http.server` from
this folder, or open `index.html` directly) if the rebuild is ever in doubt.

The React source under `src/` at the repo root is a from-scratch,
readable reconstruction of this bundle's behavior — built by decompiling and
reverse-engineering the minified code (component structure, the Google Apps
Script JSONP API contract, theme palettes, row/column schemas, status
thresholds), not by copying it. See `docs/` for what was found and how
confident the reconstruction is.
