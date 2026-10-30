// Characterization tests: they pin what the raw-SQL repository does, so any rewrite of
// it (new SQL, another driver) must pass them unchanged.
// Real DB (DB_NAME must end with _dev). Every write is rolled back.
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../../../../../db');
const repo = require('../../../../../modules/master/locations/locations.repository');
const processesRepo = require('../../../../../modules/master/processes/processes.repository');
const { getUniqueViolationName, getConstraintConflict } = require('../../../../../shared/sqlErrors');
const { withRollback } = require('../../../../helpers/withRollback');

const LOCATION_KEYS = ['created_at', 'id', 'is_active', 'location_code', 'location_name', 'process_id'];
// The list stays flat: process_code / process_name are top-level keys, never a nested `process` object.
const LIST_KEYS = [...LOCATION_KEYS, 'process_code', 'process_name'].sort();
const UNKNOWN_ID = 999999;

const inTx = (fn) => withRollback(db.transaction, fn);
const keysOf = (row) => Object.keys(row).sort();

const insertFixtureProcess = (txDb) =>
    processesRepo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT process', can_clear_tag: false });

const locationInput = (processId, overrides = {}) => ({
    location_code: 'zz_it_1', location_name: 'IT location', process_id: processId, is_active: true, ...overrides,
});

test('selectLocations returns flat rows with the process code and name, ordered by location_code', async () => {
    await inTx(async (txDb) => {
        const process = await insertFixtureProcess(txDb);
        // Inserted out of order, so the id order differs from the code order.
        await repo.insertLocation(txDb, locationInput(process.id, { location_code: 'zz_it_2', is_active: false }));
        await repo.insertLocation(txDb, locationInput(process.id, { location_code: 'zz_it_1' }));

        const rows = await repo.selectLocations(txDb);

        assert.ok(Array.isArray(rows));
        for (const row of rows) {
            assert.deepStrictEqual(keysOf(row), LIST_KEYS);
            assert.ok(row.created_at instanceof Date);
            assert.strictEqual(typeof row.is_active, 'boolean');
        }
        const codes = rows.map((r) => r.location_code);
        assert.ok(codes.indexOf('zz_it_1') < codes.indexOf('zz_it_2'));

        const mine = rows.find((r) => r.location_code === 'zz_it_2');
        assert.deepStrictEqual(
            { process_id: mine.process_id, process_code: mine.process_code, process_name: mine.process_name, is_active: mine.is_active },
            { process_id: process.id, process_code: 'ZZIT1', process_name: 'IT process', is_active: false });
    });
});

test('insertLocation returns the new row with exactly the location keys, created_at set by the DB', async () => {
    await inTx(async (txDb) => {
        const process = await insertFixtureProcess(txDb);

        const row = await repo.insertLocation(txDb, locationInput(process.id));

        assert.deepStrictEqual(keysOf(row), LOCATION_KEYS);
        assert.ok(Number.isInteger(row.id));
        assert.ok(row.created_at instanceof Date);
        assert.deepStrictEqual(
            { location_code: row.location_code, location_name: row.location_name, process_id: row.process_id, is_active: row.is_active },
            { location_code: 'zz_it_1', location_name: 'IT location', process_id: process.id, is_active: true });
    });
});

test('updateLocation returns the updated row and keeps created_at', async () => {
    await inTx(async (txDb) => {
        const process = await insertFixtureProcess(txDb);
        const created = await repo.insertLocation(txDb, locationInput(process.id));

        const row = await repo.updateLocation(txDb, created.id,
            locationInput(process.id, { location_code: 'zz_it_9', location_name: 'IT nine', is_active: false }));

        assert.deepStrictEqual(row, {
            id: created.id, location_code: 'zz_it_9', location_name: 'IT nine',
            process_id: process.id, is_active: false, created_at: created.created_at,
        });
    });
});

test('updateLocation with an unknown id returns null', async () => {
    await inTx(async (txDb) => {
        const process = await insertFixtureProcess(txDb);
        const row = await repo.updateLocation(txDb, UNKNOWN_ID, locationInput(process.id));
        assert.strictEqual(row, null);
    });
});

test('insertLocation with an unknown process_id rejects with a FOREIGN KEY conflict', async () => {
    await inTx(async (txDb) => {
        await assert.rejects(repo.insertLocation(txDb, locationInput(UNKNOWN_ID)), (err) => {
            assert.deepStrictEqual(getConstraintConflict(err), { kind: 'FOREIGN KEY', name: 'FK_master_location_process' });
            return true;
        });
    });
});

test('insertLocation with a duplicate location_code rejects with UQ_master_location_code', async () => {
    await inTx(async (txDb) => {
        const process = await insertFixtureProcess(txDb);
        await repo.insertLocation(txDb, locationInput(process.id));

        await assert.rejects(repo.insertLocation(txDb, locationInput(process.id, { location_name: 'IT copy' })), (err) => {
            assert.strictEqual(getUniqueViolationName(err), 'UQ_master_location_code');
            return true;
        });
    });
});
