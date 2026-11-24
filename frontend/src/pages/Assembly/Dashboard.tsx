import React, { useState, useEffect, useRef } from 'react';
import { backendApi } from '../../config/instance';
import * as XLSX from 'xlsx';
import {
    DashboardOutlined,
    ScanOutlined,
    ToolOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { groupDailyInventory } from './dailyInventory';
import { toProcessShares } from './processBreakdown';
import type {
    DailyInventoryRow,
    DashboardFilter,
    DashboardResponse,
    DashboardSummary,
    HistoryRow,
    LocationRow,
    ProcessSummaryRow,
} from '../../types/api';

type Tab = 'summary' | 'detail';

interface PaginationProps {
    page: number;
    totalPages: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
}

const STATUS_BADGE: Record<number, { label: string; bg: string; text: string; border: string }> = {
    1: { label: 'BEFORE ISSUE', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    2: { label: 'GAUGING ROOM F1', bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
    3: { label: 'MC GAUGING F1', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    4: { label: 'COMPLETED', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
};

const STATUS_OPTIONS = [
    { id: '', label: 'All Process' },
    { id: '1', label: 'Before Issue' },
    { id: '2', label: 'Gauging Room F1' },
    { id: '3', label: 'MC Gauging F1' },
];

const TABS: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'detail', label: 'Detail' },
];

const CARDS: { key: keyof DashboardSummary; label: string; color: string; bg: string; border: string; bar?: string; icon: React.ReactNode }[] = [
    // Stage cards use the same colours as STATUS_BADGE; TOTAL is neutral because it is a sum, not a stage.
    // Only stage cards have a `bar`: it shows their share of TOTAL.
    { key: 'total_qty', label: 'TOTAL QTY', color: 'text-slate-800', bg: 'bg-white', border: 'border-gray-200', icon: <DashboardOutlined className="text-slate-400" /> },
    { key: 'bf_issue', label: 'BEFORE ISSUE', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-400', icon: <ScanOutlined className="text-amber-400" /> },
    { key: 'gr_f1', label: 'GAUGING ROOM F1', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', bar: 'bg-green-400', icon: <ToolOutlined className="text-green-400" /> },
    { key: 'mc_f1', label: 'MC GAUGING F1', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', bar: 'bg-blue-400', icon: <ToolOutlined className="text-blue-400" /> },
];

const DATE_FIELDS: { name: keyof DashboardFilter; label: string; type: string }[] = [
    { name: 'date_from', label: 'Date From', type: 'date' },
    { name: 'date_to', label: 'Date To', type: 'date' },
];

const TEXT_FIELDS: { name: keyof DashboardFilter; label: string; placeholder: string }[] = [
    { name: 'wos', label: 'W.O.S.', placeholder: 'W.O.S.' },
    { name: 'lot_no', label: 'Lot No.', placeholder: 'Lot No.' },
];

const today = () => new Date().toLocaleDateString('en-CA');
const defaultFilter: Required<DashboardFilter> = { date_from: today(), date_to: today(), brg_type: '', wos: '', lot_no: '', status_id: '', location_name: '' };
const PAGE_SIZE = 20;

const TH_CLS = 'px-4 py-2.5 text-xs font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap uppercase tracking-wider';

// table-fixed takes these widths from the header row, so columns do not shift with the data.
const DAILY_COLUMNS = [
    { label: 'M/C NO.', cls: 'text-left w-[40%] border-r' },
    { label: 'PART NO.', cls: 'text-left w-[25%] border-r' },
    { label: 'WOS', cls: 'text-left w-[20%] border-r' },
    { label: 'QTY', cls: 'text-right w-[15%]' },
];

const DAILY_TD = 'px-4 py-2.5 border-b border-gray-200';

const Dashboard = () => {
    const [activeTab, setActiveTab] = useState<Tab>('summary');
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [processSummary, setProcessSummary] = useState<ProcessSummaryRow[]>([]);
    const [dailyInventory, setDailyInventory] = useState<DailyInventoryRow[]>([]);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [locations, setLocations] = useState<LocationRow[]>([]);
    const [filter, setFilter] = useState(defaultFilter);
    const [pageH, setPageH] = useState(1);
    const [loading, setLoading] = useState(false);
    const [partInput, setPartInput] = useState('');
    const [partDropdown, setPartDropdown] = useState<string[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const totalPagesH = Math.ceil(history.length / PAGE_SIZE);
    const pagedHistory = history.slice((pageH - 1) * PAGE_SIZE, pageH * PAGE_SIZE);

    // part options จาก history
    const partOptions = [...new Set(history.map(l => l.brg_type).filter(Boolean))].sort();

    const dailyParts = groupDailyInventory(dailyInventory);
    const dailyWosCount = dailyParts.reduce((sum, p) => sum + p.lines.length, 0);
    const dailyMachineCount = new Set(dailyInventory.map(r => r.mc_no)).size;
    const dailyTotalQty = dailyParts.reduce((sum, p) => sum + p.qty, 0);
    const processBreakdown = toProcessShares(processSummary);

    // ===== FETCH =====

    const fetchSummary = async () => {
        try {
            const [resMain, resProcess] = await Promise.all([
                backendApi.get<DashboardResponse>('/dashboard'),
                backendApi.get<ProcessSummaryRow[]>('/dashboard/process-summary'),
            ]);
            setLastRefresh(new Date());
            setSummary(resMain.data.summary);
            setProcessSummary(resProcess.data);
        } catch (err) {
            console.error(err);
        }
    };

    // Separate from fetchSummary: this endpoint is not built on the backend yet,
    // so its failure must not blank the cards and the process summary.
    const fetchDailyInventory = async () => {
        try {
            const res = await backendApi.get<DailyInventoryRow[]>('/dashboard/daily-inventory');
            setDailyInventory(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const refreshSummaryTab = () => {
        void fetchSummary();
        void fetchDailyInventory();
    };

    const fetchHistory = async (f: DashboardFilter = filter) => {
        setLoading(true);
        try {
            const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
            const res = await backendApi.get<HistoryRow[]>('/dashboard/history', { params });
            setHistory(res.data);
            setPageH(1);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLocations = async () => {
        try {
            const res = await backendApi.get<LocationRow[]>('/dashboard/locations');
            setLocations(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        refreshSummaryTab();
        void fetchLocations();
        intervalRef.current = setInterval(refreshSummaryTab, 3 * 60 * 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    useEffect(() => {
        if (activeTab === 'detail') void fetchHistory();
    }, [activeTab]);

    // ปิด dropdown เมื่อคลิกข้างนอก
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            // a mousedown listener on document always gets a Node as target
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // ===== HANDLERS =====

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setFilter({ ...filter, [e.target.name]: e.target.value });
    const handleSearch = () => { setPageH(1); void fetchHistory(filter); };
    const handleReset = () => {
        setFilter(defaultFilter);
        setPartInput('');
        void fetchHistory(defaultFilter);
    };

    const handlePartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setPartInput(val);
        setFilter({ ...filter, brg_type: val });
        if (val.length >= 4) {
            const filtered = partOptions.filter(p => p.includes(val));
            setPartDropdown(filtered);
            setShowDropdown(filtered.length > 0);
        } else {
            setShowDropdown(false);
        }
    };

    const handleSelectPart = (part: string) => {
        setPartInput(part);
        setFilter({ ...filter, brg_type: part });
        setShowDropdown(false);
    };

    const handleExportSummary = () => {
        const data = processSummary.map(p => ({
            'PROCESS CODE': p.process_code,
            'PROCESS NAME': p.process_name,
            'INVENTORY QTY': p.inventory_qty,
        }));
        data.push({
            'PROCESS CODE': '',
            'PROCESS NAME': 'TOTAL INVENTORY',
            'INVENTORY QTY': processSummary.reduce((sum, p) => sum + (p.inventory_qty || 0), 0),
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');
        XLSX.writeFile(wb, 'inventory_summary.xlsx');
    };

    const handleExportDetail = () => {
        const data = history.map((l, i) => ({
            'No': i + 1,
            'Lot No': l.lot_no,
            'Part No': l.brg_type,
            'Spec': l.spec,
            'WOS': l.wos,
            'Location': l.location_name || '',
            'Process': STATUS_BADGE[l.status_id]?.label || '',
            'QTY': l.qty,
            'Updated': l.updated_at?.replace('T', ' ').slice(0, 19),
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detail');
        XLSX.writeFile(wb, 'detail.xlsx');
    };

    const inputCls = "h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400";

    const Pagination = ({ page, totalPages, setPage }: PaginationProps) => totalPages <= 1 ? null : (
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between shrink-0">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="h-7 px-3 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 text-gray-500">‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, i, arr) => (
                        <React.Fragment key={p}>
                            {i > 0 && arr[i - 1] !== p - 1 && <span className="h-7 px-2 text-xs flex items-center text-gray-300">...</span>}
                            <button onClick={() => setPage(p)}
                                className={`h-7 px-3 text-xs border rounded-lg transition-colors ${page === p ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-200 hover:bg-gray-50 text-gray-500'}`}>
                                {p}
                            </button>
                        </React.Fragment>
                    ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="h-7 px-3 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 text-gray-500">›</button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-3 h-full">

            {/* TABS + REFRESH */}
            <div className="flex items-center border-b border-gray-200 shrink-0">
                {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-base font-medium border-b-2 transition-colors
                            ${activeTab === tab.key
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {tab.label}
                    </button>
                ))}
                <div className="flex-1" />
                <div className="flex items-center gap-2 pr-2">
                    {lastRefresh && (
                        <p className="text-xs text-gray-400">
                            Updated {lastRefresh.toLocaleTimeString('th-TH')}
                        </p>
                    )}
                    <button onClick={refreshSummaryTab} title="Refresh" aria-label="Refresh"
                        className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                        <ReloadOutlined />
                    </button>
                </div>
            </div>

            {/* ===== TAB 1: SUMMARY ===== */}
            {activeTab === 'summary' && (
                <div className="flex flex-col gap-3 flex-1 min-h-0">

                    {/* Cards */}
                    <div className="grid grid-cols-4 gap-3 shrink-0">
                        {CARDS.map(c => {
                            const qty = summary?.[c.key] ?? 0;
                            const total = summary?.total_qty ?? 0;
                            const pct = total === 0 ? 0 : (qty / total) * 100;
                            return (
                                <div key={c.key} className={`${c.bg} border ${c.border} rounded-xl p-4`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {c.icon}
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{c.label}</p>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className={`text-4xl font-bold ${c.color}`}>{qty.toLocaleString()}</p>
                                        {c.bar && <p className="text-sm font-medium text-gray-500 tabular-nums">{Math.round(pct)}%</p>}
                                    </div>
                                    {c.bar && (
                                        <div className="mt-2 h-1.5 rounded-full bg-white/70 overflow-hidden">
                                            <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Middle */}
                    <div className="flex gap-3 flex-1 min-h-0">

                        {/* Daily Inventory Table */}
                        <div className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden min-h-0">
                            <div className="h-14 px-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                                <p className="text-sm font-semibold text-gray-600">Daily Inventory Gauging</p>
                                {dailyParts.length > 0 && (
                                    <p className="text-xs text-gray-400">
                                        {dailyParts.length} parts · {dailyWosCount} WOS · {dailyMachineCount} machines
                                    </p>
                                )}
                            </div>
                            <div className="overflow-auto flex-1">
                                <table className="w-full table-fixed border-collapse">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            {DAILY_COLUMNS.map(col => (
                                                <th key={col.label} className={`${TH_CLS} ${col.cls}`}>{col.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    {dailyParts.length === 0 && (
                                        <tbody>
                                            <tr><td colSpan={4} className="text-center py-8 text-gray-300 text-xs">No data</td></tr>
                                        </tbody>
                                    )}
                                    {/* One tbody per part; PART NO. is merged across its WOS rows
                                    //! need to discuss with P'Bo about which data should be Bold or normal text
                                    */}
                                    {dailyParts.map(p => (
                                        <tbody key={p.part_no}>
                                            {p.lines.map((l, li) => (
                                                <tr key={l.wos}>
                                                    <td className={`${DAILY_TD} border-r`}>
                                                        <div className="flex flex-wrap gap-1">
                                                            {l.mc_nos.map(mc => (
                                                                <span key={mc} className="text-xs px-1.5 leading-5 rounded bg-gray-50 text-gray-500 border border-gray-200 whitespace-nowrap">
                                                                    {mc}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    {li === 0 && (
                                                        <td rowSpan={p.lines.length} className={`${DAILY_TD} border-r align-top text-sm font-semibold text-gray-900 truncate`}>
                                                            {p.part_no}
                                                        </td>
                                                    )}
                                                    <td className={`${DAILY_TD} border-r text-sm font-mono text-gray-500 truncate`}>{l.wos}</td>
                                                    <td className={`${DAILY_TD} text-sm font-bold text-gray-800 text-right tabular-nums`}>{l.qty.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    ))}
                                    {dailyParts.length > 0 && (
                                        <tfoot className="sticky bottom-0 bg-white">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3 border-y-2 border-r border-gray-200 text-sm font-bold text-gray-600 uppercase tracking-wider">TOTAL :</td>
                                                <td className="px-4 py-3 border-y-2 border-gray-200 text-base font-bold text-slate-900 text-right tabular-nums">{dailyTotalQty.toLocaleString()}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>

                        {/* Inventory by Process: height follows content, bars are neutral because
                            a process (e.g. GAUGING) can span more than one stage colour */}
                        <div className="w-[420px] self-start bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="h-14 px-4 border-b border-gray-100 flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-600">Inventory by Process</p>
                                <button onClick={handleExportSummary}
                                    className="h-8 px-4 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-500 border border-emerald-200 rounded-lg transition-colors font-medium">
                                    ↓ Export Excel
                                </button>
                            </div>
                            {processBreakdown.shares.length === 0 ? (
                                <p className="text-center py-8 text-gray-300 text-xs">No data</p>
                            ) : (
                                <>
                                    <ul className="px-4 py-2">
                                        {processBreakdown.shares.map(s => (
                                            <li key={s.process_code} className="py-3">
                                                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                                    <p className="text-sm font-semibold text-gray-700 truncate">
                                                        {s.process_name}
                                                        <span className="ml-2 text-xs font-mono font-normal text-gray-400">{s.process_code}</span>
                                                    </p>
                                                    <p className="text-sm tabular-nums whitespace-nowrap">
                                                        <span className="font-bold text-gray-800">{s.qty.toLocaleString()}</span>
                                                        <span className="ml-2 inline-block w-12 text-right text-xs text-gray-500">{s.pct.toFixed(1)}%</span>
                                                    </p>
                                                </div>
                                                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                                    <div className="h-full rounded-full bg-slate-500" style={{ width: `${s.pct}%` }} />
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="px-4 py-3 border-t-2 border-gray-200 flex items-baseline justify-between">
                                        <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">Total inventory</p>
                                        <p className="text-base font-bold text-slate-900 tabular-nums">{processBreakdown.total.toLocaleString()}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== TAB 2: DETAIL ===== */}
            {activeTab === 'detail' && (
                <div className="flex flex-col gap-3 flex-1 min-h-0">

                    {/* Filter */}
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shrink-0">
                        <div className="flex items-end gap-2 flex-wrap">
                            {DATE_FIELDS.map(({ name, label, type }) => (
                                <div key={name} className="flex flex-col gap-1">
                                    <p className="text-xs text-gray-400 whitespace-nowrap">{label}</p>
                                    <input type={type} name={name} value={filter[name]}
                                        onChange={handleChange}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        className={inputCls} />
                                </div>
                            ))}

                            {/* Part No. with dropdown */}
                            <div className="flex flex-col gap-1 flex-1 min-w-0 relative" ref={dropdownRef}>
                                <p className="text-xs text-gray-400">Part No.</p>
                                <input
                                    type="text"
                                    value={partInput}
                                    onChange={handlePartInput}
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                    placeholder="Part No."
                                    className={inputCls + " w-full"}
                                />
                                {showDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                        {partDropdown.map((p, i) => (
                                            <button key={i} onClick={() => handleSelectPart(p)}
                                                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {TEXT_FIELDS.map(({ name, label, placeholder }) => (
                                <div key={name} className="flex flex-col gap-1 flex-1 min-w-0">
                                    <p className="text-xs text-gray-400 whitespace-nowrap">{label}</p>
                                    <input type="text" name={name} value={filter[name]}
                                        onChange={handleChange}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        placeholder={placeholder}
                                        className={inputCls + " w-full"} />
                                </div>
                            ))}

                            <div className="flex flex-col gap-1">
                                <p className="text-xs text-gray-400 whitespace-nowrap">Location</p>
                                <select name="location_name" value={filter.location_name} onChange={handleChange}
                                    className={inputCls + " w-44"}>
                                    <option value="">All Location</option>
                                    {locations.map((l, i) => (
                                        <option key={i} value={l.location_name}>{l.location_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <p className="text-xs text-gray-400 whitespace-nowrap">Process</p>
                                <select name="status_id" value={filter.status_id} onChange={handleChange}
                                    className={inputCls + " w-36"}>
                                    {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                            </div>

                            <button onClick={handleSearch} disabled={loading}
                                className="h-9 px-5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap shrink-0">
                                {loading ? '...' : 'Search'}
                            </button>
                            <button onClick={handleReset}
                                className="h-9 px-4 text-sm border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors shrink-0">
                                Reset
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden min-h-0">
                        <div className="h-14 px-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <p className="text-sm font-semibold text-gray-600">
                                รายการชิ้นงาน
                                <span className="ml-2 text-xs font-normal text-blue-500">{history.length} records</span>
                            </p>
                            <button onClick={handleExportDetail}
                                className="h-8 px-4 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-500 border border-emerald-200 rounded-lg transition-colors font-medium">
                                ↓ Export Excel
                            </button>
                        </div>
                        <div className="overflow-auto flex-1">
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        {['No.', 'Lot No.', 'Part No.', 'Spec', 'WOS', 'Location', 'Process', 'QTY', 'Updated'].map((col, i) => (
                                            <th key={i} className={`${TH_CLS} text-left`}>
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedHistory.length === 0 && (
                                        <tr><td colSpan={9} className="text-center py-12 text-gray-300 text-sm">No data</td></tr>
                                    )}
                                    {pagedHistory.map((l, i) => {
                                        const badge = STATUS_BADGE[l.status_id];
                                        return (
                                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                                <td className="px-4 py-2.5 text-xs text-gray-400">{(pageH - 1) * PAGE_SIZE + i + 1}</td>
                                                <td className="px-4 py-2.5 text-xs font-semibold text-blue-600">{l.lot_no}</td>
                                                <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">{l.brg_type}</td>
                                                <td className="px-4 py-2.5 text-xs text-gray-500">{l.spec}</td>
                                                <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{l.wos}</td>
                                                <td className="px-4 py-2.5 text-xs text-gray-500">{l.location_name || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {badge && (
                                                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}>
                                                            {badge.label}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm font-bold text-gray-700">{l.qty?.toLocaleString()}</td>
                                                <td className="px-4 py-2.5 text-xs text-gray-400">
                                                    {l.updated_at?.replace('T', ' ').slice(0, 19)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={pageH} totalPages={totalPagesH} setPage={setPageH} />
                    </div>
                </div>
            )}

        </div>
    );
};

export default Dashboard;