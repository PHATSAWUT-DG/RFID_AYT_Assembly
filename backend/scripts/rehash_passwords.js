// One-off: hash any plaintext password still in tb_assy_login.
// Run once, after alter_login_password_width.sql, with the server stopped:
//   cd backend && node scripts/rehash_passwords.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');

const ALREADY_HASHED = /^\$2[aby]\$/;

async function main() {
    const pool = await getPool();
    const { recordset: rows } = await pool.request()
        .query('SELECT id, password FROM tb_assy_login');

    let rehashed = 0;
    for (const row of rows) {
        if (ALREADY_HASHED.test(row.password)) continue;
        const hash = bcrypt.hashSync(row.password, 10);
        await pool.request()
            .input('id', sql.Int, row.id)
            .input('password', sql.VarChar, hash)
            .query('UPDATE tb_assy_login SET password = @password WHERE id = @id');
        rehashed++;
    }

    console.log(`Rehashed ${rehashed} of ${rows.length} row(s).`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
