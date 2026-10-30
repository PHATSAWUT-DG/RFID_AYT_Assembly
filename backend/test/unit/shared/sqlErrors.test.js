const { test } = require('node:test');
const assert = require('node:assert');
const {
    isUniqueViolation, getUniqueViolationName, getConstraintConflict,
} = require('../../../shared/sqlErrors');
const { UniqueConstraintError, ForeignKeyConstraintError, DatabaseError } = require('sequelize');

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

const foreignKey = sqlError(547,
    'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_master_location_process". The conflict occurred in database "db", table "dbo.tb_master_process", column \'id\'.');
const reference = sqlError(547,
    'The DELETE statement conflicted with the REFERENCE constraint "FK_master_location_process". The conflict occurred in database "db", table "dbo.tb_master_location", column \'process_id\'.');
const check = sqlError(547,
    'The INSERT statement conflicted with the CHECK constraint "CK_master_assy_status_location_rule". The conflict occurred in database "db", table "dbo.tb_master_assy_status".');

test('getConstraintConflict reads the kind and name of a 547 error', () => {
    assert.deepStrictEqual(getConstraintConflict(foreignKey),
        { kind: 'FOREIGN KEY', name: 'FK_master_location_process' });
    assert.deepStrictEqual(getConstraintConflict(reference),
        { kind: 'REFERENCE', name: 'FK_master_location_process' });
    assert.deepStrictEqual(getConstraintConflict(check),
        { kind: 'CHECK', name: 'CK_master_assy_status_location_rule' });
});

test('getConstraintConflict: null when it is not a constraint conflict', () => {
    assert.strictEqual(getConstraintConflict(duplicateConstraint), null);
    assert.strictEqual(getConstraintConflict(sqlError(547, 'unexpected text')), null);
    assert.strictEqual(getConstraintConflict(new Error('x')), null);
    assert.strictEqual(getConstraintConflict(undefined), null);
});

// Sequelize wraps the driver error. The SQL number and message are only on err.parent.
test('a Sequelize UniqueConstraintError is read from its parent driver error', () => {
    const wrapped = new UniqueConstraintError({ parent: duplicateConstraint });
    assert.strictEqual(wrapped.name, 'SequelizeUniqueConstraintError');
    assert.strictEqual(isUniqueViolation(wrapped), true);
    assert.strictEqual(getUniqueViolationName(wrapped), 'UQ_assy_tag_code');
    assert.strictEqual(getUniqueViolationName(new UniqueConstraintError({ parent: duplicateIndex })), 'UX_pairing_active_tag');
});

test('a Sequelize ForeignKeyConstraintError / DatabaseError (547) is read from its parent driver error', () => {
    assert.deepStrictEqual(getConstraintConflict(new ForeignKeyConstraintError({ parent: foreignKey })),
        { kind: 'FOREIGN KEY', name: 'FK_master_location_process' });
    assert.deepStrictEqual(getConstraintConflict(new ForeignKeyConstraintError({ parent: reference })),
        { kind: 'REFERENCE', name: 'FK_master_location_process' });
    // Sequelize has no class for a CHECK conflict, so it is a plain DatabaseError.
    assert.deepStrictEqual(getConstraintConflict(new DatabaseError(check)),
        { kind: 'CHECK', name: 'CK_master_assy_status_location_rule' });
});
