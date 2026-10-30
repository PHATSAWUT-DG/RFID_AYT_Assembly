const express = require('express');
const { defineMasterModels } = require('./master.models');
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

// orm: Sequelize context (processes). db: raw-SQL context (locations, statuses until plan Task 7).
const createMasterModule = ({ db, orm }) => {
    defineMasterModels(orm.sequelize);
    const router = express.Router();
    router.use(createProcessesRoutes({
        controller: createProcessesController({ service: createProcessesService({ repo: processesRepo, db: orm }) }),
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
