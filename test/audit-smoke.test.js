import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAuditOrigin,
  runAuditSmoke,
} from '../scripts/audit-smoke.mjs';

function jsonResponse(value, options = {}) {
  return new Response(JSON.stringify(value), {
    status: options.status || 200,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

test('audit smoke accepts only an exact HTTPS deployment origin', () => {
  assert.equal(
    normalizeAuditOrigin('https://01rx.vercel.app/'),
    'https://01rx.vercel.app',
  );
  assert.throws(() => normalizeAuditOrigin('http://01rx.vercel.app'), /HTTPS origin/);
  assert.throws(() => normalizeAuditOrigin('https://user@example.com'), /without credentials/);
  assert.throws(() => normalizeAuditOrigin('https://example.com/path'), /without credentials or a path/);
});

test('audit smoke is GET-only and records a passing deployment boundary', async () => {
  const requests = [];
  const headers = {
    'content-security-policy': "base-uri 'self'; object-src 'none'",
    'permissions-policy': 'camera=(), geolocation=(), microphone=()',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-permitted-cross-domain-policies': 'none',
  };
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (url.pathname === '/') {
      return new Response('<!doctype html>', { status: 200, headers });
    }
    if (url.pathname === '/api/current-nav') {
      return jsonResponse({
        ok: true,
        data: { source: { provider: '01Resolved' }, tokens: [{ token: 'solo' }] },
      }, { headers: { 'x-01r-contract': 'core.current-nav.v1' } });
    }
    if (url.pathname === '/api/v1/futarchy') {
      return jsonResponse({ ok: true, data: { markets: [] } }, {
        headers: { 'x-01r-contract': 'futarchy.markets.v1' },
      });
    }
    if (url.pathname === '/api/historic-nav') {
      return jsonResponse({
        ok: false,
        code: 'DATA_NOT_AVAILABLE_FROM_01RESOLVED',
        missingPath: '/api/historic-nav',
      }, { status: 503 });
    }
    if (url.pathname === '/api/beta/trading') {
      return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, {
        status: 405,
        headers: {
          allow: 'POST, OPTIONS',
          'x-01r-execution': 'paused',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  let tick = 0;
  const evidence = await runAuditSmoke({
    origin: 'https://01rx.vercel.app',
    fetchImpl,
    now: () => `2026-08-04T12:00:0${tick++}.000Z`,
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.mode, 'read-only-get-only');
  assert.equal(requests.length, 5);
  assert.equal(requests.every(request => request.options.method === 'GET'), true);
  assert.equal(requests.every(request => request.options.body == null), true);
  assert.equal(requests.every(request => request.options.redirect === 'manual'), true);
  assert.equal(evidence.responses.some(response => response.json?.tokens), false);
  assert.equal(evidence.checks.every(item => item.ok), true);
});

test('audit smoke fails when the deployed execution boundary reports enabled', async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === '/') {
      return new Response('', {
        status: 200,
        headers: {
          'content-security-policy': "base-uri 'self'; object-src 'none'",
          'permissions-policy': 'camera=(), geolocation=(), microphone=()',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    if (url.pathname === '/api/current-nav') {
      return jsonResponse({ ok: true, data: { source: { provider: '01Resolved' } } }, {
        headers: { 'x-01r-contract': 'core.current-nav.v1' },
      });
    }
    if (url.pathname === '/api/v1/futarchy') {
      return jsonResponse({ ok: true, data: { markets: [] } }, {
        headers: { 'x-01r-contract': 'futarchy.markets.v1' },
      });
    }
    if (url.pathname === '/api/historic-nav') {
      return jsonResponse({
        code: 'DATA_NOT_AVAILABLE_FROM_01RESOLVED',
        missingPath: '/api/historic-nav',
      }, { status: 503 });
    }
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED' }, {
      status: 405,
      headers: { allow: 'POST, OPTIONS', 'x-01r-execution': 'enabled' },
    });
  };

  const evidence = await runAuditSmoke({
    origin: 'https://01rx.vercel.app',
    fetchImpl,
  });
  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.checks.find(item => item.id === 'execution-paused').ok,
    false,
  );
});
