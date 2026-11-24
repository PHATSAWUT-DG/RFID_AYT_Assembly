import type { Process } from '../../types/api';
import type { StatusRow } from '../types';

export const buildProcesses = (): Process[] => [
    { id: 1, process_code: '1400', process_name: 'BEFORE ISSUE', can_clear_tag: true },
    { id: 2, process_code: '1500', process_name: 'GAUGING', can_clear_tag: true },
];

export const buildStatuses = (): StatusRow[] => [
    { id: 1, status: 'bf_issue', label_status: 'Before Issue', process_id: 1 },
    { id: 2, status: 'gr_f1', label_status: 'Gauging Room F1', process_id: 2 },
    { id: 3, status: 'mc_f1', label_status: 'MC Gauging F1', process_id: 2 },
    { id: 4, status: 'completed', label_status: 'Completed', process_id: 2 },
];
