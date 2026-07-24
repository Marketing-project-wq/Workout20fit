// Minimal zero-dependency static server for the bundled 20FIT HTML app.
// Railway (and most PaaS) inject the port to listen on via process.env.PORT,
// so we must never hardcode it. Uses only Node built-ins => `npm install`
// has nothing to fetch and the build cannot fail on dependencies.
//
// The same bundle powers two separate deployments:
//   * User app  — the default (this service / domain).
//   * CMS admin — a SEPARATE Railway service/domain. Set env CMS_MODE=1 there,
//     or hit the /cms path, and the page boots straight into CMS mode.
// Both share one codebase so data & components never drift.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const CMS_ENV = /^(1|true|yes|on)$/i.test(process.env.CMS_MODE || '');

// Pick the page to serve: prefer index.html, otherwise the first *.html file.
function findHtmlFile() {
  const dir = __dirname;
  const files = fs.readdirSync(dir);
  if (files.includes('index.html')) return path.join(dir, 'index.html');
  const html = files.filter((f) => f.toLowerCase().endsWith('.html'));
  if (html.length === 0) {
    throw new Error('No .html file found to serve in ' + dir);
  }
  return path.join(dir, html[0]);
}

const htmlPath = findHtmlFile();
const htmlUser = fs.readFileSync(htmlPath, 'utf8');
// CMS variant: set a global flag before the app boots so it starts in CMS mode.
const htmlCms = htmlUser.replace('<body>', '<body><script>window.__CMS_MODE__=true;</script>');
console.log('[20fit] serving:', path.basename(htmlPath), CMS_ENV ? '(CMS_MODE)' : '(user app; CMS at /cms)');

function wantsCms(url) {
  return CMS_ENV || url === '/cms' || url.startsWith('/cms/') || url.startsWith('/cms?');
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  const body = wantsCms(req.url) ? htmlCms : htmlUser;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
  res.end(body);
});

server.listen(PORT, HOST, () => {
  console.log(`[20fit] listening on http://${HOST}:${PORT}`);
});
