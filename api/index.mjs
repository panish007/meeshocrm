const EXPECTED_HOST = 'supplier.meesho.com';
const EXPECTED_PATH = '/api/cataloging/imageBulkUpload/uploadSingleCatalogImages';
let session = null;

function shellUnquote(value) {
  value = value.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return value.slice(1, -1);
  return value;
}

function parseCurl(curl) {
  if (typeof curl !== 'string' || !/^\s*curl\b/i.test(curl)) throw new Error('Paste a complete cURL command');
  const urlMatch = curl.match(/curl\s+(?:--location\s+)?(['"])(https?:\/\/[^'"]+)\1/i) || curl.match(/curl\s+(https?:\/\/\S+)/i);
  if (!urlMatch) throw new Error('Could not find the request URL in the cURL');
  const url = new URL(urlMatch[2] || urlMatch[1]);
  if (url.hostname !== EXPECTED_HOST || url.pathname !== EXPECTED_PATH) throw new Error('This cURL is not for the supported Meesho image-upload endpoint');
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
  const allowed = ['accept', 'accept-language', 'browser-id', 'client-package-version', 'client-type', 'identifier', 'supplier-id', 'referer', 'user-agent', 'cookie'];
  return { url: url.toString(), headers: Object.fromEntries(allowed.filter(key => headers[key]).map(key => [key, headers[key]])) };
}

async function requestBody(request) {
  if (request.body !== undefined && request.body !== null) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function uploadImage(payload) {
  if (!session) throw Object.assign(new Error('Paste a fresh Meesho cURL first'), { status: 401 });
  const data = Buffer.from(payload.data || '', 'base64');
  if (!data.length) throw Object.assign(new Error('Image data is empty'), { status: 400 });
  const form = new FormData();
  form.append('file', new Blob([data], { type: payload.type || 'application/octet-stream' }), payload.name || 'image.jpg');
  const upstream = await fetch(session.url, { method: 'POST', headers: session.headers, body: form, redirect: 'manual' });
  const text = await upstream.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { message: text.slice(0, 500) || `Meesho returned HTTP ${upstream.status}` }; }
  if (!upstream.ok) throw Object.assign(new Error(result.message || result.error || `Meesho returned HTTP ${upstream.status}`), { status: upstream.status });
  if (!result.image) throw Object.assign(new Error('Upload succeeded but the response did not contain an image link'), { status: 502 });
  return result;
}

export default async function handler(request, response) {
  try {
    const url = new URL(request.url, 'http://localhost');
    const route = url.searchParams.get('route') || 'session';
    if (route === 'session' && request.method === 'GET') return response.status(200).json({ configured: Boolean(session), identifier: session?.headers.identifier || null, supplierId: session?.headers['supplier-id'] || null });
    if (route === 'session' && request.method === 'POST') {
      session = parseCurl((await requestBody(request)).curl);
      return response.status(200).json({ ok: true, identifier: session.headers.identifier || null, supplierId: session.headers['supplier-id'] || null });
    }
    if (route === 'session' && request.method === 'DELETE') {
      session = null;
      return response.status(200).json({ ok: true });
    }
    if (route === 'upload' && request.method === 'POST') return response.status(200).json(await uploadImage(await requestBody(request)));
    return response.status(404).json({ error: 'Not found' });
  } catch (error) {
    return response.status(error.status || 500).json({ error: error.message || 'Unexpected server error' });
  }
}
