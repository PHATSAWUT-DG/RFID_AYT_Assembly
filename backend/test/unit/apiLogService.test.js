const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('../helpers/fakeDb');
const { insertApiLog } = require('../../services/apiLogService');

test('insertApiLog binds every column and defaults missing fields to null', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    await insertApiLog(db, { api_type: 'RECEIVE', method: 'GET', url: '/x' });

    const { sql, params } = db.calls[0];
    assert.match(sql, /INSERT INTO tb_assy_api_log/);
    assert.strictEqual(params.api_type, 'RECEIVE');
    assert.strictEqual(params.error_msg, null);
    assert.strictEqual(params.http_status, null);
});

test('insertApiLog swallows database errors', async () => {
    const db = createFakeDb([]);
    await assert.doesNotReject(() => insertApiLog(db, { api_type: 'RECEIVE' }));
});
