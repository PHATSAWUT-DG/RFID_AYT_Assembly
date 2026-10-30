const express = require('express');
const { validate } = require('../../../shared/validate');
const { idParams } = require('../master.schemas');
const { locationBody } = require('./locations.schemas');

const createLocationsRoutes = ({ controller }) => {
    const router = express.Router();

    // No DELETE: a location is deactivated with is_active = false.
    router.get('/locations', controller.listLocations);
    router.post('/locations', validate({ body: locationBody }), controller.createLocation);
    router.put('/locations/:id', validate({ params: idParams, body: locationBody }), controller.updateLocation);

    return router;
};

module.exports = { createLocationsRoutes };
