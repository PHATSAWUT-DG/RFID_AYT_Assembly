const { test } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { createFakeDb } = require('../helpers/fakeDb');
const {
    verifyLogin, listUsers, createUser, updateUser, deleteUser,
} = require('../../services/userService');

test('verifyLogin returns the user when the password matches its hash', async () => {
    const hash = bcrypt.hashSync('secret', 10);
    const db = createFakeDb([{ recordset: [{ id: 1, emp_id: 'E1', eng_name: 'A', eng_surname: 'B',
        password: hash, position: 'admin' }] }]);
    const user = await verifyLogin(db, 'E1', 'secret');
    assert.strictEqual(user.emp_id, 'E1');
    assert.strictEqual(user.password, undefined, 'password must not be returned');
});

test('verifyLogin returns null on a wrong password', async () => {
    const db = createFakeDb([{ recordset: [{ id: 1, emp_id: 'E1',
        password: bcrypt.hashSync('secret', 10) }] }]);
    assert.strictEqual(await verifyLogin(db, 'E1', 'wrong'), null);
});

test('verifyLogin returns null on no match', async () => {
    const db = createFakeDb([{ recordset: [] }]);
    assert.strictEqual(await verifyLogin(db, 'E1', 'wrong'), null);
});

test('listUsers returns rows', async () => {
    const db = createFakeDb([{ recordset: [{ id: 1, emp_id: 'E1' }] }]);
    const rows = await listUsers(db);
    assert.strictEqual(rows.length, 1);
});

test('createUser stores a hash, never the plaintext', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    await createUser(db, { emp_id: 'E1', eng_name: 'A', eng_surname: 'B',
        password: 'secret', position: 'user' });
    const stored = db.calls[0].params.password;
    assert.notStrictEqual(stored, 'secret');
    assert.match(stored, /^\$2[aby]\$/);
});

test('createUser returns OK', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    assert.deepStrictEqual(
        await createUser(db, { emp_id: 'E1', eng_name: 'A', eng_surname: 'B', password: 'p', position: 'user' }),
        { result: 'OK' });
});

test('createUser returns the error message as result, not a throw', async () => {
    const db = { query: async () => { throw new Error('duplicate key'); } };
    assert.deepStrictEqual(
        await createUser(db, { emp_id: 'E1', eng_name: 'A', eng_surname: 'B', password: 'p', position: 'user' }),
        { result: 'duplicate key' });
});

test('updateUser omits emp_id and password from the statement', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    await updateUser(db, { id: 1, eng_name: 'A', eng_surname: 'B', position: 'admin' });
    assert.doesNotMatch(db.calls[0].sql, /emp_id/);
    assert.doesNotMatch(db.calls[0].sql, /password/);
});

test('deleteUser returns OK', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    assert.deepStrictEqual(await deleteUser(db, 1), { result: 'OK' });
});
