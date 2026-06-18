import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { VehicleProvider } from './contexts/VehicleContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Fleet from './pages/Fleet'
import FuelLog from './pages/FuelLog'
import ServiceLog from './pages/ServiceLog'
import PartsLog from './pages/PartsLog'
import Maintenance from './pages/Maintenance'
import Templates from './pages/Templates'
import WorkOrders from './pages/WorkOrders'
import Snags from './pages/Snags'
import Dtc from './pages/Dtc'
import Analysis from './pages/Analysis'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading...</div>
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading...</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <VehicleProvider>
              <Layout />
            </VehicleProvider>
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="fuel" element={<FuelLog />} />
        <Route path="service" element={<ServiceLog />} />
        <Route path="parts" element={<PartsLog />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="templates" element={<Templates />} />
        <Route path="work-orders" element={<WorkOrders />} />
        <Route path="snags" element={<Snags />} />
        <Route path="dtc" element={<Dtc />} />
        <Route path="analysis" element={<Analysis />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
