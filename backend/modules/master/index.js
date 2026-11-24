const express = require('express');
const processesRepo = require('./processes/processes.repository');
const { createProcessesService } = require('./processes/processes.service');
const { createProcessesController } = require('./processes/processes.controller');
const { createProcessesRoutes } = require('./processes/processes.routes');
const locationsRepo = require('./locations/locations.repository');
const { createLocationsService } = require('./locations/locations.service');
const { createLocationsController } = require('./locations/locations.controller');
const { createLocationsRoutes } = require('./locations/locations.routes');
const statusesRepo = require('./statuses/statuses.repository');
const { createStatusesService } = require('./statuses/statuses.service');
const { createStatusesController } = require('./statuses/statuses.controller');
const { createStatusesRoutes } = require('./statuses/statuses.routes');

const createMasterModule = ({ db }) => {
    const router = express.Router();
    router.use(createProcessesRoutes({
        controller: createProcessesController({ service: createProcessesService({ repo: processesRepo, db }) }),
    }));
    router.use(createLocationsRoutes({
        controller: createLocationsController({ service: createLocationsService({ repo: locationsRepo, db }) }),
    }));
    router.use(createStatusesRoutes({
        controller: createStatusesController({ service: createStatusesService({ repo: statusesRepo, db }) }),
    }));
    return router;
};

module.exports = { createMasterModule };
