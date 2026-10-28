const { sendData } = require('../../../shared/respond');

const createLocationsController = ({ service }) => ({
    listLocations: async (req, res) => {
        sendData(res, await service.listLocations());
    },
    createLocation: async (req, res) => {
        sendData(res, await service.createLocation(req.valid.body), { status: 201 });
    },
    updateLocation: async (req, res) => {
        sendData(res, await service.updateLocation(req.valid.params.id, req.valid.body));
    },
});

module.exports = { createLocationsController };
