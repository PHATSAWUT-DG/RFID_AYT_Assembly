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

        const send = (status, code, message, details) => {
            const error = { code, message };
            if (details !== undefined) error.details = details;
            error.request_id = req.id;
            return res.status(status).json({ error });
        };

        if (err instanceof AppError) {
            return send(err.httpStatus, err.code, err.message, err.details);
        }

        const bodyError = BODY_PARSER_ERRORS[err.type];
        if (bodyError) {
            return send(bodyError.status, 'VALIDATION_ERROR', bodyError.message);
        }

        logger.error(`[${req.method} ${req.originalUrl} ${req.id}]`, err);
        return send(500, 'INTERNAL', 'Internal server error');
    };
}

module.exports = { createErrorHandler };
