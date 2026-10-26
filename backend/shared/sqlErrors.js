// SQL Server: 2601 = duplicate key in a unique index, 2627 = unique/PK constraint.
const UNIQUE_VIOLATION_NUMBERS = new Set([2601, 2627]);
const VIOLATED_NAME = /(?:unique index|constraint) '([^']+)'/i;

const isUniqueViolation = (err) => UNIQUE_VIOLATION_NUMBERS.has(err?.number);

const getUniqueViolationName = (err) => {
    if (!isUniqueViolation(err)) return null;
    const match = VIOLATED_NAME.exec(err.message);
    return match ? match[1] : null;
};

module.exports = { isUniqueViolation, getUniqueViolationName };
