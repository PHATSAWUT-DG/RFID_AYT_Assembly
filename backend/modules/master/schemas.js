const { z } = require('zod');

const idParams = z.object({ id: z.coerce.number().int().positive() });

// PUT replaces the whole row, so its schema has no defaults: a missing field is a 400.
const processUpdateBody = z.object({
    process_code: z.string().trim().min(1).max(10),
    process_name: z.string().trim().min(1).max(50),
    can_clear_tag: z.boolean(),
});
const processBody = processUpdateBody.extend({ can_clear_tag: z.boolean().default(false) });

// location_code keeps its case: readers send lower-case codes such as gr_f1.
const locationUpdateBody = z.object({
    location_code: z.string().trim().min(1).max(20),
    location_name: z.string().trim().min(1).max(100),
    process_id: z.number().int().positive(),
    is_active: z.boolean(),
});
const locationBody = locationUpdateBody.extend({ is_active: z.boolean().default(true) });

// status_code is upper-cased: the DB collation ignores case, so "cleared" would hit the CLEARED rule anyway.
// CLEARED is the only status without a location (matches CK_master_assy_status_location_rule).
const statusBody = z.object({
    status_code: z.string().trim().toUpperCase().min(1).max(30).regex(/^[A-Z0-9_]+$/),
    status_label: z.string().trim().min(1).max(50),
    seq: z.number().int().min(0),
    location_id: z.number().int().positive().nullable(),
}).superRefine((body, ctx) => {
    const isCleared = body.status_code === 'CLEARED';
    if (isCleared && body.location_id !== null) {
        ctx.addIssue({ code: 'custom', path: ['location_id'], message: 'CLEARED must have no location' });
    }
    if (!isCleared && body.location_id === null) {
        ctx.addIssue({ code: 'custom', path: ['location_id'], message: 'An active status needs a location' });
    }
});

module.exports = {
    idParams, processBody, processUpdateBody, locationBody, locationUpdateBody, statusBody,
};
