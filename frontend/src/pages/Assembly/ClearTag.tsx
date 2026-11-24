import { useState, useRef, useEffect } from 'react';
import { backendApi } from '../../config/instance';
import Swal from 'sweetalert2';
import type { SweetAlertIcon } from 'sweetalert2';
import type {
    ActiveLot,
    ClearTagHistoryQuery,
    ClearTagHistoryRow,
    CompletedRequest,
    CompletedResult,
    Process,
    Status,
} from '../../types/api';

type Tab = 'clear' | 'history';

interface InfoBlockProps {
    title: string;
    info: ActiveLot | null;
    onClear: () => void;
}

const showAlert = (msg: string, type: SweetAlertIcon) => {
    void Swal.fire({ position: 'center', icon: type, title: msg, showConfirmButton: false, timer: 1500 });
};

const today = () => new Date().toLocaleDateString('en-CA');

const TABS: { key: Tab; label: string }[] = [
    { key: 'clear',   label: 'Clear Tag' },
    { key: 'history', label: 'History' },
];

const DATE_FIELDS: { name: keyof ClearTagHistoryQuery; label: string }[] = [
    { name: 'date_from', label: 'Date From' },
    { name: 'date_to',   label: 'Date To' },
];

const SEARCH_MIN_CHARS   = 3;
const SEARCH_DEBOUNCE_MS = 3000;

