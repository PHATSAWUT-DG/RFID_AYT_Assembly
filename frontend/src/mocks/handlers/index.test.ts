import { createRoutes } from './index';
import { matchRoute } from '../router';
import { createTestDb } from '../testUtils';
import type { Method } from '../types';

const CALLED_BY_APP: [Method, string][] = [
    ['POST', '/login'],
    ['GET', '/login/users'], ['POST', '/login/users'], ['PUT', '/login/users/1'], ['DELETE', '/login/users/1'],
    ['GET', '/status'], ['POST', '/status'], ['PUT', '/status/1'], ['DELETE', '/status/1'],
    ['GET', '/process'], ['POST', '/process'], ['PUT', '/process/1'], ['DELETE', '/process/1'],
    ['GET', '/lot/DEMO000001'], ['GET', '/lot-by-lot/DEMO000001'], ['GET', '/lot-by-tag/E2801160'],
    ['POST', '/register-tag'], ['POST', '/gauging-room-f1'], ['POST', '/mc-gauging-f1'], ['POST', '/completed'],
    ['GET', '/clear-tag/history'],
    ['GET', '/dashboard'], ['GET', '/dashboard/process-summary'], ['GET', '/dashboard/daily-inventory'],
    ['GET', '/dashboard/history'], ['GET', '/dashboard/locations'],
    ['GET', '/mock-done'], ['POST', '/mock-done'], ['DELETE', '/mock-done/DEMO000001'],
    ['GET', '/readers-config'], ['PUT', '/readers-config'], ['GET', '/readers-status'], ['POST', '/readers-restart'],
];

const routes = createRoutes(createTestDb());

test('covers all 33 endpoints the app calls', () => {
    expect(CALLED_BY_APP).toHaveLength(33);
});

test.each(CALLED_BY_APP)('%s %s has a mock', (method, path) => {
    expect(matchRoute(routes, method, path)).not.toBeNull();
});

test('no method + path is registered twice', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
});
