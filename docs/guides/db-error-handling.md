# How a database error becomes an API response

This guide explains what happens when SQL Server rejects a query, and how that error turns into the JSON the frontend receives. It uses the `master` module (`processes`, `locations`, `statuses`) as the example.

## The short version

1. The **database** checks its rules (unique codes, foreign keys). If a rule is broken, it throws an error.
2. The **repository** does nothing with the error. It lets it go up.
3. The **service** catches it and turns it into an `AppError` ("409 duplicate", "422 invalid reference", ...).
4. The **error handler** sends the `AppError` to the client as JSON.

You write **no try/catch** in repositories, services or controllers. One wrapper does it for the whole service.

## The path of an error

```text
Client: POST /api/assembly/locations { "location_code": "L01", ... }
   │
   ▼
routes        validate(...)       bad input?  → 400 VALIDATION_ERROR (the DB is never called)
   │
   ▼
controller    calls the service, does not catch anything
   │
   ▼
service       wrapped by mapMasterErrors(LOCATION_RULES, ...)
   │            catches the SQL error → toMasterError → AppError 409
   ▼
repository    runs the SQL, does not catch anything
   │
   ▼
SQL Server    "Violation of UNIQUE KEY constraint 'UQ_master_location_code'..."

               the error goes back up the same path ▲

errorHandler  AppError → res.status(409).json({ error: { ... } })
```

Express 5 sends a rejected `async` handler to the error handler on its own, so controllers need no try/catch either.

## Who does what

| Part | File | Job |
| --- | --- | --- |
| `AppError` | `backend/utils/AppError.js` | An error that already knows its HTTP status, code and message |
| `sqlErrors` | `backend/utils/sqlErrors.js` | Reads a SQL Server error: what kind of rule failed, and its name |
| `toMasterError` | `backend/modules/master/master.errors.js` | Turns one SQL error into one `AppError`, using the service's rules |
| `withMasterErrors` | same file | One try/catch: runs a function and passes any error to `toMasterError` |
| `mapMasterErrors` | same file | Puts `withMasterErrors` around every function of a service |
| `orNotFound` | same file | Throws a 404 when the repository found no row |
| `errorHandler` | `backend/utils/errorHandler.js` | Sends any error to the client as `{ error: { ... } }` |

## Step 1: SQL Server throws an error

The error from the `mssql` driver has a **number** and a **message**. The only way to know *which* rule failed is the constraint name inside the message.

| What went wrong | `err.number` | Part of `err.message` |
| --- | --- | --- |
| Code already exists (unique constraint) | 2627 | `Violation of UNIQUE KEY constraint 'UQ_master_location_code'` |
| Value already exists (unique index) | 2601 | `... with unique index 'UX_master_assy_status_location'` |
| The id you sent does not exist | 547 | `conflicted with the FOREIGN KEY constraint "FK_master_location_process"` |
| You delete a row that another table still uses | 547 | `conflicted with the REFERENCE constraint "FK_master_location_process"` |
| A value breaks a CHECK rule | 547 | `conflicted with the CHECK constraint "CK_master_assy_status_location_rule"` |

## Step 2: `sqlErrors.js` reads the error

Two small functions read the number and pull the name out of the message:

```js
getUniqueViolationName(err)
// 2601 / 2627 → 'UQ_master_location_code'
// anything else → null

getConstraintConflict(err)
// 547 → { kind: 'FOREIGN KEY', name: 'FK_master_location_process' }
//       kind is 'FOREIGN KEY', 'REFERENCE' or 'CHECK'
// anything else → null
```

This file knows SQL Server only. It knows nothing about HTTP or about our tables.

## Step 3: the service's rules

Each service declares one `RULES` object. It tells `toMasterError` what each constraint means for **this** resource.

```js
// backend/modules/master/locations/locations.service.js
const LOCATION_RULES = {
    uniques: { UQ_master_location_code: 'location_code' },   // constraint name → body field
    refs: { FK_master_location_process: 'process_id' },      // foreign key name → body field
    messages: {
        duplicate: 'Location code already exists',
        invalidRef: 'Process does not exist',
        inUse: 'Location is still in use',
    },
};
```

| Key | Why we need it |
| --- | --- |
| `uniques` | SQL gives the *constraint name*. The frontend needs the *field name* to show the error under the right input. It is also an allow-list: a unique rule that is not listed stays a 500, so you notice it. |
| `refs` | Same idea for foreign keys: which field held the bad id. |
| `messages` | The text the user reads. The error code is the same for every resource, but the words are not ("Process does not exist" vs "Location does not exist"). |

`processes` has no foreign key, so its `refs` is `{}`.

## Step 4: `toMasterError` picks the response

`toMasterError(err, rules)` checks the cases in this order:

| SQL case | Response | `details` |
| --- | --- | --- |
| Unique (2601/2627) **and** the name is in `uniques` | `409 MASTER_DUPLICATE` | yes: the field from `uniques` |
| FOREIGN KEY (547) | `422 MASTER_INVALID_REF` | yes: the field from `refs` (none if the name is not listed) |
| REFERENCE (547) | `409 MASTER_IN_USE` | no: the problem is a row in another table, not a field you sent |
| Anything else | the error is returned unchanged | becomes `500 INTERNAL` in the error handler |

