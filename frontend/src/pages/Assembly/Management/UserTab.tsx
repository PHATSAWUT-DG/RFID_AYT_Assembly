import { useState, useEffect } from 'react';
import { backendApi } from '../../../config/instance';
import Swal from 'sweetalert2';
import type { AdminResult, Position, User, UserCreateRequest } from '../../../types/api';

const POSITIONS: Position[] = ['admin', 'user'];
const defaultForm: UserCreateRequest = { emp_id: '', eng_name: '', eng_surname: '', password: '', position: 'user' };

const UserTab = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [form, setForm] = useState(defaultForm);
    const [editId, setEditId] = useState<number | null>(null);

    const fetchUsers = async () => {
        try {
            const res = await backendApi.get<User[]>('/login/users');
            setUsers(res.data);
        } catch {
            void Swal.fire('Error', 'โหลดข้อมูลไม่ได้', 'error');
        }
    };

    useEffect(() => { void fetchUsers(); }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async () => {
        if (!form.emp_id || !form.eng_name || !form.eng_surname || !form.password) {
            return Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลให้ครบ', showConfirmButton: false, timer: 1500 });
        }
        try {
            if (editId) {
                await backendApi.put<AdminResult>(`/login/users/${editId}`, form);
            } else {
                await backendApi.post<AdminResult>('/login/users', form);
            }
            setForm(defaultForm);
            setEditId(null);
            void fetchUsers();
            void Swal.fire({ icon: 'success', title: editId ? 'แก้ไขแล้ว' : 'เพิ่มแล้ว', showConfirmButton: false, timer: 1500 });
        } catch {
            void Swal.fire('Error', 'บันทึกไม่ได้', 'error');
        }
    };

    const handleEdit = (u: User) => {
        setEditId(u.id);
        // TODO(ts-bug-3): the list has no password, so this was `undefined`. '' shows the same empty field.
        setForm({ emp_id: u.emp_id, eng_name: u.eng_name, eng_surname: u.eng_surname, password: '', position: u.position });
    };

    const handleDelete = async (id: number) => {
        const confirm = await Swal.fire({
            title: 'ลบ user นี้?', icon: 'warning',
            showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
        });
        if (!confirm.isConfirmed) return;
        try {
            await backendApi.delete<AdminResult>(`/login/users/${id}`);
            void fetchUsers();
        } catch {
            void Swal.fire('Error', 'ลบไม่ได้', 'error');
        }
    };

    const handleCancel = () => { setForm(defaultForm); setEditId(null); };

    const fields: { name: Exclude<keyof UserCreateRequest, 'position'>; placeholder: string; disabled?: boolean; type?: string }[] = [
        { name: 'emp_id', placeholder: 'Employee ID', disabled: !!editId },
        { name: 'eng_name', placeholder: 'First Name' },
        { name: 'eng_surname', placeholder: 'Last Name' },
        { name: 'password', placeholder: 'Password', type: 'password' },
    ];

    return (
        <div className="flex gap-4 h-full">

            {/* ซ้าย — form */}
            <div className="w-80 shrink-0 flex flex-col gap-4">
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">
                        {editId ? 'Edit User' : 'Add User'}
                    </p>
                    {fields.map(({ name, placeholder, disabled, type }) => (
                        <input
                            key={name}
                            name={name}
                            type={type || 'text'}
                            value={form[name]}
                            onChange={(e) => {
                                e.target.value = e.target.value.toUpperCase();
                                handleChange(e);
                            }}
                            placeholder={placeholder}
                            disabled={disabled}
                            className="w-full h-10 px-3 text-sm font-mono uppercase border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                        />
                    ))}
                    <select
                        name="position"
                        value={form.position}
                        onChange={handleChange}
                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
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
                    <p className="text-sm font-medium text-gray-500">Users</p>
                    <span className="text-xs text-gray-400">{users.length} records</span>
                </div>
                <div className="overflow-y-auto flex-1">
                    {users.length === 0 && (
                        <p className="text-center py-12 text-gray-300 text-sm">No records</p>
                    )}
                    <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {['Emp ID', 'ชื่อ', 'Position', ''].map((col, i) => (
                                    <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 border-b border-gray-100">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{u.emp_id}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800">{u.eng_name} {u.eng_surname}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                            ${u.position === 'admin' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                            {u.position}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-3">
                                        <button onClick={() => handleEdit(u)}
                                            className="text-xs text-blue-400 hover:text-blue-600">แก้ไข</button>
                                        <button onClick={() => handleDelete(u.id)}
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

export default UserTab;