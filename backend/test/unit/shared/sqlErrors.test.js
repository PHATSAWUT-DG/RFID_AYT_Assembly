const { test } = require('node:test');
const assert = require('node:assert');
const { isUniqueViolation, getUniqueViolationName } = require('../../../shared/sqlErrors');

const sqlError = (number, message) => Object.assign(new Error(message), { number });

const duplicateIndex = sqlError(2601,
    "Cannot insert duplicate key row in object 'dbo.tb_assy_pairing' with unique index 'UX_pairing_active_tag'. The duplicate key value is (5).");
const duplicateConstraint = sqlError(2627,
    "Violation of UNIQUE KEY constraint 'UQ_assy_tag_code'. Cannot insert duplicate key in object 'dbo.tb_assy_tag'. The duplicate key value is (T1).");

test('isUniqueViolation: true for 2601 and 2627', () => {
    assert.strictEqual(isUniqueViolation(duplicateIndex), true);
    assert.strictEqual(isUniqueViolation(duplicateConstraint), true);
});

test('isUniqueViolation: false for other errors', () => {
    assert.strictEqual(isUniqueViolation(sqlError(547, 'FK conflict')), false);
    assert.strictEqual(isUniqueViolation(new Error('plain')), false);
    assert.strictEqual(isUniqueViolation(undefined), false);
});

test('getUniqueViolationName reads the index or constraint name', () => {
    assert.strictEqual(getUniqueViolationName(duplicateIndex), 'UX_pairing_active_tag');
    assert.strictEqual(getUniqueViolationName(duplicateConstraint), 'UQ_assy_tag_code');
});

test('getUniqueViolationName: null when it is not a unique violation', () => {
    assert.strictEqual(getUniqueViolationName(sqlError(547, "constraint 'FK_x'")), null);
});
