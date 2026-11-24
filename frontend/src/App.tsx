import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import RegisterSingle from './pages/Assembly/RegisterSingle';
import ScanTag from './pages/Assembly/ScanTag';
import MockDone from './pages/Assembly/MockDone';
import ReaderConfig from './pages/Assembly/ReaderConfig';
import Dashboard from './pages/Assembly/Dashboard';
import Management from './pages/Assembly/Management';
import ClearTag from './pages/Assembly/ClearTag';
import SecureRoute from './components/SecureRoute';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Navigate to="/assembly/dashboard" replace />} />

                    <Route path="assembly/dashboard" element={<Dashboard />} />
                    <Route path="assembly/mock-done" element={<MockDone />} />

                    <Route path="assembly/register" element={
                        <SecureRoute><RegisterSingle /></SecureRoute>
                    } />

                    <Route path="assembly/management" element={
                        <SecureRoute adminOnly={true}><Management /></SecureRoute>
                    } />
                    <Route path="assembly/clear-tag" element={
                        <SecureRoute adminOnly={true}><ClearTag /></SecureRoute>
                    } />

                    <Route path="assembly/gauging-room-f1" element={
                        <SecureRoute><ScanTag mode="gr_f1" /></SecureRoute>
                    } />
                    <Route path="assembly/mc-gauging-f1" element={
                        <SecureRoute><ScanTag mode="mc_f1" /></SecureRoute>
                    } />
                    <Route path="assembly/reader-config" element={
                        <SecureRoute adminOnly={true}><ReaderConfig /></SecureRoute>
                    } />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;