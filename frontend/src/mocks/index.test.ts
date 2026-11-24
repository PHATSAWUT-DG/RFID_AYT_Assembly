import axios from 'axios';
import { vi } from 'vitest';
import type { As400Lot, DashboardResponse, User } from '../types/api';

beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv('VITE_MOCK_LATENCY', '0');
    vi.resetModules();
});

test('installs the adapter and seeds the admin session', async () => {
    const { installMockMode } = await import('./index');
    const api = axios.create({ baseURL: 'http://localhost:5001/api/assembly' });
    installMockMode(api);

    const res = await api.get<DashboardResponse>('/dashboard');
    expect(res.data.summary.total_qty).toBeGreaterThan(0);
    expect((JSON.parse(sessionStorage.getItem('assy_user') ?? 'null') as User).position).toBe('admin');
});

test('a mutation through the API shows on the dashboard', async () => {
    const { installMockMode } = await import('./index');
    const api = axios.create({ baseURL: 'http://localhost:5001/api/assembly' });
    installMockMode(api);

    const before = (await api.get<DashboardResponse>('/dashboard')).data.summary.bf_issue;
    const lot = (await api.get<As400Lot>('/lot/DEMO000040')).data;
    await api.post('/register-tag', { ...lot, tag_id: 'INSTALLTEST' });
    const after = (await api.get<DashboardResponse>('/dashboard')).data.summary.bf_issue;
    expect(after).toBe((before ?? 0) + lot.qty);
});
