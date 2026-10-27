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
        'selectStatuses', 'selectStatusById', 'insertStatus', 'updateStatus', 'deleteStatus',
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

const statusInput = { status_code: 'GR_F2', status_label: 'Gauging F2', seq: 5, location_id: 4 };
const registered = { id: 1, status_code: 'REGISTERED', status_label: 'Registered', seq: 1, location_id: 1 };
const cleared = { id: 4, status_code: 'CLEARED', status_label: 'Cleared', seq: 4, location_id: null };
const grF1 = { id: 2, status_code: 'GR_F1', status_label: 'Gauging F1', seq: 2, location_id: 2 };
const duplicateStatusLocation = sqlError(2601,
    "Cannot insert duplicate key row in object 'dbo.tb_master_assy_status' with unique index 'UX_master_assy_status_location'. The duplicate key value is (4).");
const duplicateStatusCode = sqlError(2627,
    "Violation of UNIQUE KEY constraint 'UQ_master_assy_status_code'. Cannot insert duplicate key in object 'dbo.tb_master_assy_status'. The duplicate key value is (GR_F2).");
const missingLocation = sqlError(547,
    'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_master_assy_status_location". The conflict occurred in database "db", table "dbo.tb_master_location", column \'id\'.');
const statusUsedByLot = sqlError(547,
    'The DELETE statement conflicted with the REFERENCE constraint "FK_assy_lot_status". The conflict occurred in database "db", table "dbo.tb_assy_lot", column \'status_id\'.');

test('listStatuses marks REGISTERED and CLEARED as system statuses', async () => {
    const { repo, calls } = fakeRepo({ selectStatuses: [registered, grF1, cleared] });
    const out = await createMasterService({ repo, db }).listStatuses();
    assert.deepStrictEqual(out.map((s) => [s.status_code, s.is_system]),
        [['REGISTERED', true], ['GR_F1', false], ['CLEARED', true]]);
    assert.deepStrictEqual(calls[0].args, [db]);
});

test('createStatus passes the fields to the repository and returns its row', async () => {
    const row = { id: 5, ...statusInput };
    const { repo, calls } = fakeRepo({ insertStatus: row });
    const out = await createMasterService({ repo, db }).createStatus(statusInput);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[0].args, [db, statusInput]);
});

test('createStatus: second status on a location -> MASTER_DUPLICATE with path location_id', async () => {
    const { repo } = fakeRepo({ insertStatus: duplicateStatusLocation });
    await assert.rejects(createMasterService({ repo, db }).createStatus(statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.details[0].path, 'location_id');
        return true;
    });
});

test('createStatus: duplicate code -> MASTER_DUPLICATE with path status_code', async () => {
    const { repo } = fakeRepo({ insertStatus: duplicateStatusCode });
    await assert.rejects(createMasterService({ repo, db }).createStatus(statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.details[0].path, 'status_code');
        return true;
    });
});

test('createStatus: unknown location -> MASTER_INVALID_REF with path location_id', async () => {
    const { repo } = fakeRepo({ insertStatus: missingLocation });
    await assert.rejects(createMasterService({ repo, db }).createStatus(statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_INVALID_REF');
        assert.strictEqual(err.httpStatus, 422);
        assert.strictEqual(err.details[0].path, 'location_id');
        return true;
    });
});

test('updateStatus: unknown id -> MASTER_NOT_FOUND, repo update not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: null });
    await assertAppError(createMasterService({ repo, db }).updateStatus(99, statusInput), 'MASTER_NOT_FOUND', 404);
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('updateStatus: system status, same code, new label -> allowed', async () => {
    const input = { status_code: 'REGISTERED', status_label: 'Registered (new)', seq: 1, location_id: 1 };
    const row = { id: 1, ...input };
    const { repo, calls } = fakeRepo({ selectStatusById: registered, updateStatus: row });
    const out = await createMasterService({ repo, db }).updateStatus(1, input);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[1], { name: 'updateStatus', args: [db, 1, input] });
});

test('updateStatus: system status, new code -> MASTER_IN_USE, repo update not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: registered });
    const input = { status_code: 'REG2', status_label: 'Registered', seq: 1, location_id: 1 };
    await assert.rejects(createMasterService({ repo, db }).updateStatus(1, input), (err) => {
        assert.strictEqual(err.code, 'MASTER_IN_USE');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.message, 'System status REGISTERED cannot change its code');
        return true;
    });
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('updateStatus: a normal status can change its code', async () => {
    const row = { id: 2, ...statusInput };
    const { repo } = fakeRepo({ selectStatusById: grF1, updateStatus: row });
    assert.strictEqual(await createMasterService({ repo, db }).updateStatus(2, statusInput), row);
});

test('updateStatus: second status on a location -> MASTER_DUPLICATE with path location_id', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, updateStatus: duplicateStatusLocation });
    await assert.rejects(createMasterService({ repo, db }).updateStatus(2, statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.details[0].path, 'location_id');
        return true;
    });
});

test('updateStatus: the row vanishes after the load -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, updateStatus: null });
    await assertAppError(createMasterService({ repo, db }).updateStatus(2, statusInput), 'MASTER_NOT_FOUND', 404);
});

test('deleteStatus: unknown id -> MASTER_NOT_FOUND, repo delete not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: null });
    await assertAppError(createMasterService({ repo, db }).deleteStatus(99), 'MASTER_NOT_FOUND', 404);
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('deleteStatus: system status -> MASTER_IN_USE, repo delete not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: cleared });
    await assert.rejects(createMasterService({ repo, db }).deleteStatus(4), (err) => {
        assert.strictEqual(err.code, 'MASTER_IN_USE');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.message, 'System status CLEARED cannot be deleted');
        return true;
    });
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('deleteStatus: used by a lot -> MASTER_IN_USE', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, deleteStatus: statusUsedByLot });
    await assertAppError(createMasterService({ repo, db }).deleteStatus(2), 'MASTER_IN_USE', 409);
});

test('deleteStatus: normal status -> resolves undefined', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: grF1, deleteStatus: 1 });
    assert.strictEqual(await createMasterService({ repo, db }).deleteStatus(2), undefined);
    assert.deepStrictEqual(calls[1], { name: 'deleteStatus', args: [db, 2] });
});

test('deleteStatus: the row vanishes after the load -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, deleteStatus: 0 });
    await assertAppError(createMasterService({ repo, db }).deleteStatus(2), 'MASTER_NOT_FOUND', 404);
});
