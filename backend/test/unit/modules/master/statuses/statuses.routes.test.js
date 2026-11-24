const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../../../../../app');
const { createStatusesController } = require('../../../../../modules/master/statuses/statuses.controller');
const { createStatusesRoutes } = require('../../../../../modules/master/statuses/statuses.routes');
const { startApp } = require('../../../../helpers/startApp');

const statusRow = {
    id: 5, status_code: 'GR_F2', status_label: 'Gauging F2', seq: 5, location_id: 3, is_system: false,
};
const statusBody = { status_code: 'GR_F2', status_label: 'Gauging F2', seq: 5, location_id: 3 };

let calls;
const record = (name, result) => async (...args) => {
    calls.push({ name, args });
    return result;
};
const service = {
    listStatuses: record('listStatuses', [statusRow]),
    createStatus: record('createStatus', statusRow),
    updateStatus: record('updateStatus', statusRow),
    deleteStatus: record('deleteStatus', undefined),
};

let server;
before(async () => {
    const apiRouter = createStatusesRoutes({ controller: createStatusesController({ service }) });
    server = await startApp(createApp({ apiRouter, logger: { error() {}, info() {} } }));
});
after(() => server.close());
beforeEach(() => { calls = []; });

const call = (method, path, body) => fetch(`${server.baseUrl}/api/assembly${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

test('GET /statuses -> 200 with the service rows', async () => {
    const res = await call('GET', '/statuses');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { data: [statusRow] });
});

test('POST /statuses trims and upper-cases the code -> 201', async () => {
    const res = await call('POST', '/statuses', { ...statusBody, status_code: ' gr_f2 ' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await res.json(), { data: statusRow });
    assert.deepStrictEqual(calls[0].args, [statusBody]);
});

test('POST /statuses with CLEARED and a location -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('POST', '/statuses', { ...statusBody, status_code: 'CLEARED', location_id: 3 });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()).error;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details, [{ in: 'body', path: 'location_id', message: 'CLEARED must have no location' }]);
    assert.strictEqual(calls.length, 0);
});

test('POST /statuses with CLEARED and no location -> 201', async () => {
    const res = await call('POST', '/statuses', { ...statusBody, status_code: 'CLEARED', location_id: null });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(calls[0].args[0].location_id, null);
});

test('POST /statuses without a location on a normal code -> 400 VALIDATION_ERROR', async () => {
    const res = await call('POST', '/statuses', { ...statusBody, location_id: null });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(calls.length, 0);
});

test('PUT /statuses/5 -> 200; the service gets a numeric id', async () => {
    const res = await call('PUT', '/statuses/5', statusBody);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(calls[0].args, [5, statusBody]);
});

test('PUT /statuses/abc -> 400 VALIDATION_ERROR', async () => {
    const res = await call('PUT', '/statuses/abc', statusBody);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(calls.length, 0);
});

test('DELETE /statuses/4 -> 204 with an empty body', async () => {
    const res = await call('DELETE', '/statuses/4');
    assert.strictEqual(res.status, 204);
    assert.strictEqual(await res.text(), '');
    assert.deepStrictEqual(calls[0].args, [4]);
});
