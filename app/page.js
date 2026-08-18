'use client';
import Link from 'next/link';

const cards = [
  {
    id: 'rpt',
    label: 'RPT ASSIST',
    icon: '/assets/RPT AI ASSIST ICON.png',
    desc: 'Jana Rancangan Pengajaran Tahunan (RPT) secara automatik berdasarkan kurikulum, standard dan data sekolah.',
    className: 'rpt-card',
    href: '/rpt-assist',
  },
  {
    id: 'schedule',
    label: 'SCHEDULE ASSIST',
    icon: '/assets/SCHEDULE AI ASSIST ICON.png',
    desc: 'Muat turun dan automasikan ekstraksi jadual waktu ke dalam sistem CIDS dengan pantas.',
    className: 'schedule-card',
    href: '/schedule-assist',
  },
  {
    id: 'rph',
    label: 'RPH ASSIST',
    icon: '/assets/RPH AI ASSIST ICON.png',
    desc: 'Jana Rancangan Pengajaran Harian (RPH) berkualiti tinggi mengikut objektif pembelajaran dan amalan pedagogi terbaik.',
    className: 'rph-card',
    href: '/rph-assist',
  },
  {
    id: 'deleter',
    label: 'RPH DELETER',
    icon: '/assets/RPH DELETER ICON.png',
    desc: 'Padam RPH yang tidak diperlukan dengan selamat dan kekalkan pengurusan fail yang teratur.',
    className: 'deleter-card',
    href: '/rph-deleter',
  },
  {
    id: 'setting',
    label: 'SETTING',
    icon: '/assets/SETTING ICON.png',
    desc: 'Sesuaikan tetapan sistem, profil pengguna dan pilihan aplikasi mengikut keperluan anda.',
    className: 'setting-card',
    href: '/settings',
  },
];

export default function DashboardPage() {
  return (
    <div className="module-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div style={{ textAlign: 'center' }}>
            <img src="/assets/BRANDING.png" alt="CIDS SUITES PRO" className="dashboard-branding" />
            <div className="subtitle-wrapper">
              <span className="line"></span>
              <p>AI Assists. Less Admin. More Teaching.</p>
              <span className="line"></span>
            </div>
          </div>
        </header>

        {/* Grid Cards */}
        <div className="dashboard-grid">
          {cards.map(card => (
            <Link key={card.id} href={card.href} className={`dash-card ${card.className}`}>
              <div className="dash-card-icon">
                <img src={card.icon} alt={card.label} width={90} style={{ objectFit: 'contain' }} />
              </div>
              <h2>{card.label}</h2>
              <p>{card.desc}</p>
              <div className="arrow-btn">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Admin Portal Quick Link */}
        <div style={{ marginTop: '36px', textAlign: 'center' }}>
          <Link
            href="/admin"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              color: '#94a3b8',
              fontSize: '12px',
              textDecoration: 'none',
              transition: 'all 0.2s',
              backdropFilter: 'blur(8px)'
            }}
          >
            <span>🔐</span>
            <span>Portal Pengurusan Lesen Admin</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
