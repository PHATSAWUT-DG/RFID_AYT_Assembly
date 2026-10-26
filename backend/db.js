const { sql, getPool } = require('./database');

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

module.exports = { query, transaction, typed, inferSqlType, sql };
