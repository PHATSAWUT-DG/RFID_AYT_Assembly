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
    assert.deepStrictEqual(await res.json(), { error: 'LOT_NOT_FOUND', message: 'Lot not found' });
});

test('rejected promise in an async route becomes 500 INTERNAL with no internals', async () => {
    const res = await call('/api/assembly/async-crash');
    assert.strictEqual(res.status, 500);
    const text = await res.text();
    assert.deepStrictEqual(JSON.parse(text), { error: 'INTERNAL', message: 'Internal server error' });
    assert.doesNotMatch(text, /secret/);
    assert.ok(logged.length >= 1);
});

test('malformed JSON body becomes 400 VALIDATION_ERROR', async () => {
    const res = await postJson('/api/assembly/echo', '{"lot_no":');
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'VALIDATION_ERROR');
});

test('unknown /api/assembly route returns 404 ROUTE_NOT_FOUND as JSON', async () => {
    const res = await call('/api/assembly/register-tag', { method: 'POST' });
    assert.strictEqual(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const body = await res.json();
    assert.strictEqual(body.error, 'ROUTE_NOT_FOUND');
    assert.match(body.message, /POST \/api\/assembly\/register-tag/);
});
