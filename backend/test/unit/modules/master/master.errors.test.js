const { test } = require('node:test');
const assert = require('node:assert');
const { assertAffected } = require('../../../../modules/master/master.errors');
const { AppError } = require('../../../../shared/AppError');

test('assertAffected: zero rows -> MASTER_NOT_FOUND 404 naming the entity and id', () => {
    assert.throws(() => assertAffected(0, 'Process', 9), (err) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.code, 'MASTER_NOT_FOUND');
        assert.strictEqual(err.httpStatus, 404);
        assert.strictEqual(err.message, 'Process 9 not found');
        return true;
    });
});

test('assertAffected: one row returns without throwing', () => {
    assert.doesNotThrow(() => assertAffected(1, 'Process', 9));
});
