const winston = require('winston');
require('winston-daily-rotate-file');

const { format } = winston;
const SPLAT = Symbol.for('splat');

// A message with a %d-like token (e.g. an encoded url) makes winston keep the
// extra args in SPLAT instead of merging the Error, so its stack would be lost.
const stackFromSplat = format((info) => {
    const err = info[SPLAT]?.find((arg) => arg instanceof Error);
    if (err && !info.stack) info.stack = err.stack;
    return info;
});

const lineFormat = format.combine(
    stackFromSplat(),
    format.errors({ stack: true }),
    format.timestamp(),
    format.printf(({ timestamp, level, message, stack }) => `${timestamp} ${level} ${message}${stack ? `\n${stack}` : ''}`),
);

function createLogger({ dir }) {
    return winston.createLogger({
        level: 'info',
        format: lineFormat,
        transports: [
            new winston.transports.Console(),
            new winston.transports.DailyRotateFile({
                dirname: dir,
                filename: 'app-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
            }),
        ],
    });
}

module.exports = { createLogger };
