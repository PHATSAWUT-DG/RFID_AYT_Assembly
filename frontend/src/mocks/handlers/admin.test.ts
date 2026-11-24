import { adminRoutes } from './admin';
import { createTestDb, callRoute } from '../testUtils';
import type { Method, MockDb, Route } from '../types';
import type { AdminResult, Process, ReaderConfig, Status } from '../../types/api';

let db: MockDb;
let routes: Route[];
beforeEach(() => {
    db = createTestDb();
    routes = adminRoutes(db);
});

const call = <T = AdminResult>(method: Method, path: string, body?: unknown) =>
    callRoute<T>(routes, method, path, { body });

describe('/status', () => {
    test('lists statuses joined with their process, with numeric ids', async () => {
        const { data } = await call<Status[]>('GET', '/status');
        expect(data.find((s) => s.id === 1)).toMatchObject({ status: 'bf_issue', process_code: '1400' });
        data.forEach((s) => expect(typeof s.id).toBe('number'));
    });

    test('creates a status with the next id', async () => {
        expect((await call('POST', '/status', { status: 'x', label_status: 'X' })).data).toEqual({ result: 'OK' });
        expect(db.statuses.find((s) => s.status === 'x')).toMatchObject({ id: 5, process_id: null });
    });

    test('updates by string id and unlinks the process, like the real API', async () => {
        await call('PUT', '/status/2', { status: 'gr_f1', label_status: 'Renamed' });
        expect(db.statuses.find((s) => s.id === 2)).toMatchObject({ label_status: 'Renamed', process_id: null });
    });

    test('refuses to delete a status used by a lot', async () => {
        const { data } = await call('DELETE', '/status/1');
        expect(data.result).toMatch(/REFERENCE constraint "FK_assy_lot_status"/);
        expect(db.statuses.some((s) => s.id === 1)).toBe(true);
    });

    test('deletes an unused status', async () => {
        await call('POST', '/status', { status: 'x', label_status: 'X' });
        expect((await call('DELETE', '/status/5')).data).toEqual({ result: 'OK' });
        expect(db.statuses.some((s) => s.id === 5)).toBe(false);
    });
});

describe('/process', () => {
    test('lists processes ordered by code', async () => {
        await call('POST', '/process', { process_code: '0100', process_name: 'FIRST', can_clear_tag: false });
        const { data } = await call<Process[]>('GET', '/process');
        expect(data.map((p) => p.process_code)).toEqual(['0100', '1400', '1500']);
    });

    test('creates a process with can_clear_tag', async () => {
        await call('POST', '/process', { process_code: '0100', process_name: 'FIRST', can_clear_tag: true });
        expect(db.processes.find((p) => p.process_code === '0100')).toMatchObject({ can_clear_tag: true });
    });

    test('updates by string id', async () => {
        await call('PUT', '/process/1', { process_code: '1401', process_name: 'RENAMED', can_clear_tag: true });
        expect(db.processes.find((p) => p.id === 1)).toMatchObject({
            process_code: '1401', process_name: 'RENAMED', can_clear_tag: true,
        });
    });

    test('refuses to delete a process used by a status', async () => {
        const { data } = await call('DELETE', '/process/1');
        expect(data.result).toMatch(/REFERENCE constraint "FK_status_process"/);
        expect(db.processes.some((p) => p.id === 1)).toBe(true);
    });
});

describe('readers', () => {
    test('saving the config changes what is read back', async () => {
        const config: ReaderConfig[] = [{ type: 'gr_f1', location_name: 'NEW ROOM', enabled: true, ip: '192.0.2.99', power: 20 }];
        expect((await call('PUT', '/readers-config', config)).data).toEqual({ result: 'OK' });
        expect((await call<ReaderConfig[]>('GET', '/readers-config')).data).toEqual(config);
    });

    test('status reports each reader with index and ip, enabled ones as connected', async () => {
        expect((await call('GET', '/readers-status')).data).toEqual({
            readers: [
                { index: 0, type: 'gr_f1', ip: '192.0.2.10', connected: true },
                { index: 1, type: 'mc_f1', ip: '192.0.2.11', connected: false },
            ],
        });
    });

    test('restart answers OK', async () => {
        expect((await call('POST', '/readers-restart')).data).toEqual({ result: 'OK' });
    });
});
