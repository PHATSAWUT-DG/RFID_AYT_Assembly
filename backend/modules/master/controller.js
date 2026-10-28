const { sendData } = require('../../shared/respond');

const createMasterController = ({ service }) => ({
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
    listLocations: async (req, res) => {
        sendData(res, await service.listLocations());
    },
    createLocation: async (req, res) => {
        sendData(res, await service.createLocation(req.valid.body), { status: 201 });
    },
    updateLocation: async (req, res) => {
        sendData(res, await service.updateLocation(req.valid.params.id, req.valid.body));
    },
    listStatuses: async (req, res) => {
        sendData(res, await service.listStatuses());
    },
    createStatus: async (req, res) => {
        sendData(res, await service.createStatus(req.valid.body), { status: 201 });
    },
    updateStatus: async (req, res) => {
        sendData(res, await service.updateStatus(req.valid.params.id, req.valid.body));
    },
    deleteStatus: async (req, res) => {
        await service.deleteStatus(req.valid.params.id);
        res.status(204).end();
    },
});

module.exports = { createMasterController };
