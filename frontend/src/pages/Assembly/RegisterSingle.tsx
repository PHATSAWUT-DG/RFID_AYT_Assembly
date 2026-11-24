import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { backendApi } from '../../config/instance';
import Swal from 'sweetalert2';
import type { SweetAlertIcon } from 'sweetalert2';
import LoginModal from '../../components/LoginModal';
import type { As400Lot, RegisterTagRequest, RegisterTagResult } from '../../types/api';

interface RegisteredRow {
    lot_no: string;
    tag_id: string;
    time: string;
}

const showAlert = (msg: string, type: SweetAlertIcon) => {
    void Swal.fire({
        position: 'center',
        icon: type,
        title: msg,
        showConfirmButton: false,
        timer: 1500,
    });
};

const RegisterSingle = () => {
     const navigate = useNavigate();
    // const [user, setUser] = useState(null);
    const [lotNo, setLotNo] = useState('');
    const [lotInfo, setLotInfo] = useState<As400Lot | null>(null);
    const [tagId, setTagId] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<RegisteredRow[]>([]);

    const lotRef = useRef<HTMLInputElement>(null);
    const tagRef = useRef<HTMLInputElement>(null);
    const lotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // focus lot เสมอถ้ายังไม่มี lotInfo
    useEffect(() => {
        if (lotInfo) return;
        lotRef.current?.focus();
    }, [lotInfo]);

    // focus tag เมื่อมี lotInfo
    useEffect(() => {
        if (!lotInfo) return;
        tagRef.current?.focus();
    }, [lotInfo]);

    // เช็ค sessionStorage
    // useEffect(() => {
    //     const stored = sessionStorage.getItem('assy_user');
    //     if (stored) setUser(JSON.parse(stored));
    // }, []);
    // if (!user) {
    //     return (
    //         <LoginModal
    //             onSuccess={(u) => setUser(u)}
    //             onCancel={() => navigate('/assembly/dashboard')}
    //         />
    //     );
    // }

    // สแกน lot — timer 300ms
    const handleLotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setLotNo(val);
        if (lotTimer.current) clearTimeout(lotTimer.current);
        lotTimer.current = setTimeout(() => {
            const target = val.trim();
            if (target) void fetchLot(target);
        }, 300);
    };

    const fetchLot = async (target: string) => {
        setLoading(true);
        try {
            const res = await backendApi.get<As400Lot>(`/lot/${target}`);
            setLotInfo(res.data);
            setLotNo('');
        } catch {
            showAlert('Lot not found!', 'error');
            setLotNo('');
            lotRef.current?.focus();
        } finally {
            setLoading(false);
        }
    };

    // สแกน tag — timer 300ms
    const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setTagId(val);
        if (tagTimer.current) clearTimeout(tagTimer.current);
        tagTimer.current = setTimeout(() => {
            const tag = val.trim();
            if (tag) void registerTag(tag);
        }, 300);
    };

    const isValidTag = (tag: string) => {
        // เช็คว่าเป็น alphanumeric เท่านั้น
        return /^[A-Z0-9]+$/.test(tag);
    };

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        const tag = tagId.trim();
        if (!tag) return;

        if (!isValidTag(tag)) {
            showAlert('Invalid tag! Please switch to English input', 'error');
            setTagId('');
            return;
        }

        void registerTag(tag);
    };


    const registerTag = async (tag: string) => {
        if (!lotInfo || loading) return;
        setLoading(true);
        try {
            const res = await backendApi.post<RegisterTagResult>('/register-tag', {
                tag_id: tag,
                lot_no: lotInfo.lot_no,
                wos: lotInfo.wos,
                brg_type: lotInfo.brg_type,
                spec: lotInfo.spec,
                qty: lotInfo.qty,
            } satisfies RegisterTagRequest);

            const result = res.data.result;
            if (result === 'OK') {
                // เพิ่ม history
                setHistory(prev => [{
                    lot_no: lotInfo.lot_no,
                    tag_id: tag,
                    time: new Date().toLocaleTimeString('th-TH'),
                }, ...prev].slice(0, 20));

                showAlert('Tag registered!', 'success');
                setLotInfo(null);
                setTagId('');
            } else if (result === 'TAG_IN_USE') {
                showAlert('Tag already in use!', 'error');
                setTagId('');
                tagRef.current?.focus();
            } else if (result === 'LOT_ALREADY_EXISTS') {
                showAlert('Lot already registered!', 'warning');
                setLotInfo(null);
                setTagId('');
            } else {
                showAlert(result, 'error');
                setTagId('');
            }
        } catch {
            showAlert('Register failed!', 'error');
            setTagId('');
        } finally {
            setLoading(false);
        }
    };

    const clearLot = () => {
        setLotInfo(null);
        setLotNo('');
        setTagId('');
    };

    return (
        <div className="flex flex-col h-full gap-4">

            <div className="flex gap-4 flex-1 min-h-0">
                {/* ซ้าย — scan + info (เหมือนเดิมทุกอย่าง) */}
                <div className="flex flex-col gap-4 w-96 shrink-0">
                    {/* STATUS */}
                    <div className={`rounded-xl px-4 py-3 text-sm font-medium
                        ${lotInfo
                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                            : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                        {lotInfo ? '● Waiting for tag scan...' : '○ Waiting for lot scan...'}
                    </div>

                    {/* SCAN LOT */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Lot Barcode</p>
                        <input
                            ref={lotRef}
                            type="text"
                            value={lotNo}
                            onChange={handleLotChange}
                            onBlur={() => !lotInfo && setTimeout(() => lotRef.current?.focus(), 0)}
                            disabled={loading || !!lotInfo}
                            placeholder="Scan lot barcode..."
                            className="w-full h-10 px-3 text-sm font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                        />
                    </div>

                    {/* LOT INFO */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Lot Info</p>
                            {lotInfo && (
                                <button onClick={clearLot} className="text-xs text-gray-300 hover:text-red-400">
                                    ✕ Clear
                                </button>
                            )}
                        </div>
                        {[
                            { label: 'Lot No.', value: lotInfo?.lot_no },
                            { label: 'WOS', value: lotInfo?.wos },
                            { label: 'BRG Type', value: lotInfo?.brg_type },
                            { label: 'Spec', value: lotInfo?.spec },
                            { label: 'Qty', value: lotInfo?.qty },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                                <p className="text-xs text-gray-400">{label}</p>
                                <p className={`text-sm font-medium font-mono ${value ? 'text-gray-800' : 'text-gray-200'}`}>
                                    {value || '—'}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* SCAN TAG */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                        <input
                            ref={tagRef}
                            type="text"
                            value={tagId}
                            onChange={(e) => setTagId(e.target.value.toUpperCase())}
                            onKeyDown={handleTagKeyDown}
                            onBlur={() => lotInfo && setTimeout(() => tagRef.current?.focus(), 0)}
                            disabled={loading || !lotInfo}
                            placeholder={lotInfo ? 'Scan tag...' : 'Waiting for lot...'}
                            className="w-full h-10 px-3 text-sm font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                        />
                    </div>
                </div>

                {/* ขวา — history (เหมือนเดิมทุกอย่าง) */}
                <div className="flex-1 bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden min-h-0">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-500">History</p>
                        <span className="text-xs text-gray-400">{history.length} records</span>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {history.length === 0 && (
                            <p className="text-center py-12 text-gray-300 text-sm">No records yet</p>
                        )}
                        <table className="w-full">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    {['Time', 'Lot No.', 'Tag ID'].map((col, i) => (
                                        <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 border-b border-gray-100">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h, i) => (
                                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="px-4 py-3 text-xs text-gray-400">{h.time}</td>
                                        <td className="px-4 py-3 text-sm font-mono text-blue-600">{h.lot_no}</td>
                                        <td className="px-4 py-3 text-sm font-mono text-gray-600">{h.tag_id}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegisterSingle;