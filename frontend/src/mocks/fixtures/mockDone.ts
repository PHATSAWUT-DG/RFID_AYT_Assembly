import { daysAgo } from '../time';
import type { MockDoneRow } from '../../types/api';

export const buildMockDone = (today: Date): MockDoneRow[] => [
    { id: 1, lot_no: 'DEMO000003', created_at: daysAgo(today, 0, 9, 15) },
    { id: 2, lot_no: 'DEMO000010', created_at: daysAgo(today, 1, 10) },
];
