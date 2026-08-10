import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { IncidentDetailsPage } from './pages/IncidentDetailsPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/incidents" replace />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route
          path="/incidents/:incidentId"
          element={<IncidentDetailsPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
