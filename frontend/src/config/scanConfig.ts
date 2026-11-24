import type { ReaderType, Status } from '../types/api';

// Statuses that have a scan endpoint. Keys are the `status` column of tb_master_status.
export const SCAN_CONFIG: Record<ReaderType, { label: string; endpoint: string }> = {
    'gr_f1': { label: 'Gauging Room F1', endpoint: '/gauging-room-f1' },
    'mc_f1': { label: 'MC Gauging F1', endpoint: '/mc-gauging-f1' },
};

export type ScannableStatus = Status & { status: ReaderType };

export const isScannableStatus = (s: Status): s is ScannableStatus => s.status in SCAN_CONFIG;
