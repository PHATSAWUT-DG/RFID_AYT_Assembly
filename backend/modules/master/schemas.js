const { z } = require('zod');

const idParams = z.object({ id: z.coerce.number().int().positive() });

const processBody = z.object({
    process_code: z.string().trim().min(1).max(10),
    process_name: z.string().trim().min(1).max(50),
    can_clear_tag: z.boolean().default(false),
});

// location_code keeps its case: readers send lower-case codes such as gr_f1.
const locationBody = z.object({
    location_code: z.string().trim().min(1).max(20),
    location_name: z.string().trim().min(1).max(100),
    process_id: z.number().int().positive(),
    is_active: z.boolean().default(true),
});

module.exports = { idParams, processBody, locationBody };
