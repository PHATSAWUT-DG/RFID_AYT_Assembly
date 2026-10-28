const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { assignRequestId } = require('../../../shared/requestId');
const { accessLog } = require('../../../shared/accessLog');
const { startApp } = require('../../helpers/startApp');

const lines = [];
const logger = { info: (line) => lines.push(line) };

const app = express();
app.use(assignRequestId());
app.use(accessLog({ logger }));
app.get('/ok', (req, res) => res.json({ ok: true }));
app.get('/missing', (req, res) => res.status(404).json({}));

let server;
before(async () => { server = await startApp(app); });
after(() => server.close());

// morgan logs on response finish, which can land just after the client has the response.
async function lineFor(id) {
    const end = Date.now() + 2000;
    for (;;) {
        const line = lines.find((l) => l.endsWith(` ${id}`));
        if (line) return line;
        if (Date.now() > end) throw new Error(`no log line for ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

const call = (path, id) => fetch(`${server.baseUrl}${path}`, { headers: { 'X-Request-Id': id } });

test('one line per request: method url status ms request id', async () => {
    await call('/ok?lot_no=L1', 'a-1');
    assert.match(await lineFor('a-1'), /^GET \/ok\?lot_no=L1 200 \d+(\.\d+)? ms a-1$/);
});

test('non-2xx responses are logged with their status', async () => {
    await call('/missing', 'a-2');
    assert.match(await lineFor('a-2'), /^GET \/missing 404 /);
});
