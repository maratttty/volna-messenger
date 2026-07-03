import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';

// Lazy-load all pages so the initial JS bundle is smaller and the app opens faster.
// The main chat page is still eager because it's the first thing users see after login.
const Login         = lazy(() => import('./pages/Login'));
const Register      = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const SetupProfile  = lazy(() => import('./pages/SetupProfile'));
const ChatPage      = lazy(() => import('./pages/ChatPage'));
const InvitePage    = lazy(() => import('./pages/InvitePage'));
const Settings      = lazy(() => import('./pages/Settings'));

// Minimal fallback while a lazy chunk loads (usually < 200ms on first visit)
function PageLoader() {
  return <div className="h-full bg-bg" />;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/setup-profile"   element={<SetupProfile />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/invite/:token"
          element={
            <RequireAuth>
              <InvitePage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
