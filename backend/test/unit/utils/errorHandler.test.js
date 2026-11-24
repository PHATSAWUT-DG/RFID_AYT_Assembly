const { test } = require('node:test');
const assert = require('node:assert');
const { AppError } = require('../../../utils/AppError');
const { createErrorHandler } = require('../../../utils/errorHandler');

function fakeRes() {
    return {
        statusCode: 200,
        body: undefined,
        headersSent: false,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

function fakeLogger() {
    const errors = [];
    return { errors, error: (...args) => errors.push(args) };
}

const req = { method: 'POST', originalUrl: '/api/assembly/pairings', id: 'r-1' };

test('AppError is an Error with code, status and details', () => {
    const err = new AppError('TAG_IN_USE', 409, 'Tag is in use', { lot_no: 'L1' });
    assert.ok(err instanceof Error);
    assert.strictEqual(err.code, 'TAG_IN_USE');
    assert.strictEqual(err.httpStatus, 409);
    assert.strictEqual(err.message, 'Tag is in use');
    assert.deepStrictEqual(err.details, { lot_no: 'L1' });
});

test('AppError becomes its status and { error: { code, message, details, request_id } }', () => {
    const res = fakeRes();
    createErrorHandler({ logger: fakeLogger() })(
        new AppError('TAG_IN_USE', 409, 'Tag is in use', { lot_no: 'L1' }), req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, {
        error: { code: 'TAG_IN_USE', message: 'Tag is in use', details: { lot_no: 'L1' }, request_id: 'r-1' },
    });
});

test('AppError without details has no details key', () => {
    const res = fakeRes();
    createErrorHandler({ logger: fakeLogger() })(
        new AppError('LOT_NOT_FOUND', 404, 'Lot not found'), req, res, () => {});
    assert.deepStrictEqual(res.body, { error: { code: 'LOT_NOT_FOUND', message: 'Lot not found', request_id: 'r-1' } });
});

test('malformed JSON body becomes 400 VALIDATION_ERROR', () => {
    const res = fakeRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 });
    createErrorHandler({ logger: fakeLogger() })(err, req, res, () => {});
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, {
        error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON', request_id: 'r-1' },
    });
});

test('body over the size limit becomes 413 JSON', () => {
    const res = fakeRes();
    const err = Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 });
    createErrorHandler({ logger: fakeLogger() })(err, req, res, () => {});
    assert.strictEqual(res.statusCode, 413);
    assert.deepStrictEqual(res.body, {
        error: { code: 'VALIDATION_ERROR', message: 'Request body is too large', request_id: 'r-1' },
    });
});

test('unknown error is logged and hidden behind 500 INTERNAL', () => {
    const res = fakeRes();
    const logger = fakeLogger();
    createErrorHandler({ logger })(new Error('Login failed for user sa'), req, res, () => {});
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, {
        error: { code: 'INTERNAL', message: 'Internal server error', request_id: 'r-1' },
    });
    assert.strictEqual(logger.errors.length, 1);
    assert.match(String(logger.errors[0][0]), /POST \/api\/assembly\/pairings/);
});

test('headers already sent: passes the error on to Express', () => {
    const res = { ...fakeRes(), headersSent: true };
    const err = new Error('late');
    let passed;
    createErrorHandler({ logger: fakeLogger() })(err, req, res, (e) => { passed = e; });
    assert.strictEqual(passed, err);
    assert.strictEqual(res.body, undefined);
});
