const { z } = require('zod');

// PUT replaces the whole row, so its schema has no defaults: a missing field is a 400.
const processUpdateBody = z.object({
    process_code: z.string().trim().min(1).max(10),
    process_name: z.string().trim().min(1).max(50),
    can_clear_tag: z.boolean(),
});
const processBody = processUpdateBody.extend({ can_clear_tag: z.boolean().default(false) });

module.exports = { processBody, processUpdateBody };
