import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readSessionUser } from '../../config/session';
import {
    ScanOutlined,
    DashboardOutlined,
    CheckOutlined,
    AppstoreOutlined,
    ClearOutlined,
    SettingOutlined,
    ToolOutlined,
    ApiOutlined,
} from '@ant-design/icons';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(false);
    const [user, setUser] = useState(readSessionUser);

    const collapsed = !hovered;

    useEffect(() => {
        const handleStorage = () => setUser(readSessionUser());
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const navItems = [
        { label: 'Dashboard', icon: <DashboardOutlined />, path: '/assembly/dashboard' },
        { label: 'Register', icon: <ScanOutlined />, path: '/assembly/register' },
        { label: 'Gauging Room F1', icon: <ToolOutlined />, path: '/assembly/gauging-room-f1' },
        { label: 'MC Gauging F1', icon: <ToolOutlined />, path: '/assembly/mc-gauging-f1' },
        { label: 'Clear Tag', icon: <ClearOutlined />, path: '/assembly/clear-tag' },
        { label: 'Mock Done', icon: <CheckOutlined />, path: '/assembly/mock-done' },
        { label: 'Management', icon: <SettingOutlined />, path: '/assembly/management' },
        { label: 'Reader Config', icon: <ApiOutlined />, path: '/assembly/reader-config' },
    ];

    const isActive = (path: string) => location.pathname === path;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`${collapsed ? 'w-14' : 'w-52'} bg-white border-r border-gray-100 flex flex-col shrink-0 h-full transition-all duration-200`}
        >
            {/* Header */}
            <div className="p-3 border-b border-gray-100 flex items-center justify-center">
                {collapsed ? (
                    <span className="text-gray-400 text-base"><AppstoreOutlined /></span>
                ) : (
                    <div className="w-full">
                        <p className="text-sm font-semibold text-gray-800">RFID System</p>
                        <p className="text-xs text-gray-400">Assembly</p>
                        {user && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-xs font-medium text-gray-700 truncate">{user.eng_name} {user.eng_surname}</p>
                                <p className="text-xs text-blue-400">{user.position}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto p-2">
                {navItems.map((item) => (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        title={collapsed ? item.label : ''}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-1
                            ${collapsed ? 'justify-center' : ''}
                            ${isActive(item.path)
                                ? 'bg-blue-50 text-blue-600 font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <span className="text-base shrink-0">{item.icon}</span>
                        {!collapsed && item.label}
                    </button>
                ))}
            </nav>
        </div>
    );
};

export default Sidebar;
