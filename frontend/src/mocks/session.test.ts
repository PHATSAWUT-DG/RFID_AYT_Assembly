import { seedMockSession } from './session';
import { createTestDb } from './testUtils';
import type { User } from '../types/api';

const readStored = () => JSON.parse(sessionStorage.getItem('assy_user') ?? 'null') as Partial<User> | null;

beforeEach(() => sessionStorage.clear());

test('stores the admin user without the password', () => {
    seedMockSession(createTestDb().users);
    const stored = readStored();
    expect(stored).toMatchObject({ emp_id: 'MOCK001', position: 'admin' });
    expect(stored).not.toHaveProperty('password');
});

test('keeps an existing session', () => {
    sessionStorage.setItem('assy_user', JSON.stringify({ emp_id: 'MOCK002' }));
    seedMockSession(createTestDb().users);
    expect(readStored()?.emp_id).toBe('MOCK002');
});
