import axios from 'axios';
import { vi } from 'vitest';
import { createMockAdapter } from './adapter';
import type { Route } from './types';

const BASE = 'http://localhost:5001/api/assembly';

const makeApi = (routes: Route[]) => {
    const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });
    api.defaults.adapter = createMockAdapter(routes, 0);
    return api;
};

describe('createMockAdapter', () => {
    test('resolves with the handler data and status 200 by default', async () => {
        const api = makeApi([{ method: 'GET', path: '/status', handler: () => ({ data: [{ id: 1 }] }) }]);
        const res = await api.get('/status');
        expect(res.status).toBe(200);
        expect(res.data).toEqual([{ id: 1 }]);
    });

    test('passes path params, query params and the parsed JSON body', async () => {
        const handler = vi.fn(() => ({ data: { result: 'OK' } }));
        const api = makeApi([{ method: 'PUT', path: '/status/:id', handler }]);
        await api.put('/status/7', { label_status: 'X' }, { params: { date_from: '2026-09-29' } });
        expect(handler).toHaveBeenCalledWith({
            params: { id: '7' },
            query: { date_from: '2026-09-29' },
            body: { label_status: 'X' },
        });
    });

    test('passes an empty query and body when none are sent', async () => {
        const handler = vi.fn(() => ({ data: [] }));
        const api = makeApi([{ method: 'GET', path: '/mock-done', handler }]);
        await api.get('/mock-done');
        expect(handler).toHaveBeenCalledWith({ params: {}, query: {}, body: {} });
    });

    test('supports async handlers', async () => {
        const api = makeApi([{ method: 'GET', path: '/status', handler: () => Promise.resolve({ data: 'late' }) }]);
        expect((await api.get('/status')).data).toBe('late');
    });

    test('rejects like axios for a 4xx status, with the response attached', async () => {
        const api = makeApi([{
            method: 'GET', path: '/lot/:lot_no',
            handler: () => ({ status: 404, data: { error: 'LOT_NOT_FOUND' } }),
        }]);
        await expect(api.get('/lot/NOPE')).rejects.toMatchObject({
            isAxiosError: true,
            response: { status: 404, data: { error: 'LOT_NOT_FOUND' } },
        });
    });

    test('returns 404 and warns for an unmocked endpoint', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const api = makeApi([]);
        await expect(api.get('/nope')).rejects.toMatchObject({ response: { status: 404 } });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('GET /nope'));
        warn.mockRestore();
    });
});
