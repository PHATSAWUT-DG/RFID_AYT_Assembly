import { createDb, nextId } from './db';
import { toWallClock, daysAgo } from './time';
import { FIXED_NOW, createTestDb } from './testUtils';

const TODAY = '2026-09-29';

describe('time helpers', () => {
    test('toWallClock prints local date parts with a Z suffix, like the real API', () => {
        expect(toWallClock(new Date(2026, 8, 29, 10, 5, 7))).toBe('2026-09-29T10:05:07.000Z');
    });

    test('daysAgo counts calendar days back from today', () => {
        expect(daysAgo(FIXED_NOW, 1, 8, 30)).toBe('2026-09-28T08:30:00.000Z');
    });
});

describe('createDb', () => {
    test('returns an independent store on every call', () => {
        const a = createTestDb();
        const b = createTestDb();
        a.lots.pop();
        expect(b.lots.length).toBe(a.lots.length + 1);
    });

    test('now() uses the injected clock', () => {
        expect(createDb({ now: () => FIXED_NOW }).now()).toBe('2026-09-29T10:00:00.000Z');
    });

    test('seeds active lots at every process step, created today', () => {
        const todays = createTestDb().lots.filter((l) => l.created_at.startsWith(TODAY));
        [1, 2, 3].forEach((statusId) => {
            expect(todays.some((l) => l.status_id === statusId)).toBe(true);
        });
    });

    test('seeds lots cleared today, for the Clear Tag history default filter', () => {
        const cleared = createTestDb().lots.filter((l) => l.status_id === 4);
        expect(cleared.some((l) => l.cleared_at?.startsWith(TODAY))).toBe(true);
    });

    test('seeds more than one page (20 rows) of active lots', () => {
        expect(createTestDb().lots.filter((l) => l.status_id !== 4).length).toBeGreaterThan(20);
    });

    test('every registered lot exists in the AS400 catalog, and some catalog lots are unregistered', () => {
        const db = createTestDb();
        const registered = new Set(db.lots.map((l) => l.lot_no));
        db.lots.forEach((l) => expect(db.as400Lots.some((a) => a.lot_no === l.lot_no)).toBe(true));
        expect(db.as400Lots.some((a) => !registered.has(a.lot_no))).toBe(true);
    });

    test('every WOS holds one part, in the lots and in the AS400 catalog', () => {
        const db = createTestDb();
        [db.lots, db.as400Lots].forEach((rows) => {
            const partsByWos = new Map<string, Set<string>>();
            rows.forEach((r) => partsByWos.set(r.wos, (partsByWos.get(r.wos) ?? new Set()).add(r.brg_type)));
            expect(partsByWos.size).toBeGreaterThan(1);
            partsByWos.forEach((parts) => expect(parts.size).toBe(1));
        });
    });

    test('no timestamp is in the future, even shortly after midnight', () => {
        [FIXED_NOW, new Date(2026, 8, 29, 0, 20)].forEach((clock) => {
            const db = createDb({ now: () => clock });
            const now = db.now();
            db.lots.forEach((l) => {
                expect(l.created_at <= now).toBe(true);
                expect(l.updated_at <= now).toBe(true);
                expect(l.created_at <= l.updated_at).toBe(true);
            });
        });
    });

    test('seeds several lots cleared today, from more than one process', () => {
        const cleared = createTestDb().lots.filter((l) => l.cleared_at?.startsWith(TODAY));
        expect(cleared.length).toBeGreaterThanOrEqual(4);
        expect(new Set(cleared.map((l) => l.remark?.match(/^\[FROM: ([^\]]+)\]/)?.[1])).size).toBeGreaterThan(1);
    });

    test('status and process ids are numbers', () => {
        const db = createTestDb();
        [...db.statuses, ...db.processes, ...db.users].forEach((row) => expect(typeof row.id).toBe('number'));
    });

    test('seeds one admin user', () => {
        expect(createTestDb().users.filter((u) => u.position === 'admin')).toHaveLength(1);
    });
});

describe('nextId', () => {
    test('returns max id + 1, or 1 for an empty table', () => {
        expect(nextId([{ id: 3 }, { id: 9 }])).toBe(10);
        expect(nextId([])).toBe(1);
    });
});
