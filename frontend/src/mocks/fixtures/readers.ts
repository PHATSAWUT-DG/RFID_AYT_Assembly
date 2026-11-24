import type { ReaderConfig } from '../../types/api';

// 192.0.2.0/24 is the documentation range: never a real reader.
export const buildReaderConfig = (): ReaderConfig[] => [
    { type: 'gr_f1', location_name: 'GAUGING ROOM F1', enabled: true, ip: '192.0.2.10', power: 10 },
    { type: 'mc_f1', location_name: 'MC GAUGING F1', enabled: false, ip: '192.0.2.11', power: 10 },
];
