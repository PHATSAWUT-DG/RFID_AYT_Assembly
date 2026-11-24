import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { normalizePath, matchRoute } from './router';
import type { HandlerInput, HandlerResult, Query, Route } from './types';

const parseBody = (data: unknown): unknown => {
    if (typeof data === 'string' && data) return JSON.parse(data) as unknown;
    return data ?? {};
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const notMocked = (method: string, path: string): HandlerResult => {
    const message = `[mock] No mock for ${method} ${path}`;
    console.warn(message);
    return { status: 404, data: { error: 'NO_MOCK', message } };
};

export const createMockAdapter = (routes: Route[], latencyMs = 0): AxiosAdapter =>
    async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const method = (config.method ?? 'get').toUpperCase();
    const path = normalizePath(config.url, config.baseURL);
    const match = matchRoute(routes, method, path);
    await wait(latencyMs);

    // Pages are the only callers and send the documented request shape; the mock trusts them.
    const input = {
        params: match?.params ?? {},
        query: (config.params ?? {}) as Query,
        body: parseBody(config.data),
    } as HandlerInput;
    const { status = 200, data } = match ? await match.handler(input) : notMocked(method, path);

    const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
    if (!config.validateStatus || config.validateStatus(status)) return response;
    throw new AxiosError(
        `Request failed with status code ${status}`,
        status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        response.request,
        response,
    );
};
