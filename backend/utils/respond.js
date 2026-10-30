// Success bodies are { data } or { data, meta }. See spec 9.
function sendData(res, data, { status = 200, meta } = {}) {
    const body = meta === undefined ? { data } : { data, meta };
    return res.status(status).json(body);
}

module.exports = { sendData };
