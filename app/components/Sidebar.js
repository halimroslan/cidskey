'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const menuItems = [
  { id: 'rpt',      label: 'RPT ASSIST',      icon: '/assets/RPT AI ASSIST ICON.png',      href: '/rpt-assist' },
  { id: 'schedule', label: 'SCHEDULE ASSIST',  icon: '/assets/SCHEDULE AI ASSIST ICON.png', href: '/schedule-assist' },
  { id: 'rph',      label: 'RPH ASSIST',       icon: '/assets/RPH AI ASSIST ICON.png',      href: '/rph-assist' },
  { id: 'deleter',  label: 'RPH DELETER',      icon: '/assets/RPH DELETER ICON.png',        href: '/rph-deleter' },
  { id: 'setting',  label: 'SETTING',          icon: '/assets/SETTING ICON.png',             href: '/settings' },
  { id: 'admin',    label: 'PORTAL LESEN',     icon: '/assets/APPLOGO.png',                  href: '/admin' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [asieStatus, setAsieStatus] = useState(false);
  const [apiStatus, setApiStatus] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cids_settings');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.username) setAsieStatus(true);
        if (s.apiKey) setApiStatus(true);
      }
    } catch {}
  }, [pathname]);

  function getActiveId() {
    if (pathname === '/') return '';
    const item = menuItems.find(m => pathname.startsWith(m.href));
    return item ? item.id : '';
  }

  const activeId = getActiveId();

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <img src="/assets/CIDS-NEW-GEN ICON.png" alt="Logo" className="sidebar-logo" />
        <div className="brand">
          <img src="/assets/BRANDING.png" alt="CIDS SUITES PRO" className="sidebar-branding-img" />
          <p className="sidebar-tagline">AI Assists. Less Admin. More Teaching.</p>
        </div>
      </div>

      {/* Active Badge */}
      <div className="active-badge show">
        <span>✨</span>
        <span>Web Edition</span>
      </div>

      {/* Nav Menu */}
      <nav className="sidebar-menu">
        {menuItems.map(item => (
          <Link
            key={item.id}
            href={item.href}
            className={`menu-item ${activeId === item.id ? 'active' : ''}`}
            data-id={item.id}
          >
            <img src={item.icon} alt={item.label} className="menu-icon" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer: System Status */}
      <div className="sidebar-footer">
        <div className="footer-card">
          <div className="shield-icon">⚡</div>
          <div className="footer-features">
            <h4>SYSTEM STATUS</h4>
            <ul className="status-list">
              <li>
                <div className={`led ${asieStatus ? 'led-green' : 'led-red'}`}></div>
                <div className="status-text">
                  <span className="status-label">asiemodel.net</span>
                  <span className={`status-sub ${asieStatus ? 'green' : 'red'}`}>
                    {asieStatus ? 'Kredensial Tersedia' : 'Belum Log Masuk'}
                  </span>
                </div>
              </li>
              <li>
                <div className={`led ${apiStatus ? 'led-green' : 'led-red'}`}></div>
                <div className="status-text">
                  <span className="status-label">API Key (AI)</span>
                  <span className={`status-sub ${apiStatus ? 'green' : 'red'}`}>
                    {apiStatus ? 'Tersedia' : 'Tiada API Key'}
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}
