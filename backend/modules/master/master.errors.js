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

// Runs fn and rethrows SQL constraint errors as AppError.
const withMasterErrors = async (rules, fn) => {
    try {
        return await fn();
    } catch (err) {
        throw toMasterError(err, rules);
    }
};

// Wraps every function of a service object in withMasterErrors, so the service
// code itself has no wrapper. AppError and other errors pass through unchanged.
const mapMasterErrors = (rules, service) => Object.fromEntries(
    Object.entries(service).map(([name, fn]) => [name, (...args) => withMasterErrors(rules, () => fn(...args))]));

// One not-found check for every repository result: an update or a read by id gives
// the row or null, a delete gives the affected row count. null, undefined and 0 mean
// "no such row" (404); anything else is returned unchanged.
const orNotFound = (result, entity, id) => {
    if (result === null || result === undefined || result === 0) {
        throw new AppError('MASTER_NOT_FOUND', 404, `${entity} ${id} not found`);
    }
    return result;
};

module.exports = { toMasterError, withMasterErrors, mapMasterErrors, orNotFound };
