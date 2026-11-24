import type { UserRow } from '../types';

// Fake demo accounts. Plain-text passwords here only; the real API stores bcrypt hashes.
export const buildUsers = (): UserRow[] => [
    { id: 1, emp_id: 'MOCK001', eng_name: 'DEMO', eng_surname: 'ADMIN', position: 'admin', password: 'DEMO1234' },
    { id: 2, emp_id: 'MOCK002', eng_name: 'DEMO', eng_surname: 'OPERATOR', position: 'user', password: 'DEMO1234' },
];
