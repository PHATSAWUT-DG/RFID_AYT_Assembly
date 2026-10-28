const { withMasterErrors, orNotFound, assertAffected } = require('../master.errors');

const PROCESS_RULES = {
    uniques: { UQ_master_process_code: 'process_code' },
    refs: {},
    messages: {
        duplicate: 'Process code already exists',
        invalidRef: 'Referenced row does not exist',
        inUse: 'Process is still used by a location',
    },
};

const createProcessesService = ({ repo, db }) => {
    const listProcesses = () => repo.selectProcesses(db);

    const createProcess = (input) => withMasterErrors(PROCESS_RULES, () => repo.insertProcess(db, input));

    const updateProcess = async (id, input) =>
        orNotFound(await withMasterErrors(PROCESS_RULES, () => repo.updateProcess(db, id, input)), 'Process', id);

    const deleteProcess = async (id) => {
        const affected = await withMasterErrors(PROCESS_RULES, () => repo.deleteProcess(db, id));
        assertAffected(affected, 'Process', id);
    };

    return { listProcesses, createProcess, updateProcess, deleteProcess };
};

module.exports = { createProcessesService };
