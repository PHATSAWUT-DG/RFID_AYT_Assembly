const { test } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');
const { validate } = require('../../../shared/validate');
const { AppError } = require('../../../shared/AppError');

function run(middleware, req) {
    let nextArg = 'not called';
    middleware(req, {}, (arg) => { nextArg = arg; });
    return nextArg;
}

test('valid input: parsed values go to req.valid and next() gets no error', () => {
    const mw = validate({
        params: z.object({ id: z.coerce.number().int().positive() }),
        query: z.object({ page: z.coerce.number().int().default(1) }),
        body: z.object({ lot_no: z.string().min(1) }),
    });
    const req = { params: { id: '7' }, query: {}, body: { lot_no: 'L1' } };
    const nextArg = run(mw, req);
    assert.strictEqual(nextArg, undefined);
    assert.deepStrictEqual(req.valid, { params: { id: 7 }, query: { page: 1 }, body: { lot_no: 'L1' } });
});

test('req.query is never written (Express 5 makes it read-only)', () => {
    const mw = validate({ query: z.object({ page: z.coerce.number() }) });
    const query = { page: '2' };
    const req = { query };
    run(mw, req);
    assert.strictEqual(req.query, query);
    assert.deepStrictEqual(req.valid.query, { page: 2 });
});

test('invalid input: one VALIDATION_ERROR listing issues from every part', () => {
    const mw = validate({
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({ lot_no: z.string().min(1), tag_codes: z.array(z.string().min(1)) }),
    });
    const req = { params: { id: 'abc' }, body: { lot_no: '', tag_codes: ['ok', ''] } };
    const err = run(mw, req);
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 'VALIDATION_ERROR');
    assert.strictEqual(err.httpStatus, 400);
    const where = err.details.map((d) => `${d.in}:${d.path}`).sort();
    assert.deepStrictEqual(where, ['body:lot_no', 'body:tag_codes.1', 'params:id']);
    assert.ok(err.details.every((d) => typeof d.message === 'string' && d.message.length > 0));
    assert.strictEqual(req.valid, undefined);
});

test('missing body (Express 5 leaves req.body undefined) is a validation error, not a crash', () => {
    const mw = validate({ body: z.object({ lot_no: z.string() }) });
    const err = run(mw, { params: {}, query: {} });
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 'VALIDATION_ERROR');
});
