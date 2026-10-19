// Named Vercel function. vercel.json routes /api/erp/<path> here using erpPath.
// Stateless: the ERP session cookies live in the client's `lgjar` cookie
// (same-origin), which is forwarded upstream here on every request.
const UPSTREAM = 'https://www.lgerp.cc';
const COOKIE_LIFETIME = 30 * 24 * 60 * 60;
const jarCookie = (value, maxAge = COOKIE_LIFETIME) => 'lgjar=' + encodeURIComponent(value) + '; Path=/api; Max-Age=' + maxAge + '; HttpOnly; SameSite=Lax; Secure';

export const config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
}

function parseJar(header) {
  const jar = new Map();
  if (!header) return jar;
  for (const p of String(header).split('; ')) {
    const i = p.indexOf('=');
    if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return jar;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-LG-Proxy', '1');
  try {
    const url = new URL(req.url, 'http://localhost');
    const prefix = '/api/erp';
    let path;
    if (url.pathname === '/api/proxy') {
      const routed = req.query?.erpPath ?? url.searchParams.get('erpPath') ?? '';
      path = '/' + (Array.isArray(routed) ? routed.join('/') : String(routed)).replace(/^\/+/, '');
    } else if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
      // Some runtime versions retain the original request URL after a rewrite.
      path = url.pathname.slice(prefix.length) || '/';
    } else { res.status(404).send('Not found.'); return; }
    url.searchParams.delete('erpPath');
    const q = url.searchParams.size ? '?' + url.searchParams.toString() : '';
    if (path === '/') { res.status(200).send('LG Insights proxy is running.'); return; }

    if (path === '/session' && req.method === 'DELETE') {
      res.setHeader('Set-Cookie', jarCookie('', 0));
      res.status(200).send('{"disconnected":true}');
      return;
    }

    const jar = parseJar(getCookie(req, 'lgjar'));
    const headers = {};
    for (const h of ['content-type', 'accept', 'accept-language']) {
      const v = req.headers[h];
      if (v) headers[h] = v;
    }
    headers['origin'] = UPSTREAM;
    headers['referer'] = UPSTREAM + '/index';
    headers['x-requested-with'] = 'XMLHttpRequest';
    headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LGInsights/3.0';
    if (jar.size) headers['cookie'] = [...jar].map(([k, v]) => k + '=' + v).join('; ');

    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const up = await fetch(UPSTREAM + path + q, { method: req.method, headers, body, redirect: 'manual' });

    const setCookies = typeof up.headers.getSetCookie === 'function' ? up.headers.getSetCookie() : [];
    for (const h of setCookies) {
      const pair = h.split(';', 1)[0];
      const i = pair.indexOf('=');
      if (i > 0) {
        const name = pair.slice(0, i).trim();
        const maxAge = h.match(/;\s*max-age=(-?\d+)/i);
        const expires = h.match(/;\s*expires=([^;]+)/i);
        if (maxAge ? Number(maxAge[1]) <= 0 : expires && Date.parse(expires[1]) <= Date.now()) jar.delete(name);
        else jar.set(name, pair.slice(i + 1).trim());
      }
    }
    if (setCookies.length) {
      res.setHeader('Set-Cookie', jarCookie([...jar].map(([k, v]) => k + '=' + v).join('; '), jar.size ? COOKIE_LIFETIME : 0));
    }
    const ct = up.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.status(up.status).send(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.status(502).send('Could not reach LG ERP: ' + e.message);
  }
}
