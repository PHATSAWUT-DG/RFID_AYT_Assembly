const { test } = require('node:test');
const assert = require('node:assert');
const { inferSqlType, typed, sql, createPoolGetter, buildOrmOptions, orm } = require('../../db');

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

const ormEnv = { DB_NAME: 'db_rfid_assembly_dev', DB_USER: 'u', DB_PASSWORD: 'p' };

test('buildOrmOptions splits host\\instance into host + instanceName and leaves out port', () => {
    const options = buildOrmOptions({ ...ormEnv, DB_SERVER: 'PBSY70\\SQLEXPRESS', DB_PORT: '1433' });
    assert.strictEqual(options.host, 'PBSY70');
    assert.strictEqual(options.dialectOptions.options.instanceName, 'SQLEXPRESS');
    assert.strictEqual('port' in options, false);
});

test('buildOrmOptions uses host + port when DB_SERVER has no instance', () => {
    const options = buildOrmOptions({ ...ormEnv, DB_SERVER: 'db1', DB_PORT: '1444' });
    assert.strictEqual(options.host, 'db1');
    assert.strictEqual(options.port, 1444);
    assert.strictEqual('instanceName' in options.dialectOptions.options, false);
});

test('buildOrmOptions: same database, login and TLS settings as dbConfig, no logging, no timestamps', () => {
    for (const DB_SERVER of ['PBSY70\\SQLEXPRESS', 'db1']) {
        const options = buildOrmOptions({ ...ormEnv, DB_SERVER, DB_PORT: '1433' });
        assert.strictEqual(options.dialect, 'mssql');
        assert.strictEqual(options.logging, false);
        assert.deepStrictEqual(options.define, { freezeTableName: true, timestamps: false });
        assert.strictEqual(options.dialectOptions.options.encrypt, true);
        assert.strictEqual(options.dialectOptions.options.trustServerCertificate, true);
        assert.deepStrictEqual(
            { database: options.database, username: options.username, password: options.password },
            { database: 'db_rfid_assembly_dev', username: 'u', password: 'p' });
    }
});

test('orm is { sequelize, tx: undefined } and loading it does not connect', () => {
    assert.strictEqual(orm.sequelize.getDialect(), 'mssql');
    assert.strictEqual(orm.tx, undefined);
    // The pool opens its first connection on the first query.
    assert.strictEqual(orm.sequelize.connectionManager.pool.size, 0);
});
