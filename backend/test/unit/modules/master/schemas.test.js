const { test } = require('node:test');
const assert = require('node:assert');
const { statusBody } = require('../../../../modules/master/schemas');

const valid = { status_code: 'GR_F2', status_label: 'Gauging F2', seq: 2, location_id: 3 };
const issuePaths = (result) => result.error.issues.map((i) => i.path.join('.'));

test('statusBody trims and upper-cases status_code', () => {
    const result = statusBody.safeParse({ ...valid, status_code: ' gr_f2 ' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.status_code, 'GR_F2');
});

test('statusBody: a lower-case cleared is treated as CLEARED (no location allowed)', () => {
    const result = statusBody.safeParse({ status_code: ' cleared ', status_label: 'Cleared', seq: 5, location_id: null });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.status_code, 'CLEARED');
});

test('statusBody: CLEARED with a location fails on location_id', () => {
    const result = statusBody.safeParse({ ...valid, status_code: 'CLEARED', location_id: 3 });
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(issuePaths(result), ['location_id']);
    assert.strictEqual(result.error.issues[0].message, 'CLEARED must have no location');
});

test('statusBody: lower-case cleared with a location also fails', () => {
    const result = statusBody.safeParse({ ...valid, status_code: 'cleared', location_id: 3 });
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(issuePaths(result), ['location_id']);
});

test('statusBody: another code without a location fails on location_id', () => {
    const result = statusBody.safeParse({ ...valid, location_id: null });
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(issuePaths(result), ['location_id']);
    assert.strictEqual(result.error.issues[0].message, 'An active status needs a location');
});

test('statusBody: a code with a space fails on status_code', () => {
    const result = statusBody.safeParse({ ...valid, status_code: 'GR F2' });
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(issuePaths(result), ['status_code']);
});

test('statusBody: bad seq, label or location_id are rejected', () => {
    for (const bad of [{ seq: -1 }, { seq: 1.5 }, { status_label: ' ' }, { location_id: 0 }, { location_id: 'x' }]) {
        assert.strictEqual(statusBody.safeParse({ ...valid, ...bad }).success, false, JSON.stringify(bad));
    }
});
