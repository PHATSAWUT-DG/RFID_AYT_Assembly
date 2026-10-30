// SQL Server: 2601 = duplicate key in a unique index, 2627 = unique/PK constraint.
const UNIQUE_VIOLATION_NUMBERS = new Set([2601, 2627]);
const VIOLATED_NAME = /(?:unique index|constraint) '([^']+)'/i;

// Sequelize wraps the driver error and changes the message ("Validation error"),
// so the SQL number and message are read from err.parent when it is there.
const driverError = (err) => err?.parent ?? err;

const isUniqueViolation = (err) => UNIQUE_VIOLATION_NUMBERS.has(driverError(err)?.number);

const getUniqueViolationName = (err) => {
    if (!isUniqueViolation(err)) return null;
    const match = VIOLATED_NAME.exec(driverError(err).message);
    return match ? match[1] : null;
};

// 547 = FOREIGN KEY / REFERENCE / CHECK conflict. REFERENCE means a DELETE hit a row that is still used.
const CONSTRAINT_CONFLICT = /conflicted with the (FOREIGN KEY|REFERENCE|CHECK) constraint "([^"]+)"/i;

const getConstraintConflict = (err) => {
    const driverErr = driverError(err);
    if (driverErr?.number !== 547) return null;
    const match = CONSTRAINT_CONFLICT.exec(driverErr.message);
    return match ? { kind: match[1].toUpperCase(), name: match[2] } : null;
};

module.exports = { isUniqueViolation, getUniqueViolationName, getConstraintConflict };
