import { createDb } from './db';
import { matchRoute } from './router';
import type { HandlerInput, Method, MockDb, Query, Route } from './types';

export const FIXED_NOW = new Date(2026, 8, 29, 10, 0, 0);

export const createTestDb = (): MockDb => createDb({ now: () => FIXED_NOW });

// `T` is the response type the test expects; the handler is trusted to return it.
export const callRoute = async <T = unknown>(
    routes: Route[],
    method: Method,
    path: string,
    { query = {}, body = {} }: { query?: Query; body?: unknown } = {},
): Promise<{ status: number; data: T }> => {
    const match = matchRoute(routes, method, path);
    if (!match) throw new Error(`No route for ${method} ${path}`);
    // Tests pass the documented request shape; the mock trusts it (same cast as adapter.ts).
    const input = { params: match.params, query, body } as HandlerInput;
    const { status = 200, data } = await match.handler(input);
    return { status, data: data as T };
};
