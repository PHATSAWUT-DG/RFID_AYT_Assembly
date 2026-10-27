const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../../../../app');
const { AppError } = require('../../../../shared/AppError');
const { createMasterController } = require('../../../../modules/master/controller');
const { createMasterRoutes } = require('../../../../modules/master/routes');
const { startApp } = require('../../../helpers/startApp');

const processRow = { id: 7, process_code: '1600', process_name: 'ASSY', can_clear_tag: false };
const locationRow = {
    id: 5, location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1, is_active: true,
};
const statusRow = {
    id: 5, status_code: 'GR_F2', status_label: 'Gauging F2', seq: 5, location_id: 3, is_system: false,
};
const statusBody = { status_code: 'GR_F2', status_label: 'Gauging F2', seq: 5, location_id: 3 };

let calls;
let nextError;
// Records every call; throws nextError once if set.
const record = (name, result) => async (...args) => {
    calls.push({ name, args });
    if (nextError) {
        const err = nextError;
        nextError = null;
        throw err;
    }
    return result;
};
const service = {
    listProcesses: record('listProcesses', [processRow]),
    createProcess: record('createProcess', processRow),
    updateProcess: record('updateProcess', processRow),
    deleteProcess: record('deleteProcess', undefined),
    listLocations: record('listLocations', [locationRow]),
    createLocation: record('createLocation', locationRow),
    updateLocation: record('updateLocation', locationRow),
    listStatuses: record('listStatuses', [statusRow]),
    createStatus: record('createStatus', statusRow),
    updateStatus: record('updateStatus', statusRow),
    deleteStatus: record('deleteStatus', undefined),
};

let server;
before(async () => {
    const apiRouter = createMasterRoutes({ controller: createMasterController({ service }) });
    server = await startApp(createApp({ apiRouter, logger: { error() {} } }));
});
after(() => server.close());
beforeEach(() => { calls = []; nextError = null; });

const call = (method, path, body) => fetch(`${server.baseUrl}/api/assembly${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

test('GET /processes -> 200 with the service rows', async () => {
    const res = await call('GET', '/processes');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), [processRow]);
});

test('POST /processes trims the code and defaults can_clear_tag to false', async () => {
    const res = await call('POST', '/processes', { process_code: ' 1600 ', process_name: 'ASSY' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await res.json(), processRow);
    assert.deepStrictEqual(calls[0].args, [{ process_code: '1600', process_name: 'ASSY', can_clear_tag: false }]);
});

test('POST /processes with an empty body -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('POST', '/processes', {});
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path).sort(), ['process_code', 'process_name']);
    assert.strictEqual(calls.length, 0);
});

test('PUT /processes/:id with a bad id -> 400 VALIDATION_ERROR', async () => {
    for (const id of ['abc', '0', '1.5']) {
        const res = await call('PUT', `/processes/${id}`, { process_code: '1600', process_name: 'ASSY' });
        assert.strictEqual(res.status, 400, `id ${id}`);
        assert.strictEqual((await res.json()).error, 'VALIDATION_ERROR');
    }
    assert.strictEqual(calls.length, 0);
});

test('DELETE /processes/:id with a bad id -> 400 VALIDATION_ERROR', async () => {
    const res = await call('DELETE', '/processes/abc');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(calls.length, 0);
});

test('PUT /processes/7 -> 200; the service gets a numeric id', async () => {
    const res = await call('PUT', '/processes/7', { process_code: '1600', process_name: 'ASSY', can_clear_tag: true });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), processRow);
    assert.deepStrictEqual(calls[0].args, [7, { process_code: '1600', process_name: 'ASSY', can_clear_tag: true }]);
});

test('DELETE /processes/7 -> 204 with an empty body', async () => {
    const res = await call('DELETE', '/processes/7');
    assert.strictEqual(res.status, 204);
    assert.strictEqual(await res.text(), '');
    assert.deepStrictEqual(calls[0].args, [7]);
});

test('GET /locations -> 200 with the service rows', async () => {
    const res = await call('GET', '/locations');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), [locationRow]);
});

test('POST /locations trims the code, keeps its case, and defaults is_active to true', async () => {
    const res = await call('POST', '/locations', { location_code: ' GR_F2 ', location_name: 'Gauging F2', process_id: 1 });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await res.json(), locationRow);
    assert.deepStrictEqual(calls[0].args, [{
        location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1, is_active: true,
    }]);
});

test('POST /locations without process_id -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('POST', '/locations', { location_code: 'GR_F2', location_name: 'Gauging F2' });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path), ['process_id']);
    assert.strictEqual(calls.length, 0);
});

test('PUT /locations/5 deactivates a location; the service gets a numeric id', async () => {
    const body = { location_code: 'GR_F2', location_name: 'Gauging F2', process_id: 1, is_active: false };
    const res = await call('PUT', '/locations/5', body);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(calls[0].args, [5, body]);
});

test('PUT /locations/abc -> 400 VALIDATION_ERROR', async () => {
    const res = await call('PUT', '/locations/abc', { location_code: 'x', location_name: 'x', process_id: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(calls.length, 0);
});

test('DELETE /locations/1 -> 404 ROUTE_NOT_FOUND (locations are deactivated, not deleted)', async () => {
    const res = await call('DELETE', '/locations/1');
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error, 'ROUTE_NOT_FOUND');
});

test('GET /statuses -> 200 with the service rows', async () => {
    const res = await call('GET', '/statuses');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), [statusRow]);
});

test('POST /statuses trims and upper-cases the code -> 201', async () => {
    const res = await call('POST', '/statuses', { ...statusBody, status_code: ' gr_f2 ' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await res.json(), statusRow);
    assert.deepStrictEqual(calls[0].args, [statusBody]);
});

test('POST /statuses with CLEARED and a location -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('POST', '/statuses', { ...statusBody, status_code: 'CLEARED', location_id: 3 });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'VALIDATION_ERROR');
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

test('an AppError from the service becomes its status and JSON body', async () => {
    nextError = new AppError('MASTER_IN_USE', 409, 'x');
    const res = await call('DELETE', '/processes/7');
    assert.strictEqual(res.status, 409);
    assert.deepStrictEqual(await res.json(), { error: 'MASTER_IN_USE', message: 'x' });
});
