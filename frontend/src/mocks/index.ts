import { createDb } from './db';
import { createRoutes } from './handlers';
import { createMockAdapter } from './adapter';
import { seedMockSession } from './session';
import { MOCK_LATENCY_MS } from './config';
import type { AxiosInstance } from 'axios';
export const installMockMode = (api: AxiosInstance): void => {
    const db = createDb();
    api.defaults.adapter = createMockAdapter(createRoutes(db), MOCK_LATENCY_MS);
    seedMockSession(db.users);
};
