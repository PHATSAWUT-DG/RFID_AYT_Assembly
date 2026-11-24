import { dashboardRoutes } from './dashboard';
import { createTestDb, callRoute } from '../testUtils';
import type { MockDb, Query, Route } from '../types';
import type {
    DailyInventoryRow, DashboardResponse, DashboardSummary, HistoryRow, ProcessSummaryRow, LocationRow,
} from '../../types/api';

let db: MockDb;
let routes: Route[];
beforeEach(() => {
    db = createTestDb();
    routes = dashboardRoutes(db);
});

const get = async <T>(path: string, query?: Query) => (await callRoute<T>(routes, 'GET', path, { query })).data;

// The API type allows null totals; the mock always returns numbers.
type Totals = { summary: Record<keyof DashboardSummary, number> };

describe('GET /dashboard', () => {
    test('total_qty is the sum of the three active steps', async () => {
        const { summary } = await get<Totals>('/dashboard');
        expect(summary.total_qty).toBe(summary.bf_issue + summary.gr_f1 + summary.mc_f1);
        expect(summary.bf_issue).toBeGreaterThan(0);
    });

    test('status_id filter keeps only that step, sent as a string', async () => {
        const { summary } = await get<Totals>('/dashboard', { status_id: '2' });
        expect(summary.gr_f1).toBeGreaterThan(0);
        expect(summary).toMatchObject({ bf_issue: 0, mc_f1: 0, total_qty: summary.gr_f1 });
    });

    test('brg_type and date filters narrow the totals', async () => {
        const all = (await get<Totals>('/dashboard')).summary;
        const none = (await get<Totals>('/dashboard', { brg_type: 'NO-SUCH-PART' })).summary;
        const past = (await get<Totals>('/dashboard', { date_to: '2000-01-01' })).summary;
        expect(all.total_qty).toBeGreaterThan(0);
        expect(none.total_qty).toBe(0);
        expect(past.total_qty).toBe(0);
    });

    test('reflects a change in the store', async () => {
        const before = (await get<Totals>('/dashboard')).summary;
        db.lots.find((l) => l.status_id === 1)!.status_id = 2; // fixture always has one
        const after = (await get<Totals>('/dashboard')).summary;
        expect(after.bf_issue).toBeLessThan(before.bf_issue);
        expect(after.gr_f1).toBeGreaterThan(before.gr_f1);
        expect(after.total_qty).toBe(before.total_qty);
    });

    test('top5 counts active lots per bearing type, most first, at most 5', async () => {
        const { top5 } = await get<DashboardResponse>('/dashboard');
        expect(top5.length).toBeGreaterThan(0);
        expect(top5.length).toBeLessThanOrEqual(5);
        const counts = top5.map((r) => r.total_qty);
        expect(counts).toEqual([...counts].sort((a, b) => b - a));
        const active6204 = db.lots.filter((l) => l.status_id !== 4 && l.brg_type === '6204ZZCM').length;
        // fixture always has this bearing type
        expect(top5.find((r) => r.brg_type === '6204ZZCM')!.total_qty).toBe(active6204);
    });

    test('lots lists filtered active lots with their status label', async () => {
        const { lots } = await get<DashboardResponse>('/dashboard', { status_id: '2' });
        expect(lots.length).toBeGreaterThan(0);
        expect(lots.every((l) => l.status_id === 2 && l.label_status === 'Gauging Room F1')).toBe(true);
        expect(Object.keys(lots[0]).sort()).toEqual([
            'brg_type', 'created_at', 'label_status', 'location_name', 'lot_no', 'machine_no',
            'qty', 'spec', 'status_id', 'tag_id', 'updated_at', 'wos',
        ]);
    });
});

describe('GET /dashboard/process-summary', () => {
    test('is ordered by process_code and totals the active inventory', async () => {
        const rows = await get<ProcessSummaryRow[]>('/dashboard/process-summary');
        expect(rows.map((r) => r.process_code)).toEqual(['1400', '1500']);
        const total = rows.reduce((sum, r) => sum + r.inventory_qty, 0);
        expect(total).toBe((await get<Totals>('/dashboard')).summary.total_qty);
    });
});

describe('GET /dashboard/daily-inventory', () => {
    test('returns flat machine + WOS rows in the Bruno shape', async () => {
        const rows = await get<DailyInventoryRow[]>('/dashboard/daily-inventory');
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(Object.keys(r).sort()).toEqual(['mc_no', 'part_no', 'qty', 'wos']));
    });

    test('every WOS and part pair also exists in the lots', async () => {
        const rows = await get<DailyInventoryRow[]>('/dashboard/daily-inventory');
        rows.forEach((r) => {
            expect(db.lots.some((l) => l.wos === r.wos && l.brg_type === r.part_no)).toBe(true);
        });
    });
});

describe('GET /dashboard/history', () => {
    test('the default "today" filter returns rows, all active and created today', async () => {
        const rows = await get<HistoryRow[]>('/dashboard/history', { date_from: '2026-09-29', date_to: '2026-09-29' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => {
            expect(r.created_at.startsWith('2026-09-29')).toBe(true);
            expect(r.status_id).not.toBe(4);
        });
    });

    test('filters status_id sent as a string', async () => {
        const rows = await get<HistoryRow[]>('/dashboard/history', { status_id: '2' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(r.status_id).toBe(2));
    });

    test('matches part numbers case-insensitively and partially', async () => {
        const rows = await get<HistoryRow[]>('/dashboard/history', { brg_type: '6204zz' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(r.brg_type).toBe('6204ZZCM'));
    });

    test('a location filter excludes lots with no location', async () => {
        const rows = await get<HistoryRow[]>('/dashboard/history', { location_name: 'GAUGING ROOM F1' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(r.location_name).toBe('GAUGING ROOM F1'));
    });

    test('rows carry label_status and are newest-updated first', async () => {
        const rows = await get<HistoryRow[]>('/dashboard/history');
        expect(rows[0].label_status).toBeTruthy();
        const updated = rows.map((r) => r.updated_at);
        expect(updated).toEqual([...updated].sort().reverse());
    });
});

describe('GET /dashboard/locations', () => {
    test('lists reader locations', async () => {
        expect(await get<LocationRow[]>('/dashboard/locations')).toEqual([
            { location_name: 'GAUGING ROOM F1' },
            { location_name: 'MC GAUGING F1' },
        ]);
    });
});
