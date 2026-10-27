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

const STATUS_RULES = {
    uniques: { UQ_master_assy_status_code: 'status_code', UX_master_assy_status_location: 'location_id' },
    refs: { FK_master_assy_status_location: 'location_id' },
    messages: {
        duplicate: 'Status code or location already used by another status',
        invalidRef: 'Location does not exist',
        inUse: 'Status is still used by a lot or an event',
    },
};

// B2-B4 find these statuses by code, so they can be edited but not renamed or deleted.
const SYSTEM_STATUS_CODES = ['REGISTERED', 'CLEARED'];
const isSystemStatus = (code) => SYSTEM_STATUS_CODES.includes(code);

const fieldDetails =(path, message) => (path ? [{ in: 'body', path, message }] : undefined);

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

    const mapStatusError = (err) => { throw toMasterError(err, STATUS_RULES); };

    const listStatuses = async () => {
        const rows = await repo.selectStatuses(db);
        return rows.map((row) => ({ ...row, is_system: isSystemStatus(row.status_code) }));
    };

    const createStatus = async (input) => {
        try {
            return await repo.insertStatus(db, input);
        } catch (err) {
            return mapStatusError(err);
        }
    };

    const loadStatus = async (id) => {
        const current = await repo.selectStatusById(db, id);
        if (!current) throw new AppError('MASTER_NOT_FOUND', 404, `Status ${id} not found`);
        return current;
    };

    const updateStatus = async (id, input) => {
        const current = await loadStatus(id);
        if (isSystemStatus(current.status_code) && input.status_code !== current.status_code) {
            throw new AppError('MASTER_IN_USE', 409, `System status ${current.status_code} cannot change its code`);
        }
        let row;
        try {
            row = await repo.updateStatus(db, id, input);
        } catch (err) {
            return mapStatusError(err);
        }
        if (!row) throw new AppError('MASTER_NOT_FOUND', 404, `Status ${id} not found`);
        return row;
    };

    const deleteStatus = async (id) => {
        const current = await loadStatus(id);
        if (isSystemStatus(current.status_code)) {
            throw new AppError('MASTER_IN_USE', 409, `System status ${current.status_code} cannot be deleted`);
        }
        let affected;
        try {
            affected = await repo.deleteStatus(db, id);
        } catch (err) {
            return mapStatusError(err);
        }
        if (affected === 0) throw new AppError('MASTER_NOT_FOUND', 404, `Status ${id} not found`);
        return undefined;
    };

    return {
        listProcesses, createProcess, updateProcess, deleteProcess,
        listLocations, createLocation, updateLocation,
        listStatuses, createStatus, updateStatus, deleteStatus,
    };
};

module.exports = { createMasterService, SYSTEM_STATUS_CODES };
