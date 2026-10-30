const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { withRollback } = require('./withRollback');

// Fake db.transaction: records whether fn threw, then rethrows, like the real one after its rollback.
const fakeTransaction = () => {
    const seen = { calls: 0, rolledBack: false, committed: false };
    const transaction = async (fn) => {
        seen.calls += 1;
        try {
            const out = await fn({ name: 'tx-db' });
            seen.committed = true;
            return out;
        } catch (err) {
            seen.rolledBack = true;
            throw err;
        }
    };
    return { transaction, seen };
};

let savedDbName;
beforeEach(() => {
    savedDbName = process.env.DB_NAME;
    process.env.DB_NAME = 'db_rfid_assembly_dev';
});
afterEach(() => {
    if (savedDbName === undefined) delete process.env.DB_NAME;
    else process.env.DB_NAME = savedDbName;
});

test('withRollback returns what fn returned and never commits', async () => {
    const { transaction, seen } = fakeTransaction();
    const out = await withRollback(transaction, async (txDb) => `ran on ${txDb.name}`);
    assert.strictEqual(out, 'ran on tx-db');
    assert.strictEqual(seen.rolledBack, true);
    assert.strictEqual(seen.committed, false);
});

test('withRollback rethrows an error from fn', async () => {
    const { transaction, seen } = fakeTransaction();
    const boom = new Error('boom');
    await assert.rejects(withRollback(transaction, async () => { throw boom; }), (err) => err === boom);
    assert.strictEqual(seen.rolledBack, true);
});

test('withRollback refuses a DB_NAME that does not end with _dev, before connecting', async () => {
    for (const name of ['db_rfid_assembly', 'db_rfid_assembly_dev_copy', '', undefined]) {
        if (name === undefined) delete process.env.DB_NAME;
        else process.env.DB_NAME = name;
        const { transaction, seen } = fakeTransaction();
        await assert.rejects(withRollback(transaction, async () => 'x'), /DB_NAME must end with _dev/);
        assert.strictEqual(seen.calls, 0);
    }
});
