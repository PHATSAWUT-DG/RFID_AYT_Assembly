// Characterization tests: written against the raw-SQL repository (plan 2026-10-27, Task 5).
// The Sequelize version (Task 6) passes them with no assertion changed.
// Real DB (DB_NAME must end with _dev). Every write is rolled back.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { orm, ormTransaction } = require('../../../../../db');
const { defineMasterModels } = require('../../../../../modules/master/master.models');
const repo = require('../../../../../modules/master/processes/processes.repository');
const { getUniqueViolationName, getConstraintConflict } = require('../../../../../shared/sqlErrors');
const { withRollback } = require('../../../../helpers/withRollback');

const PROCESS_KEYS = ['can_clear_tag', 'id', 'process_code', 'process_name'];
const UNKNOWN_ID = 999999;

before(() => defineMasterModels(orm.sequelize));

const inTx = (fn) => withRollback(ormTransaction, fn);
const keysOf = (row) => Object.keys(row).sort();

test('selectProcesses returns rows with exactly the process keys, ordered by process_code', async () => {
    await inTx(async (txDb) => {
        // Inserted out of order, so the id order differs from the code order.
        await repo.insertProcess(txDb, { process_code: 'ZZIT2', process_name: 'IT two', can_clear_tag: true });
        await repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: false });

        const rows = await repo.selectProcesses(txDb);

        assert.ok(Array.isArray(rows));
        for (const row of rows) {
            assert.deepStrictEqual(keysOf(row), PROCESS_KEYS);
            assert.strictEqual(typeof row.can_clear_tag, 'boolean');
        }
        const codes = rows.map((r) => r.process_code);
        assert.ok(codes.indexOf('ZZIT1') < codes.indexOf('ZZIT2'));
        assert.strictEqual(rows.find((r) => r.process_code === 'ZZIT2').can_clear_tag, true);
    });
});

test('insertProcess returns the new row with exactly the process keys', async () => {
    await inTx(async (txDb) => {
        const row = await repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: true });

        assert.deepStrictEqual(keysOf(row), PROCESS_KEYS);
        assert.ok(Number.isInteger(row.id));
        assert.deepStrictEqual(
            { process_code: row.process_code, process_name: row.process_name, can_clear_tag: row.can_clear_tag },
            { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: true });
    });
});

test('updateProcess returns the updated row', async () => {
    await inTx(async (txDb) => {
        const created = await repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: false });

        const row = await repo.updateProcess(txDb, created.id, { process_code: 'ZZIT9', process_name: 'IT nine', can_clear_tag: true });

        assert.deepStrictEqual(row, { id: created.id, process_code: 'ZZIT9', process_name: 'IT nine', can_clear_tag: true });
    });
});

test('updateProcess with an unknown id returns null', async () => {
    await inTx(async (txDb) => {
        const row = await repo.updateProcess(txDb, UNKNOWN_ID, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: false });
        assert.strictEqual(row, null);
    });
});

test('deleteProcess returns the affected row count: 1 for a known id, 0 for an unknown id', async () => {
    await inTx(async (txDb) => {
        const created = await repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: false });

        assert.strictEqual(await repo.deleteProcess(txDb, created.id), 1);
        assert.strictEqual(await repo.deleteProcess(txDb, UNKNOWN_ID), 0);
    });
});

test('insertProcess with a duplicate process_code rejects with UQ_master_process_code', async () => {
    await inTx(async (txDb) => {
        await repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: false });

        await assert.rejects(
            repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT copy', can_clear_tag: false }),
            (err) => {
                assert.strictEqual(getUniqueViolationName(err), 'UQ_master_process_code');
                return true;
            });
    });
});

test('deleteProcess of a process used by a location rejects with a REFERENCE conflict', async () => {
    await inTx(async (txDb) => {
        const process = await repo.insertProcess(txDb, { process_code: 'ZZIT1', process_name: 'IT one', can_clear_tag: false });
        // Through the model, not locations.repository: that one is raw SQL until Task 7.
        await txDb.sequelize.models.MasterLocation.create({
            location_code: 'zz_it_1', location_name: 'IT location', process_id: process.id, is_active: true,
        }, { transaction: txDb.tx });

        await assert.rejects(repo.deleteProcess(txDb, process.id), (err) => {
            assert.deepStrictEqual(getConstraintConflict(err), { kind: 'REFERENCE', name: 'FK_master_location_process' });
            return true;
        });
    });
});
