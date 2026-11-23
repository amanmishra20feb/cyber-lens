import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import { RequireAuth } from './auth.jsx';
import { Shell } from './components/Shell.jsx';
import { AuthPage } from './pages/Auth.jsx';
import { ScansPage } from './pages/Scans.jsx';
import { HistoryPage } from './pages/History.jsx';
import { ScanResultPage } from './pages/ScanResult.jsx';
import { SettingsPage } from './pages/Settings.jsx';
import { LandingPage } from './landing/Landing.jsx';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => e.status >= 500 && n < 2 } } });

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/signup', element: <AuthPage mode="signup" /> },
  {
    path: '/app',
    element: <RequireAuth><Shell /></RequireAuth>,
    children: [
      { index: true, element: <ScansPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'scans/:id', element: <ScanResultPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/app" replace /> },
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
