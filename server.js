const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 25 * 1024 * 1024;
const EXPECTED_HOST = 'supplier.meesho.com';
const EXPECTED_PATH = '/api/cataloging/imageBulkUpload/uploadSingleCatalogImages';
let session = null;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return Promise.resolve(Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request is too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function shellUnquote(value) {
  value = value.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseCurl(curl) {
  if (typeof curl !== 'string' || !/^\s*curl\b/i.test(curl)) throw new Error('Paste a complete cURL command');
  const urlMatch = curl.match(/curl\s+(?:--location\s+)?(['"])(https?:\/\/[^'"]+)\1/i) || curl.match(/curl\s+(https?:\/\/\S+)/i);
  if (!urlMatch) throw new Error('Could not find the request URL in the cURL');
  const url = new URL(urlMatch[2] || urlMatch[1]);
  if (url.hostname !== EXPECTED_HOST || url.pathname !== EXPECTED_PATH) throw new Error('This cURL is not for the supported Meesho image-upload endpoint');
  url.protocol = 'https:';

  const headers = {};
  const headerRegex = /(?:^|\s)(?:-H|--header)\s+((['"])([\s\S]*?)\2|\S+)/g;
  let match;
  while ((match = headerRegex.exec(curl))) {
    const line = shellUnquote(match[1]);
    const split = line.indexOf(':');
    if (split > 0) headers[line.slice(0, split).trim().toLowerCase()] = line.slice(split + 1).trim();
  }
  const cookieMatch = curl.match(/(?:^|\s)(?:-b|--cookie)\s+((['"])([\s\S]*?)\2|\S+)/);
  if (cookieMatch) headers.cookie = shellUnquote(cookieMatch[1]);
  if (!headers.cookie) throw new Error('No cookie (-b or --cookie) was found');

  const allowed = ['accept', 'accept-language', 'browser-id', 'client-package-version', 'client-type', 'identifier', 'supplier-id', 'origin', 'referer', 'user-agent', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'priority', 'x-requested-with', 'cookie'];
  const forwarded = Object.fromEntries(allowed.filter(k => headers[k]).map(k => [k, headers[k]]));
  forwarded.origin ||= 'https://supplier.meesho.com';
  forwarded.referer ||= 'https://supplier.meesho.com/';
  return { url: url.toString(), headers: forwarded };
}

async function uploadImage(payload) {
  if (!session) throw Object.assign(new Error('Paste a fresh Meesho cURL first'), { status: 401 });
  const data = Buffer.from(payload.data || '', 'base64');
  if (!data.length) throw Object.assign(new Error('Image data is empty'), { status: 400 });
  const form = new FormData();
  form.append('file', new Blob([data], { type: payload.type || 'application/octet-stream' }), payload.name || 'image.jpg');
  const response = await fetch(session.url, { method: 'POST', headers: session.headers, body: form, redirect: 'manual' });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { message: text.slice(0, 500) || `Meesho returned HTTP ${response.status}` }; }
  if (!response.ok) throw Object.assign(new Error(result.message || result.error || `Meesho returned HTTP ${response.status}`), { status: response.status, details: result });
  if (!result.image) throw Object.assign(new Error('Upload succeeded but the response did not contain an image link'), { status: 502, details: result });
  return result;
}

async function handleRequest(req, res) {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const file = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': file.length });
      return res.end(file);
    }
    if (req.method === 'GET' && req.url === '/api/session') return json(res, 200, { configured: Boolean(session), identifier: session?.headers.identifier || null, supplierId: session?.headers['supplier-id'] || null });
    if (req.method === 'POST' && req.url === '/api/session') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      session = parseCurl(body.curl);
      return json(res, 200, { ok: true, identifier: session.headers.identifier || null, supplierId: session.headers['supplier-id'] || null });
    }
    if (req.method === 'DELETE' && req.url === '/api/session') {
      session = null;
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/upload') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      return json(res, 200, await uploadImage(body));
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Unexpected server error', details: error.details });
  }
}

let server = null;
if (require.main === module) {
  server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => console.log(`Meesho uploader running at http://${HOST}:${PORT}`));
}

module.exports = { parseCurl, server, handleRequest };
