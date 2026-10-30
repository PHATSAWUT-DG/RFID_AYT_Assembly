const { AppError } = require('../../../shared/AppError');
const { mapMasterErrors, orNotFound } = require('../master.errors');

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

const createStatusesService = ({ repo, db }) => {
    const listStatuses = async () => {
        const rows = await repo.selectStatuses(db);
        return rows.map((row) => ({ ...row, is_system: isSystemStatus(row.status_code) }));
    };

    const createStatus = (input) => repo.insertStatus(db, input);

    const loadStatus = async (id) => {
        const row = await repo.selectStatusById(db, id);
        return orNotFound(row, 'Status', id);
    };

    const updateStatus = async (id, input) => {
        const current = await loadStatus(id);
        if (isSystemStatus(current.status_code) && input.status_code !== current.status_code) {
            throw new AppError('MASTER_SYSTEM_LOCKED', 409, `System status ${current.status_code} cannot change its code`);
        }
        const row = await repo.updateStatus(db, id, input);
        return orNotFound(row, 'Status', id);
    };

    const deleteStatus = async (id) => {
        const current = await loadStatus(id);
        if (isSystemStatus(current.status_code)) {
            throw new AppError('MASTER_SYSTEM_LOCKED', 409, `System status ${current.status_code} cannot be deleted`);
        }
        const affected = await repo.deleteStatus(db, id);
        orNotFound(affected, 'Status', id);
    };

    // SQL constraint errors from any of these become AppError (STATUS_RULES).
    return mapMasterErrors(STATUS_RULES, { listStatuses, createStatus, updateStatus, deleteStatus });
};

module.exports = { createStatusesService, SYSTEM_STATUS_CODES };
