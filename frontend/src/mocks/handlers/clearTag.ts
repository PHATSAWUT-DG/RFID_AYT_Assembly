import { nextId } from '../db';
import type { HandlerInput, HandlerResult, LotRow, MockDb, Route } from '../types';
import type {
    ClearTagHistoryQuery, ClearTagHistoryRow, MockDoneAddResult, MockDoneRemoveResult, MockDoneRequest,
    MockDoneRow,
} from '../../types/api';

const COMPLETED = 4;
const MAX_ROWS = 200;

type ClearedLot = LotRow & { cleared_at: string };

const newestFirst = <K extends string>(key: K) => (a: Record<K, string>, b: Record<K, string>) =>
    b[key].localeCompare(a[key]);
// Structural return type on purpose: ResultResponse<'OK'> is not assignable to ResultResponse<'X'>
// (TS compares the type argument, not the shape).
const result = <C extends string>(code: 'OK' | C): HandlerResult<{ result: 'OK' | C }> => ({ data: { result: code } });

const historyRow = ({ lot_no, tag_id, emp_id, remark, cleared_at, updated_at, brg_type, spec }: ClearedLot): ClearTagHistoryRow =>
    ({ lot_no, tag_id, emp_id, remark, cleared_at, updated_at, brg_type, spec });

// Case-insensitive like the SQL Server default collation.
const matchesSearch = (search: string | undefined) => {
    const needle = search?.trim().toLowerCase();
    if (!needle) return () => true;
    return (l: ClearedLot) => [l.lot_no, l.tag_id, l.emp_id, l.brg_type]
        .some((v) => v?.toLowerCase().includes(needle));
};

export const clearTagRoutes = (db: MockDb): Route[] => [
    {
        method: 'GET',
        path: '/clear-tag/history',
        handler: ({ query }: HandlerInput<never, ClearTagHistoryQuery>): HandlerResult<ClearTagHistoryRow[]> => {
            const rows = db.lots
                .filter((l): l is ClearedLot => l.status_id === COMPLETED && l.cleared_at !== null)
                .filter((l) => !query.date_from || l.cleared_at.slice(0, 10) >= query.date_from)
                .filter((l) => !query.date_to || l.cleared_at.slice(0, 10) <= query.date_to)
                .filter(matchesSearch(query.search))
                .sort(newestFirst('cleared_at'))
                .slice(0, MAX_ROWS)
                .map(historyRow);
            return { data: rows };
        },
    },
    {
        method: 'GET',
        path: '/mock-done',
        handler: (): HandlerResult<MockDoneRow[]> => ({ data: [...db.mockDone].sort(newestFirst('created_at')) }),
    },
    {
        method: 'POST',
        path: '/mock-done',
        handler: ({ body }: HandlerInput<MockDoneRequest>): HandlerResult<MockDoneAddResult> => {
            if (db.mockDone.some((m) => m.lot_no === body.lot_no)) return result('ALREADY_EXISTS');
            db.mockDone.push({ id: nextId(db.mockDone), lot_no: body.lot_no, created_at: db.now() });
            return result('OK');
        },
    },
    {
        method: 'DELETE',
        path: '/mock-done/:lot_no',
        handler: ({ params }: HandlerInput): HandlerResult<MockDoneRemoveResult> => {
            const before = db.mockDone.length;
            db.mockDone = db.mockDone.filter((m) => m.lot_no !== params.lot_no);
            return result(db.mockDone.length < before ? 'OK' : 'NOT_FOUND');
        },
    },
];
