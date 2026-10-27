const { test } = require('node:test');
const assert = require('node:assert');
const { inferSqlType, typed, sql, createPoolGetter } = require('../../db');

test('inferSqlType maps JS values to mssql types', () => {
    assert.strictEqual(inferSqlType(5).name, 'Int');
    assert.strictEqual(inferSqlType('abc').name, 'VarChar');
    assert.strictEqual(inferSqlType(new Date()).name, 'DateTime');
    assert.strictEqual(inferSqlType(null).name, 'VarChar');
});

test('typed() forces a specific type', () => {
    assert.strictEqual(inferSqlType(typed(sql.Date, '2026-09-03')).name, 'Date');
});

function fakePoolClass(connectResults) {
    const created = [];
    class FakePool {
        constructor(config) {
            this.config = config;
            created.push(this);
        }
        connect() {
            const next = connectResults.shift();
            return next instanceof Error ? Promise.reject(next) : Promise.resolve(this);
        }
    }
    return { FakePool, created };
}

test('getPool does not connect until it is called', () => {
    const { FakePool, created } = fakePoolClass([]);
    createPoolGetter({ ConnectionPool: FakePool, config: {} });
    assert.strictEqual(created.length, 0);
});

test('getPool connects once and reuses the pool', async () => {
    const { FakePool, created } = fakePoolClass(['ok']);
    const getPool = createPoolGetter({ ConnectionPool: FakePool, config: { database: 'x' } });
    const [a, b] = await Promise.all([getPool(), getPool()]);
    assert.strictEqual(a, b);
    assert.strictEqual(created.length, 1);
    assert.deepStrictEqual(created[0].config, { database: 'x' });
});

test('getPool rejects on a failed connect, then retries on the next call', async () => {
    const { FakePool, created } = fakePoolClass([new Error('db down'), 'ok']);
    const getPool = createPoolGetter({ ConnectionPool: FakePool, config: {} });
    await assert.rejects(getPool(), /db down/);
    const pool = await getPool();
    assert.strictEqual(pool, created[1]);
    assert.strictEqual(created.length, 2);
});
