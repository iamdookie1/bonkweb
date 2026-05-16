import Busboy from 'busboy';
import FormData from 'form-data';

export const config = { api: { bodyParser: false } };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-roblox-path, x-roblox-method',
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = {};
    const bb = Busboy({ headers: req.headers });
    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        files[name] = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType };
      });
    });
    bb.on('finish', () => resolve({ fields, files }));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey       = req.headers['x-api-key'];
  const robloxPath   = req.headers['x-roblox-path'];
  const robloxMethod = (req.headers['x-roblox-method'] || 'GET').toUpperCase();

  if (!apiKey || !robloxPath) {
    res.status(400).json({ error: 'Missing x-api-key or x-roblox-path' });
    return;
  }

  const url = `https://apis.roblox.com${robloxPath}`;

  try {
    let rbxRes;

    if (robloxMethod === 'GET' || robloxMethod === 'HEAD') {
      rbxRes = await fetch(url, { method: robloxMethod, headers: { 'x-api-key': apiKey } });

    } else {
      const { fields, files } = await parseMultipart(req);

      // Log what we received for debugging
      console.log('fields.request:', fields.request);
      console.log('files:', Object.keys(files));

      const form = new FormData();

      // CRITICAL: append 'request' as a plain string with NO content-type header on the part.
      // Roblox parses this as a plain text field containing JSON.
      // Do NOT pass options object — that adds a Content-Type sub-header that breaks parsing.
      if (fields.request) {
        form.append('request', fields.request);
      }

      if (files.fileContent) {
        const { buffer, filename, mimeType } = files.fileContent;
        form.append('fileContent', buffer, {
          filename: filename || 'asset.png',
          contentType: mimeType || 'image/png',
          knownLength: buffer.length,
        });
      }

      const formHeaders = form.getHeaders();
      console.log('Sending to Roblox with headers:', { 'x-api-key': '***', ...formHeaders });
      console.log('Form buffer length:', form.getBuffer().length);

      rbxRes = await fetch(url, {
        method: robloxMethod,
        headers: { 'x-api-key': apiKey, ...formHeaders },
        body: form.getBuffer(),
      });
    }

    const body = await rbxRes.arrayBuffer();
    const ct = rbxRes.headers.get('content-type') || 'application/octet-stream';
    res.status(rbxRes.status).setHeader('Content-Type', ct).end(Buffer.from(body));

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Proxy error', detail: err.message });
  }
}
