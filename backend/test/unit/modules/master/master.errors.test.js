const { test } = require('node:test');
const assert = require('node:assert');
const { orNotFound, mapMasterErrors } = require('../../../../modules/master/master.errors');
const { AppError } = require('../../../../shared/AppError');

test('orNotFound: null (update), undefined or 0 (delete count) -> MASTER_NOT_FOUND 404 naming the entity and id', () => {
    for (const result of [null, undefined, 0]) {
        assert.throws(() => orNotFound(result, 'Process', 9), (err) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.code, 'MASTER_NOT_FOUND');
            assert.strictEqual(err.httpStatus, 404);
            assert.strictEqual(err.message, 'Process 9 not found');
            return true;
        }, `result ${result}`);
    }
});

test('orNotFound: a row or a count of 1 is returned unchanged', () => {
    const row = { id: 9 };
    assert.strictEqual(orNotFound(row, 'Process', 9), row);
    assert.strictEqual(orNotFound(1, 'Process', 9), 1);
});

const rules = {
    uniques: { UQ_master_process_code: 'process_code' },
    refs: {},
    messages: { duplicate: 'Process code already exists', invalidRef: 'x', inUse: 'x' },
};
const duplicateCode = Object.assign(new Error(
    "Violation of UNIQUE KEY constraint 'UQ_master_process_code'. Cannot insert duplicate key in object 'dbo.tb_master_process'."),
{ number: 2627 });

test('mapMasterErrors: keeps every function, passes the arguments and returns the result', async () => {
    const service = mapMasterErrors(rules, {
        sum: async (a, b) => a + b,
        echo: (value) => value,
    });
    assert.deepStrictEqual(Object.keys(service), ['sum', 'echo']);
    assert.strictEqual(await service.sum(2, 3), 5);
    assert.strictEqual(await service.echo('x'), 'x');
});

test('mapMasterErrors: a SQL constraint error becomes the AppError from the rules', async () => {
    const service = mapMasterErrors(rules, { create: async () => { throw duplicateCode; } });
    await assert.rejects(service.create(), (err) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.code, 'MASTER_DUPLICATE');
        assert.strictEqual(err.httpStatus, 409);
        assert.deepStrictEqual(err.details.map((d) => d.path), ['process_code']);
        return true;
    });
});

test('mapMasterErrors: an AppError or any other error passes through unchanged', async () => {
    const notFound = new AppError('MASTER_NOT_FOUND', 404, 'Process 9 not found');
    const boom = new Error('connection lost');
    const service = mapMasterErrors(rules, {
        update: async () => { throw notFound; },
        list: () => { throw boom; }, // a sync throw is caught too
    });
    await assert.rejects(service.update(), (err) => err === notFound);
    await assert.rejects(service.list(), (err) => err === boom);
});
