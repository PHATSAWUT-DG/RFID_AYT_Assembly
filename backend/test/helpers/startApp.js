const { once } = require('node:events');

// Starts an app on a random free local port for HTTP-level tests.
async function startApp(app) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
}

module.exports = { startApp };
