import { normalizePath, matchRoute } from './router';
import type { Route } from './types';

const handler = () => ({ data: 'ok' });
const routes: Route[] = [
    { method: 'GET', path: '/status', handler },
    { method: 'GET', path: '/lot-by-tag/:tag_id', handler },
    { method: 'PUT', path: '/login/users/:id', handler },
    { method: 'GET', path: '/dashboard/process-summary', handler },
];

describe('normalizePath', () => {
    test('strips the axios baseURL', () => {
        expect(normalizePath('/status', 'http://localhost:5001/api/assembly')).toBe('/status');
        expect(normalizePath('http://localhost:5001/api/assembly/status', 'http://localhost:5001/api/assembly'))
            .toBe('/status');
    });

    test('strips the query string', () => {
        expect(normalizePath('/dashboard/history?date_from=2026-09-14', '')).toBe('/dashboard/history');
    });

    test('strips a trailing slash but keeps root', () => {
        expect(normalizePath('/status/', '')).toBe('/status');
        expect(normalizePath('/', '')).toBe('/');
    });

    test('adds a leading slash', () => {
        expect(normalizePath('status', '')).toBe('/status');
    });
});

describe('matchRoute', () => {
    test('matches a static path', () => {
        expect(matchRoute(routes, 'GET', '/status')).toMatchObject({ params: {} });
    });

    test('extracts named params', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/E2801160')?.params).toEqual({ tag_id: 'E2801160' });
        expect(matchRoute(routes, 'PUT', '/login/users/7')?.params).toEqual({ id: '7' });
    });

    test('is method-sensitive', () => {
        expect(matchRoute(routes, 'POST', '/status')).toBeNull();
    });

    test('accepts a lowercase method', () => {
        expect(matchRoute(routes, 'get', '/status')).not.toBeNull();
    });

    test('does not let a param segment swallow a slash', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/AB/CD')).toBeNull();
    });

    test('matches a multi-segment static path', () => {
        expect(matchRoute(routes, 'GET', '/dashboard/process-summary')).not.toBeNull();
    });

    test('returns null for an unknown path', () => {
        expect(matchRoute(routes, 'GET', '/nope')).toBeNull();
    });

    test('url-decodes params', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/A%2F1')?.params).toEqual({ tag_id: 'A/1' });
    });

    test('returns null instead of throwing on a malformed escape', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/50%')).toBeNull();
    });
});
