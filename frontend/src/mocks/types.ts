import type {
    As400Lot, DateTimeText, MockDoneRow, Process, ReaderConfig, Status, User,
} from '../types/api';

// Mock "tables": API shapes plus the columns the API never returns.
export interface LotRow extends As400Lot {
    tag_id: string;
    status_id: number;
    location_name: string | null;
    machine_no: string | null;
    emp_id: string | null;
    remark: string | null;
    cleared_at: DateTimeText | null;
    created_at: DateTimeText;
    updated_at: DateTimeText;
}

export type StatusRow = Pick<Status, 'id' | 'status' | 'label_status' | 'process_id'>;

export interface UserRow extends User {
    password: string;
}

export interface MockDb {
    now: () => DateTimeText;
    processes: Process[];
    statuses: StatusRow[];
    users: UserRow[];
    as400Lots: As400Lot[];
    lots: LotRow[];
    mockDone: MockDoneRow[];
    readerConfig: ReaderConfig[];
}

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type Query = Partial<Record<string, string>>;

// `Q` is unconstrained: query interfaces (e.g. DashboardFilter) have no index signature.
export interface HandlerInput<Body = never, Q = Query> {
    params: Record<string, string>;
    query: Q;
    body: Body;
}

export interface HandlerResult<T = unknown> {
    status?: number;
    data: T;
}

// Body is `never` here so every handler that reads `body` must name its request type.
export type Handler = (input: HandlerInput) => HandlerResult | Promise<HandlerResult>;

export interface Route {
    method: Method;
    path: string;
    handler: Handler;
}
