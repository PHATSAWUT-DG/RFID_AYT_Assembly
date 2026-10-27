const { AppError } = require('../../shared/AppError');
const { getUniqueViolationName, getConstraintConflict } = require('../../shared/sqlErrors');

const PROCESS_UNIQUES = { UQ_master_process_code: 'process_code' };

// Maps SQL constraint errors to AppError. Anything else is rethrown unchanged.
// uniqueFields: constraint or index name -> body field, for the error details.
const toMasterError = (err, uniqueFields, messages) => {
    const uniqueName = getUniqueViolationName(err);
    if (uniqueName && uniqueFields[uniqueName]) {
        const path = uniqueFields[uniqueName];
        return new AppError('MASTER_DUPLICATE', 409, messages.duplicate,
            [{ in: 'body', path, message: messages.duplicate }]);
    }
    const conflict = getConstraintConflict(err);
    if (conflict?.kind === 'FOREIGN KEY') {
        return new AppError('MASTER_INVALID_REF', 422, messages.invalidRef);
    }
    if (conflict?.kind === 'REFERENCE') {
        return new AppError('MASTER_IN_USE', 409, messages.inUse);
    }
    return err;
};

const createMasterService = ({ repo, db }) => {
    const processMessages = {
        duplicate: 'Process code already exists',
        invalidRef: 'Referenced row does not exist',
        inUse: 'Process is still used by a location',
    };
    const mapProcessError = (err) => { throw toMasterError(err, PROCESS_UNIQUES, processMessages); };

    const listProcesses = () => repo.selectProcesses(db);

    const createProcess = async (input) => {
        try {
            return await repo.insertProcess(db, input);
        } catch (err) {
            return mapProcessError(err);
        }
    };

    const updateProcess = async (id, input) => {
        let row;
        try {
            row = await repo.updateProcess(db, id, input);
        } catch (err) {
            return mapProcessError(err);
        }
        if (!row) throw new AppError('MASTER_NOT_FOUND', 404, `Process ${id} not found`);
        return row;
    };

    const deleteProcess = async (id) => {
        let affected;
        try {
            affected = await repo.deleteProcess(db, id);
        } catch (err) {
            return mapProcessError(err);
        }
        if (affected === 0) throw new AppError('MASTER_NOT_FOUND', 404, `Process ${id} not found`);
        return undefined;
    };

    return { listProcesses, createProcess, updateProcess, deleteProcess };
};

module.exports = { createMasterService };
