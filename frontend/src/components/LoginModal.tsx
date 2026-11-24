import { useState } from 'react';
import { backendApi } from '../config/instance';
import Swal from 'sweetalert2';
import { SESSION_KEY } from '../config/session';
import type { LoginRequest, LoginResponse, User } from '../types/api';

interface LoginModalProps {
    onSuccess?: (user: User) => void;
    onCancel: () => void;
}

const LoginModal = ({ onSuccess, onCancel }: LoginModalProps) => {
    const [empId, setEmpId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!empId || !password) {
            void Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลให้ครบ', showConfirmButton: false, timer: 1500 });
            return;
        }
        setLoading(true);
        try {
            const res = await backendApi.post<LoginResponse>('/login', { emp_id: empId, password } satisfies LoginRequest);
            if (res.data.result === 'OK') {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(res.data.user));
                window.dispatchEvent(new Event('storage'));
                void Swal.fire({ icon: 'success', title: `Welcome, ${res.data.user.eng_name}`, showConfirmButton: false, timer: 1000 });
                onSuccess?.(res.data.user);
            } else {
                void Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ถูกต้อง', showConfirmButton: false, timer: 1500 });
            }
        } catch {
            void Swal.fire({ icon: 'error', title: 'ไม่สามารถเชื่อมต่อได้', showConfirmButton: false, timer: 1500 });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
            onClick={onCancel}
        >
            <div
                className="bg-white rounded-2xl p-10 w-96 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <p className="text-lg font-semibold text-gray-800 mb-6">Sign in</p>

                <div className="flex flex-col gap-4">
                    <div>
                        <p className="text-sm text-gray-500 mb-1.5">Employee ID</p>
                        <input
                            type="text"
                            value={empId}
                            onChange={(e) => setEmpId(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && handleLogin()}
                            placeholder="Enter ID"
                            autoFocus
                            className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1.5">Password</p>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleLogin()}
                            placeholder="Enter password"
                            className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="h-11 w-full text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 mt-2"
                    >
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginModal;