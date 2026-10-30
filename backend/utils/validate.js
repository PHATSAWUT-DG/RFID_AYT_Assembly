const { AppError } = require('./AppError');

const PARTS = ['params', 'query', 'body'];

// Parsed values go to req.valid: Express 5 makes req.query a read-only getter,
// and one place for all parsed input keeps controllers consistent.
function validate(schemas) {
    return (req, res, next) => {
        const valid = {};
        const details = [];
        for (const part of PARTS) {
            const schema = schemas[part];
            if (!schema) continue;
            const result = schema.safeParse(req[part]);
            if (result.success) {
                valid[part] = result.data;
            } else {
                for (const issue of result.error.issues) {
                    details.push({ in: part, path: issue.path.join('.'), message: issue.message });
                }
            }
        }
        if (details.length > 0) {
            return next(new AppError('VALIDATION_ERROR', 400, 'Request validation failed', details));
        }
        req.valid = valid;
        return next();
    };
}

module.exports = { validate };
