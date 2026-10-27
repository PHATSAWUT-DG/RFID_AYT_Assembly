const { z } = require('zod');

const idParams = z.object({ id: z.coerce.number().int().positive() });

const processBody = z.object({
    process_code: z.string().trim().min(1).max(10),
    process_name: z.string().trim().min(1).max(50),
    can_clear_tag: z.boolean().default(false),
});

module.exports = { idParams, processBody };
