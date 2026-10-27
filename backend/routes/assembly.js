const express = require('express');
const router = express.Router();
const fs = require('fs');
const { sql, getPool } = require('../database');
const axios = require('axios');
const db = require('../db');
const { insertApiLog } = require('../services/apiLogService');
const { listMockDone, addMockDone, removeMockDone } = require('../services/mockService');
const { listStatuses, createStatus, updateStatus, deleteStatus } = require('../services/masterService');
const { verifyLogin, listUsers, createUser, updateUser, deleteUser } = require('../services/userService');


const BEARER_TOKEN = `Bearer ${process.env.API_TOKEN}`
const API_RECEIVE_URL = process.env.API_RECEIVE_URL;

// LOT
// ดึงข้อมูล lot จาก AS400
router.get('/lot/:lot_no', async (req, res) => {
    const url = `${API_RECEIVE_URL}/${req.params.lot_no}`;
    const start = Date.now();
    try {
        const result = await axios.get(url, {
            headers: { Authorization: BEARER_TOKEN }
        });
        const response_time_ms = Date.now() - start;
        const data = result.data[0];

        await insertApiLog(db, {
            api_type: 'RECEIVE', method: 'GET', url,
            request_params: req.params.lot_no,
            http_status: result.status,
            status: data ? 'SUCCESS' : 'NOT_FOUND',
            response: JSON.stringify(result.data),
            response_time_ms,
        });

        if (!data) return res.status(404).json({ error: 'LOT_NOT_FOUND' });

        res.json({
            lot_no: data.lotNo,
            wos: data.wosNo,
            brg_type: data.brgType,
            spec: data.specNo,
            qty: data.qty,
        });
    } catch (err) {
        const response_time_ms = Date.now() - start;
        await insertApiLog(db, {
            api_type: 'RECEIVE', method: 'GET', url,
            request_params: req.params.lot_no,
            http_status: err.response?.status || null,
            status: 'ERROR',
            response: err.response?.data ? JSON.stringify(err.response.data) : null,
            error_msg: err.message,
            response_time_ms,
        });
        res.status(500).json({ error: err.message });
    }
});

