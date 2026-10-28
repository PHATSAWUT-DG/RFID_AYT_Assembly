const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../../../../../app');
const { AppError } = require('../../../../../shared/AppError');
const { createProcessesController } = require('../../../../../modules/master/processes/processes.controller');
const { createProcessesRoutes } = require('../../../../../modules/master/processes/processes.routes');
const { startApp } = require('../../../../helpers/startApp');

const processRow = { id: 7, process_code: '1600', process_name: 'ASSY', can_clear_tag: false };

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
};

let server;
before(async () => {
    const apiRouter = createProcessesRoutes({ controller: createProcessesController({ service }) });
    server = await startApp(createApp({ apiRouter, logger: { error() {}, info() {} } }));
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
    assert.deepStrictEqual(await res.json(), { data: [processRow] });
});

test('POST /processes trims the code and defaults can_clear_tag to false', async () => {
    const res = await call('POST', '/processes', { process_code: ' 1600 ', process_name: 'ASSY' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await res.json(), { data: processRow });
    assert.deepStrictEqual(calls[0].args, [{ process_code: '1600', process_name: 'ASSY', can_clear_tag: false }]);
});

test('POST /processes with an empty body -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('POST', '/processes', {});
    assert.strictEqual(res.status, 400);
    const body = (await res.json()).error;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path).sort(), ['process_code', 'process_name']);
    assert.strictEqual(calls.length, 0);
});

test('PUT /processes/:id with a bad id -> 400 VALIDATION_ERROR', async () => {
    for (const id of ['abc', '0', '1.5']) {
        const res = await call('PUT', `/processes/${id}`, { process_code: '1600', process_name: 'ASSY' });
        assert.strictEqual(res.status, 400, `id ${id}`);
        assert.strictEqual((await res.json()).error.code, 'VALIDATION_ERROR');
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
    assert.deepStrictEqual(await res.json(), { data: processRow });
    assert.deepStrictEqual(calls[0].args, [7, { process_code: '1600', process_name: 'ASSY', can_clear_tag: true }]);
});

test('PUT /processes/7 without can_clear_tag -> 400 VALIDATION_ERROR, service not called', async () => {
    const res = await call('PUT', '/processes/7', { process_code: '1600', process_name: 'ASSY' });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()).error;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.deepStrictEqual(body.details.map((d) => d.path), ['can_clear_tag']);
    assert.strictEqual(calls.length, 0);
});

test('DELETE /processes/7 -> 204 with an empty body', async () => {
    const res = await call('DELETE', '/processes/7');
    assert.strictEqual(res.status, 204);
    assert.strictEqual(await res.text(), '');
    assert.deepStrictEqual(calls[0].args, [7]);
});

test('an AppError from the service becomes its status and JSON body', async () => {
    nextError = new AppError('MASTER_IN_USE', 409, 'x');
    const res = await call('DELETE', '/processes/7');
    assert.strictEqual(res.status, 409);
    const { error } = await res.json();
    assert.deepStrictEqual({ code: error.code, message: error.message }, { code: 'MASTER_IN_USE', message: 'x' });
    assert.ok(error.request_id);
});
