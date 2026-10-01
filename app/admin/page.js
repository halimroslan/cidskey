'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

export default function AdminLicensesPage() {
    const [adminSecret, setAdminSecret] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginInput, setLoginInput] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Data State
    const [stats, setStats] = useState({
        totalKeys: 0,
        activeKeys: 0,
        unusedKeys: 0,
        disabledKeys: 0,
        totalDevices: 0,
        maxDevicesAllowed: 2
    });
    const [licenses, setLicenses] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');

    // Filter & Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // all, active, unused, full, disabled
    const [sortBy, setSortBy] = useState('recent_active'); // recent_active, key_asc, devices_desc
    const [pageSize, setPageSize] = useState(50);
    const [currentPage, setCurrentPage] = useState(1);

    // Modals & Action States
    const [selectedLicense, setSelectedLicense] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isEditNoteModalOpen, setIsEditNoteModalOpen] = useState(false);
    const [noteInput, setNoteInput] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [copiedKey, setCopiedKey] = useState('');
    const [toastMessage, setToastMessage] = useState('');

    // Semak auth dari sessionStorage pada permulaan
    useEffect(() => {
        const savedSecret = sessionStorage.getItem('cids_admin_secret') || localStorage.getItem('cids_admin_secret');
        if (savedSecret) {
            setAdminSecret(savedSecret);
            fetchLicenses(savedSecret);
        }
    }, []);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3000);
    };

    // Muat turun data dari API
    const fetchLicenses = async (secret) => {
        setIsLoading(true);
        setErrorMsg('');
        try {
            const res = await fetch(`/api/admin/licenses?adminSecret=${encodeURIComponent(secret)}`, {
                headers: { 'x-admin-secret': secret }
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                if (res.status === 401) {
                    setIsAuthenticated(false);
                    sessionStorage.removeItem('cids_admin_secret');
                    setLoginError('Kata laluan admin tidak tepat.');
                } else {
                    setErrorMsg(data.error || 'Gagal memuatkan data lesen.');
                }
                setIsLoading(false);
                return;
            }

            setStats(data.stats);
            setLicenses(data.licenses || []);
            setIsAuthenticated(true);
            sessionStorage.setItem('cids_admin_secret', secret);
        } catch (e) {
            setErrorMsg('Ralat sambungan ke pelayan: ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        if (!loginInput.trim()) {
            setLoginError('Sila masukkan kata laluan admin.');
            return;
        }
        setLoginError('');
        setAdminSecret(loginInput.trim());
        fetchLicenses(loginInput.trim());
    };

    const handleLogout = () => {
        sessionStorage.removeItem('cids_admin_secret');
        localStorage.removeItem('cids_admin_secret');
        setAdminSecret('');
        setIsAuthenticated(false);
        setLicenses([]);
    };

    // Format Tarikh & Masa Malaysia
    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '-';
            return d.toLocaleString('ms-MY', {
                timeZone: 'Asia/Kuala_Lumpur',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        } catch (e) {
            return dateStr;
        }
    };

    // Fungsi Salin Kunci
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(text);
        showToast(`Kunci ${text} disalin!`);
        setTimeout(() => setCopiedKey(''), 2000);
    };

    // Tindakan API (Reset Slot, Buang Device, Toggle Status, Edit Note)
    const executeAction = async (payload) => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/admin/licenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-secret': adminSecret
                },
                body: JSON.stringify({ ...payload, adminSecret })
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                alert('Ralat: ' + (data.error || 'Operasi gagal'));
            } else {
                showToast(data.message || 'Tindakan berjaya!');
                // Muat semula data
                await fetchLicenses(adminSecret);
                if (isDetailModalOpen && selectedLicense) {
                    // Update modal view
                    const updated = licenses.find(l => l.key === selectedLicense.key);
                    if (updated) setSelectedLicense(updated);
                    else setIsDetailModalOpen(false);
                }
            }
        } catch (e) {
            alert('Ralat sambungan: ' + e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleResetDevices = (key) => {
        if (confirm(`Adakah anda pasti ingin MENGOSONGKAN (RESET) semua peranti untuk lesen:\n${key}?\n\nPengguna akan boleh mengaktifkan peranti baru selepas ini.`)) {
            executeAction({ action: 'reset_devices', key });
        }
    };

    const handleRemoveDevice = (deviceId, deviceName) => {
        if (confirm(`Padam peranti "${deviceName}" dari lesen ini?`)) {
            executeAction({ action: 'remove_device', deviceId });
        }
    };

    const handleToggleActive = (key, currentStatus) => {
        const nextStatus = !currentStatus;
        const actionLabel = nextStatus ? 'MENGAKTIFKAN SEMULA' : 'MENYAHAKTIFKAN';
        if (confirm(`Adakah anda pasti ingin ${actionLabel} lesen:\n${key}?`)) {
            executeAction({ action: 'toggle_active', key, isActive: nextStatus });
        }
    };

    const handleSaveNote = () => {
        if (!selectedLicense) return;
        executeAction({ action: 'update_notes', key: selectedLicense.key, notes: noteInput });
        setIsEditNoteModalOpen(false);
    };

    // Eksport CSV
    const exportToCSV = () => {
        if (!licenses.length) return;
        const headers = ['Bil', 'Kunci Lesen', 'Status', 'Bilangan Peranti', 'Maksimum Peranti', 'Masa Mula Diaktifkan', 'Masa Terkini Dilihat', 'Senarai Peranti', 'Catatan / Nota'];
        const rows = filteredLicenses.map((l, idx) => [
            idx + 1,
            l.key,
            !l.isActive ? 'Dinyahaktifkan' : l.deviceCount > 0 ? 'Aktif' : 'Belum Digunakan',
            l.deviceCount,
            l.maxDevices,
            l.firstActivatedAt ? formatDateTime(l.firstActivatedAt) : '-',
            l.lastActivatedAt ? formatDateTime(l.lastActivatedAt) : '-',
            l.devices.map(d => `${d.deviceName} (${formatDateTime(d.activatedAt)})`).join(' | ') || '-',
            `"${(l.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `CIDS_Lesen_Export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filter & Search Logic
    const filteredLicenses = useMemo(() => {
        let list = [...licenses];

        const hasSearch = searchTerm.trim().length > 0;

        // Carian Kata Kunci: Jika pengguna membuat carian, cari merentasi SEMUA lesen secara global
        if (hasSearch) {
            const term = searchTerm.trim().toLowerCase();
            list = list.filter(l => {
                const matchKey = l.key.toLowerCase().includes(term);
                const matchNotes = (l.notes || '').toLowerCase().includes(term);
                const matchDevice = l.devices.some(d => 
                    (d.deviceName || '').toLowerCase().includes(term) ||
                    (d.machineId || '').toLowerCase().includes(term)
                );
                return matchKey || matchNotes || matchDevice;
            });
        } else {
            // Penapis Tab Hanya Apabila Tiada Carian Aktif
            if (activeTab === 'active') {
                list = list.filter(l => l.isActive && l.deviceCount > 0);
            } else if (activeTab === 'unused') {
                list = list.filter(l => l.isActive && l.deviceCount === 0);
            } else if (activeTab === 'full') {
                list = list.filter(l => l.isActive && l.deviceCount >= l.maxDevices);
            } else if (activeTab === 'disabled') {
                list = list.filter(l => !l.isActive);
            }
        }

        // Susunan (Sorting)
        list.sort((a, b) => {
            if (sortBy === 'recent_active') {
                const timeA = a.lastActivatedAt ? new Date(a.lastActivatedAt).getTime() : 0;
                const timeB = b.lastActivatedAt ? new Date(b.lastActivatedAt).getTime() : 0;
                if (timeB !== timeA) return timeB - timeA;
                return b.deviceCount - a.deviceCount;
            }
            if (sortBy === 'key_asc') {
                return a.key.localeCompare(b.key);
            }
            if (sortBy === 'devices_desc') {
                return b.deviceCount - a.deviceCount;
            }
            return 0;
        });

        return list;
    }, [licenses, activeTab, searchTerm, sortBy]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredLicenses.length / pageSize) || 1;
    const paginatedLicenses = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredLicenses.slice(start, start + pageSize);
    }, [filteredLicenses, currentPage, pageSize]);

    // Jika belum login, tunjuk skrin login Admin
    if (!isAuthenticated) {
        return (
            <div style={styles.loginContainer}>
                <div style={styles.loginCard}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
                    <h2 style={styles.loginTitle}>Portal Admin Lesen CIDS</h2>
                    <p style={styles.loginSubtitle}>Sila masukkan kata laluan admin untuk mengakses dashboard pengurusan lesen.</p>

                    <form onSubmit={handleLogin} style={{ width: '100%', marginTop: '20px' }}>
                        <input
                            type="password"
                            placeholder="Kata Laluan Admin..."
                            value={loginInput}
                            onChange={(e) => setLoginInput(e.target.value)}
                            style={styles.loginInput}
                            autoFocus
                        />
                        {loginError && <div style={styles.loginError}>{loginError}</div>}
                        <button type="submit" disabled={isLoading} style={styles.loginBtn}>
                            {isLoading ? 'Mengesahkan...' : 'Buka Dashboard'}
                        </button>
                    </form>
                    <div style={{ marginTop: '24px' }}>
                        <Link href="/" style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}>
                            ← Kembali ke Halaman Utama
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.pageWrapper}>
            {/* Toast Notification */}
            {toastMessage && (
                <div style={styles.toast}>
                    ✅ {toastMessage}
                </div>
            )}

            {/* Top Navigation Bar */}
            <header style={styles.navbar}>
                <div style={styles.navLeft}>
                    <Link href="/" style={styles.backBtn} title="Kembali ke Dashboard Utama">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </Link>
                    <div>
                        <div style={styles.brandTitle}>CIDS SUITES PRO</div>
                        <div style={styles.brandSubtitle}>Pengurusan & Pemantauan Lesen Penuh</div>
                    </div>
                </div>

                <div style={styles.navRight}>
                    <button onClick={() => fetchLicenses(adminSecret)} disabled={isLoading} style={styles.refreshBtn}>
                        <span style={{ display: 'inline-block', animation: isLoading ? 'spin 1s infinite linear' : 'none' }}>🔄</span>
                        <span style={{ marginLeft: '6px' }}>{isLoading ? 'Memuatkan...' : 'Muat Semula'}</span>
                    </button>
                    <button onClick={exportToCSV} style={styles.exportBtn}>
                        📥 Eksport CSV
                    </button>
                    <button onClick={handleLogout} style={styles.logoutBtn}>
                        🚪 Log Keluar
                    </button>
                </div>
            </header>

            <main style={styles.mainContent}>
                {/* Stats Summary Cards */}
                <div style={styles.statsGrid}>
                    <div style={{ ...styles.statCard, borderTop: '4px solid #3b82f6' }}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>JUMLAH LESEN</span>
                            <span style={styles.statIcon}>🔑</span>
                        </div>
                        <div style={styles.statNumber}>{stats.totalKeys}</div>
                        <div style={styles.statDesc}>Maksimum 2 peranti setiap kunci</div>
                    </div>

                    <div style={{ ...styles.statCard, borderTop: '4px solid #10b981' }}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>LESEN DIAKTIFKAN</span>
                            <span style={styles.statIcon}>🟢</span>
                        </div>
                        <div style={{ ...styles.statNumber, color: '#10b981' }}>{stats.activeKeys}</div>
                        <div style={styles.statDesc}>
                            {stats.totalKeys ? `${((stats.activeKeys / stats.totalKeys) * 100).toFixed(1)}% daripada jumlah` : '0%'}
                        </div>
                    </div>

                    <div style={{ ...styles.statCard, borderTop: '4px solid #8b5cf6' }}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>PERANTI BERDAFTAR</span>
                            <span style={styles.statIcon}>💻</span>
                        </div>
                        <div style={{ ...styles.statNumber, color: '#a78bfa' }}>{stats.totalDevices}</div>
                        <div style={styles.statDesc}>Jumlah komputer & telefon aktif</div>
                    </div>

                    <div style={{ ...styles.statCard, borderTop: '4px solid #64748b' }}>
                        <div style={styles.statHeader}>
                            <span style={styles.statLabel}>BAKI BELUM GUNA</span>
                            <span style={styles.statIcon}>⚪</span>
                        </div>
                        <div style={styles.statNumber}>{stats.unusedKeys}</div>
                        <div style={styles.statDesc}>Sedia untuk diagihkan kepada pembeli</div>
                    </div>
                </div>

                {/* Search, Filter & Controls Toolbar */}
                <div style={styles.toolbarCard}>
                    {/* Filter Tabs */}
                    <div style={styles.filterTabs}>
                        <button
                            style={activeTab === 'all' ? styles.activeTabBtn : styles.tabBtn}
                            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
                        >
                            Semua ({stats.totalKeys})
                        </button>
                        <button
                            style={activeTab === 'active' ? styles.activeTabBtn : styles.tabBtn}
                            onClick={() => { setActiveTab('active'); setCurrentPage(1); }}
                        >
                            🟢 Aktif / Digunakan ({stats.activeKeys})
                        </button>
                        <button
                            style={activeTab === 'unused' ? styles.activeTabBtn : styles.tabBtn}
                            onClick={() => { setActiveTab('unused'); setCurrentPage(1); }}
                        >
                            ⚪ Belum Digunakan ({stats.unusedKeys})
                        </button>
                        <button
                            style={activeTab === 'full' ? styles.activeTabBtn : styles.tabBtn}
                            onClick={() => { setActiveTab('full'); setCurrentPage(1); }}
                        >
                            🔒 Slot Penuh 2/2
                        </button>
                        <button
                            style={activeTab === 'disabled' ? styles.activeTabBtn : styles.tabBtn}
                            onClick={() => { setActiveTab('disabled'); setCurrentPage(1); }}
                        >
                            🔴 Dinyahaktifkan ({stats.disabledKeys})
                        </button>
                    </div>

                    {/* Search & Sort Row */}
                    <div style={styles.searchRow}>
                        <div style={styles.searchBox}>
                            <span style={{ fontSize: '16px', color: '#64748b', marginRight: '8px' }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Cari Kunci Lesen (cth: S8TU), Nama Peranti, atau Catatan Pemilik..."
                                value={searchTerm}
                                onChange={(e) => { 
                                    setSearchTerm(e.target.value); 
                                    if (activeTab !== 'all') setActiveTab('all');
                                    setCurrentPage(1); 
                                }}
                                style={styles.searchInput}
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} style={styles.clearBtn}>✕</button>
                            )}
                        </div>

                        <div style={styles.sortBox}>
                            <label style={{ fontSize: '13px', color: '#94a3b8', marginRight: '8px' }}>Susun:</label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                style={styles.selectInput}
                            >
                                <option value="recent_active">Terkini Diaktifkan (Aktif Dulu)</option>
                                <option value="devices_desc">Bilangan Peranti Terbanyak</option>
                                <option value="key_asc">Abjad Kunci Lesen (A-Z)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Main License Table */}
                <div style={styles.tableCard}>
                    <div style={styles.tableHeaderInfo}>
                        <span style={{ fontSize: '14px', color: '#94a3b8' }}>
                            Menunjukkan <strong>{paginatedLicenses.length}</strong> daripada <strong>{filteredLicenses.length}</strong> lesen
                            {searchTerm.trim() && (
                                <span style={{ marginLeft: '10px', color: '#38bdf8', fontWeight: 600 }}>
                                    (Carian Global: "{searchTerm.trim()}")
                                </span>
                            )}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Papar:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                style={styles.selectInputSmall}
                            >
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                                <option value="500">Semua (500)</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={{ ...styles.th, width: '50px' }}>#</th>
                                    <th style={styles.th}>KUNCI LESEN</th>
                                    <th style={styles.th}>STATUS</th>
                                    <th style={styles.th}>PENGGUNAAN SLOT</th>
                                    <th style={styles.th}>MASA DIAKTIFKAN (MALAYSIA)</th>
                                    <th style={styles.th}>PERANTI BERDAFTAR</th>
                                    <th style={styles.th}>PEMILIK / NOTA</th>
                                    <th style={{ ...styles.th, textAlign: 'center' }}>TINDAKAN</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedLicenses.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={styles.emptyTd}>
                                            Tiada rekod lesen dijumpai untuk carian atau penapis ini.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedLicenses.map((item, idx) => {
                                        const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                                        const isCopied = copiedKey === item.key;

                                        return (
                                            <tr key={item.key} style={styles.tr}>
                                                {/* 1. Nombor Baris */}
                                                <td style={{ ...styles.td, color: '#64748b', fontSize: '12px' }}>
                                                    {rowNumber}
                                                </td>

                                                {/* 2. Kunci Lesen */}
                                                <td style={styles.td}>
                                                    <div style={styles.keyCell}>
                                                        <span style={styles.keyText}>{item.key}</span>
                                                        <button
                                                            onClick={() => copyToClipboard(item.key)}
                                                            style={isCopied ? styles.copiedBtn : styles.copyBtn}
                                                            title="Salin Kunci Lesen"
                                                        >
                                                            {isCopied ? '✓ Disalin' : '📋 Salin'}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* 3. Status Lesen */}
                                                <td style={styles.td}>
                                                    {!item.isActive ? (
                                                        <span style={styles.badgeDisabled}>🔴 Dinyahaktifkan</span>
                                                    ) : item.deviceCount > 0 ? (
                                                        <span style={styles.badgeActive}>🟢 Aktif</span>
                                                    ) : (
                                                        <span style={styles.badgeUnused}>⚪ Belum Guna</span>
                                                    )}
                                                </td>

                                                {/* 4. Slot Peranti */}
                                                <td style={styles.td}>
                                                    <div style={styles.slotCell}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                            <span style={{
                                                                fontSize: '13px',
                                                                fontWeight: '700',
                                                                color: item.deviceCount === 2 ? '#10b981' : item.deviceCount === 1 ? '#f59e0b' : '#94a3b8'
                                                            }}>
                                                                {item.deviceCount} / {item.maxDevices} Peranti
                                                            </span>
                                                        </div>
                                                        {/* Progress bar */}
                                                        <div style={styles.progressBarBg}>
                                                            <div style={{
                                                                ...styles.progressBarFill,
                                                                width: `${(item.deviceCount / item.maxDevices) * 100}%`,
                                                                backgroundColor: item.deviceCount === 2 ? '#10b981' : item.deviceCount === 1 ? '#f59e0b' : '#334155'
                                                            }}></div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 5. Masa Diaktifkan */}
                                                <td style={styles.td}>
                                                    {item.firstActivatedAt ? (
                                                        <div>
                                                            <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: '500' }}>
                                                                {formatDateTime(item.firstActivatedAt)}
                                                            </div>
                                                            {item.lastActivatedAt && item.lastActivatedAt !== item.firstActivatedAt && (
                                                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                                                    Terkini: {formatDateTime(item.lastActivatedAt)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#64748b', fontSize: '13px' }}>- Belum diaktifkan -</span>
                                                    )}
                                                </td>

                                                {/* 6. Peranti Berdaftar */}
                                                <td style={styles.td}>
                                                    {item.devices.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {item.devices.map((d, dIdx) => (
                                                                <div key={d.id || dIdx} style={styles.devicePill}>
                                                                    <span style={{ color: '#38bdf8' }}>💻</span>
                                                                    <span style={{ fontWeight: '500' }}>{d.deviceName}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#64748b', fontSize: '13px' }}>Tiada peranti</span>
                                                    )}
                                                </td>

                                                {/* 7. Catatan / Pemilik */}
                                                <td style={styles.td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '13px', color: item.notes ? '#e2e8f0' : '#64748b' }}>
                                                            {item.notes || 'Tiada catatan'}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedLicense(item);
                                                                setNoteInput(item.notes || '');
                                                                setIsEditNoteModalOpen(true);
                                                            }}
                                                            style={styles.editNoteBtn}
                                                            title="Edit Catatan Guru/Sekolah"
                                                        >
                                                            ✏️
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* 8. Tindakan */}
                                                <td style={{ ...styles.td, textAlign: 'center' }}>
                                                    <div style={styles.actionGroup}>
                                                        {/* Butang Butiran */}
                                                        <button
                                                            onClick={() => {
                                                                setSelectedLicense(item);
                                                                setIsDetailModalOpen(true);
                                                            }}
                                                            style={styles.actionBtnDetail}
                                                            title="Lihat Butiran Penuh Peranti"
                                                        >
                                                            🔍 Butiran
                                                        </button>

                                                        {/* Butang Reset Slot (jika ada peranti) */}
                                                        {item.deviceCount > 0 && (
                                                            <button
                                                                onClick={() => handleResetDevices(item.key)}
                                                                disabled={actionLoading}
                                                                style={styles.actionBtnReset}
                                                                title="Kosongkan slot peranti untuk lesen ini"
                                                            >
                                                                🔄 Reset Slot
                                                            </button>
                                                        )}

                                                        {/* Butang Toggle Aktif */}
                                                        <button
                                                            onClick={() => handleToggleActive(item.key, item.isActive)}
                                                            disabled={actionLoading}
                                                            style={item.isActive ? styles.actionBtnDisable : styles.actionBtnEnable}
                                                            title={item.isActive ? 'Nyahaktifkan Lesen' : 'Aktifkan Semula Lesen'}
                                                        >
                                                            {item.isActive ? '🚫' : '🟢'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div style={styles.paginationRow}>
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                style={currentPage === 1 ? styles.pageBtnDisabled : styles.pageBtn}
                            >
                                ← Sebelumnya
                            </button>

                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                                Halaman <strong>{currentPage}</strong> daripada <strong>{totalPages}</strong>
                            </span>

                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                style={currentPage === totalPages ? styles.pageBtnDisabled : styles.pageBtn}
                            >
                                Seterusnya →
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {/* Modal Butiran Peranti Terperinci */}
            {isDetailModalOpen && selectedLicense && (
                <div style={styles.modalOverlay} onClick={() => setIsDetailModalOpen(false)}>
                    <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>🔑</span>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', color: '#ffffff' }}>Maklumat Lesen: {selectedLicense.key}</h3>
                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                        {selectedLicense.deviceCount} / {selectedLicense.maxDevices} Peranti Berdaftar
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setIsDetailModalOpen(false)} style={styles.modalCloseBtn}>✕</button>
                        </div>

                        <div style={styles.modalBody}>
                            {/* Summary Box */}
                            <div style={styles.modalSummaryBox}>
                                <div style={styles.modalSummaryItem}>
                                    <span style={styles.modalSummaryLabel}>Status:</span>
                                    <span style={{ fontWeight: '600', color: selectedLicense.isActive ? '#10b981' : '#ef4444' }}>
                                        {selectedLicense.isActive ? 'Aktif' : 'Dinyahaktifkan'}
                                    </span>
                                </div>
                                <div style={styles.modalSummaryItem}>
                                    <span style={styles.modalSummaryLabel}>Catatan:</span>
                                    <span style={{ color: '#e2e8f0' }}>{selectedLicense.notes || 'Tiada'}</span>
                                </div>
                                <div style={styles.modalSummaryItem}>
                                    <span style={styles.modalSummaryLabel}>Tarikh Dicipta:</span>
                                    <span style={{ color: '#94a3b8' }}>{formatDateTime(selectedLicense.createdAt)}</span>
                                </div>
                            </div>

                            {/* Connected Devices List */}
                            <h4 style={{ margin: '16px 0 10px 0', fontSize: '15px', color: '#cbd5e1' }}>Peranti Yang Didaftarkan:</h4>

                            {selectedLicense.devices.length === 0 ? (
                                <div style={styles.noDevicesBox}>
                                    Belum ada peranti yang diaktifkan dengan kunci ini. Kedua-dua slot masih kosong.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {selectedLicense.devices.map((dev, idx) => (
                                        <div key={dev.id || idx} style={styles.deviceCard}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '20px' }}>💻</span>
                                                    <div>
                                                        <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '14px' }}>
                                                            Peranti {idx + 1}: {dev.deviceName}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                                                            ID: {dev.machineId ? dev.machineId.slice(0, 24) + '...' : '-'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleRemoveDevice(dev.id, dev.deviceName)}
                                                    disabled={actionLoading}
                                                    style={styles.removeDeviceBtn}
                                                    title="Padam peranti ini sahaja"
                                                >
                                                    🗑️ Buang Peranti
                                                </button>
                                            </div>

                                            <div style={styles.deviceTimestamps}>
                                                <div>
                                                    <span style={{ color: '#94a3b8' }}>Diaktifkan: </span>
                                                    <span style={{ color: '#38bdf8' }}>{formatDateTime(dev.activatedAt)}</span>
                                                </div>
                                                {dev.lastSeen && (
                                                    <div>
                                                        <span style={{ color: '#94a3b8' }}>Terakhir Dilihat: </span>
                                                        <span style={{ color: '#a78bfa' }}>{formatDateTime(dev.lastSeen)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={styles.modalFooter}>
                            {selectedLicense.deviceCount > 0 && (
                                <button
                                    onClick={() => handleResetDevices(selectedLicense.key)}
                                    disabled={actionLoading}
                                    style={styles.actionBtnResetModal}
                                >
                                    🔄 Kosongkan Semua Slot Peranti ({selectedLicense.deviceCount})
                                </button>
                            )}
                            <button onClick={() => setIsDetailModalOpen(false)} style={styles.modalDoneBtn}>
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Edit Nota / Pemilik */}
            {isEditNoteModalOpen && selectedLicense && (
                <div style={styles.modalOverlay} onClick={() => setIsEditNoteModalOpen(false)}>
                    <div style={{ ...styles.modalContent, maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={{ margin: 0, fontSize: '17px', color: '#ffffff' }}>Edit Catatan Pemilik Lesen</h3>
                            <button onClick={() => setIsEditNoteModalOpen(false)} style={styles.modalCloseBtn}>✕</button>
                        </div>

                        <div style={styles.modalBody}>
                            <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: 0 }}>
                                Kunci: <strong style={{ color: '#ffffff' }}>{selectedLicense.key}</strong>
                            </p>
                            <label style={{ fontSize: '12px', color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                                Catatan / Nama Guru / Sekolah:
                            </label>
                            <textarea
                                rows="3"
                                placeholder="Cth: Cikgu Roslan - SK Taman Melati (Resit #1042)"
                                value={noteInput}
                                onChange={(e) => setNoteInput(e.target.value)}
                                style={styles.textarea}
                            />
                        </div>

                        <div style={styles.modalFooter}>
                            <button onClick={() => setIsEditNoteModalOpen(false)} style={styles.cancelBtn}>
                                Batal
                            </button>
                            <button onClick={handleSaveNote} disabled={actionLoading} style={styles.saveBtn}>
                                {actionLoading ? 'Menyimpan...' : 'Simpan Catatan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Inline Styles for Dashboard
const styles = {
    pageWrapper: {
        minHeight: '100vh',
        backgroundColor: '#0b0f19',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        paddingBottom: '40px'
    },
    toast: {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: '#10b981',
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: '10px',
        fontWeight: '600',
        fontSize: '14px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        zIndex: 9999,
        animation: 'slideUp 0.3s ease'
    },
    loginContainer: {
        minHeight: '100vh',
        backgroundColor: '#0b0f19',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
    },
    loginCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '36px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(10px)'
    },
    loginTitle: {
        color: '#ffffff',
        margin: '0 0 8px 0',
        fontSize: '22px',
        fontWeight: '700'
    },
    loginSubtitle: {
        color: '#94a3b8',
        fontSize: '13px',
        margin: 0,
        lineHeight: 1.5
    },
    loginInput: {
        width: '100%',
        padding: '14px 16px',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '10px',
        color: '#ffffff',
        fontSize: '15px',
        boxSizing: 'border-box',
        outline: 'none',
        marginBottom: '14px',
        textAlign: 'center'
    },
    loginError: {
        color: '#ef4444',
        fontSize: '13px',
        marginBottom: '14px'
    },
    loginBtn: {
        width: '100%',
        padding: '14px',
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '15px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background 0.2s'
    },
    navbar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
    },
    navLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
    },
    backBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '38px',
        height: '38px',
        borderRadius: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        color: '#cbd5e1',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
        textDecoration: 'none'
    },
    brandTitle: {
        fontSize: '17px',
        fontWeight: '800',
        letterSpacing: '0.5px',
        background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    brandSubtitle: {
        fontSize: '12px',
        color: '#94a3b8'
    },
    navRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    },
    refreshBtn: {
        padding: '8px 14px',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        color: '#e2e8f0',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center'
    },
    exportBtn: {
        padding: '8px 14px',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    logoutBtn: {
        padding: '8px 14px',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    mainContent: {
        maxWidth: '1380px',
        margin: '0 auto',
        padding: '24px 20px'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
    },
    statCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        backdropFilter: 'blur(8px)'
    },
    statHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    },
    statLabel: {
        fontSize: '11px',
        fontWeight: '700',
        color: '#94a3b8',
        letterSpacing: '1px'
    },
    statIcon: {
        fontSize: '20px'
    },
    statNumber: {
        fontSize: '32px',
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: '4px'
    },
    statDesc: {
        fontSize: '12px',
        color: '#64748b'
    },
    toolbarCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        marginBottom: '20px'
    },
    filterTabs: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '12px'
    },
    tabBtn: {
        padding: '7px 14px',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        color: '#94a3b8',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer'
    },
    activeTabBtn: {
        padding: '7px 14px',
        backgroundColor: '#3b82f6',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    searchRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        padding: '8px 14px',
        flex: '1',
        minWidth: '280px'
    },
    searchInput: {
        backgroundColor: 'transparent',
        border: 'none',
        color: '#ffffff',
        fontSize: '14px',
        width: '100%',
        outline: 'none'
    },
    clearBtn: {
        background: 'none',
        border: 'none',
        color: '#94a3b8',
        cursor: 'pointer',
        fontSize: '14px',
        padding: '0 4px'
    },
    sortBox: {
        display: 'flex',
        alignItems: 'center'
    },
    selectInput: {
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: '#ffffff',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '13px',
        outline: 'none'
    },
    selectInputSmall: {
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: '#ffffff',
        borderRadius: '6px',
        padding: '4px 8px',
        fontSize: '12px',
        outline: 'none'
    },
    tableCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        overflow: 'hidden'
    },
    tableHeaderInfo: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        textAlign: 'left',
        fontSize: '13px'
    },
    th: {
        padding: '12px 16px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        color: '#94a3b8',
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.6px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        whiteSpace: 'nowrap'
    },
    tr: {
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        transition: 'background 0.15s'
    },
    td: {
        padding: '14px 16px',
        verticalAlign: 'middle'
    },
    emptyTd: {
        padding: '40px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '14px'
    },
    keyCell: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    keyText: {
        fontFamily: 'monospace',
        fontWeight: '700',
        color: '#38bdf8',
        fontSize: '13px',
        letterSpacing: '0.5px'
    },
    copyBtn: {
        padding: '3px 8px',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: '#cbd5e1',
        fontSize: '11px',
        cursor: 'pointer'
    },
    copiedBtn: {
        padding: '3px 8px',
        backgroundColor: '#10b981',
        border: 'none',
        borderRadius: '6px',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: '600'
    },
    badgeActive: {
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '20px',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        color: '#34d399',
        fontSize: '12px',
        fontWeight: '600',
        border: '1px solid rgba(16, 185, 129, 0.3)'
    },
    badgeUnused: {
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '20px',
        backgroundColor: 'rgba(100, 116, 139, 0.15)',
        color: '#94a3b8',
        fontSize: '12px',
        fontWeight: '500',
        border: '1px solid rgba(100, 116, 139, 0.3)'
    },
    badgeDisabled: {
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '20px',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        fontSize: '12px',
        fontWeight: '600',
        border: '1px solid rgba(239, 68, 68, 0.3)'
    },
    slotCell: {
        minWidth: '110px'
    },
    progressBarBg: {
        width: '100%',
        height: '6px',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: '3px',
        overflow: 'hidden'
    },
    progressBarFill: {
        height: '100%',
        borderRadius: '3px',
        transition: 'width 0.3s'
    },
    devicePill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#cbd5e1'
    },
    editNoteBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '12px',
        opacity: 0.6,
        padding: '2px'
    },
    actionGroup: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
    },
    actionBtnDetail: {
        padding: '5px 10px',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '6px',
        color: '#60a5fa',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    actionBtnReset: {
        padding: '5px 10px',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: '6px',
        color: '#fbbf24',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    actionBtnDisable: {
        padding: '5px 8px',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '6px',
        fontSize: '12px',
        cursor: 'pointer'
    },
    actionBtnEnable: {
        padding: '5px 8px',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '6px',
        fontSize: '12px',
        cursor: 'pointer'
    },
    paginationRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
    },
    pageBtn: {
        padding: '6px 14px',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '6px',
        color: '#ffffff',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer'
    },
    pageBtnDisabled: {
        padding: '6px 14px',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '6px',
        color: '#475569',
        fontSize: '12px',
        cursor: 'not-allowed'
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(6px)',
        padding: '20px'
    },
    modalContent: {
        backgroundColor: '#1e293b',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        maxWidth: '560px',
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px 22px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
    },
    modalCloseBtn: {
        background: 'none',
        border: 'none',
        color: '#94a3b8',
        fontSize: '18px',
        cursor: 'pointer'
    },
    modalBody: {
        padding: '20px 22px',
        maxHeight: '70vh',
        overflowY: 'auto'
    },
    modalSummaryBox: {
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderRadius: '10px',
        padding: '14px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
        border: '1px solid rgba(255, 255, 255, 0.05)'
    },
    modalSummaryItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontSize: '12px'
    },
    modalSummaryLabel: {
        color: '#64748b',
        fontSize: '11px',
        fontWeight: '600'
    },
    noDevicesBox: {
        padding: '20px',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        borderRadius: '10px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '13px',
        border: '1px dashed rgba(255, 255, 255, 0.1)'
    },
    deviceCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '10px',
        padding: '14px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
    },
    removeDeviceBtn: {
        padding: '4px 10px',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '6px',
        color: '#f87171',
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    deviceTimestamps: {
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px'
    },
    modalFooter: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        padding: '14px 22px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(15, 23, 42, 0.4)'
    },
    actionBtnResetModal: {
        padding: '8px 16px',
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        borderRadius: '8px',
        color: '#fbbf24',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    modalDoneBtn: {
        padding: '8px 18px',
        backgroundColor: '#3b82f6',
        border: 'none',
        borderRadius: '8px',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    textarea: {
        width: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        padding: '10px',
        color: '#ffffff',
        fontSize: '13px',
        boxSizing: 'border-box',
        outline: 'none'
    },
    cancelBtn: {
        padding: '8px 14px',
        backgroundColor: 'transparent',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: '#94a3b8',
        fontSize: '13px',
        cursor: 'pointer'
    },
    saveBtn: {
        padding: '8px 16px',
        backgroundColor: '#10b981',
        border: 'none',
        borderRadius: '8px',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer'
    }
};
