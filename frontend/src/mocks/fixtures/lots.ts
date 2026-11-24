import { daysAgo, toWallClock } from '../time';
import type { As400Lot } from '../../types/api';
import type { LotRow } from '../types';

const PARTS = [
    { brg_type: '6204ZZCM', spec: 'NS7S' },
    { brg_type: '6205DDUCM', spec: 'AV2S' },
    { brg_type: '6301ZZCM', spec: 'E' },
    { brg_type: '6003VVCM', spec: 'NS7S' },
];

const REGISTERED = 32;
const UNREGISTERED = 8;
const LOTS_PER_WOS = 5;

// Every 4th lot is cleared, so the Clear Tag history has rows on several days.
const CLEARED_EVERY = 4;
const ACTIVE_STATUS_CYCLE = [1, 1, 2, 2, 3, 3];
const LOCATION_BY_STATUS: Record<number, string | null> = { 1: null, 2: 'GAUGING ROOM F1', 3: 'MC GAUGING F1' };
const CLEARED_FROM = [
    { process_name: 'GAUGING', location_name: 'MC GAUGING F1', note: '' },
    { process_name: 'BEFORE ISSUE', location_name: null, note: ' rework' },
    { process_name: 'GAUGING', location_name: 'GAUGING ROOM F1', note: ' tag damaged' },
    { process_name: 'BEFORE ISSUE', location_name: null, note: '' },
];
// The first 5 cleared lots are cleared today; the rest on the days before.
const CLEARED_TODAY = 5;

// A WOS is one part: all its lots share the same part and spec.
const catalogLot = (n: number): As400Lot => {
    const wosIndex = Math.floor((n - 1) / LOTS_PER_WOS);
    const part = PARTS[wosIndex % PARTS.length];
    return {
        lot_no: `DEMO${String(n).padStart(6, '0')}`,
        wos: `W${String(100 + wosIndex).padStart(6, '0')}`,
        brg_type: part.brg_type,
        spec: part.spec,
        qty: 100 + (n % 5) * 50,
    };
};

export const buildAs400Lots = (): As400Lot[] =>
    Array.from({ length: REGISTERED + UNREGISTERED }, (_, i) => catalogLot(i + 1));

// Never later than `now`, and never before midnight, so "today" rows stay today.
const minutesAgo = (now: Date, minutes: number) => {
    const sinceMidnight = now.getHours() * 60 + now.getMinutes();
    return toWallClock(new Date(now.getTime() - Math.min(minutes, sinceMidnight) * 60_000));
};

const timestamps = (today: Date, day: number, slot: number) =>
    day === 0
        ? { created_at: minutesAgo(today, 60 + slot * 25), updated_at: minutesAgo(today, 15 + slot * 25) }
        : { created_at: daysAgo(today, day, 7 + slot % 8), updated_at: daysAgo(today, day, 8 + slot % 8, 30) };

export const buildLots = (today: Date): LotRow[] =>
    Array.from({ length: REGISTERED }, (_, i) => {
        const clearedIndex = Math.floor(i / CLEARED_EVERY);
        const cleared = i % CLEARED_EVERY === CLEARED_EVERY - 1;
        const from = CLEARED_FROM[clearedIndex % CLEARED_FROM.length];
        const statusId = cleared ? 4 : ACTIVE_STATUS_CYCLE[(i - clearedIndex) % ACTIVE_STATUS_CYCLE.length];
        const clearedDay = clearedIndex < CLEARED_TODAY ? 0 : clearedIndex - CLEARED_TODAY + 1;
        const { created_at, updated_at } = timestamps(today, cleared ? clearedDay : i % 3, i % 10);
        return {
            ...catalogLot(i + 1),
            tag_id: `E2801160000${String(i + 1).padStart(5, '0')}`,
            status_id: statusId,
            location_name: cleared ? from.location_name : LOCATION_BY_STATUS[statusId],
            machine_no: null,
            emp_id: cleared ? 'MOCK001' : null,
            remark: cleared ? `[FROM: ${from.process_name}]${from.note}` : null,
            cleared_at: cleared ? updated_at : null,
            created_at,
            updated_at,
        };
    });
