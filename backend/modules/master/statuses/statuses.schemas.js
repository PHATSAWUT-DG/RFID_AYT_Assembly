const { z } = require('zod');

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

module.exports = { statusBody };
