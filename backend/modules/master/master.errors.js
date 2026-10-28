const { AppError } = require('../../shared/AppError');
const { getUniqueViolationName, getConstraintConflict } = require('../../shared/sqlErrors');

const fieldDetails = (path, message) => (path ? [{ in: 'body', path, message }] : undefined);

// Maps SQL constraint errors to AppError. Anything else is rethrown unchanged.
// uniques / refs: constraint or index name -> body field, for the error details.
const toMasterError = (err, { uniques, refs, messages }) => {
    const uniqueName = getUniqueViolationName(err);
    if (uniqueName && uniques[uniqueName]) {
        return new AppError('MASTER_DUPLICATE', 409, messages.duplicate,
            fieldDetails(uniques[uniqueName], messages.duplicate));
    }
    const conflict = getConstraintConflict(err);
    if (conflict?.kind === 'FOREIGN KEY') {
        return new AppError('MASTER_INVALID_REF', 422, messages.invalidRef,
            fieldDetails(refs[conflict.name], messages.invalidRef));
    }
    if (conflict?.kind === 'REFERENCE') {
        return new AppError('MASTER_IN_USE', 409, messages.inUse);
    }
    return err;
};

// Runs a repo call and rethrows SQL constraint errors as AppError.
const withMasterErrors = async (rules, fn) => {
    try {
        return await fn();
    } catch (err) {
        throw toMasterError(err, rules);
    }
};

const orNotFound = (found, entity, id) => {
    if (!found) throw new AppError('MASTER_NOT_FOUND', 404, `${entity} ${id} not found`);
    return found;
};

const assertAffected = (count, entity, id) => {
    if (count === 0) throw new AppError('MASTER_NOT_FOUND', 404, `${entity} ${id} not found`);
};

module.exports = { toMasterError, withMasterErrors, orNotFound, assertAffected };
