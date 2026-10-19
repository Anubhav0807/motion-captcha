import { useEffect, useState } from 'react';
import { UserPlus, Trash2, LogOut, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtDate } from '../lib/format';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, Tabs, Toggle,
} from '../components/ui';

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Everything, including billing' },
  { value: 'developer', label: 'Developer', desc: 'Keys, usage and logs' },
  { value: 'billing', label: 'Billing', desc: 'Spend, budgets and invoices' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only' },
];

function Profile({ settings, onSaved }) {
  const toast = useToast();
  const { setUser, user } = useAuth();
  const [name, setName] = useState(settings.profile.name);
  const [tz, setTz] = useState(settings.timezone);
  const [busy, setBusy] = useState(false);
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [settings.timezone];
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.settings.update({ profile: { name }, timezone: tz });
      setUser({ ...user, name });
      onSaved(s);
      toast.success('Profile saved');
    } catch (err) { toast.error(err); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader title="Profile" />
      <form className="card-pad stack gap-16" onSubmit={save} style={{ maxWidth: 520 }}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" hint="Contact support to change your sign-in email."><Input value={settings.profile.email} disabled /></Field>
        <Field label="Time zone" hint="Used for charts and daily limits display.">
          <Select value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select>
        </Field>
        <div><Button variant="primary" type="submit" loading={busy}>Save</Button></div>
      </form>
    </Card>
  );
}

function Notifications({ settings, onSaved }) {
  const toast = useToast();
  const [n, setN] = useState(settings.notifications);
  useEffect(() => setN(settings.notifications), [settings]);
  const update = async (k, v) => {
    const prev = n;
    setN({ ...n, [k]: v });
    try { onSaved(await api.settings.update({ notifications: { [k]: v } })); } catch (e) { setN(prev); toast.error(e); }
  };
  const rows = [
    ['budgetAlerts', 'Budget alerts', 'When a budget crosses one of its thresholds.'],
    ['keyExpiry', 'Key expiry', '14 days and 1 day before a key expires.'],
    ['rateLimitHits', 'Rate-limit spikes', 'When more than 5% of requests are throttled in an hour.'],
    ['weeklyReport', 'Weekly usage report', 'A Monday summary of requests and spend.'],
    ['productUpdates', 'Product updates', 'New models, features and deprecations.'],
  ];
  return (
    <Card>
      <CardHeader title="Email notifications" />
      <div className="card-pad stack">
        {rows.map(([k, l, d]) => <Toggle key={k} checked={!!n[k]} onChange={(v) => update(k, v)} label={l} description={d} />)}
      </div>
    </Card>
  );
}

function Team() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => api.team.list(), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(null);
  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const m = await api.team.invite(email.trim(), role);
      setData((l) => [...l, m]);
      setEmail('');
      toast.success(`Invite sent to ${m.email}`);
    } catch (err) { toast.error(err); }
    setBusy(false);
  };
  const changeRole = async (m, r) => {
    try { const u = await api.team.updateRole(m.id, r); setData((l) => l.map((x) => (x.id === u.id ? u : x))); toast.success('Role updated'); } catch (e) { toast.error(e); }
  };
  return (
    <Card className="table-card">
      <CardHeader title="Team members" subtitle="Everyone here can access all projects in this account." />
      <form className="card-pad row gap-8 wrap invite" onSubmit={invite}>
        <Input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
        </Select>
        <Button variant="primary" icon={UserPlus} type="submit" loading={busy}>Invite</Button>
      </form>
      {loading ? <LoadingBlock rows={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Added</th><th /></tr></thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td><div className="strong">{m.name || m.email}</div>{m.name && <div className="xsmall faint">{m.email}</div>}</td>
                  <td>{m.role === 'owner' ? <Badge tone="info">Owner</Badge> : (
                    <Select value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label="Role">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  )}</td>
                  <td>{m.status === 'active' ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="warn" dot>Invited</Badge>}</td>
                  <td>{fmtDate(m.joinedAt)}</td>
                  <td className="actions">{m.role !== 'owner' && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemove(m)}>Remove</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title="Remove member?" confirmLabel="Remove"
        body={<><strong>{remove?.email}</strong> loses access immediately. Keys they created keep working.</>}
        onConfirm={async () => { try { await api.team.remove(remove.id); setData((l) => l.filter((x) => x.id !== remove.id)); toast.success('Member removed'); } catch (e) { toast.error(e); throw e; } }} />
    </Card>
  );
}

function Security() {
  const toast = useToast();
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card>
      <CardHeader title="Sessions" />
      <div className="card-pad stack gap-12">
        <p className="muted small">Signs you out on every browser and device, including this one. API keys are not affected.</p>
        <div><Button variant="danger" icon={LogOut} onClick={() => setConfirm(true)}>Sign out everywhere</Button></div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Sign out of all sessions?" confirmLabel="Sign out everywhere"
        body="You’ll need to sign in again."
        onConfirm={async () => { try { await api.auth.logoutAll(); await logout(); } catch (e) { toast.error(e); throw e; } }} />
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');
  const { data, loading, error, reload, setData } = useAsync(() => api.settings.get(), []);
  return (
    <div className="page">
      <PageHeader eyebrow="Account" title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'profile', label: 'Profile' },
        { value: 'team', label: 'Team' },
        { value: 'notifications', label: 'Notifications' },
        { value: 'security', label: 'Security' },
      ]} />
      {tab === 'team' ? <Team /> : tab === 'security' ? <Security />
        : loading ? <Card><LoadingBlock /></Card>
        : error ? <Card><ErrorState error={error} onRetry={reload} /></Card>
        : tab === 'profile' ? <Profile settings={data} onSaved={setData} /> : <Notifications settings={data} onSaved={setData} />}
      {tab === 'team' && <p className="footnote row gap-6"><Users size={14} /> Roles are enforced by the API, not just hidden in the UI.</p>}
    </div>
  );
}
