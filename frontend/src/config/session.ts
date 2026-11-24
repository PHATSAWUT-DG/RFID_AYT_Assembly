import type { User } from '../types/api';

export const SESSION_KEY = 'assy_user';

export const readSessionUser = (): User | null => {
    try {
        // Written only by LoginModal and the mock seed, both from a typed User.
        return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as User | null;
    } catch {
        return null;
    }
};
