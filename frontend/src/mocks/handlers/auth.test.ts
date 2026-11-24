import { authRoutes } from './auth';
import { createTestDb, callRoute } from '../testUtils';
import type { MockDb, Route } from '../types';
import type { AdminResult, LoginResponse, User } from '../../types/api';

let db: MockDb;
let routes: Route[];
beforeEach(() => {
    db = createTestDb();
    routes = authRoutes(db);
});

describe('POST /login', () => {
    test('returns the user without the password', async () => {
        const res = await callRoute<LoginResponse>(routes, 'POST', '/login', { body: { emp_id: 'MOCK001', password: 'DEMO1234' } });
        expect(res.data.result).toBe('OK');
        expect(res.data.user).toMatchObject({ emp_id: 'MOCK001', position: 'admin' });
        expect(res.data.user).not.toHaveProperty('password');
    });

    test('returns 401 for a wrong password', async () => {
        const res = await callRoute(routes, 'POST', '/login', { body: { emp_id: 'MOCK001', password: 'nope' } });
        expect(res).toEqual({ status: 401, data: { error: 'INVALID_CREDENTIALS' } });
    });
});

describe('/login/users', () => {
    test('lists users without passwords', async () => {
        const { data } = await callRoute<User[]>(routes, 'GET', '/login/users');
        expect(data.length).toBe(db.users.length);
        data.forEach((u) => expect(u).not.toHaveProperty('password'));
    });

    test('creates a user that can then log in', async () => {
        const body = { emp_id: 'MOCK099', eng_name: 'NEW', eng_surname: 'USER', password: 'PW', position: 'user' };
        expect((await callRoute<AdminResult>(routes, 'POST', '/login/users', { body })).data).toEqual({ result: 'OK' });
        const login = await callRoute<LoginResponse>(routes, 'POST', '/login', { body: { emp_id: 'MOCK099', password: 'PW' } });
        expect(login.data.result).toBe('OK');
    });

    test('updates name and position by string id, but not emp_id', async () => {
        await callRoute(routes, 'PUT', '/login/users/2', {
            body: { emp_id: 'HACK', eng_name: 'RENAMED', eng_surname: 'X', position: 'admin' },
        });
        expect(db.users.find((u) => u.id === 2)).toMatchObject({ emp_id: 'MOCK002', eng_name: 'RENAMED', position: 'admin' });
    });

    test('deletes by string id', async () => {
        await callRoute(routes, 'DELETE', '/login/users/2');
        expect(db.users.some((u) => u.id === 2)).toBe(false);
    });
});
