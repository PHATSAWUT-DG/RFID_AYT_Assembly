import { SESSION_KEY } from '../config/session';
import type { UserRow } from './types';

export const seedMockSession = (users: UserRow[]): void => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const admin = users.find((u) => u.position === 'admin');
    if (!admin) throw new Error('mock fixtures have no admin user');
    const { password: _password, ...user } = admin;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
};
