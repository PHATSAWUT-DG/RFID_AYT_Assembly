const express = require('express');
const { validate } = require('../../shared/validate');
const { idParams, processBody, locationBody, statusBody } = require('./schemas');

const createMasterRoutes = ({ controller }) => {
    const router = express.Router();

    router.get('/processes', controller.listProcesses);
    router.post('/processes', validate({ body: processBody }), controller.createProcess);
    router.put('/processes/:id', validate({ params: idParams, body: processBody }), controller.updateProcess);
    router.delete('/processes/:id', validate({ params: idParams }), controller.deleteProcess);

    // No DELETE: a location is deactivated with is_active = false.
    router.get('/locations', controller.listLocations);
    router.post('/locations', validate({ body: locationBody }), controller.createLocation);
    router.put('/locations/:id', validate({ params: idParams, body: locationBody }), controller.updateLocation);

    router.get('/statuses', controller.listStatuses);
    router.post('/statuses', validate({ body: statusBody }), controller.createStatus);
    router.put('/statuses/:id', validate({ params: idParams, body: statusBody }), controller.updateStatus);
    router.delete('/statuses/:id', validate({ params: idParams }), controller.deleteStatus);

    return router;
};

module.exports = { createMasterRoutes };
