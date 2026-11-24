// Request and response shapes of the backend API (/api/assembly).
// Source of truth: bruno/AYT-RFID/*.yml. Change both together.

// SQL Server DATETIME serialised as ISO text, e.g. "2026-09-29T10:00:00.000Z".
export type DateTimeText = string;

export type Position = 'admin' | 'user';

export interface User {
    id: number;
    emp_id: string;
    eng_name: string;
    eng_surname: string;
    position: Position;
}

export interface Process {
    id: number;
    process_code: string;
    process_name: string;
    can_clear_tag: boolean;
}

export interface Status {
    id: number;
    status: string;
    label_status: string;
    process_id: number | null;
    process_code: string | null;
    process_name: string | null;
}

// Lot from the upstream AS400 receive API (GET /lot/:lot_no). Not stored yet.
export interface As400Lot {
    lot_no: string;
    wos: string;
    brg_type: string;
    spec: string;
    qty: number;
}

// Active lot (status not Completed), found by lot number or by tag.
export interface ActiveLot extends As400Lot {
    tag_id: string;
    status_id: number;
}

export interface DashboardSummary {
    total_qty: number | null;
    bf_issue: number | null;
    gr_f1: number | null;
    mc_f1: number | null;
}

export interface Top5Row {
    brg_type: string;
    total_qty: number;
}

export interface DashboardLot extends ActiveLot {
    label_status: string | null;
    location_name: string | null;
    machine_no: string | null;
    created_at: DateTimeText;
    updated_at: DateTimeText;
}

export interface DashboardResponse {
    summary: DashboardSummary;
    top5: Top5Row[];
    lots: DashboardLot[];
}

export interface HistoryRow extends DashboardLot {
    emp_id: string | null;
    remark: string | null;
}

export interface ProcessSummaryRow {
    process_code: string;
    process_name: string;
    inventory_qty: number;
}

// GET /dashboard/daily-inventory: one row per machine + WOS. Proposed contract, backend not built yet.
export interface DailyInventoryRow {
    mc_no: string;
    part_no: string;
    wos: string;
    qty: number;
}

export interface LocationRow {
    location_name: string;
}

// Query params of GET /dashboard and GET /dashboard/history. All optional; empty ones are not sent.
export interface DashboardFilter {
    date_from?: string;
    date_to?: string;
    brg_type?: string;
    wos?: string;
    lot_no?: string;
    status_id?: string;
    location_name?: string;
}

export interface ClearTagHistoryRow {
    lot_no: string;
    tag_id: string;
    emp_id: string | null;
    remark: string | null;
    cleared_at: DateTimeText;
    updated_at: DateTimeText;
    brg_type: string;
    spec: string;
}

export interface ClearTagHistoryQuery {
    date_from?: string;
    date_to?: string;
    /** Matches lot_no, tag_id, emp_id or brg_type (contains). */
    search?: string;
}

export interface MockDoneRow {
    id: number;
    lot_no: string;
    created_at: DateTimeText;
}

export type ReaderType = 'gr_f1' | 'mc_f1';

export interface ReaderConfig {
    type: ReaderType;
    location_name: string;
    enabled: boolean;
    ip: string;
    power: number;
}

export interface ReaderStatus {
    index: number;
    type: ReaderType;
    ip: string;
    connected: boolean;
}

export interface ReadersStatusResponse {
    readers: ReaderStatus[];
}

// Business errors come back as HTTP 200 with a code in `result`.
export interface ResultResponse<Code extends string = never> {
    result: 'OK' | Code;
}
export type RegisterTagResult = ResultResponse<'LOT_ALREADY_EXISTS' | 'TAG_IN_USE' | 'INVALID_STATUS'>;
export type CompletedResult = ResultResponse<'LOT_NOT_FOUND' | 'INVALID_PROCESS' | 'INVALID_STATUS'>;
export type ScanResult = ResultResponse<'TAG_NOT_FOUND' | 'INVALID_PROCESS'>;
export type MockDoneAddResult = ResultResponse<'ALREADY_EXISTS'>;
export type MockDoneRemoveResult = ResultResponse<'NOT_FOUND'>;
// Admin CRUD (user, status, process): `result` is 'OK' or SQL Server's error text.
export interface AdminResult {
    result: string;
}

export interface LoginResponse {
    result: 'OK';
    user: User;
}

// Body of 4xx/5xx responses.
export interface ErrorResponse {
    error: string;
}

export interface LoginRequest {
    emp_id: string;
    password: string;
}

export interface UserCreateRequest extends Omit<User, 'id'> {
    password: string;
}

export type UserUpdateRequest = Pick<User, 'eng_name' | 'eng_surname' | 'position'>;

export type ProcessRequest = Omit<Process, 'id'>;

export interface StatusRequest {
    status: string;
    label_status: string;
    process_id?: number | null;
}

export interface RegisterTagRequest extends As400Lot {
    tag_id: string;
    location_name?: string;
}

export interface ScanRequest {
    tag_id: string;
    location_name?: string;
}

export interface CompletedRequest {
    lot_no: string;
    remark?: string;
    emp_id?: string;
    machine_no?: string;
}

export interface MockDoneRequest {
    lot_no: string;
}
