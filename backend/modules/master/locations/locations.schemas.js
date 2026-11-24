const { z } = require('zod');

// One body for POST and PUT. Every field is required and none has a default:
// PUT replaces the whole row, so a default would silently reset a missing field.
// location_code keeps its case: readers send lower-case codes such as gr_f1.
const locationBody = z.object({
    location_code: z.string().trim().min(1).max(20),
    location_name: z.string().trim().min(1).max(100),
    process_id: z.number().int().positive(),
    is_active: z.boolean(),
});

module.exports = { locationBody };
