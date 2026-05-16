import Busboy from 'busboy';
import FormData from 'form-data';

export const config = { api: { bodyParser: false } };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-roblox-path, x-roblox-method',
};

/**
 * Parse an incoming multipart/form-data request with Busboy.
 * Returns { fields: {name: stringValue}, files: {name: {buffer, filename, mimeType}} }
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = {};

    const bb = Busboy({ headers: req.headers });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        files[name] = {
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimeType: info.mimeType,
        };
      });
    });

    bb.on('finish', () => resolve({ fields, files }));
    bb.on('error', reject);

    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  // Set CORS headers on every response
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey     = req.headers['x-api-key'];
  const robloxPath = req.headers['x-roblox-path'];
  const robloxMethod = (req.headers['x-roblox-method'] || 'GET').toUpperCase();

  if (!apiKey || !robloxPath) {
    res.status(400).json({ error: 'Missing x-api-key or x-roblox-path header' });
    return;
  }

  const url = `https://apis.roblox.com${robloxPath}`;

  try {
    let rbxRes;

    if (robloxMethod === 'GET' || robloxMethod === 'HEAD') {
      // Simple GET (e.g. validation check, list assets, poll operation)
      rbxRes = await fetch(url, {
        method: robloxMethod,
        headers: { 'x-api-key': apiKey },
      });
    } else {
      // POST/PATCH — parse the incoming multipart and rebuild it cleanly
      const { fields, files } = await parseMultipart(req);

      // Build a fresh FormData with form-data npm package (generates valid boundary)
      const form = new FormData();

      // 'request' field: must be the JSON string exactly as Roblox expects it.
      // Roblox wants the value to literally be the JSON string (like curl --form 'request="..."')
      if (fields.request) {
        form.append('request', fields.request, {
          contentType: 'application/json',
        });
      }

      // 'fileContent' field: the actual binary file
      if (files.fileContent) {
        const { buffer, filename, mimeType } = files.fileContent;
        form.append('fileContent', buffer, {
          filename: filename || 'asset.png',
          contentType: mimeType || 'image/png',
          knownLength: buffer.length,
        });
      }

      rbxRes = await fetch(url, {
        method: robloxMethod,
        headers: {
          'x-api-key': apiKey,
          // form-data generates the correct Content-Type with boundary
          ...form.getHeaders(),
        },
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
