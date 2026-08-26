import http from 'node:http';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./src/index.js', import.meta.url), 'utf8');
const htmlMatch = source.match(/const HTML = `([\s\S]*?)`;\n\nexport default/);
if (!htmlMatch) throw new Error('Nepodařilo se načíst HTML aplikace.');
const html = htmlMatch[1];
const reservations = [];
let nextId = 1;

const send = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8787');
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  if (req.method === 'GET' && url.pathname === '/api/reservations') {
    const month = url.searchParams.get('month') || '';
    return send(res, 200, { reservations: reservations.filter(r => r.date.startsWith(month)), admin: false });
  }
  if (req.method === 'POST' && url.pathname === '/api/reservations') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const clash = reservations.some(r => r.date === body.date && r.time_from < body.time_to && r.time_to > body.time_from);
    if (clash) return send(res, 409, { error: 'Tento čas se překrývá s jinou rezervací.' });
    reservations.push({ id: nextId++, ...body });
    return send(res, 201, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    return send(res, 401, { error: 'Admin režim bude dostupný po připojení Cloudflare D1.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/logout') return send(res, 200, { ok: true });
  send(res, 404, { error: 'Nenalezeno.' });
});

server.listen(8787, '0.0.0.0', () => console.log('Zasedačka běží na http://localhost:8787'));
