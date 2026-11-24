const { sendData } = require('../../../utils/respond');

const createProcessesController = ({ service }) => ({
    listProcesses: async (req, res) => {
        sendData(res, await service.listProcesses());
    },
    createProcess: async (req, res) => {
        sendData(res, await service.createProcess(req.valid.body), { status: 201 });
    },
    updateProcess: async (req, res) => {
        sendData(res, await service.updateProcess(req.valid.params.id, req.valid.body));
    },
    deleteProcess: async (req, res) => {
        await service.deleteProcess(req.valid.params.id);
        res.status(204).end();
    },
});

module.exports = { createProcessesController };
