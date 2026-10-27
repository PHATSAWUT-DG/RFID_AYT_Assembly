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

// Runs a repo call and rethrows SQL constraint errors as AppError.
const run = async (rules, fn) => {
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

const createMasterService = ({ repo, db }) => {
    const listProcesses = () => repo.selectProcesses(db);

    const createProcess = (input) => run(PROCESS_RULES, () => repo.insertProcess(db, input));

    const updateProcess = async (id, input) =>
        orNotFound(await run(PROCESS_RULES, () => repo.updateProcess(db, id, input)), 'Process', id);

    const deleteProcess = async (id) => {
        const affected = await run(PROCESS_RULES, () => repo.deleteProcess(db, id));
        orNotFound(affected !== 0, 'Process', id);
    };

    const listLocations = () => repo.selectLocations(db);

    const createLocation = (input) => run(LOCATION_RULES, () => repo.insertLocation(db, input));

    const updateLocation = async (id, input) =>
        orNotFound(await run(LOCATION_RULES, () => repo.updateLocation(db, id, input)), 'Location', id);

    const listStatuses = async () => {
        const rows = await repo.selectStatuses(db);
        return rows.map((row) => ({ ...row, is_system: isSystemStatus(row.status_code) }));
    };

    const createStatus = (input) => run(STATUS_RULES, () => repo.insertStatus(db, input));

    const loadStatus = async (id) => orNotFound(await repo.selectStatusById(db, id), 'Status', id);

    const updateStatus = async (id, input) => {
        const current = await loadStatus(id);
        if (isSystemStatus(current.status_code) && input.status_code !== current.status_code) {
            throw new AppError('MASTER_SYSTEM_LOCKED', 409, `System status ${current.status_code} cannot change its code`);
        }
        return orNotFound(await run(STATUS_RULES, () => repo.updateStatus(db, id, input)), 'Status', id);
    };

    const deleteStatus = async (id) => {
        const current = await loadStatus(id);
        if (isSystemStatus(current.status_code)) {
            throw new AppError('MASTER_SYSTEM_LOCKED', 409, `System status ${current.status_code} cannot be deleted`);
        }
        const affected = await run(STATUS_RULES, () => repo.deleteStatus(db, id));
        orNotFound(affected !== 0, 'Status', id);
    };

    return {
        listProcesses, createProcess, updateProcess, deleteProcess,
        listLocations, createLocation, updateLocation,
        listStatuses, createStatus, updateStatus, deleteStatus,
    };
};

module.exports = { createMasterService, SYSTEM_STATUS_CODES };
