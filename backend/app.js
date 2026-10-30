const express = require('express');
const cors = require('cors');
const { AppError } = require('./utils/AppError');
const { createErrorHandler } = require('./utils/errorHandler');
const { assignRequestId } = require('./utils/requestId');
const { accessLog } = require('./utils/accessLog');

function createApp({ apiRouter, logger = console }) {
    const app = express();
    app.use(assignRequestId());
    app.use(accessLog({ logger }));
    app.use(cors());
    app.use(express.json());

    app.use('/api/assembly', apiRouter);
    app.use('/api/assembly', (req, res, next) => {
        next(new AppError('ROUTE_NOT_FOUND', 404, `No route for ${req.method} ${req.originalUrl}`));
    });

    app.use(createErrorHandler({ logger }));
    return app;
}

module.exports = { createApp };
