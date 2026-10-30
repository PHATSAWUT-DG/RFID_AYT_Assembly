// Characterization tests: they pin what the raw-SQL repository does, so any rewrite of
// it (new SQL, another driver) must pass them unchanged.
// Real DB (DB_NAME must end with _dev). Every write is rolled back.
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../../../../../db');
const repo = require('../../../../../modules/master/statuses/statuses.repository');
const processesRepo = require('../../../../../modules/master/processes/processes.repository');
const locationsRepo = require('../../../../../modules/master/locations/locations.repository');
const { getUniqueViolationName, getConstraintConflict } = require('../../../../../shared/sqlErrors');
const { withRollback } = require('../../../../helpers/withRollback');

const STATUS_KEYS = ['id', 'location_id', 'seq', 'status_code', 'status_label'];
// The list stays flat: the location and process columns are top-level keys.
const LIST_KEYS = [...STATUS_KEYS, 'location_code', 'location_name', 'process_code', 'process_id'].sort();
const UNKNOWN_ID = 999999;

const inTx = (fn) => withRollback(db.transaction, fn);
const keysOf = (row) => Object.keys(row).sort();

// A new process with new locations that have no status yet (the seed locations all have one).
const insertFixtureLocations = async (txDb, count = 1) => {
    const process = await processesRepo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT process', can_clear_tag: false });
    const locations = [];
    for (let i = 1; i <= count; i += 1) {
        locations.push(await locationsRepo.insertLocation(txDb, {
            location_code: `zz_it_${i}`, location_name: `IT location ${i}`, process_id: process.id, is_active: true,
        }));
    }
    return { process, locations };
};

const statusInput = (locationId, overrides = {}) => ({
    status_code: 'ZZ_IT_1', status_label: 'IT status', seq: 90, location_id: locationId, ...overrides,
});

test('selectStatuses returns flat rows with the location and process columns, ordered by seq then id', async () => {
    await inTx(async (txDb) => {
        const { process, locations: [first, second] } = await insertFixtureLocations(txDb, 2);
        // Same seq: the tie is broken by id, so ZZ_IT_B (inserted first) comes before ZZ_IT_A.
        await repo.insertStatus(txDb, statusInput(first.id, { status_code: 'ZZ_IT_B', seq: 91 }));
        await repo.insertStatus(txDb, statusInput(second.id, { status_code: 'ZZ_IT_A', seq: 91 }));

        const rows = await repo.selectStatuses(txDb);

        assert.ok(Array.isArray(rows));
        for (const row of rows) {
            assert.deepStrictEqual(keysOf(row), LIST_KEYS);
        }
        const codes = rows.map((r) => r.status_code);
        assert.ok(codes.indexOf('ZZ_IT_B') < codes.indexOf('ZZ_IT_A'));

        const mine = rows.find((r) => r.status_code === 'ZZ_IT_B');
        assert.deepStrictEqual(
            { location_id: mine.location_id, location_code: mine.location_code, location_name: mine.location_name, process_id: mine.process_id, process_code: mine.process_code },
            { location_id: first.id, location_code: 'zz_it_1', location_name: 'IT location 1', process_id: process.id, process_code: 'ZZIT1' });

        // The seeded CLEARED status has no location, so the LEFT joins give nulls, not a missing row.
        const cleared = rows.find((r) => r.status_code === 'CLEARED');
        if (cleared) {
            assert.deepStrictEqual(
                { location_id: cleared.location_id, location_code: cleared.location_code, process_code: cleared.process_code },
                { location_id: null, location_code: null, process_code: null });
        }
    });
});

test('insertStatus returns the new row with exactly the status keys', async () => {
    await inTx(async (txDb) => {
        const { locations: [location] } = await insertFixtureLocations(txDb);

        const row = await repo.insertStatus(txDb, statusInput(location.id));

        assert.deepStrictEqual(keysOf(row), STATUS_KEYS);
        assert.ok(Number.isInteger(row.id));
        assert.deepStrictEqual(
            { status_code: row.status_code, status_label: row.status_label, seq: row.seq, location_id: row.location_id },
            { status_code: 'ZZ_IT_1', status_label: 'IT status', seq: 90, location_id: location.id });
    });
});

