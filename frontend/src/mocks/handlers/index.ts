import { authRoutes } from './auth';
import { lotRoutes } from './lots';
import { dashboardRoutes } from './dashboard';
import { clearTagRoutes } from './clearTag';
import { adminRoutes } from './admin';
import type { MockDb, Route } from '../types';

export const createRoutes = (db: MockDb): Route[] => [
    ...authRoutes(db),
    ...lotRoutes(db),
    ...dashboardRoutes(db),
    ...clearTagRoutes(db),
    ...adminRoutes(db),
];
