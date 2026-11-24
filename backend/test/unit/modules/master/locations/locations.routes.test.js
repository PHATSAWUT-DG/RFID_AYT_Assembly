const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../../../../../app');
const { createLocationsController } = require('../../../../../modules/master/locations/locations.controller');
const { createLocationsRoutes } = require('../../../../../modules/master/locations/locations.routes');
const { startApp } = require('../../../../helpers/startApp');

const locationRow = {
    id: 5, location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1, is_active: true,
};

let calls;
const record = (name, result) => async (...args) => {
    calls.push({ name, args });
    return result;
};
const service = {
    listLocations: record('listLocations', [locationRow]),
    createLocation: record('createLocation', locationRow),
    updateLocation: record('updateLocation', locationRow),
};

let server;
before(async () => {
    const apiRouter = createLocationsRoutes({ controller: createLocationsController({ service }) });
    server = await startApp(createApp({ apiRouter, logger: { error() {}, info() {} } }));
});
after(() => server.close());
beforeEach(() => { calls = []; });

const call = (method, path, body) => fetch(`${server.baseUrl}/api/assembly${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

test('GET /locations -> 200 with the service rows', async () => {
    const res = await call('GET', '/locations');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { data: [locationRow] });
});

test('POST /locations trims the code and keeps its case', async () => {
    const res = await call('POST', '/locations', { location_code: ' GR_F2 ', location_name: 'Gauging F2', process_id: 1, is_active: true });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await res.json(), { data: locationRow });
    assert.deepStrictEqual(calls[0].args, [{
        location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1, is_active: true,
    }]);
});

test('POST /locations without is_active -> 400 VALIDATION_ERROR (no default), service not called', async () => {
    const res = await call('POST', '/locations', { location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1 });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()).error;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path), ['is_active']);
    assert.strictEqual(calls.length, 0);
});

test('POST /locations without process_id -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('POST', '/locations', { location_code: 'GR_F2', location_name: 'Gauging F2', is_active: true });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()).error;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path), ['process_id']);
    assert.strictEqual(calls.length, 0);
});

test('PUT /locations/5 deactivates a location; the service gets a numeric id', async () => {
    const body = { location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1, is_active: false };
    const res = await call('PUT', '/locations/5', body);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(calls[0].args, [5, body]);
});

test('PUT /locations/5 without is_active -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('PUT', '/locations/5', { location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1 });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()).error;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path), ['is_active']);
    assert.strictEqual(calls.length, 0);
});

test('PUT /locations/abc -> 400 VALIDATION_ERROR', async () => {
    const res = await call('PUT', '/locations/abc', { location_code: 'x', location_name: 'x', process_id: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(calls.length, 0);
});

test('DELETE /locations/1 -> 404 ROUTE_NOT_FOUND (locations are deactivated, not deleted)', async () => {
    const res = await call('DELETE', '/locations/1');
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error.code, 'ROUTE_NOT_FOUND');
});
