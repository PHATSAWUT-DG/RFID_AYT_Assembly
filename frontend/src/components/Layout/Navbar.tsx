import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readSessionUser, SESSION_KEY } from '../../config/session';

const pageTitles: Record<string, string> = {
    '/assembly/register':  'Register',
    '/assembly/clear-tag': 'Clear Tag',
    '/assembly/dashboard': 'Dashboard',
};

const Navbar = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const title = pageTitles[pathname] || 'RFID Assembly';
    const [currentTime, setCurrentTime] = useState(new Date());
    const [user, setUser] = useState(readSessionUser);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleStorage = () => setUser(readSessionUser());
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const handleLogout = () => {
        sessionStorage.removeItem(SESSION_KEY);
        setUser(null);
        window.dispatchEvent(new Event('storage'));
        void navigate('/assembly/dashboard');
    };

    return (
        <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
            <span className="text-sm font-medium text-gray-800">{title}</span>

            <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400">
                    Date: {currentTime.toLocaleDateString('th-TH')} | Time: {currentTime.toLocaleTimeString('th-TH')}
                </span>
                {user && (
                    <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
                        <button
                            onClick={handleLogout}
                            className="text-base text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                            Sign out
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Navbar;
