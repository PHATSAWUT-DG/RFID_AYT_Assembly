const express = require('express');
const { validate } = require('../../../shared/validate');
const { idParams } = require('../master.schemas');
const { statusBody } = require('./statuses.schemas');

const createStatusesRoutes = ({ controller }) => {
    const router = express.Router();

    router.get('/statuses', controller.listStatuses);
    router.post('/statuses', validate({ body: statusBody }), controller.createStatus);
    router.put('/statuses/:id', validate({ params: idParams, body: statusBody }), controller.updateStatus);
    router.delete('/statuses/:id', validate({ params: idParams }), controller.deleteStatus);

    return router;
};

module.exports = { createStatusesRoutes };
