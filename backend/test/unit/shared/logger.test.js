const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const winston = require('winston');
const { createLogger } = require('../../../shared/logger');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
const loggers = [];
after(() => {
    loggers.forEach((logger) => logger.close());
    fs.rmSync(dir, { recursive: true, force: true });
});

function makeLogger() {
    const logger = createLogger({ dir });
    loggers.push(logger);
    return logger;
}

function captureLines(logger) {
    const lines = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => lines.push(chunk.toString()));
    logger.add(new winston.transports.Stream({ stream }));
    return lines;
}

async function waitFor(check, ms = 2000) {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error('timed out');
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

test('a line is timestamp, level, message', () => {
    const logger = makeLogger();
    const lines = captureLines(logger);
    logger.info('hello');
    assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T\S+ info hello\s*$/);
});

test('logger.error(msg, err) keeps the stack', () => {
    const logger = makeLogger();
    const lines = captureLines(logger);
    logger.error('[GET /api/assembly/x t-1]', new Error('boom'));
    assert.match(lines[0], /\[GET \/api\/assembly\/x t-1\]/);
    assert.match(lines[0], /Error: boom\n\s+at /);
});

test('the stack is kept when the message holds a %d token (e.g. an encoded url)', () => {
    const logger = makeLogger();
    const lines = captureLines(logger);
    logger.error('[GET /api/assembly/a%de t-2]', new Error('boom'));
    assert.match(lines[0], /a%de t-2/);
    assert.match(lines[0], /Error: boom\n\s+at /);
});

test('lines are written to a daily file in dir', async () => {
    const logger = makeLogger();
    logger.info('to file');
    const file = () => fs.readdirSync(dir).find((name) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(name));
    await waitFor(() => file() && fs.readFileSync(path.join(dir, file()), 'utf8').includes('to file'));
});