// ดึงข้อมูล lot จาก tag_id
router.get('/lot-by-tag/:tag_id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('tag_id', sql.VarChar, req.params.tag_id)
            .input('lot_no', sql.VarChar, null)
            .execute('Stored_tb_assy_lot_by_tag');
        if (result.recordset.length === 0)
            return res.status(404).json({ error: 'TAG_NOT_FOUND' });
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงจาก lot_no
router.get('/lot-by-lot/:lot_no', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('tag_id', sql.VarChar, null)
            .input('lot_no', sql.VarChar, req.params.lot_no)
            .execute('Stored_tb_assy_lot_by_tag');
        if (result.recordset.length === 0)
            return res.status(404).json({ error: 'LOT_NOT_FOUND' });
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROCESS
// register lot + tag
router.post('/register-tag', async (req, res) => {
    try {
        const { tag_id, lot_no, wos, brg_type, spec, qty, location_name } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('lot_no', sql.VarChar, lot_no)
            .input('wos', sql.VarChar, wos)
            .input('brg_type', sql.VarChar, brg_type)
            .input('spec', sql.VarChar, spec)
            .input('qty', sql.Int, qty)
            .input('tag_id', sql.VarChar, tag_id)
            .input('location_name', sql.VarChar, location_name || null)
            .execute('Stored_tb_assy_register');
        res.json({ result: result.recordset[0].result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// scan เข้า gauging room f1
router.post('/gauging-room-f1', async (req, res) => {
    try {
        const { tag_id, location_name } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('tag_id', sql.VarChar, tag_id)
            .input('location_name', sql.VarChar, location_name || null)
            .execute('Stored_tb_assy_gauging_room_f1');
        res.json({ result: result.recordset[0].result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// scan เข้า mc gauging f1
router.post('/mc-gauging-f1', async (req, res) => {
    try {
        const { tag_id, location_name } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('tag_id', sql.VarChar, tag_id)
            .input('location_name', sql.VarChar, location_name || null)
            .execute('Stored_tb_assy_mc_gauging_f1');
        res.json({ result: result.recordset[0].result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// change process manual
router.post('/change-process', async (req, res) => {
    try {
        const { tag_id, status_id, location_name, remark, emp_id } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('tag_id', sql.VarChar, tag_id)
            .input('status_id', sql.Int, status_id)
            .input('location_name', sql.VarChar, location_name || null)
            .input('remark', sql.VarChar, remark || null)
            .input('emp_id', sql.VarChar, emp_id || null)
            .execute('Stored_tb_assy_change_process');
        res.json({ result: result.recordset[0].result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// completed + clear tag
router.post('/completed', async (req, res) => {
    try {
        const { lot_no, remark, emp_id, machine_no } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('lot_no', sql.VarChar, lot_no)
            .input('remark', sql.VarChar, remark || null)
            .input('emp_id', sql.VarChar, emp_id || null)
            .input('machine_no', sql.VarChar, machine_no || null)
            .execute('Stored_tb_assy_completed');
        res.json({ result: result.recordset[0].result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// สำรอง — endpoint เดิม (ยังไม่ลบ รอ Python อัพเดท)
// router.post('/in-assy', async (req, res) => {
//     try {
//         const { tag_id } = req.body;
//         const pool = await getPool();
//         const result = await pool.request()
//             .input('tag_id', sql.VarChar, tag_id)
//             .execute('Stored_tb_assy_in_assy');
//         res.json({ result: result.recordset[0].result });
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// router.post('/wip-gauging', async (req, res) => {
//     try {
//         const { tag_id } = req.body;
//         const pool = await getPool();
//         const result = await pool.request()
//             .input('tag_id', sql.VarChar, tag_id)
//             .execute('Stored_tb_assy_wip_gauging');
//         res.json({ result: result.recordset[0].result });
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// MOCK DONE
router.get('/mock-done', async (req, res) => {
    try { res.json(await listMockDone(db)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mock-done', async (req, res) => {
    try { res.json(await addMockDone(db, req.body.lot_no)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/mock-done/:lot_no', async (req, res) => {
    try { res.json(await removeMockDone(db, req.params.lot_no)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// READER CONFIG
router.get('/readers-config', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync('../service/reader_config.json', 'utf8'));
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/readers-config', async (req, res) => {
    try {
        fs.writeFileSync('../service/reader_config.json', JSON.stringify(req.body, null, 4));
        res.json({ result: 'OK' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/readers-status', async (req, res) => {
    try {
        const result = await axios.get('http://localhost:8001/status', { timeout: 3000 });
        res.json(result.data);
    } catch {
        res.json({ readers: [] });
    }
});

router.post('/readers-restart', async (req, res) => {
    try {
        await axios.post('http://localhost:8001/restart', {}, { timeout: 3000 });
        res.json({ result: 'OK' });
    } catch {
        res.json({ result: 'OK' });
    }
});

// LOGIN / USER MANAGEMENT
router.post('/login', async (req, res) => {
    try {
        const { emp_id, password } = req.body;
        const user = await verifyLogin(db, emp_id, password);
        if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
        res.json({ result: 'OK', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/login/users', async (req, res) => {
    try { res.json(await listUsers(db)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login/users', async (req, res) => {
    try { res.json(await createUser(db, req.body)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/login/users/:id', async (req, res) => {
    try { res.json(await updateUser(db, { id: req.params.id, ...req.body })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/login/users/:id', async (req, res) => {
    try { res.json(await deleteUser(db, req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// STATUS MASTER
router.get('/status', async (req, res) => {
    try { res.json(await listStatuses(db)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/status', async (req, res) => {
    try { res.json(await createStatus(db, req.body)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/status/:id', async (req, res) => {
    try { res.json(await updateStatus(db, { id: req.params.id, ...req.body })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/status/:id', async (req, res) => {
    try { res.json(await deleteStatus(db, req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// DASHBOARD
router.get('/dashboard', async (req, res) => {
    try {
        const { date_from, date_to, brg_type, wos, lot_no, status_id } = req.query;
        const pool = await getPool();
        const result = await pool.request()
            .input('date_from', sql.Date, date_from || null)
            .input('date_to', sql.Date, date_to || null)
            .input('brg_type', sql.VarChar, brg_type || null)
            .input('wos', sql.VarChar, wos || null)
            .input('lot_no', sql.VarChar, lot_no || null)
            .input('status_id', sql.Int, status_id ? parseInt(status_id) : null)
            .execute('Stored_tb_assy_dashboard');
        res.json({
            summary: result.recordsets[0][0],
            top5: result.recordsets[1],
            lots: result.recordsets[2],
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/dashboard/history', async (req, res) => {
    try {
        const { date_from, date_to, brg_type, wos, lot_no, status_id, location_name } = req.query;
        const pool = await getPool();
        const result = await pool.request()
            .input('date_from', sql.Date, date_from || null)
            .input('date_to', sql.Date, date_to || null)
            .input('brg_type', sql.VarChar, brg_type || null)
            .input('wos', sql.VarChar, wos || null)
            .input('lot_no', sql.VarChar, lot_no || null)
            .input('status_id', sql.Int, status_id ? parseInt(status_id) : null)
            .input('location_name', sql.VarChar, location_name || null)
            .execute('Stored_tb_assy_dashboard_history');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/dashboard/process-summary', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .execute('Stored_tb_assy_dashboard_process_summary');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/dashboard/locations', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync('../service/reader_config.json', 'utf8'));
        const locations = config
            .filter(r => r.location_name)
            .map(r => ({ location_name: r.location_name }));
        res.json(locations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// clear tag history
router.get('/clear-tag/history', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        const pool = await getPool();
        const result = await pool.request()
            .input('date_from', sql.Date, date_from || null)
            .input('date_to',   sql.Date, date_to   || null)
            .execute('Stored_tb_assy_clear_tag_history');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;