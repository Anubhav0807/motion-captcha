import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, KeyRound, Code2, BarChart3, Gauge, ScrollText, PieChart, CreditCard, Settings,
  Bell, Search, Moon, Sun, LogOut, Menu as MenuIcon, X, BookOpen, ArrowUpRight, ChevronDown, Waves,
} from 'lucide-react';
import { APP_NAME, DOCS_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { fmtRelative } from '../lib/format';
import { Menu } from './ui';

export const NAV = [
  { group: 'Build', items: [
    { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/keys', label: 'API keys', icon: KeyRound },
    { to: '/integration', label: 'Integration', icon: Code2 },
  ] },
  { group: 'Monitor', items: [
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/logs', label: 'Request logs', icon: ScrollText },
    { to: '/rate-limits', label: 'Rate limits', icon: Gauge },
  ] },
  { group: 'Billing', items: [
    { to: '/quota', label: 'Quota & alerts', icon: PieChart },
    { to: '/billing', label: 'Plans & billing', icon: CreditCard },
  ] },
  { group: 'Account', items: [
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ks_theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ks_theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const load = () => api.notifications.list().then(setItems).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const unread = items.filter((i) => !i.read).length;
  const markAll = async () => {
    await api.notifications.readAll().catch(() => {});
    setItems((x) => x.map((i) => ({ ...i, read: true })));
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-label="Notifications" data-tip="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell size={17} />
        {unread > 0 && <span className="pip">{unread}</span>}
      </button>
      {open && (
        <div className="menu popover notif">
          <div className="popover-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link small" onClick={markAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <p className="muted small" style={{ padding: 16 }}>You’re all caught up.</p>}
          {items.map((n) => (
            <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>
              <i className={`notif-dot tone-${n.tone}`} />
              <div>
                <div className="notif-title">{n.title}</div>
                <div className="muted small">{n.body}</div>
                <div className="faint xsmall">{fmtRelative(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [keys, setKeys] = useState([]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (open) { setQ(''); setIdx(0); api.keys.list().then(setKeys).catch(() => {}); }
  }, [open]);
  const results = useMemo(() => {
    const pages = NAV.flatMap((g) => g.items).map((i) => ({ label: i.label, hint: 'Page', icon: i.icon, go: i.to }));
    const keyItems = keys.map((k) => ({ label: k.name, hint: 'API key', icon: KeyRound, go: `/analytics?keyId=${k.id}` }));
    const all = [...pages, ...keyItems];
    const s = q.trim().toLowerCase();
    return s ? all.filter((r) => r.label.toLowerCase().includes(s)) : pages;
  }, [q, keys]);
  if (!open) return null;
  const pick = (r) => { navigate(r.go); onClose(); };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette">
        <div className="palette-input">
          <Search size={16} />
          <input autoFocus placeholder="Jump to a page or key…" value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && results[idx]) pick(results[idx]);
            }} />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list">
          {results.length === 0 && <p className="muted small" style={{ padding: 16 }}>No matches.</p>}
          {results.map((r, i) => (
            <button key={r.label + r.go} className={i === idx ? 'on' : ''} onMouseEnter={() => setIdx(i)} onClick={() => pick(r)}>
              <r.icon size={15} /><span>{r.label}</span><span className="faint xsmall">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const current = NAV.flatMap((g) => g.items).find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
  const initials = (user?.name || user?.email || '?').split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Waves size={17} strokeWidth={2.5} /></div>
          <div>
            <div className="brand-name">{APP_NAME}</div>
            <div className="brand-sub">{user?.organization?.name}</div>
          </div>
          <button className="icon-btn only-mobile on-dark" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-label">{g.group}</div>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <i.icon size={17} /><span>{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a className="nav-item" href={DOCS_URL} target={DOCS_URL.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            <BookOpen size={17} /><span>Documentation</span>{DOCS_URL.startsWith('http') && <ArrowUpRight size={14} className="ml-auto" />}
          </a>
          <div className="plan-chip">
            <span>{user?.organization?.planName} plan</span>
            <NavLink to="/billing" className="link xsmall">Upgrade</NavLink>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setNavOpen(true)} aria-label="Open menu"><MenuIcon size={18} /></button>
          <div className="crumbs">
            <span className="faint">{APP_NAME}</span><span className="faint">/</span><strong>{current?.label || 'Console'}</strong>
          </div>
          <button className="search-trigger" onClick={() => setPalette(true)}>
            <Search size={15} /><span>Search</span><kbd>⌘K</kbd>
          </button>
          <div className="row gap-4">
            <Notifications />
            <button className="icon-btn" aria-label="Toggle theme" data-tip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Menu
              trigger={({ toggle }) => (
                <button className="user-chip" onClick={toggle}>
                  <span className="avatar">{initials}</span>
                  <span className="user-email">{user?.email}</span>
                  <ChevronDown size={14} />
                </button>
              )}
              items={[
                { label: 'Settings', icon: Settings, onClick: () => navigate('/settings') },
                { label: 'Plans & billing', icon: CreditCard, onClick: () => navigate('/billing') },
                'divider',
                { label: 'Sign out', icon: LogOut, danger: true, onClick: logout },
              ]}
            />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