test('selectStatusById returns the row with exactly the status keys', async () => {
    await inTx(async (txDb) => {
        const { locations: [location] } = await insertFixtureLocations(txDb);
        const created = await repo.insertStatus(txDb, statusInput(location.id));

        const row = await repo.selectStatusById(txDb, created.id);

        assert.deepStrictEqual(row, created);
    });
});

test('selectStatusById with an unknown id returns null', async () => {
    await inTx(async (txDb) => {
        assert.strictEqual(await repo.selectStatusById(txDb, UNKNOWN_ID), null);
    });
});

test('updateStatus returns the updated row; with an unknown id it returns null', async () => {
    await inTx(async (txDb) => {
        const { locations: [first, second] } = await insertFixtureLocations(txDb, 2);
        const created = await repo.insertStatus(txDb, statusInput(first.id));

        const row = await repo.updateStatus(txDb, created.id,
            statusInput(second.id, { status_code: 'ZZ_IT_9', status_label: 'IT nine', seq: 99 }));

        assert.deepStrictEqual(row, { id: created.id, status_code: 'ZZ_IT_9', status_label: 'IT nine', seq: 99, location_id: second.id });
        assert.strictEqual(await repo.updateStatus(txDb, UNKNOWN_ID, statusInput(first.id)), null);
    });
});

test('deleteStatus returns the affected row count: 1 for a known id, 0 for an unknown id', async () => {
    await inTx(async (txDb) => {
        const { locations: [location] } = await insertFixtureLocations(txDb);
        const created = await repo.insertStatus(txDb, statusInput(location.id));

        assert.strictEqual(await repo.deleteStatus(txDb, created.id), 1);
        assert.strictEqual(await repo.deleteStatus(txDb, UNKNOWN_ID), 0);
    });
});

test('a second status on the same location rejects with UX_master_assy_status_location', async () => {
    await inTx(async (txDb) => {
        const { locations: [location] } = await insertFixtureLocations(txDb);
        await repo.insertStatus(txDb, statusInput(location.id));

        await assert.rejects(repo.insertStatus(txDb, statusInput(location.id, { status_code: 'ZZ_IT_2' })), (err) => {
            assert.strictEqual(getUniqueViolationName(err), 'UX_master_assy_status_location');
            return true;
        });
    });
});

test('insertStatus with a duplicate status_code rejects with UQ_master_assy_status_code', async () => {
    await inTx(async (txDb) => {
        const { locations: [first, second] } = await insertFixtureLocations(txDb, 2);
        await repo.insertStatus(txDb, statusInput(first.id));

        await assert.rejects(repo.insertStatus(txDb, statusInput(second.id)), (err) => {
            assert.strictEqual(getUniqueViolationName(err), 'UQ_master_assy_status_code');
            return true;
        });
    });
});

test('insertStatus with an unknown location_id rejects with a FOREIGN KEY conflict', async () => {
    await inTx(async (txDb) => {
        await assert.rejects(repo.insertStatus(txDb, statusInput(UNKNOWN_ID)), (err) => {
            assert.deepStrictEqual(getConstraintConflict(err), { kind: 'FOREIGN KEY', name: 'FK_master_assy_status_location' });
            return true;
        });
    });
});

// CK_master_assy_status_location_rule. Tested from the active-status side: CLEARED is seeded and
// status_code is unique, so CLEARED + a location could fail on the unique key or the CHECK,
// depending on the query plan.
test('an active status with no location_id rejects with a CHECK conflict', async () => {
    await inTx(async (txDb) => {
        await assert.rejects(repo.insertStatus(txDb, statusInput(null)), (err) => {
            assert.deepStrictEqual(getConstraintConflict(err), { kind: 'CHECK', name: 'CK_master_assy_status_location_rule' });
            return true;
        });
    });
});
