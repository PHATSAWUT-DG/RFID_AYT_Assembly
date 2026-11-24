import { useState, useEffect } from 'react';
import UserTab from './Management/UserTab';
import StatusTab from './Management/StatusTab';
import ProcessTab from './Management/ProcessTab';
import ReaderConfig from './ReaderConfig';
import LoginModal from '../../components/LoginModal';
import { useNavigate } from 'react-router-dom';
import { readSessionUser } from '../../config/session';

type TabKey = 'user' | 'status' | 'process' | 'reader';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'user', label: 'Users' },
    { key: 'status', label: 'Status' },
    { key: 'process', label: 'Process' },
    { key: 'reader', label: 'Reader Config' },
];

const Management = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabKey>('user');

    // อ่านตรงจาก sessionStorage ทุกครั้งที่ render
    const storedUser = readSessionUser();

    // const [user, setUser] = useState(storedUser);
    // const handleLoginSuccess = (u) => {
    //     if (u.position !== 'admin') {
    //         sessionStorage.removeItem('assy_user');
    //         return;
    //     }
    //     setUser(u);
    // };
    // if (!user || user.position !== 'admin') {
    //     return (
    //         <LoginModal
    //             onSuccess={handleLoginSuccess}
    //             onCancel={() => navigate('/assembly/dashboard')}
    //         />
    //     );
    // }

    return (
        <div className="flex flex-col h-full p-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-semibold text-gray-800">Management</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 mb-6 shrink-0">
                {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
                            ${activeTab === tab.key
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0">
                {activeTab === 'user' && <UserTab />}
                {activeTab === 'status' && <StatusTab />}
                {activeTab === 'process' && <ProcessTab />}
                {activeTab === 'reader' && <ReaderConfig />}
            </div>
        </div>
    );
};

export default Management;