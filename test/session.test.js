const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCurl } = require('../server');

const sampleCurl = String.raw`curl 'https://supplier.meesho.com/api/cataloging/imageBulkUpload/uploadSingleCatalogImages' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'browser-id: test-browser-id' \
  -H 'client-package-version: 1.0.1' \
  -H 'client-type: d-web' \
  -H 'content-type: multipart/form-data; boundary=----CopiedBoundary' \
  -b 'connect.sid=test-session; bm_s=test-akamai-cookie' \
  -H 'identifier: test-supplier' \
  -H 'origin: https://supplier.meesho.com' \
  -H 'referer: https://supplier.meesho.com/panel/v3/new/cataloging/test-supplier/images-bulk-upload' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'supplier-id: 123456' \
  -H 'user-agent: Test Browser' \
  --data-raw $'------CopiedBoundary\r\nContent-Disposition: form-data; name="file"; filename="test.jpg"\r\n\r\n------CopiedBoundary--\r\n'`;

test('parses a copied Meesho cURL (bash) session', () => {
  const session = parseCurl(sampleCurl);
  assert.equal(session.url, 'https://supplier.meesho.com/api/cataloging/imageBulkUpload/uploadSingleCatalogImages');
  assert.equal(session.headers.identifier, 'test-supplier');
  assert.equal(session.headers['supplier-id'], '123456');
  assert.equal(session.headers.origin, 'https://supplier.meesho.com');
  assert.equal(session.headers['sec-fetch-site'], 'same-origin');
  assert.match(session.headers.cookie, /connect\.sid=test-session/);
  assert.equal(session.headers['content-type'], undefined);
});

test('normalizes the supported endpoint to HTTPS', () => {
  const session = parseCurl("curl http://supplier.meesho.com/api/cataloging/imageBulkUpload/uploadSingleCatalogImages -b 'test=value'");
  assert.match(session.url, /^https:\/\//);
});
