// A Word report (.docx) → its paragraphs and tables as plain text.
// A .docx is a zip; word/document.xml holds the text. No library: the zip
// directory is read by hand and the entry inflated with the browser's own
// DecompressionStream (also in Node 18+, used by the tests).

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// zip bytes → contents of one entry (null when it is not there)
export async function unzipEntry(buf, name) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // end of central directory: last 0x06054b50 within the final 64 KB
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a Word file (no zip directory)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const entry = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    if (entry === name) {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = b.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error(`unsupported zip compression (${method})`);
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m));

// document.xml → { paragraphs: [text], tables: [[[cell text]]] }. Text of
// the paragraphs outside tables; a cell's paragraphs are joined by "\n".
// Nested tables are kept as their own tables.
export function readDocumentXml(xml) {
  const paragraphs = [];
  const tables = [];
  const stack = []; // open tables: { rows, row, cell }
  let para = null;
  const re = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr)\b[^>]*?(\/?)>|([^<]+)/g;
  let inText = false;
  let m;
  while ((m = re.exec(xml))) {
    if (m[4] !== undefined) {
      if (inText && para !== null) para += unescape(m[4]);
      continue;
    }
    const [, close, tag, self] = m;
    const t = stack[stack.length - 1];
    if (tag === "t") inText = !close && !self;
    else if (tag === "tab" || tag === "br" || tag === "cr") {
      if (para !== null) para += tag === "tab" ? " " : "\n";
    } else if (tag === "p") {
      if (!close && !self) para = "";
      else if (close) {
        const text = (para || "").replace(/[ \t]+/g, " ").trim();
        if (t && t.cell) t.cell.push(text);
        else if (text) paragraphs.push(text);
        para = null;
      }
    } else if (tag === "tbl") {
      if (!close) stack.push({ rows: [], row: null, cell: null });
      else {
        const done = stack.pop();
        if (done) tables.push(done.rows);
      }
    } else if (tag === "tr" && t) {
      if (!close) t.row = [];
      else if (t.row) { t.rows.push(t.row); t.row = null; }
    } else if (tag === "tc" && t) {
      if (!close) t.cell = [];
      else if (t.cell) { (t.row || (t.row = [])).push(t.cell.filter(Boolean).join("\n")); t.cell = null; }
    }
  }
  return { paragraphs, tables };
}

export async function docxTables(buf) {
  const xml = await unzipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("not a Word file (no word/document.xml)");
  return readDocumentXml(new TextDecoder().decode(xml));
}
