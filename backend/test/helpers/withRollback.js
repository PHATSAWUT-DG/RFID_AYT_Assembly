// Integration tests write to a real database, so they may only run on a dev one.
const DEV_DB_NAME = /_dev$/;

// Thrown inside the transaction to force the rollback. Private, so a real error
// is never mistaken for it.
class RollbackSignal extends Error {}

const assertDevDatabase = () => {
    const name = process.env.DB_NAME;
    if (!DEV_DB_NAME.test(name ?? '')) {
        throw new Error(`withRollback: DB_NAME must end with _dev (got ${JSON.stringify(name)}). Refusing to connect.`);
    }
};

// Runs fn(txDb) inside transaction(...), always rolls back, and returns what fn returned.
// transaction is db.transaction (or any function with the same shape).
const withRollback = async (transaction, fn) => {
    assertDevDatabase();
    let result;
    try {
        await transaction(async (txDb) => {
            result = await fn(txDb);
            throw new RollbackSignal();
        });
    } catch (err) {
        if (!(err instanceof RollbackSignal)) throw err;
    }
    return result;
};

module.exports = { withRollback };
