const { sendData } = require('../../../utils/respond');

const createStatusesController = ({ service }) => ({
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

module.exports = { createStatusesController };
