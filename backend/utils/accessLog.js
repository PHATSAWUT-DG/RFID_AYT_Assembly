const morgan = require('morgan');

morgan.token('id', (req) => req.id);

// Needs assignRequestId() before it, so every line carries req.id.
function accessLog({ logger }) {
    return morgan(':method :url :status :response-time ms :id', {
        stream: { write: (line) => logger.info(line.trim()) },
    });
}

module.exports = { accessLog };
