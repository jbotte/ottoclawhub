// Local dev/preview server: serves dist/ and mounts the Netlify Function at /api/*.
// Loads .env if present. Without DATABASE_URL the API uses an in-memory store.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

// tiny .env loader
try {
  const env = await readFile(join(root, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env */ }

const { default: apiHandler } = await import(join(root, 'netlify/functions/api.mjs'));
const dist = join(root, 'dist');
const port = parseInt(process.env.PORT || '8888', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1e6) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const event = {
        httpMethod: req.method,
        path: url.pathname,
        headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req),
      };
      const result = await apiHandler(event, {});
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
      return;
    }
    // static
    let filePath = normalize(join(dist, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!filePath.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    let data;
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) throw new Error('dir');
      data = await readFile(filePath);
    } catch {
      filePath = join(dist, 'index.html'); // SPA fallback
      data = await readFile(filePath);
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('dev server error');
  }
});

server.listen(port, () => {
  console.log(`OttoClawHub dev server: http://localhost:${port}  (backend: ${process.env.DATABASE_URL ? 'neon' : 'memory'})`);
});
