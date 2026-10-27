const { AppError } = require('../../shared/AppError');
const { getUniqueViolationName, getConstraintConflict } = require('../../shared/sqlErrors');

// uniques / refs: constraint or index name -> body field, for the error details.
const PROCESS_RULES = {
    uniques: { UQ_master_process_code: 'process_code' },
    refs: {},
    messages: {
        duplicate: 'Process code already exists',
        invalidRef: 'Referenced row does not exist',
        inUse: 'Process is still used by a location',
    },
};

const LOCATION_RULES = {
    uniques: { UQ_master_location_code: 'location_code' },
    refs: { FK_master_location_process: 'process_id' },
    messages: {
        duplicate: 'Location code already exists',
        invalidRef: 'Process does not exist',
        inUse: 'Location is still in use',
    },
};

const fieldDetails = (path, message) => (path ? [{ in: 'body', path, message }] : undefined);

// Maps SQL constraint errors to AppError. Anything else is rethrown unchanged.
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

const createMasterService = ({ repo, db }) => {
    const mapProcessError = (err) => { throw toMasterError(err, PROCESS_RULES); };
    const mapLocationError = (err) => { throw toMasterError(err, LOCATION_RULES); };

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

    const listLocations = () => repo.selectLocations(db);

    const createLocation = async (input) => {
        try {
            return await repo.insertLocation(db, input);
        } catch (err) {
            return mapLocationError(err);
        }
    };

    const updateLocation = async (id, input) => {
        let row;
        try {
            row = await repo.updateLocation(db, id, input);
        } catch (err) {
            return mapLocationError(err);
        }
        if (!row) throw new AppError('MASTER_NOT_FOUND', 404, `Location ${id} not found`);
        return row;
    };

    return {
        listProcesses, createProcess, updateProcess, deleteProcess,
        listLocations, createLocation, updateLocation,
    };
};

module.exports = { createMasterService };
