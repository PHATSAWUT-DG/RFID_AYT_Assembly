import { clearTagRoutes } from './clearTag';
import { createTestDb, callRoute } from '../testUtils';
import type { MockDb, Route } from '../types';
import type { ClearTagHistoryRow, MockDoneRow } from '../../types/api';

let db: MockDb;
let routes: Route[];
beforeEach(() => {
    db = createTestDb();
    routes = clearTagRoutes(db);
});

describe('GET /clear-tag/history', () => {
    test('the default "today" filter returns lots cleared today', async () => {
        const { data } = await callRoute<ClearTagHistoryRow[]>(routes, 'GET', '/clear-tag/history', {
            query: { date_from: '2026-09-29', date_to: '2026-09-29' },
        });
        expect(data.length).toBeGreaterThan(0);
        data.forEach((h) => {
            expect(h.cleared_at.startsWith('2026-09-29')).toBe(true);
            expect(Object.keys(h).sort()).toEqual(
                ['brg_type', 'cleared_at', 'emp_id', 'lot_no', 'remark', 'spec', 'tag_id', 'updated_at'],
            );
        });
    });

    test('without dates returns every cleared lot, newest first', async () => {
        const { data } = await callRoute<ClearTagHistoryRow[]>(routes, 'GET', '/clear-tag/history');
        expect(data.length).toBe(db.lots.filter((l) => l.status_id === 4).length);
        const cleared = data.map((h) => h.cleared_at);
        expect(cleared).toEqual([...cleared].sort().reverse());
    });

    test('search matches lot_no, tag_id, emp_id or brg_type, case-insensitive', async () => {
        const target = db.lots.find((l) => l.status_id === 4)!;
        for (const field of ['lot_no', 'tag_id', 'emp_id', 'brg_type'] as const) {
            const needle = target[field]!.slice(1, 5).toLowerCase();
            const { data } = await callRoute<ClearTagHistoryRow[]>(routes, 'GET', '/clear-tag/history', {
                query: { search: needle },
            });
            expect(data.map((h) => h.lot_no)).toContain(target.lot_no);
            data.forEach((h) => {
                const haystack = [h.lot_no, h.tag_id, h.emp_id, h.brg_type].join('|').toLowerCase();
                expect(haystack).toContain(needle);
            });
        }
    });

    test('search combines with the date range', async () => {
        const { data } = await callRoute<ClearTagHistoryRow[]>(routes, 'GET', '/clear-tag/history', {
            query: { date_from: '2000-01-01', date_to: '2000-01-01', search: 'DEMO' },
        });
        expect(data).toEqual([]);
    });
});

describe('/mock-done', () => {
    test('lists newest first', async () => {
        const { data } = await callRoute<MockDoneRow[]>(routes, 'GET', '/mock-done');
        const created = data.map((m) => m.created_at);
        expect(created).toEqual([...created].sort().reverse());
    });

    test('adds a lot once', async () => {
        const add = () => callRoute(routes, 'POST', '/mock-done', { body: { lot_no: 'DEMO000020' } });
        expect((await add()).data).toEqual({ result: 'OK' });
        expect((await add()).data).toEqual({ result: 'ALREADY_EXISTS' });
        expect(db.mockDone.find((m) => m.lot_no === 'DEMO000020')).toMatchObject({
            id: 3, created_at: '2026-09-29T10:00:00.000Z',
        });
    });

    test('deletes by lot_no, and reports NOT_FOUND for an unknown one', async () => {
        expect((await callRoute(routes, 'DELETE', '/mock-done/DEMO000003')).data).toEqual({ result: 'OK' });
        expect((await callRoute(routes, 'DELETE', '/mock-done/DEMO000003')).data).toEqual({ result: 'NOT_FOUND' });
    });
});
