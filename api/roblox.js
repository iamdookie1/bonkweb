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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-roblox-path, x-roblox-method');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey     = req.headers['x-api-key'];
  const robloxPath = req.headers['x-roblox-path'];
  const robloxMethod = (req.headers['x-roblox-method'] || 'GET').toUpperCase();

  if (!apiKey || !robloxPath) {
    res.status(400).json({ error: 'Missing x-api-key or x-roblox-path' });
    return;
  }

  const url = `https://apis.roblox.com${robloxPath}`;

  // Always forward the browser's Content-Type verbatim — this is critical for
  // multipart/form-data because it carries the boundary parameter that Roblox
  // needs to parse the body. Without it the body looks empty to Roblox.
  const headers = { 'x-api-key': apiKey };
  const incomingCT = req.headers['content-type'];
  if (incomingCT) headers['Content-Type'] = incomingCT;

  const fetchOpts = { method: robloxMethod, headers };
  if (robloxMethod !== 'GET' && robloxMethod !== 'HEAD') {
    fetchOpts.body = await readBody(req);
  }

  try {
    const rbxRes = await fetch(url, fetchOpts);
    const body = await rbxRes.arrayBuffer();
    const ct = rbxRes.headers.get('content-type') || 'application/octet-stream';
    res.status(rbxRes.status).setHeader('Content-Type', ct).end(Buffer.from(body));
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: err.message });
  }
}
