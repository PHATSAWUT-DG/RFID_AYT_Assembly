const listMockDone = async (db) => {
    const out = await db.query(
        `SELECT id, lot_no, created_at FROM tb_assy_mock_done ORDER BY created_at DESC`);
    return out.recordset;
};

const addMockDone = async (db, lotNo) => {
    const existing = await db.query(
        `SELECT 1 AS n FROM tb_assy_mock_done WHERE lot_no = @lot_no`, { lot_no: lotNo });
    if (existing.recordset.length > 0) return { result: 'ALREADY_EXISTS' };

    await db.query(`INSERT INTO tb_assy_mock_done (lot_no) VALUES (@lot_no)`, { lot_no: lotNo });
    return { result: 'OK' };
};

const removeMockDone = async (db, lotNo) => {
    const out = await db.query(
        `DELETE FROM tb_assy_mock_done WHERE lot_no = @lot_no`, { lot_no: lotNo });
    return { result: out.rowsAffected[0] > 0 ? 'OK' : 'NOT_FOUND' };
};

module.exports = { listMockDone, addMockDone, removeMockDone };
