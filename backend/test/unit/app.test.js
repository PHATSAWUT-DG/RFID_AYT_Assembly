const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createApp } = require('../../app');
const { AppError } = require('../../shared/AppError');
const { startApp } = require('../helpers/startApp');

const logged = [];
const logger = { error: (...args) => logged.push(args) };

const router = express.Router();
router.get('/ok', (req, res) => res.json({ ok: true }));
router.post('/echo', (req, res) => res.json({ body: req.body }));
router.get('/app-error', () => { throw new AppError('LOT_NOT_FOUND', 404, 'Lot not found'); });
router.get('/async-crash', async () => { throw new Error('connection string with secret'); });

let server;
before(async () => { server = await startApp(createApp({ apiRouter: router, logger })); });
after(() => server.close());

const call = (path, init) => fetch(`${server.baseUrl}${path}`, init);
const postJson = (path, raw) => call(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
});

test('the api router is mounted under /api/assembly', async () => {
    const res = await call('/api/assembly/ok');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
});

test('JSON bodies are parsed', async () => {
    const res = await postJson('/api/assembly/echo', '{"lot_no":"L1"}');
    assert.deepStrictEqual(await res.json(), { body: { lot_no: 'L1' } });
});

test('AppError thrown in a route becomes its status and JSON body', async () => {
    const res = await call('/api/assembly/app-error');
    assert.strictEqual(res.status, 404);
    const { error } = await res.json();
    assert.deepStrictEqual({ code: error.code, message: error.message }, { code: 'LOT_NOT_FOUND', message: 'Lot not found' });
    assert.strictEqual(error.request_id, res.headers.get('x-request-id'));
});

test('rejected promise in an async route becomes 500 INTERNAL with no internals', async () => {
    const res = await call('/api/assembly/async-crash');
    assert.strictEqual(res.status, 500);
    const text = await res.text();
    const { error } = JSON.parse(text);
    assert.deepStrictEqual({ code: error.code, message: error.message }, { code: 'INTERNAL', message: 'Internal server error' });
    assert.ok(error.request_id);
    assert.doesNotMatch(text, /secret/);
    assert.ok(logged.length >= 1);
});

test('every response has an X-Request-Id header (uuid when none sent)', async () => {
    const res = await call('/api/assembly/ok');
    assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
});

test('a valid inbound X-Request-Id is echoed', async () => {
    const res = await call('/api/assembly/ok', { headers: { 'X-Request-Id': 'abc-123' } });
    assert.strictEqual(res.headers.get('x-request-id'), 'abc-123');
});

test('a junk inbound X-Request-Id is replaced, never echoed', async () => {
    for (const junk of ['x'.repeat(70), 'a b']) {
        const res = await call('/api/assembly/ok', { headers: { 'X-Request-Id': junk } });
        assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    }
});

test('the 500 log line carries the request id', async () => {
    logged.length = 0;
    await call('/api/assembly/async-crash', { headers: { 'X-Request-Id': 't-1' } });
    assert.match(logged[0][0], /t-1/);
});

test('malformed JSON body becomes 400 VALIDATION_ERROR', async () => {
    const res = await postJson('/api/assembly/echo', '{"lot_no":');
    assert.strictEqual(res.status, 400);
    const { error } = await res.json();
    assert.strictEqual(error.code, 'VALIDATION_ERROR');
    assert.ok(error.request_id);
});

test('unknown /api/assembly route returns 404 ROUTE_NOT_FOUND as JSON', async () => {
    const res = await call('/api/assembly/register-tag', { method: 'POST' });
    assert.strictEqual(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const { error } = await res.json();
    assert.strictEqual(error.code, 'ROUTE_NOT_FOUND');
    assert.match(error.message, /POST \/api\/assembly\/register-tag/);
    assert.ok(error.request_id);
});
