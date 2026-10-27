const bcrypt = require('bcryptjs');

// Interim: the SPs returned SQL errors as a `result` string and the frontend
// depends on it. B6 replaces this with typed errors and HTTP codes.
const asResult = async (fn) => {
    try {
        await fn();
        return { result: 'OK' };
    } catch (err) {
        return { result: err.message };
    }
};

// The hash crosses the service boundary here (needed for bcrypt.compareSync)
// and must not leak further — the destructure below is what keeps it out of
// the HTTP response.
const verifyLogin = async (db, empId, password) => {
    const out = await db.query(
        `SELECT id, emp_id, eng_name, eng_surname, position, password
         FROM tb_assy_login WHERE emp_id = @emp_id`,
        { emp_id: empId });

    const row = out.recordset[0];
    if (!row) return null;
    if (!bcrypt.compareSync(password, row.password)) return null;

    const { password: _discarded, ...user } = row;
    return user;
};

const listUsers = async (db) => {
    const out = await db.query(
        `SELECT id, emp_id, eng_name, eng_surname, position FROM tb_assy_login`);
    return out.recordset;
};

const createUser = (db, { emp_id, eng_name, eng_surname, password, position }) =>
    asResult(() => db.query(
        `INSERT INTO tb_assy_login (emp_id, eng_name, eng_surname, password, position)
         VALUES (@emp_id, @eng_name, @eng_surname, @password, @position)`,
        { emp_id, eng_name, eng_surname, password: bcrypt.hashSync(password, 10), position }));

// Does not touch emp_id or password — there is no password-change path here.
const updateUser = (db, { id, eng_name, eng_surname, position }) =>
    asResult(() => db.query(
        `UPDATE tb_assy_login
         SET eng_name = @eng_name, eng_surname = @eng_surname, position = @position
         WHERE id = @id`,
        { id, eng_name, eng_surname, position }));

const deleteUser = (db, id) =>
    asResult(() => db.query(`DELETE FROM tb_assy_login WHERE id = @id`, { id }));

module.exports = { verifyLogin, listUsers, createUser, updateUser, deleteUser };
