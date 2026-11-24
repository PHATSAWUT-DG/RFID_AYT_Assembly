import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginModal from './LoginModal';
import { readSessionUser, SESSION_KEY } from '../config/session';
import type { User } from '../types/api';

interface SecureRouteProps {
    children: React.ReactNode;
    adminOnly?: boolean;
}

const SecureRoute = ({ children, adminOnly = false }: SecureRouteProps) => {
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(true);

    const user = readSessionUser();

    // มี user และถ้า adminOnly ต้องเป็น admin
    if (user && (!adminOnly || user.position === 'admin')) return children;

    return (
        <>
            <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-300 text-sm">Sign in to access this page</p>
            </div>
            {showModal && (
                <LoginModal
                    onSuccess={(u: User) => {
                        if (adminOnly && u.position !== 'admin') {
                            sessionStorage.removeItem(SESSION_KEY);
                            void navigate('/assembly/dashboard');
                            return;
                        }
                        setShowModal(false);
                    }}
                    onCancel={() => {
                        setShowModal(false);
                        void navigate('/assembly/dashboard');
                    }}
                />
            )}
        </>
    );
};

export default SecureRoute;