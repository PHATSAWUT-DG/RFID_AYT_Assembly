const { test } = require('node:test');
const assert = require('node:assert');
const { sendData } = require('../../../shared/respond');

function fakeRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

test('sendData wraps the payload in { data } with status 200 and no meta key', () => {
    const res = fakeRes();
    sendData(res, [1]);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { data: [1] });
    assert.ok(!('meta' in res.body));
});

test('sendData uses the given status', () => {
    const res = fakeRes();
    const row = { id: 1 };
    sendData(res, row, { status: 201 });
    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(res.body, { data: row });
});

test('sendData adds meta when it is given', () => {
    const res = fakeRes();
    const meta = { page: 1, page_size: 50, total: 0 };
    sendData(res, [], { meta });
    assert.deepStrictEqual(res.body, { data: [], meta });
});
