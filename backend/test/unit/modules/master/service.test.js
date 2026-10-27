const { test } = require('node:test');
const assert = require('node:assert');
const { createMasterService } = require('../../../../modules/master/service');

const sqlError = (number, message) => Object.assign(new Error(message), { number });

const duplicateCode = sqlError(2627,
    "Violation of UNIQUE KEY constraint 'UQ_master_process_code'. Cannot insert duplicate key in object 'dbo.tb_master_process'. The duplicate key value is (1500).");
const stillReferenced = sqlError(547,
    'The DELETE statement conflicted with the REFERENCE constraint "FK_master_location_process". The conflict occurred in database "db", table "dbo.tb_master_location", column \'process_id\'.');

const input = { process_code: '1600', process_name: 'ASSY', can_clear_tag: false };
const db = { name: 'fake-db' };

// Records every call as { name, args }; each function returns its canned result or throws it.
const fakeRepo = (results = {}) => {
    const calls = [];
    const repo = {};
    const names = [
        'selectProcesses', 'insertProcess', 'updateProcess', 'deleteProcess',
        'selectLocations', 'insertLocation', 'updateLocation',
    ];
    for (const name of names) {
        repo[name] = async (...args) => {
            calls.push({ name, args });
            const result = results[name];
            if (result instanceof Error) throw result;
            return result;
        };
    }
    return { repo, calls };
};

const assertAppError = async (promise, code, httpStatus) => {
    await assert.rejects(promise, (err) => {
        assert.strictEqual(err.code, code);
        assert.strictEqual(err.httpStatus, httpStatus);
        return true;
    });
};

test('listProcesses returns the repository rows unchanged', async () => {
    const rows = [{ id: 1, process_code: '1500', process_name: 'GAUGING', can_clear_tag: true }];
    const { repo, calls } = fakeRepo({ selectProcesses: rows });
    const out = await createMasterService({ repo, db }).listProcesses();
    assert.strictEqual(out, rows);
    assert.deepStrictEqual(calls[0].args, [db]);
});

test('createProcess passes the fields to the repository and returns its row', async () => {
    const row = { id: 2, ...input };
    const { repo, calls } = fakeRepo({ insertProcess: row });
    const out = await createMasterService({ repo, db }).createProcess(input);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[0].args, [db, input]);
});

test('createProcess: duplicate code -> MASTER_DUPLICATE with the field path', async () => {
    const { repo } = fakeRepo({ insertProcess: duplicateCode });
    const promise = createMasterService({ repo, db }).createProcess(input);
    await assert.rejects(promise, (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.details[0].path, 'process_code');
        assert.strictEqual(err.details[0].in, 'body');
        return true;
    });
});

test('createProcess: unknown error is rethrown unchanged', async () => {
    const boom = new Error('boom');
    const { repo } = fakeRepo({ insertProcess: boom });
    await assert.rejects(createMasterService({ repo, db }).createProcess(input), (err) => err === boom);
});

test('updateProcess: no row -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ updateProcess: null });
    await assertAppError(createMasterService({ repo, db }).updateProcess(9, input), 'MASTER_NOT_FOUND', 404);
});

test('updateProcess returns the updated row', async () => {
    const row = { id: 9, ...input };
    const { repo, calls } = fakeRepo({ updateProcess: row });
    const out = await createMasterService({ repo, db }).updateProcess(9, input);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[0].args, [db, 9, input]);
});

test('deleteProcess: no row -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ deleteProcess: 0 });
    await assertAppError(createMasterService({ repo, db }).deleteProcess(9), 'MASTER_NOT_FOUND', 404);
});

test('deleteProcess: one row -> resolves undefined', async () => {
    const { repo } = fakeRepo({ deleteProcess: 1 });
    assert.strictEqual(await createMasterService({ repo, db }).deleteProcess(9), undefined);
});

test('deleteProcess: still referenced -> MASTER_IN_USE', async () => {
    const { repo } = fakeRepo({ deleteProcess: stillReferenced });
    await assertAppError(createMasterService({ repo, db }).deleteProcess(1), 'MASTER_IN_USE', 409);
});

const locationInput = { location_code: 'gr_f2', location_name: 'Gauging F2', process_id: 1, is_active: true };
const duplicateLocationCode = sqlError(2627,
    "Violation of UNIQUE KEY constraint 'UQ_master_location_code'. Cannot insert duplicate key in object 'dbo.tb_master_location'. The duplicate key value is (gr_f2).");
const missingProcess = sqlError(547,
    'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_master_location_process". The conflict occurred in database "db", table "dbo.tb_master_process", column \'id\'.');

test('listLocations returns the repository rows unchanged', async () => {
    const rows = [{ id: 1, location_code: 'gr_f1', process_code: '1500' }];
    const { repo, calls } = fakeRepo({ selectLocations: rows });
    const out = await createMasterService({ repo, db }).listLocations();
    assert.strictEqual(out, rows);
    assert.deepStrictEqual(calls[0].args, [db]);
});

test('createLocation passes the fields to the repository and returns its row', async () => {
    const row = { id: 5, ...locationInput };
    const { repo, calls } = fakeRepo({ insertLocation: row });
    const out = await createMasterService({ repo, db }).createLocation(locationInput);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[0].args, [db, locationInput]);
});

test('createLocation: duplicate code -> MASTER_DUPLICATE with path location_code', async () => {
    const { repo } = fakeRepo({ insertLocation: duplicateLocationCode });
    await assert.rejects(createMasterService({ repo, db }).createLocation(locationInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.details[0].path, 'location_code');
        return true;
    });
});

test('createLocation: unknown process -> MASTER_INVALID_REF with path process_id', async () => {
    const { repo } = fakeRepo({ insertLocation: missingProcess });
    await assert.rejects(createMasterService({ repo, db }).createLocation(locationInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_INVALID_REF');
        assert.strictEqual(err.httpStatus, 422);
        assert.strictEqual(err.details[0].path, 'process_id');
        return true;
    });
});

test('updateLocation: unknown process -> MASTER_INVALID_REF', async () => {
    const { repo } = fakeRepo({ updateLocation: missingProcess });
    await assertAppError(createMasterService({ repo, db }).updateLocation(5, locationInput), 'MASTER_INVALID_REF', 422);
});

test('updateLocation: no row -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ updateLocation: null });
    await assertAppError(createMasterService({ repo, db }).updateLocation(9, locationInput), 'MASTER_NOT_FOUND', 404);
});

test('updateLocation returns the updated row', async () => {
    const row = { id: 5, ...locationInput, is_active: false };
    const { repo, calls } = fakeRepo({ updateLocation: row });
    const out = await createMasterService({ repo, db }).updateLocation(5, { ...locationInput, is_active: false });
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[0].args, [db, 5, { ...locationInput, is_active: false }]);
});
