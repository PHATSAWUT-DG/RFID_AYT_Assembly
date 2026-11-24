const { test } = require('node:test');
const assert = require('node:assert');
const { assignRequestId } = require('../../../utils/requestId');

function run(inboundId) {
    const req = { get: (name) => (name.toLowerCase() === 'x-request-id' ? inboundId : undefined) };
    const headers = {};
    const res = { set: (name, value) => { headers[name] = value; } };
    let nextCalled = false;
    assignRequestId()(req, res, () => { nextCalled = true; });
    return { req, headers, nextCalled };
}

test('keeps a valid inbound id on req.id and the response header', () => {
    const { req, headers, nextCalled } = run('abc.DEF_1-2');
    assert.strictEqual(req.id, 'abc.DEF_1-2');
    assert.strictEqual(headers['X-Request-Id'], 'abc.DEF_1-2');
    assert.ok(nextCalled);
});

test('generates a uuid when no id is sent', () => {
    const { req } = run(undefined);
    assert.match(req.id, /^[0-9a-f-]{36}$/);
});

test('replaces ids with a space, a newline or 65 chars', () => {
    for (const junk of ['a b', 'a\r\nSet-Cookie: x', 'x'.repeat(65), '']) {
        const { req, headers } = run(junk);
        assert.match(req.id, /^[0-9a-f-]{36}$/);
        assert.strictEqual(headers['X-Request-Id'], req.id);
    }
});

test('accepts an id of exactly 64 chars', () => {
    const id = 'x'.repeat(64);
    assert.strictEqual(run(id).req.id, id);
});