const ClearTag = () => {
    const [activeTab, setActiveTab] = useState<Tab>('clear');

    const [lotInput, setLotInput] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [lotInfo, setLotInfo]   = useState<ActiveLot | null>(null);
    const [tagInfo, setTagInfo]   = useState<ActiveLot | null>(null);
    const [statuses, setStatuses]   = useState<Status[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [processId, setProcessId] = useState('');
    const [remark, setRemark]     = useState('');
    const [empId, setEmpId]       = useState('');
    const [loading, setLoading]   = useState(false);

    const [history, setHistory]               = useState<ClearTagHistoryRow[]>([]);
    const [historyFilter, setHistoryFilter]   = useState<ClearTagHistoryQuery>({ date_from: today(), date_to: today() });
    const [historyLoading, setHistoryLoading] = useState(false);

    const lotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isMatch = lotInfo && tagInfo && lotInfo.tag_id === tagInfo.tag_id;

    // The lot's process comes from its current status. Only processes with can_clear_tag can be cleared.
    const lotStatus = lotInfo ? statuses.find(s => s.id === lotInfo.status_id) : undefined;
    const lotProcess = processes.find(p => p.id === lotStatus?.process_id);
    const canClearLot = !!lotProcess?.can_clear_tag;
    const clearableProcesses = processes.filter(p => p.can_clear_tag);
    const chosenProcess = clearableProcesses.find(p => String(p.id) === processId);
    const defaultProcessId = canClearLot ? String(lotProcess?.id) : '';

    useEffect(() => { void fetchMaster(); }, []);
    // Pre-fill the selector from the scanned lot. The user may change it afterwards.
    useEffect(() => { setProcessId(defaultProcessId); }, [defaultProcessId]);
    useEffect(() => {
        if (activeTab === 'history') void fetchHistory();
    }, [activeTab]);

    const fetchMaster = async () => {
        try {
            const [statusRes, processRes] = await Promise.all([
                backendApi.get<Status[]>('/status'),
                backendApi.get<Process[]>('/process'),
            ]);
            setStatuses(statusRes.data);
            setProcesses(processRes.data);
        } catch (err) { console.error(err); }
    };

    const fetchLot = async (val: string) => {
        setLoading(true);
        try {
            const res = await backendApi.get<ActiveLot>(`/lot-by-lot/${val}`);
            setLotInfo(res.data);
            setLotInput('');
        } catch {
            showAlert('ไม่พบ Lot นี้ในระบบ', 'error');
            setLotInput('');
        } finally { setLoading(false); }
    };

    const fetchTag = async (val: string) => {
        setLoading(true);
        try {
            const res = await backendApi.get<ActiveLot>(`/lot-by-tag/${val}`);
            setTagInfo(res.data);
            setTagInput('');
        } catch {
            showAlert('ไม่พบ Tag นี้', 'error');
            setTagInput('');
        } finally { setLoading(false); }
    };

    const handleLotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setLotInput(val);
        if (lotTimer.current) clearTimeout(lotTimer.current);
        lotTimer.current = setTimeout(() => { if (val.trim()) void fetchLot(val.trim()); }, 300);
    };

    const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setTagInput(val);
        if (tagTimer.current) clearTimeout(tagTimer.current);
        tagTimer.current = setTimeout(() => { if (val.trim()) void fetchTag(val.trim()); }, 300);
    };

    const handleClear = async () => {
        if (!lotInfo)      return showAlert('กรุณากรอก Lot No.', 'warning');
        if (!tagInfo)      return showAlert('กรุณากรอก Tag ID', 'warning');
        if (!isMatch)      return showAlert('Lot และ Tag ไม่ตรงกัน', 'error');
        if (!canClearLot) return showAlert('Process นี้ Clear Tag ไม่ได้', 'error');
        if (!chosenProcess) return showAlert('กรุณาเลือก Process', 'warning');
        if (!empId.trim()) return showAlert('กรุณากรอกรหัสพนักงาน', 'warning');

        const processName = chosenProcess.process_name;
        const confirm = await Swal.fire({
            title: `Clear tag ของ ${lotInfo.lot_no}?`,
            html: `Process: <b>${processName}</b><br/>Emp: <b>${empId}</b>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Clear',
            confirmButtonColor: '#16a34a',
            cancelButtonText: 'ยกเลิก',
        });
        if (!confirm.isConfirmed) return;

        setLoading(true);
        try {
            const fullRemark = `[FROM: ${processName}]${remark.trim() ? ' ' + remark.trim() : ''}`;
            const res = await backendApi.post<CompletedResult>('/completed', {
                lot_no: lotInfo.lot_no,
                remark: fullRemark,
                emp_id: empId.trim(),
            } satisfies CompletedRequest);
            if (res.data.result === 'OK') {
                showAlert('Clear tag สำเร็จ', 'success');
                handleReset();
            } else {
                showAlert(res.data.result, 'error');
            }
        } catch {
            showAlert('เกิดข้อผิดพลาด', 'error');
        } finally { setLoading(false); }
    };

    const handleReset = () => {
        setLotInput(''); setTagInput('');
        setLotInfo(null); setTagInfo(null);
        setProcessId(''); setRemark(''); setEmpId('');
    };

    const fetchHistory = async (f: ClearTagHistoryQuery = historyFilter) => {
        setHistoryLoading(true);
        try {
            const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
            const res = await backendApi.get<ClearTagHistoryRow[]>('/clear-tag/history', { params });
            setHistory(res.data);
        } catch (err) { console.error(err); }
        finally { setHistoryLoading(false); }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = { ...historyFilter, search: e.target.value };
        setHistoryFilter(next);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        // Empty input refetches so the full list comes back; 1-2 chars wait for more typing.
        const length = e.target.value.trim().length;
        if (length > 0 && length < SEARCH_MIN_CHARS) return;
        searchTimer.current = setTimeout(() => { void fetchHistory(next); }, SEARCH_DEBOUNCE_MS);
    };

    const handleSearchClick = () => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        void fetchHistory(historyFilter);
    };

    const InfoBlock = ({ title, info, onClear }: InfoBlockProps) => (
        <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-0">
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
                {info && (
                    <button onClick={onClear} className="text-xs text-gray-300 hover:text-gray-500">✕ ล้าง</button>
                )}
            </div>
            {[
                { label: 'Lot No.',  value: info?.lot_no },
                { label: 'Tag ID',   value: info?.tag_id },
                { label: 'Part No.', value: info?.brg_type },
                { label: 'WOS',      value: info?.wos },
                { label: 'QTY',      value: info?.qty },
            ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className={`text-sm font-medium font-mono ${value ? 'text-gray-800' : 'text-gray-200'}`}>
                        {value || '—'}
                    </p>
                </div>
            ))}
        </div>
    );

    const inputCls = "w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-40";

    return (
        <div className="flex flex-col h-full gap-3">

            {/* TABS */}
            <div className="flex items-center border-b border-gray-200 shrink-0">
                {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
                            ${activeTab === tab.key
                                ? 'border-emerald-500 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ===== TAB 1: CLEAR TAG ===== */}
            {activeTab === 'clear' && (
                <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">

                    {/* ROW 1 — LOT + TAG input + info */}
                    <div className="flex gap-3">

                        {/* LOT */}
                        <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Lot No.</p>
                                <input type="text" value={lotInput}
                                    onChange={handleLotChange}
                                    disabled={loading || !!lotInfo}
                                    placeholder="สแกนหรือกรอก Lot No."
                                    className={inputCls} />
                            </div>
                            {lotInfo && (
                                <>
                                    <div className="border-t border-gray-50 pt-3 flex flex-col gap-2">
                                        {[
                                            { label: 'Lot No.',  value: lotInfo.lot_no },
                                            { label: 'Tag ID',   value: lotInfo.tag_id },
                                            { label: 'Part No.', value: lotInfo.brg_type },
                                            { label: 'WOS',      value: lotInfo.wos },
                                            { label: 'QTY',      value: lotInfo.qty },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="flex items-center justify-between">
                                                <p className="text-xs text-gray-400">{label}</p>
                                                <p className="text-sm font-medium font-mono text-gray-800">{value || '—'}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => { setLotInfo(null); setLotInput(''); }}
                                        className="text-xs text-gray-300 hover:text-gray-500 text-right">
                                        ✕ ล้าง
                                    </button>
                                </>
                            )}
                        </div>

                        {/* TAG */}
                        <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">RFID No. (Tag ID)</p>
                                <input type="text" value={tagInput}
                                    onChange={handleTagChange}
                                    disabled={loading || !!tagInfo}
                                    placeholder="สแกนหรือกรอก Tag ID"
                                    className={inputCls} />
                            </div>
                            {tagInfo && (
                                <>
                                    <div className="border-t border-gray-50 pt-3 flex flex-col gap-2">
                                        {[
                                            { label: 'Lot No.',  value: tagInfo.lot_no },
                                            { label: 'Tag ID',   value: tagInfo.tag_id },
                                            { label: 'Part No.', value: tagInfo.brg_type },
                                            { label: 'WOS',      value: tagInfo.wos },
                                            { label: 'QTY',      value: tagInfo.qty },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="flex items-center justify-between">
                                                <p className="text-xs text-gray-400">{label}</p>
                                                <p className="text-sm font-medium font-mono text-gray-800">{value || '—'}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => { setTagInfo(null); setTagInput(''); }}
                                        className="text-xs text-gray-300 hover:text-gray-500 text-right">
                                        ✕ ล้าง
                                    </button>
                                </>
                            )}
                        </div>

                    </div>

                    {/* MATCH STATUS */}
                    {(lotInfo || tagInfo) && (
                        <div className={`rounded-xl px-4 py-3 text-center text-sm font-bold shrink-0 ${
                            !lotInfo || !tagInfo
                                ? 'bg-gray-50 text-gray-400 border border-gray-100'
                                : isMatch
                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                    : 'bg-orange-50 text-orange-500 border border-orange-200'
                        }`}>
                            {!lotInfo || !tagInfo
                                ? '○ รอข้อมูลครบทั้งสองฝั่ง'
                                : isMatch
                                    ? '✓ MATCH — Lot และ Tag ตรงกัน'
                                    : '✕ NOT MATCH — Lot และ Tag ไม่ตรงกัน'}
                        </div>
                    )}

                    {/* PROCESS + REMARK + EMP */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                    Process <span className="text-orange-400 normal-case">*</span>
                                </p>
                                {/* TODO: need to discuss with user again: clear tag by process or location */}
                                <select value={processId} onChange={e => setProcessId(e.target.value)} disabled={!lotInfo}
                                    className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-60">
                                    <option value="">{lotInfo ? '-- เลือก Process --' : '-- สแกน Lot ก่อน --'}</option>
                                    {clearableProcesses.map(p => (
                                        <option key={p.id} value={p.id}>{p.process_name}</option>
                                    ))}
                                </select>
                                {lotInfo && !canClearLot && (
                                    <p className="text-xs text-orange-500 mt-1">
                                        Lot นี้อยู่ใน Process {lotProcess?.process_name ?? '—'} ซึ่ง Clear Tag ไม่ได้
                                    </p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Remark</p>
                                <textarea value={remark}
                                    onChange={e => setRemark(e.target.value)}
                                    placeholder="ระบุหมายเหตุ (ถ้ามี)"
                                    className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                    EMP No. <span className="text-orange-400 normal-case">*</span>
                                </p>
                                <input type="text" value={empId}
                                    onChange={e => setEmpId(e.target.value.toUpperCase())}
                                    placeholder="สแกนรหัสพนักงาน"
                                    className="w-full h-10 px-3 text-sm font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            </div>
                        </div>
                    </div>

                    {/* BUTTONS */}
                    <div className="flex gap-2 shrink-0">
                        <button onClick={handleClear}
                            disabled={!lotInfo || !tagInfo || !isMatch || !canClearLot || !chosenProcess || loading}
                            className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-30">
                            {loading ? 'กำลัง Clear...' : 'Clear Tag'}
                        </button>
                        <button onClick={handleReset}
                            className="h-11 px-6 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-xl transition-colors">
                            Reset
                        </button>
                    </div>

                </div>
            )}

            {/* ===== TAB 2: HISTORY ===== */}
            {activeTab === 'history' && (
                <div className="flex flex-col gap-3 flex-1 min-h-0">
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shrink-0">
                        <div className="flex items-end gap-2">
                            {DATE_FIELDS.map(({ name, label }) => (
                                <div key={name} className="flex flex-col gap-1">
                                    <p className="text-xs text-gray-400">{label}</p>
                                    <input type="date" name={name}
                                        value={historyFilter[name]}
                                        onChange={e => setHistoryFilter({ ...historyFilter, [e.target.name]: e.target.value })}
                                        className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                </div>
                            ))}
                            <div className="flex flex-col gap-1">
                                <p className="text-xs text-gray-400">Search</p>
                                <input type="text"
                                    value={historyFilter.search ?? ''}
                                    onChange={handleSearchChange}
                                    placeholder={`Lot / Tag / Emp / Part No. (min ${SEARCH_MIN_CHARS})`}
                                    className="h-9 w-64 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            </div>
                            <button onClick={handleSearchClick} disabled={historyLoading}
                                className="h-9 px-5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50">
                                {historyLoading ? '...' : 'Search'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden min-h-0">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <p className="text-sm font-medium text-gray-500">
                                ประวัติการ Clear Tag
                                <span className="ml-2 text-xs text-gray-300">{history.length} records</span>
                            </p>
                        </div>
                        <div className="overflow-auto flex-1">
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        {['No.', 'Lot No.', 'Tag ID', 'Part No.', 'Spec', 'Emp ID', 'Remark', 'Cleared At'].map((col, i) => (
                                            <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 border-b border-gray-100 whitespace-nowrap uppercase tracking-wider">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.length === 0 && (
                                        <tr><td colSpan={8} className="text-center py-12 text-gray-300 text-sm">No data</td></tr>
                                    )}
                                    {history.map((h, i) => (
                                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                            <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                                            <td className="px-4 py-2.5 text-xs font-semibold text-emerald-600">{h.lot_no}</td>
                                            <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{h.tag_id}</td>
                                            <td className="px-4 py-2.5 text-xs text-gray-700">{h.brg_type}</td>
                                            <td className="px-4 py-2.5 text-xs text-gray-500">{h.spec}</td>
                                            <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{h.emp_id || '—'}</td>
                                            <td className="px-4 py-2.5 text-xs text-gray-500">{h.remark || '—'}</td>
                                            <td className="px-4 py-2.5 text-xs text-gray-400">
                                                {h.cleared_at?.replace('T', ' ').slice(0, 19)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ClearTag;