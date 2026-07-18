import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { record } from '../lib/feedback/breadcrumbs'
import FeedbackButton from './Feedback/FeedbackButton'
import VehicleSelector from './VehicleSelector'

const NAV_ITEMS = [
  { path: '/',            label: 'Dashboard', short: 'Home',     icon: '◈' },
  { path: '/fleet',       label: 'Fleet',     short: 'Fleet',    icon: '🚗' },
  { path: '/fuel',        label: 'Fuel Log',  short: 'Fuel',     icon: '⛽' },
  { path: '/service',     label: 'Service',   short: 'Service',  icon: '🔧' },
  { path: '/parts',       label: 'Parts',     short: 'Parts',    icon: '📦' },
  { path: '/ipc',         label: 'IPC',       short: 'IPC',      icon: '▦', desktopOnly: true },
  { path: '/maintenance', label: 'Schedule',  short: 'Schedule', icon: '📅' },
  { path: '/templates',   label: 'Templates', short: 'Tpl',      icon: '📋', desktopOnly: true },
  { path: '/work-orders', label: 'Work Orders', short: 'Jobs',   icon: '🛠️', desktopOnly: true },
  { path: '/snags',       label: 'Snags',     short: 'Snags',    icon: '⚠️'  },
  { path: '/dtc',         label: 'DTC Log',   short: 'DTC',      icon: '🩺', desktopOnly: true },
  { path: '/documents',   label: 'Documents', short: 'Docs',     icon: '📄', desktopOnly: true },
  { path: '/analysis',    label: 'Analysis',  short: 'Stats',    icon: '📊' },
  { path: '/backup',      label: 'Backup',    short: 'Backup',   icon: '💾', desktopOnly: true },
  { path: '/feedback',    label: 'Feedback',  short: 'Bugs',     icon: '🐞', desktopOnly: true },
]

const MORE_ITEMS = NAV_ITEMS.filter(i => i.desktopOnly)

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    record({ kind: 'nav', route: location.pathname })
  }, [location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {!collapsed && <span className="logo-text">STALLION <span className="logo-accent">PIT</span></span>}
            {collapsed && <span className="logo-icon">S</span>}
          </div>
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {!collapsed && <VehicleSelector />}

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              title={collapsed ? item.label : ''}>
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && <div className="sidebar-user">{user?.email}</div>}
          <button className="btn-signout" onClick={handleSignOut} title="Sign out">
            {collapsed ? '⏻' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <span className="logo-text">STALLION <span className="logo-accent">PIT</span></span>
        <div className="mobile-topbar-right">
          <VehicleSelector />
          <button className="btn-signout mobile-signout" onClick={handleSignOut} title="Sign out">⏻</button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Mobile "More" sheet — makes the desktop-only pages reachable on phones/tablets */}
      {moreOpen && (
        <>
          <div onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 64, zIndex: 61, background: '#161616', borderTop: '1px solid #2a2a2a', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {MORE_ITEMS.map(item => (
              <NavLink key={item.path} to={item.path} onClick={() => setMoreOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
                style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 6px', gap: 4 }}>
                <span className="nav-icon" style={{ fontSize: 22 }}>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="mobile-bottomnav">
        {NAV_ITEMS.filter(item => !item.desktopOnly).map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => setMoreOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.short}</span>
          </NavLink>
        ))}
        <button type="button" className={`nav-item ${moreOpen ? 'nav-item-active' : ''}`}
          onClick={() => setMoreOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="nav-icon">☰</span>
          <span className="nav-label">More</span>
        </button>
      </nav>

      <FeedbackButton />
    </div>
  )
}
