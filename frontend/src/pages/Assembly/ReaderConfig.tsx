import { useState, useEffect } from 'react';
import { backendApi } from '../../config/instance';
import Swal from 'sweetalert2';
import { isScannableStatus } from '../../config/scanConfig';
import type { ScannableStatus } from '../../config/scanConfig';
import type {
    AdminResult, ReaderConfig as ReaderConfigRow, ReaderStatus, ReadersStatusResponse, Status,
} from '../../types/api';

const ReaderConfig = () => {
    const [readers, setReaders] = useState<ReaderConfigRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<ReaderStatus[]>([]);
    const [typeOptions, setTypeOptions] = useState<ScannableStatus[]>([]);

    useEffect(() => {
        void fetchConfig();
        void fetchTypeOptions();
        void fetchStatus();
        const interval = setInterval(() => void fetchStatus(), 5000);
        return () => clearInterval(interval);
    }, []);
    const fetchConfig = async () => {
        try {
            const res = await backendApi.get<ReaderConfigRow[]>('/readers-config');
            setReaders(res.data);
        } catch {
            void Swal.fire({ icon: 'error', title: 'ไม่สามารถโหลดหน้านี้ได้', timer: 1500, showConfirmButton: false });
        }
    };

    // A reader can only be set to a status that has a scan endpoint.
    const fetchTypeOptions = async () => {
        try {
            const res = await backendApi.get<Status[]>('/status');
            setTypeOptions(res.data.filter(isScannableStatus));
        } catch (err) {
            console.error('fetchTypeOptions failed', err);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await backendApi.get<ReadersStatusResponse>('/readers-status');
            setStatus(res.data.readers || []);
        } catch (err) {
            console.error('fetchStatus failed', err);
        }
    };

    const handleChange = <K extends keyof ReaderConfigRow>(index: number, field: K, value: ReaderConfigRow[K]) => {
        setReaders(prev => prev.map((r, i) =>
            i === index ? { ...r, [field]: value } : r
        ));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await backendApi.put<AdminResult>('/readers-config', readers);
            await backendApi.post<AdminResult>('/readers-restart');
            void Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
        } catch {
            void Swal.fire({ icon: 'error', title: 'ไม่สามารถบันทึกได้!', timer: 1500, showConfirmButton: false });
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        if (typeOptions.length === 0) return;
        setReaders(prev => [...prev, {
            type: typeOptions[0].status,
            location_name: '',
            enabled: true,
            ip: '',
            power: 10,
        }]);
    };

    const handleRemove = (index: number) => {
        void Swal.fire({
            title: 'ต้องการลบ Reader นี้?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Remove',
            confirmButtonColor: '#ef4444',
        }).then(result => {
            if (result.isConfirmed) {
                setReaders(prev => prev.filter((_, i) => i !== index));
            }
        });
    };

    // The backend numbers readers by their position in the config, so match by index, not by type.
    const isConnected = (index: number) => status.find(s => s.index === index)?.connected ?? false;

    return (
        <div className="flex flex-col gap-4 h-full">

            {/* HEADER */}
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-600">Reader Config ({readers.length} readers)</p>
                <div className="flex gap-2">
                    <button
                        onClick={fetchConfig}
                        className="h-9 px-4 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                        Reset
                    </button>
                    <button
                        onClick={handleAdd}
                        disabled={typeOptions.length === 0}
                        className="h-9 px-4 text-sm rounded-lg border border-blue-200 text-blue-500 hover:bg-blue-50 disabled:opacity-50"
                    >
                        + Add Reader
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="h-9 px-5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* TABLE */}
            <div className="flex-1 bg-white border border-gray-100 rounded-xl flex flex-col min-h-0">
                <div className="overflow-y-auto flex-1 min-h-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {['Status', 'Type', 'Location Name', 'IP Address', 'Power (dBm)', 'Enabled', ''].map((col, i) => (
                                    <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-400 border-b border-gray-100 whitespace-nowrap">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {readers.length === 0 && (
                                <tr>
                                    <td colSpan={7}className="text-center py-12 text-gray-300 text-sm">
                                        No readers configured
                                    </td>
                                </tr>
                            )}
                            {readers.map((r, i) => (
                                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">

                                    {/* STATUS */}
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium
                                            ${isConnected(i)
                                                ? 'bg-green-50 text-green-600'
                                                : 'bg-gray-100 text-gray-400'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected(i) ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            {isConnected(i) ? 'Connected' : 'Offline'}
                                        </span>
                                    </td>

                                    {/* TYPE */}
                                    <td className="px-4 py-3">
                                        <select
                                            value={r.type}
                                            onChange={(e) => {
                                                const next = typeOptions.find(o => o.status === e.target.value);
                                                if (next) handleChange(i, 'type', next.status);
                                            }}
                                            className="h-9 px-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        >
                                            {!typeOptions.some(o => o.status === r.type) && (
                                                <option value={r.type}>{r.type}</option>
                                            )}
                                            {typeOptions.map(o => (
                                                <option key={o.id} value={o.status}>{o.label_status}</option>
                                            ))}
                                        </select>
                                    </td>

                                    {/* LOCATION NAME */}
                                    <td className="px-4 py-3">
                                        <input
                                            type="text"
                                            value={r.location_name || ''}
                                            onChange={(e) => handleChange(i, 'location_name', e.target.value)}
                                            placeholder="เช่น GAUGING ROOM F1"
                                            className="h-9 px-3 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                    </td>

                                    {/* IP */}
                                    <td className="px-4 py-3">
                                        <input
                                            type="text"
                                            value={r.ip}
                                            onChange={(e) => handleChange(i, 'ip', e.target.value)}
                                            placeholder="192.168.1.xxx"
                                            className="h-9 px-3 text-sm font-mono border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                    </td>

                                    {/* POWER */}
                                    <td className="px-4 py-3">
                                        <input
                                            type="number"
                                            value={r.power}
                                            onChange={(e) => handleChange(i, 'power', Number(e.target.value))}
                                            min={1} max={30}
                                            className="h-9 px-3 text-sm border border-gray-200 rounded-lg w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                    </td>

                                    {/* ENABLED */}
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleChange(i, 'enabled', !r.enabled)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                                                ${r.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                                ${r.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                                            />
                                        </button>
                                    </td>

                                    {/* REMOVE */}
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleRemove(i)}
                                            className="text-sm text-gray-300 hover:text-red-500"
                                        >✕</button>
                                    </td>

                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

export default ReaderConfig;