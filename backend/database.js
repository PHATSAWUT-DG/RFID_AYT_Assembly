const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER || 'PBSY70\\SQLEXPRESS',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'db_rfid_assembly',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
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

module.exports = { sql, getPool, createPoolGetter };
