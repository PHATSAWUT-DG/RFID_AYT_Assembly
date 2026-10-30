const sql = require('mssql');
const { Sequelize } = require('sequelize');

const dbConfig = {
    server: process.env.DB_SERVER || 'PBSY70\\SQLEXPRESS',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'db_rfid_assembly',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

// Connect on first use, not at require time, so loading this module (e.g. in
// unit tests) never opens a DB connection. A failed connect is not cached:
// the next call tries again.
function createPoolGetter({ ConnectionPool = sql.ConnectionPool, config }) {
    let poolPromise = null;
    return function getPool() {
        if (!poolPromise) {
            poolPromise = new ConnectionPool(config).connect().catch((err) => {
                poolPromise = null;
                throw err;
            });
        }
        return poolPromise;
    };
}

const getPool = createPoolGetter({ config: dbConfig });

// Params are a plain object; types are inferred unless wrapped with typed(),
// which is required for DATE columns receiving a string.
const typed = (type, value) => ({ __sqlType: type, value });

const inferSqlType = (value) => {
    if (value && value.__sqlType) return value.__sqlType;
    if (typeof value === 'number') return Number.isInteger(value) ? sql.Int : sql.Float;
    if (value instanceof Date) return sql.DateTime;
    if (typeof value === 'boolean') return sql.Bit;
    return sql.VarChar;
};

const bind = (request, params) => {
    for (const [key, raw] of Object.entries(params)) {
        const value = raw && raw.__sqlType ? raw.value : raw;
        request.input(key, inferSqlType(raw), value === undefined ? null : value);
    }
    return request;
};

const query = async (text, params = {}) => {
    const pool = await getPool();
    return bind(pool.request(), params).query(text);
};

// Runs fn inside one transaction. fn receives a db-shaped object whose query()
// runs on the transaction, so services need no transaction awareness.
const transaction = async (fn) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const txDb = {
            query: (text, params = {}) => bind(new sql.Request(tx), params).query(text),
        };
        const out = await fn(txDb);
        await tx.commit();
        return out;
    } catch (err) {
        await tx.rollback();
        throw err;
    }
};

// Sequelize options from env, same database, login and TLS as dbConfig.
// DB_SERVER may be host\instance: tedious takes the instance as instanceName and
// rejects a port next to it, so port is left out then.
const buildOrmOptions = (env) => {
    const [host, instanceName] = (env.DB_SERVER || 'PBSY70\\SQLEXPRESS').split('\\');
    const tediousOptions = { encrypt: true, trustServerCertificate: true };
    if (instanceName) tediousOptions.instanceName = instanceName;
    return {
        dialect: 'mssql',
        host,
        ...(instanceName ? {} : { port: Number(env.DB_PORT) || 1433 }),
        database: env.DB_NAME || 'db_rfid_assembly',
        username: env.DB_USER,
        password: env.DB_PASSWORD,
        logging: false,
        // The schema lives in sql/*.sql. sync() is never called.
        define: { freezeTableName: true, timestamps: false },
        dialectOptions: { options: tediousOptions },
    };
};

// Creating the instance does not connect: Sequelize opens a connection on the first query.
const sequelize = new Sequelize(buildOrmOptions(process.env));

// The ORM context a repository receives as `db`. tx is the open transaction, or undefined.
const orm = { sequelize, tx: undefined };

// Runs fn inside one transaction. fn receives the same context with tx set, so
// repositories pass `transaction: db.tx` and services need no transaction awareness.
// Commits when fn resolves, rolls back and rethrows when it throws.
const ormTransaction = (fn) => sequelize.transaction((tx) => fn({ sequelize, tx }));

module.exports = {
    query, transaction, typed, inferSqlType, sql,
    buildOrmOptions, orm, ormTransaction,
    createPoolGetter, // exported for its test only
    // Legacy: only routes/assembly.js and scripts/rehash_passwords.js use this.
    // New code uses query/transaction. Remove when they are gone.
    getPool,
};
