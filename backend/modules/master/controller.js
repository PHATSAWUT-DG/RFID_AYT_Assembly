const createMasterController = ({ service }) => ({
    listProcesses: async (req, res) => {
        res.json(await service.listProcesses());
    },
    createProcess: async (req, res) => {
        res.status(201).json(await service.createProcess(req.valid.body));
    },
    updateProcess: async (req, res) => {
        res.json(await service.updateProcess(req.valid.params.id, req.valid.body));
    },
    deleteProcess: async (req, res) => {
        await service.deleteProcess(req.valid.params.id);
        res.status(204).end();
    },
});

module.exports = { createMasterController };
