import { useState, useEffect } from 'react';
import { backendApi } from '../../../config/instance';
import Swal from 'sweetalert2';
import type { AdminResult, Status, StatusRequest } from '../../../types/api';

// No process_id: the backend stores null. Keep it that way (plan Task 12).
type StatusForm = Pick<StatusRequest, 'status' | 'label_status'>;

const defaultForm: StatusForm = { status: '', label_status: '' };

const StatusTab = () => {
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [form, setForm] = useState(defaultForm);
    const [editId, setEditId] = useState<number | null>(null);

    const fetchStatuses = async () => {
        try {
            const res = await backendApi.get<Status[]>('/status');
            setStatuses(res.data);
        } catch {
            void Swal.fire('Error', 'โหลดข้อมูลไม่ได้', 'error');
        }
    };

    useEffect(() => { void fetchStatuses(); }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async () => {
        if (!form.status || !form.label_status) {
            return Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลให้ครบ', showConfirmButton: false, timer: 1500 });
        }
        try {
            if (editId) {
                await backendApi.put<AdminResult>(`/status/${editId}`, form);
            } else {
                await backendApi.post<AdminResult>('/status', form);
            }
            setForm(defaultForm);
            setEditId(null);
            void fetchStatuses();
            void Swal.fire({ icon: 'success', title: editId ? 'แก้ไขแล้ว' : 'เพิ่มแล้ว', showConfirmButton: false, timer: 1500 });
        } catch {
            void Swal.fire('Error', 'บันทึกไม่ได้', 'error');
        }
    };

    const handleEdit = (s: Status) => {
        setEditId(s.id);
        setForm({ status: s.status, label_status: s.label_status });
    };

    const handleDelete = async (id: number) => {
        const confirm = await Swal.fire({
            title: 'ลบ status นี้?', icon: 'warning',
            showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
        });
        if (!confirm.isConfirmed) return;
        try {
            await backendApi.delete<AdminResult>(`/status/${id}`);
            void fetchStatuses();
        } catch {
            void Swal.fire('Error', 'ลบไม่ได้', 'error');
        }
    };

    const handleCancel = () => { setForm(defaultForm); setEditId(null); };

    return (
        <div className="flex gap-4 h-full">

            {/* ซ้าย — form */}
            <div className="w-80 shrink-0 flex flex-col gap-4">
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">
                        {editId ? 'Edit Status' : 'Add Status'}
                    </p>
                    <input
                        name="status"
                        value={form.status}
                        onChange={handleChange}
                        placeholder="Status เช่น gr_f1"
                        className="w-full h-10 px-3 text-sm font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <input
                        name="label_status"
                        value={form.label_status}
                        onChange={handleChange}
                        placeholder="Location เช่น Gauging Room F1"
                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <div className="flex gap-2 pt-1">
                        <button onClick={handleSubmit}
                            className="flex-1 h-9 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors">
                            {editId ? 'บันทึก' : 'เพิ่ม'}
                        </button>
                        {editId && (
                            <button onClick={handleCancel}
                                className="flex-1 h-9 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition-colors">
                                ยกเลิก
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ขวา — table */}
            <div className="flex-1 bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden min-h-0">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-500">Status</p>
                    <span className="text-xs text-gray-400">{statuses.length} records</span>
                </div>
                <div className="overflow-y-auto flex-1">
                    {statuses.length === 0 && (
                        <p className="text-center py-12 text-gray-300 text-sm">No records</p>
                    )}
                    <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {['Status', 'Label', ''].map((col, i) => (
                                    <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 border-b border-gray-100">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {statuses.map(s => (
                                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-mono text-blue-600">{s.status}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800">{s.label_status}</td>
                                    <td className="px-4 py-3 text-right space-x-3">
                                        <button onClick={() => handleEdit(s)}
                                            className="text-xs text-blue-400 hover:text-blue-600">แก้ไข</button>
                                        <button onClick={() => handleDelete(s.id)}
                                            className="text-xs text-red-300 hover:text-red-500">ลบ</button>
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

export default StatusTab;