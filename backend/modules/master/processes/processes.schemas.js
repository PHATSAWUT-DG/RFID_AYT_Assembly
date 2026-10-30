const { z } = require('zod');

// One body for POST and PUT. Every field is required and none has a default:
// PUT replaces the whole row, so a default would silently reset a missing field.
const processBody = z.object({
    process_code: z.string().trim().min(1).max(10),
    process_name: z.string().trim().min(1).max(50),
    can_clear_tag: z.boolean(),
});

module.exports = { processBody };
