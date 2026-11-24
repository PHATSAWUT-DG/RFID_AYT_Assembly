// Test double for the db seam. Queue responses in call order; inspect `calls`
// afterwards to assert on the SQL and parameters a service produced.
function createFakeDb(responses = []) {
    const queue = [...responses];
    const calls = [];

    const query = async (sql, params = {}) => {
        calls.push({ sql, params });
        if (queue.length === 0) {
            throw new Error(`fakeDb: no queued response for query: ${sql}`);
        }
        return queue.shift();
    };

    // Transactions run the callback against the same fake so the service under
    // test exercises its real code path.
    return { calls, query, transaction: async (fn) => fn({ query }) };
}

module.exports = { createFakeDb };
