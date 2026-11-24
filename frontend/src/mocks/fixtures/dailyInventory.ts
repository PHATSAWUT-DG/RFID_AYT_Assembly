import type { DailyInventoryRow } from '../../types/api';

// A part can have many WOS and run on many machines; each machine row belongs to one WOS.
// Static (not computed from lots), but the WOS and part pairs match fixtures/lots.ts.
export const buildDailyInventory = (): DailyInventoryRow[] => [
    { mc_no: 'MC-01', part_no: '6204ZZCM', wos: 'W000100', qty: 999 },
    { mc_no: 'MC-02', part_no: '6204ZZCM', wos: 'W000100', qty: 999 },
    { mc_no: 'MC-03', part_no: '6204ZZCM', wos: 'W000100', qty: 999 },
    { mc_no: 'MC-04', part_no: '6204ZZCM', wos: 'W000104', qty: 500 },
    { mc_no: 'MC-05', part_no: '6204ZZCM', wos: 'W000104', qty: 250 },
    { mc_no: 'MC-06', part_no: '6205DDUCM', wos: 'W000101', qty: 1200 },
    { mc_no: 'MC-07', part_no: '6205DDUCM', wos: 'W000101', qty: 800 },
    { mc_no: 'MC-08', part_no: '6301ZZCM', wos: 'W000102', qty: 360 },
    { mc_no: 'MC-09', part_no: '6003VVCM', wos: 'W000103', qty: 720 },
    { mc_no: 'MC-10', part_no: '6003VVCM', wos: 'W000103', qty: 930 },
];
