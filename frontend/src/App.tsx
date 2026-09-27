import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import LpRegisterPage from './pages/oil-analysis/LpRegisterPage';
import NewRoutinePage from './pages/oil-analysis/NewRoutinePage';
import OilAnalysisLayout from './pages/oil-analysis/OilAnalysisLayout';
import RoutineDetailPage from './pages/oil-analysis/RoutineDetailPage';
import RoutinesListPage from './pages/oil-analysis/RoutinesListPage';
import './App.css';

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/oil-analysis" element={<OilAnalysisLayout />}>
            <Route index element={<Navigate to="routines" replace />} />
            <Route path="lp-register" element={<LpRegisterPage />} />
            <Route path="routines" element={<RoutinesListPage />} />
            <Route path="routines/new" element={<NewRoutinePage />} />
            <Route path="routines/:routineId" element={<RoutineDetailPage />} />
          </Route>
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/*" element={<AppShell />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
