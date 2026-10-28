const { z } = require('zod');

const idParams = z.object({ id: z.coerce.number().int().positive() });

module.exports = { idParams };
