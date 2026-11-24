const COLUMNS = [
    'api_type', 'method', 'url', 'request_params', 'request_body',
    'http_status', 'status', 'response', 'error_msg', 'response_time_ms',
];

const INSERT_SQL = `
    INSERT INTO tb_assy_api_log (${COLUMNS.join(', ')})
    VALUES (${COLUMNS.map(c => '@' + c).join(', ')})`;

// Fire-and-forget: a logging failure must never fail the request being logged.
const insertApiLog = async (db, data) => {
    try {
        const params = Object.fromEntries(
            COLUMNS.map(c => [c, data[c] === undefined ? null : data[c]])
        );
        await db.query(INSERT_SQL, params);
    } catch (err) {
        console.error('[API Log Error]', err.message);
    }
};

module.exports = { insertApiLog };
