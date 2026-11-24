import type { HandlerInput, HandlerResult, LotRow, MockDb, Route } from '../types';
import type {
    ActiveLot, As400Lot, CompletedRequest, CompletedResult, ErrorResponse, RegisterTagRequest, RegisterTagResult,
    ScanRequest, ScanResult,
} from '../../types/api';

const BEFORE_ISSUE = 1;
const GAUGING_ROOM_F1 = 2;
const MC_GAUGING_F1 = 3;
const COMPLETED = 4;

// Structural return type on purpose: ResultResponse<'OK'> is not assignable to ResultResponse<'X'>
// (TS compares the type argument, not the shape).
const result = <C extends string>(code: 'OK' | C): HandlerResult<{ result: 'OK' | C }> => ({ data: { result: code } });
const notFound = (error: string): HandlerResult<ErrorResponse> => ({ status: 404, data: { error } });

const isActive = (lot: LotRow): boolean => lot.status_id !== COMPLETED;

const lotView = ({ lot_no, wos, qty, tag_id, status_id, brg_type, spec }: LotRow): ActiveLot =>
    ({ lot_no, wos, qty, tag_id, status_id, brg_type, spec });

// A tag can belong to several lots over time; the active one wins.
const findByTag = (db: MockDb, tagId: string): LotRow | undefined =>
    db.lots.find((l) => l.tag_id === tagId && isActive(l))
    ?? db.lots.find((l) => l.tag_id === tagId);

// Mirrors Stored_tb_assy_gauging_room_f1 / _mc_gauging_f1: one step forward only.
const advance = (db: MockDb, fromStatus: number, toStatus: number) =>
    ({ body }: HandlerInput<ScanRequest>): HandlerResult<ScanResult> => {
        const lot = findByTag(db, body.tag_id);
        if (!lot) return result('TAG_NOT_FOUND');
        if (lot.status_id !== fromStatus) return result('INVALID_PROCESS');
        Object.assign(lot, { status_id: toStatus, location_name: body.location_name ?? null, updated_at: db.now() });
        return result('OK');
    };

// Mirrors Stored_tb_assy_completed: the lot's status must belong to a process with can_clear_tag,
// and a completed lot cannot be cleared again.
const canClear = (db: MockDb, lot: LotRow): boolean => {
    if (lot.status_id === COMPLETED) return false;
    const status = db.statuses.find((s) => s.id === lot.status_id);
    return db.processes.some((p) => p.id === status?.process_id && p.can_clear_tag);
};

export const lotRoutes =(db: MockDb): Route[] => [
    {
        method: 'GET',
        path: '/lot/:lot_no',
        handler: ({ params }: HandlerInput): HandlerResult<As400Lot | ErrorResponse> => {
            const lot = db.as400Lots.find((a) => a.lot_no === params.lot_no);
            return lot ? { data: { ...lot } } : notFound('LOT_NOT_FOUND');
        },
    },
    {
        method: 'GET',
        path: '/lot-by-lot/:lot_no',
        handler: ({ params }: HandlerInput): HandlerResult<ActiveLot | ErrorResponse> => {
            const lot = db.lots.find((l) => l.lot_no === params.lot_no && isActive(l));
            return lot ? { data: lotView(lot) } : notFound('LOT_NOT_FOUND');
        },
    },
    {
        method: 'GET',
        path: '/lot-by-tag/:tag_id',
        handler: ({ params }: HandlerInput): HandlerResult<ActiveLot | ErrorResponse> => {
            const lot = db.lots.find((l) => l.tag_id === params.tag_id && isActive(l));
            return lot ? { data: lotView(lot) } : notFound('TAG_NOT_FOUND');
        },
    },
    {
        method: 'POST',
        path: '/register-tag',
        handler: ({ body }: HandlerInput<RegisterTagRequest>): HandlerResult<RegisterTagResult> => {
            const { tag_id, lot_no, wos, brg_type, spec, qty, location_name } = body;
            if (db.lots.some((l) => l.lot_no === lot_no)) return result('LOT_ALREADY_EXISTS');
            if (db.lots.some((l) => l.tag_id === tag_id && isActive(l))) return result('TAG_IN_USE');
            const now = db.now();
            db.lots.push({
                lot_no, wos, brg_type, spec, qty, tag_id,
                status_id: BEFORE_ISSUE,
                location_name: location_name ?? null,
                machine_no: null, emp_id: null, remark: null, cleared_at: null,
                created_at: now, updated_at: now,
            });
            return result('OK');
        },
    },
    { method: 'POST', path: '/gauging-room-f1', handler: advance(db, BEFORE_ISSUE, GAUGING_ROOM_F1) },
    { method: 'POST', path: '/mc-gauging-f1', handler: advance(db, GAUGING_ROOM_F1, MC_GAUGING_F1) },
    {
        method: 'POST',
        path: '/completed',
        handler: ({ body }: HandlerInput<CompletedRequest>): HandlerResult<CompletedResult> => {
            const lot = db.lots.find((l) => l.lot_no === body.lot_no);
            if (!lot) return result('LOT_NOT_FOUND');
            if (!canClear(db, lot)) return result('INVALID_PROCESS');
            const now = db.now();
            Object.assign(lot, {
                status_id: COMPLETED, cleared_at: now, updated_at: now,
                remark: body.remark ?? null, emp_id: body.emp_id ?? null, machine_no: body.machine_no ?? null,
            });
            return result('OK');
        },
    },
];
