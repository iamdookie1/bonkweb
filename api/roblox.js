export const config = { api: { bodyParser: false } };

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Allow all origins (your own Vercel domain only in prod is fine)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-roblox-path, x-roblox-method, x-roblox-content-type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = req.headers['x-api-key'];
  const robloxPath = req.headers['x-roblox-path'];   // e.g. /assets/v1/assets
  const robloxMethod = (req.headers['x-roblox-method'] || req.method).toUpperCase();
  const contentType = req.headers['x-roblox-content-type'] || req.headers['content-type'] || '';

  if (!apiKey || !robloxPath) {
    res.status(400).json({ error: 'Missing x-api-key or x-roblox-path header' });
    return;
  }

  const url = `https://apis.roblox.com${robloxPath}`;
  const headers = { 'x-api-key': apiKey };
  if (contentType) headers['Content-Type'] = contentType;

  const fetchOpts = { method: robloxMethod, headers };
  if (robloxMethod !== 'GET' && robloxMethod !== 'HEAD') {
    fetchOpts.body = await readBody(req);
  }

  try {
    const rbxRes = await fetch(url, fetchOpts);
    const body = await rbxRes.arrayBuffer();
    const rbxContentType = rbxRes.headers.get('content-type') || 'application/octet-stream';
    res.status(rbxRes.status).setHeader('Content-Type', rbxContentType).end(Buffer.from(body));
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: err.message });
  }
}
