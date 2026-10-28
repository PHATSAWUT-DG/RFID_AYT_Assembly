const { z } = require('zod');

// location_code keeps its case: readers send lower-case codes such as gr_f1.
const locationUpdateBody = z.object({
    location_code: z.string().trim().min(1).max(20),
    location_name: z.string().trim().min(1).max(100),
    process_id: z.number().int().positive(),
    is_active: z.boolean(),
});
const locationBody = locationUpdateBody.extend({ is_active: z.boolean().default(true) });

module.exports = { locationBody, locationUpdateBody };
