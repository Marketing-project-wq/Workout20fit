// Minimal zero-dependency static server for the bundled 20FIT HTML app.
// Railway (and most PaaS) inject the port to listen on via process.env.PORT,
// so we must never hardcode it. Uses only Node built-ins => `npm install`
// has nothing to fetch and the build cannot fail on dependencies.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

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
const html = fs.readFileSync(htmlPath);
console.log('[20fit] serving:', path.basename(htmlPath));

const server = http.createServer((req, res) => {
  // Simple health check endpoint
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Single bundled page — serve it for every route (SPA-style).
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
  res.end(html);
});

server.listen(PORT, HOST, () => {
  console.log(`[20fit] listening on http://${HOST}:${PORT}`);
});
