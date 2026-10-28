const { test } = require('node:test');
const assert = require('node:assert');
const { createStatusesService } = require('../../../../../modules/master/statuses/statuses.service');

const sqlError = (number, message) => Object.assign(new Error(message), { number });

const db = { name: 'fake-db' };

// Records every call as { name, args }; each function returns its canned result or throws it.
const fakeRepo = (results = {}) => {
    const calls = [];
    const repo = {};
    const names = ['selectStatuses', 'selectStatusById', 'insertStatus', 'updateStatus', 'deleteStatus'];
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
    const out = await createStatusesService({ repo, db }).listStatuses();
    assert.deepStrictEqual(out.map((s) => [s.status_code, s.is_system]),
        [['REGISTERED', true], ['GR_F1', false], ['CLEARED', true]]);
    assert.deepStrictEqual(calls[0].args, [db]);
});

test('createStatus passes the fields to the repository and returns its row', async () => {
    const row = { id: 5, ...statusInput };
    const { repo, calls } = fakeRepo({ insertStatus: row });
    const out = await createStatusesService({ repo, db }).createStatus(statusInput);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[0].args, [db, statusInput]);
});

test('createStatus: second status on a location -> MASTER_DUPLICATE with path location_id', async () => {
    const { repo } = fakeRepo({ insertStatus: duplicateStatusLocation });
    await assert.rejects(createStatusesService({ repo, db }).createStatus(statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.details[0].path, 'location_id');
        return true;
    });
});

test('createStatus: duplicate code -> MASTER_DUPLICATE with path status_code', async () => {
    const { repo } = fakeRepo({ insertStatus: duplicateStatusCode });
    await assert.rejects(createStatusesService({ repo, db }).createStatus(statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.details[0].path, 'status_code');
        return true;
    });
});

test('createStatus: unknown location -> MASTER_INVALID_REF with path location_id', async () => {
    const { repo } = fakeRepo({ insertStatus: missingLocation });
    await assert.rejects(createStatusesService({ repo, db }).createStatus(statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_INVALID_REF');
        assert.strictEqual(err.httpStatus, 422);
        assert.strictEqual(err.details[0].path, 'location_id');
        return true;
    });
});

test('updateStatus: unknown id -> MASTER_NOT_FOUND, repo update not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: null });
    await assertAppError(createStatusesService({ repo, db }).updateStatus(99, statusInput), 'MASTER_NOT_FOUND', 404);
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('updateStatus: system status, same code, new label -> allowed', async () => {
    const input = { status_code: 'REGISTERED', status_label: 'Registered (new)', seq: 1, location_id: 1 };
    const row = { id: 1, ...input };
    const { repo, calls } = fakeRepo({ selectStatusById: registered, updateStatus: row });
    const out = await createStatusesService({ repo, db }).updateStatus(1, input);
    assert.strictEqual(out, row);
    assert.deepStrictEqual(calls[1], { name: 'updateStatus', args: [db, 1, input] });
});

test('updateStatus: system status, new code -> MASTER_SYSTEM_LOCKED, repo update not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: registered });
    const input = { status_code: 'REG2', status_label: 'Registered', seq: 1, location_id: 1 };
    await assert.rejects(createStatusesService({ repo, db }).updateStatus(1, input), (err) => {
        assert.strictEqual(err.code, 'MASTER_SYSTEM_LOCKED');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.message, 'System status REGISTERED cannot change its code');
        return true;
    });
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('updateStatus: a normal status can change its code', async () => {
    const row = { id: 2, ...statusInput };
    const { repo } = fakeRepo({ selectStatusById: grF1, updateStatus: row });
    assert.strictEqual(await createStatusesService({ repo, db }).updateStatus(2, statusInput), row);
});

test('updateStatus: second status on a location -> MASTER_DUPLICATE with path location_id', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, updateStatus: duplicateStatusLocation });
    await assert.rejects(createStatusesService({ repo, db }).updateStatus(2, statusInput), (err) => {
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.details[0].path, 'location_id');
        return true;
    });
});

test('updateStatus: the row vanishes after the load -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, updateStatus: null });
    await assertAppError(createStatusesService({ repo, db }).updateStatus(2, statusInput), 'MASTER_NOT_FOUND', 404);
});

test('deleteStatus: unknown id -> MASTER_NOT_FOUND, repo delete not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: null });
    await assertAppError(createStatusesService({ repo, db }).deleteStatus(99), 'MASTER_NOT_FOUND', 404);
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('deleteStatus: system status -> MASTER_SYSTEM_LOCKED, repo delete not called', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: cleared });
    await assert.rejects(createStatusesService({ repo, db }).deleteStatus(4), (err) => {
        assert.strictEqual(err.code, 'MASTER_SYSTEM_LOCKED');
        assert.strictEqual(err.httpStatus, 409);
        assert.strictEqual(err.message, 'System status CLEARED cannot be deleted');
        return true;
    });
    assert.deepStrictEqual(calls.map((c) => c.name), ['selectStatusById']);
});

test('deleteStatus: used by a lot -> MASTER_IN_USE', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, deleteStatus: statusUsedByLot });
    await assertAppError(createStatusesService({ repo, db }).deleteStatus(2), 'MASTER_IN_USE', 409);
});

test('deleteStatus: normal status -> resolves undefined', async () => {
    const { repo, calls } = fakeRepo({ selectStatusById: grF1, deleteStatus: 1 });
    assert.strictEqual(await createStatusesService({ repo, db }).deleteStatus(2), undefined);
    assert.deepStrictEqual(calls[1], { name: 'deleteStatus', args: [db, 2] });
});

test('deleteStatus: the row vanishes after the load -> MASTER_NOT_FOUND', async () => {
    const { repo } = fakeRepo({ selectStatusById: grF1, deleteStatus: 0 });
    await assertAppError(createStatusesService({ repo, db }).deleteStatus(2), 'MASTER_NOT_FOUND', 404);
});
