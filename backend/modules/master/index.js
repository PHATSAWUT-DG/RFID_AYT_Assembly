const repo = require('./repository');
const { createMasterService } = require('./service');
const { createMasterController } = require('./controller');
const { createMasterRoutes } = require('./routes');

const createMasterModule = ({ db }) => createMasterRoutes({
    controller: createMasterController({ service: createMasterService({ repo, db }) }),
});

module.exports = { createMasterModule };
