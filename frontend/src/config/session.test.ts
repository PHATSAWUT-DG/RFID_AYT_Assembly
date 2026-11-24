import { readSessionUser, SESSION_KEY } from './session';

afterEach(() => sessionStorage.clear());

describe('readSessionUser', () => {
    test('returns null when nobody is signed in', () => {
        expect(readSessionUser()).toBeNull();
    });

    test('returns the stored user', () => {
        const user = { id: 1, emp_id: 'MOCK001', eng_name: 'DEMO', eng_surname: 'ADMIN', position: 'admin' };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
        expect(readSessionUser()).toEqual(user);
    });

    test('returns null for corrupt JSON instead of throwing', () => {
        sessionStorage.setItem(SESSION_KEY, '{not json');
        expect(readSessionUser()).toBeNull();
    });
});
