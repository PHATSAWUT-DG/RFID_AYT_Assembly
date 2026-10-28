const express = require('express');
const { validate } = require('../../../shared/validate');
const { idParams } = require('../master.schemas');
const { processBody, processUpdateBody } = require('./processes.schemas');

const createProcessesRoutes = ({ controller }) => {
    const router = express.Router();

    router.get('/processes', controller.listProcesses);
    router.post('/processes', validate({ body: processBody }), controller.createProcess);
    router.put('/processes/:id', validate({ params: idParams, body: processUpdateBody }), controller.updateProcess);
    router.delete('/processes/:id', validate({ params: idParams }), controller.deleteProcess);

    return router;
};

module.exports = { createProcessesRoutes };
