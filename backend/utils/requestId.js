const crypto = require('node:crypto');

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

// The format check keeps junk out of the logs and blocks header injection.
function assignRequestId() {
    return (req, res, next) => {
        const inbound = req.get('X-Request-Id');
        const isValid = typeof inbound === 'string' && VALID_REQUEST_ID.test(inbound);
        req.id = isValid ? inbound : crypto.randomUUID();
        res.set('X-Request-Id', req.id);
        next();
    };
}

module.exports = { assignRequestId };