"Anything else" includes a unique name missing from `uniques`, a CHECK conflict, and a lost connection. These are bugs or outages, not user mistakes, so the error handler logs them.

## Step 5: one wrapper for the whole service

You do not call `toMasterError` yourself. The service returns its functions through `mapMasterErrors`:

```js
const createLocationsService = ({ repo, db }) => {
    const createLocation = (input) => repo.insertLocation(db, input);

    const updateLocation = async (id, input) => {
        const row = await repo.updateLocation(db, id, input);
        return orNotFound(row, 'Location', id);
    };

    // Every function below is wrapped: a SQL error from any of them becomes an AppError.
    return mapMasterErrors(LOCATION_RULES, { listLocations, createLocation, updateLocation });
};
```

`mapMasterErrors` goes through the object and puts each function inside `withMasterErrors`, which is just this:

```js
try {
    return await fn();
} catch (err) {
    throw toMasterError(err, rules);
}
```

An `AppError` thrown inside the service (for example the 404 from `orNotFound`) is not a SQL error, so `toMasterError` returns it unchanged and it goes on to the error handler.

## Not found is not a SQL error

When you update or delete an id that does not exist, SQL Server does **not** throw. It just changes zero rows. So the service checks the result with `orNotFound`:

| Repository returns | Meaning | `orNotFound` |
| --- | --- | --- |
| a row | found | returns the row |
| `null` | update or read: no row with this id | throws `404 MASTER_NOT_FOUND` |
| `1` | delete: one row deleted | returns `1` |
| `0` | delete: no row with this id | throws `404 MASTER_NOT_FOUND` |

## Step 6: the error handler sends the JSON

`errorHandler` is the last middleware in `app.js`. Every error ends here.

| Error | Response |
| --- | --- |
| `AppError` | its own status, code, message and details |
| Bad JSON body | `400 VALIDATION_ERROR` |
| Anything else | `500 INTERNAL`, and the real error is written to the log |

Every error body has the same shape:

```json
{
  "error": {
    "code": "MASTER_DUPLICATE",
    "message": "Location code already exists",
    "details": [{ "in": "body", "path": "location_code", "message": "Location code already exists" }],
    "request_id": "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b"
  }
}
```

- `code`: stable text the frontend can check in code. Never change it lightly.
- `message`: text for people. It can change.
- `details`: only when the error is about a field. Same shape as validation errors, so the frontend handles both the same way.
- `request_id`: the same id is in the server log. Ask for it when someone reports a bug.

A 500 never shows the SQL message to the client. It can contain table names and data.

## A full example

The client creates a location with a code that already exists:

```http
POST /api/assembly/locations
{ "location_code": "L01", "location_name": "Line 1", "process_id": 1, "is_active": true }
```

1. `validate` passes: the body has the right shape.
2. The controller calls `service.createLocation(body)`.
3. The repository runs the `INSERT`. SQL Server throws error 2627 with `'UQ_master_location_code'` in the message.
4. The wrapper catches it. `getUniqueViolationName` returns `'UQ_master_location_code'`.
5. `LOCATION_RULES.uniques` maps it to `location_code`, so `toMasterError` returns `AppError('MASTER_DUPLICATE', 409, ...)`.
6. The error handler sends `409` with the JSON body shown above.

## Validate first, let the database be the safety net

Check what you can **before** the query, in the zod schema (`<resource>.schemas.js`):

- Shape and type rules: required fields, length, number vs string. These give `400 VALIDATION_ERROR`.
- CHECK rules: the database's CHECK constraints are copied into the schema. Example: `statuses.schemas.js` rejects "an active status with no location" before SQL ever sees it.

Leave to the database what only the database can know:

- "Does this code already exist?" (unique)
- "Does this process id exist?" (foreign key)
- "Is this row still used?" (reference)

Checking these first in code with a `SELECT` is not safe: another request can change the data between your `SELECT` and your `INSERT`. The database rule is always right.

## How to add a new rule

**A new unique constraint or foreign key on an existing table:**

1. Add the constraint in the `.sql` file and give it a clear name (`UQ_<table>_<column>`, `FK_<table>_<other table>`).
2. Add one line to the service's `RULES`: `uniques` for a unique rule, `refs` for a foreign key.
3. Add an integration test that triggers the constraint and checks its name.
4. Add a unit test for the service: the right status, code and field.

**A new resource in `master`:**

1. Write its `RULES` object at the top of `<resource>.service.js`.
2. Return the service through `mapMasterErrors(RULES, { ... })`.
3. Use `orNotFound` for update, delete and read by id.

## Mistakes to avoid

| Do not | Why |
| --- | --- |
| Write try/catch in a controller or repository | The wrapper and the error handler already do it. Two catches hide errors. |
| Catch an error and return `null` or `false` | The client gets 200 or 404 for a real failure. |
| Send `err.message` from SQL to the client | It can leak table names and data. |
| Map every unknown SQL error to 400 | Real bugs then look like user mistakes and are never logged. |
| Rename a constraint in SQL without updating `RULES` | The 409/422 silently becomes a 500. The integration tests catch this. |

## Where to read more

- `backend/README.md`: Rules and Cross-resource rules sections
- Spec: `docs/superpowers/specs/2026-10-01-backend-redesign-design.md`, section 9 (response envelope and error codes)
- Tests: `backend/test/unit/modules/master/master.errors.test.js`, `backend/test/integration/modules/master/`
