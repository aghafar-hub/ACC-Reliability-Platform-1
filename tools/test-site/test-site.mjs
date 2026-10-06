#!/usr/bin/env node
// Builds the whole platform (shell + Oil + Vibration) against the TEST COPY
// backends and serves it on this computer — the "test copy" from the Phase 0
// spec. Nothing here touches the live site or the live sheets.
//
//   node tools/test-site/test-site.mjs            build, then serve
//   node tools/test-site/test-site.mjs --serve    serve the last build again
//   node tools/test-site/test-site.mjs --port 5000
//
// Reads the three test Apps Script URLs from tools/test-site/test-site.env
// (copy test-site.env.example to that name and fill it in). Works on
// Windows, macOS and Linux with Node 20+. See docs/test-copy-setup.md.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ENV_FILE = path.join(HERE, 'test-site.env');
const SITE = path.join(HERE, '.site');

// The live backends. A test build must never point at these.
const LIVE_URLS = [
  'https://script.google.com/macros/s/AKfycbx3GDHY_1njtZ5wO5684BuYyslzuzB7GvAchJQtnBCynVOCLxfJ0ZnNm9oXWhqk36Lt/exec',
  'https://script.google.com/macros/s/AKfycbzBSXj7ugvqgd_KnTPOXpISmTDeQ4aB3CcIaMAg4RUnbJ6fZO03uOCqS8ekxlxLPaW9Kw/exec',
];
const REQUIRED = ['VITE_PLATFORM_CORE_URL', 'VITE_OIL_ANALYSIS_URL', 'VITE_VIBRATION_ANALYSIS_URL'];

const args = process.argv.slice(2);
const serveOnly = args.includes('--serve');
const portArg = args.indexOf('--port');
const PORT = portArg !== -1 ? Number(args[portArg + 1]) : 4173;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    fail(`Missing ${path.relative(ROOT, ENV_FILE)}.\n  Copy test-site.env.example to test-site.env in the same folder and paste in your three TEST web app URLs.`);
  }
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const key of REQUIRED) {
    if (!env[key] || env[key].includes('PASTE_')) fail(`${key} is not set in test-site.env.`);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env[key])) fail(`${key} doesn't look like an Apps Script web app URL (…/exec).`);
    if (LIVE_URLS.includes(env[key])) fail(`${key} is the LIVE backend. The test site must use your test copy's URL.`);
  }
  return env;
}

function run(cmd, cwd, extraEnv = {}) {
  console.log(`\n▶ ${cmd}   (${path.relative(ROOT, cwd) || '.'})`);
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true, env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) fail(`"${cmd}" failed.`);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function build(env) {
  const projects = ['frontend', 'apps/oil-analysis', 'apps/vibration-analysis'];
  for (const p of projects) {
    if (!fs.existsSync(path.join(ROOT, p, 'node_modules'))) run('npm install', path.join(ROOT, p));
  }
  const buildEnv = {
    ...env,
    VITE_BUILD_SHA: `test-${Date.now()}`,
    VITE_ENV_LABEL: 'TEST COPY',
  };
  run('npx vite build --base=/', path.join(ROOT, 'frontend'), buildEnv);
  run('npm run build:embed', path.join(ROOT, 'apps/oil-analysis'), buildEnv);
  run('npm run build:embed', path.join(ROOT, 'apps/vibration-analysis'), buildEnv);

  fs.rmSync(SITE, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'frontend/dist'), SITE);
  copyDir(path.join(ROOT, 'apps/oil-analysis/dist-embed'), path.join(SITE, 'apps/oil-analysis'));
  copyDir(path.join(ROOT, 'apps/vibration-analysis/dist-embed'), path.join(SITE, 'apps/vibration-analysis'));
  console.log(`\n✓ Test site built into ${path.relative(ROOT, SITE)}`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function serve() {
  if (!fs.existsSync(path.join(SITE, 'index.html'))) fail('Nothing built yet — run without --serve first.');
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(SITE, urlPath));
    if (!file.startsWith(SITE)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // Single-page app: any route without a real file gets index.html.
      file = path.extname(urlPath) ? '' : path.join(SITE, 'index.html');
    }
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✓ Test site running — TEST COPY data only.\n`);
    console.log(`  On this computer:   http://localhost:${PORT}/`);
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs || []) {
        if (a.family === 'IPv4' && !a.internal) console.log(`  On your phone (same Wi-Fi):   http://${a.address}:${PORT}/`);
      }
    }
    console.log('\n  Press Ctrl+C to stop.\n');
  });
}

if (!serveOnly) build(readEnv());
serve();
