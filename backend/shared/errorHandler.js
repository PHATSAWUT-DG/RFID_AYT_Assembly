const { AppError } = require('./AppError');

// Error types set by express.json() (body-parser) for bad client input.
const BODY_PARSER_ERRORS = {
    'entity.parse.failed': { status: 400, message: 'Request body is not valid JSON' },
    'entity.too.large': { status: 413, message: 'Request body is too large' },
};

function createErrorHandler({ logger = console } = {}) {
    // Express detects error middleware by its 4 parameters, so `next` must stay.
    return (err, req, res, next) => {
        if (res.headersSent) return next(err);

        if (err instanceof AppError) {
            const body = { error: err.code, message: err.message };
            if (err.details !== undefined) body.details = err.details;
            return res.status(err.httpStatus).json(body);
        }

        const bodyError = BODY_PARSER_ERRORS[err.type];
        if (bodyError) {
            return res.status(bodyError.status).json({ error: 'VALIDATION_ERROR', message: bodyError.message });
        }

        logger.error(`[${req.method} ${req.originalUrl}]`, err);
        return res.status(500).json({ error: 'INTERNAL', message: 'Internal server error' });
    };
}

module.exports = { createErrorHandler };
