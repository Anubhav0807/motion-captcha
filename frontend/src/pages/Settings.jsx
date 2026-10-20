import { useEffect, useState } from 'react';
import { UserPlus, Trash2, LogOut, Users, Copy } from 'lucide-react';
import { api } from '../api';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { copyText, fmtDate } from '../lib/format';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, CopyButton, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, Tabs, Toggle,
} from '../components/ui';

const ASSIGNABLE = ['admin', 'developer', 'billing', 'viewer'];

function Profile({ settings, onSaved }) {
  const toast = useToast();
  const { setUser, user } = useAuth();
  const [name, setName] = useState(settings.profile.name);
  const [tz, setTz] = useState(settings.profile.timezone);
  const [busy, setBusy] = useState(false);
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [tz];
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.settings.update({ name, timezone: tz });
      setUser({ ...user, name: s.profile.name, timezone: s.profile.timezone });
      onSaved(s);
      toast.success('Profile saved');
    } catch (err) { toast.error(err); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader title="Profile" />
      <form className="card-pad stack gap-16 narrow-form" onSubmit={save}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Email" hint="Your sign-in email can’t be changed here."><Input value={settings.profile.email} disabled /></Field>
        <Field label="Time zone">
          <Select value={zones.includes(tz) ? tz : 'UTC'} onChange={(e) => setTz(e.target.value)}>
            {!zones.includes('UTC') && <option value="UTC">UTC</option>}
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
        <div><Button variant="primary" type="submit" loading={busy}>Save</Button></div>
      </form>
    </Card>
  );
}

function Organization({ settings, onSaved }) {
  const toast = useToast();
  const { can, refresh } = useAuth();
  const [name, setName] = useState(settings.organization.name);
  const [email, setEmail] = useState(settings.organization.billingEmail || '');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {};
      if (can('org:write')) body.organizationName = name;
      if (can('billing:write') && email) body.billingEmail = email;
      onSaved(await api.settings.update(body));
      refresh();
      toast.success('Organization saved');
    } catch (err) { toast.error(err); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader title="Organization" />
      <form className="card-pad stack gap-16 narrow-form" onSubmit={save}>
        <Field label="Organization name"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!can('org:write')} required /></Field>
        <Field label="Billing email" hint="Receives invoices and payment notices.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!can('billing:write')} />
        </Field>
        <Field label="Organization ID">
          <div className="row gap-4"><code className="mono small">{settings.organization.id}</code><CopyButton value={settings.organization.id} label="Copy ID" /></div>
        </Field>
        {(can('org:write') || can('billing:write')) && <div><Button variant="primary" type="submit" loading={busy}>Save</Button></div>}
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
    ['usageAlerts', 'Usage alerts', 'When this month’s verifications cross a threshold set on the Quota page.'],
    ['keyEvents', 'API key changes', 'When someone creates, rolls or revokes a key.'],
    ['billing', 'Billing', 'Plan changes and failed payments.'],
    ['productUpdates', 'Product updates', 'New features, model updates and deprecations.'],
  ];
  return (
    <Card>
      <CardHeader title="Email notifications" subtitle="In-app notifications are always on." />
      <div className="card-pad stack">
        {rows.map(([k, l, d]) => <Toggle key={k} checked={!!n[k]} onChange={(v) => update(k, v)} label={l} description={d} />)}
      </div>
    </Card>
  );
}

function Team() {
  const toast = useToast();
  const { can } = useAuth();
  const manage = can('team:write');
  const { data, loading, error, reload, setData } = useAsync(() => api.team.list(), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.team.invite(email.trim(), role);
      setData((d) => ({ ...d, invites: [...d.invites, res.invite] }));
      setLastLink({ email: res.invite.email, url: res.inviteUrl });
      setEmail('');
      toast.success(`Invitation sent to ${res.invite.email}`);
    } catch (err) { toast.error(err); }
    setBusy(false);
  };
  const changeRole = async (m, r) => {
    try {
      await api.team.updateRole(m.id, r);
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === m.id ? { ...x, role: r } : x)) }));
      toast.success('Role updated');
    } catch (e) { toast.error(e); }
  };

  return (
    <Card className="table-card">
      <CardHeader title="Team" subtitle="Everyone here can see all keys and analytics. Roles decide what they can change." />
      {manage && (
        <form className="card-pad row gap-8 wrap invite" onSubmit={invite}>
          <Input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}</option>)}
          </Select>
          <Button variant="primary" icon={UserPlus} type="submit" loading={busy}>Invite</Button>
        </form>
      )}
      {lastLink && (
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="alert alert-info">
            <div style={{ flex: 1 }}>Invitation link for <strong>{lastLink.email}</strong> (valid 7 days) — share it if the email doesn’t arrive.</div>
            <Button size="sm" icon={Copy} onClick={async () => { await copyText(lastLink.url); toast.success('Link copied'); }}>Copy link</Button>
          </div>
        </div>
      )}
      {loading ? <LoadingBlock rows={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Since</th><th /></tr></thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td><div className="strong">{m.name || m.email}{m.isYou && <span className="faint"> (you)</span>}</div>{m.name && <div className="xsmall faint">{m.email}</div>}</td>
                  <td>
                    {m.role === 'owner' || m.isYou || !manage ? <Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>{ROLE_LABELS[m.role]}</Badge> : (
                      <Select value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label="Role">
                        {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </Select>
                    )}
                  </td>
                  <td><Badge tone="ok" dot>Active</Badge></td>
                  <td>{fmtDate(m.joinedAt)}</td>
                  <td className="actions">
                    {manage && m.role !== 'owner' && !m.isYou && (
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm({ kind: 'member', item: m })}>Remove</Button>
                    )}
                  </td>
                </tr>
              ))}
              {data.invites.map((i) => (
                <tr key={i.id}>
                  <td><div className="strong">{i.email}</div></td>
                  <td><Badge tone="neutral">{ROLE_LABELS[i.role]}</Badge></td>
                  <td><Badge tone="warn" dot>Invited</Badge></td>
                  <td><span className="xsmall faint">Expires {fmtDate(i.expiresAt)}</span></td>
                  <td className="actions">{manage && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'invite', item: i })}>Revoke</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.kind === 'invite' ? 'Revoke invitation?' : 'Remove member?'}
        confirmLabel={confirm?.kind === 'invite' ? 'Revoke' : 'Remove'}
        body={confirm?.kind === 'invite'
          ? <>The link sent to <strong>{confirm?.item.email}</strong> will stop working.</>
          : <><strong>{confirm?.item.email}</strong> loses access immediately. Keys they created keep working.</>}
        onConfirm={async () => {
          try {
            if (confirm.kind === 'invite') {
              await api.team.revokeInvite(confirm.item.id);
              setData((d) => ({ ...d, invites: d.invites.filter((x) => x.id !== confirm.item.id) }));
            } else {
              await api.team.remove(confirm.item.id);
              setData((d) => ({ ...d, members: d.members.filter((x) => x.id !== confirm.item.id) }));
            }
            toast.success('Done');
          } catch (e) { toast.error(e); throw e; }
        }} />
    </Card>
  );
}

function Security() {
  const toast = useToast();
  const { logout } = useAuth();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const change = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast.error('New passwords don’t match'); return; }
    setBusy(true);
    try {
      await api.auth.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Other sessions were signed out.');
    } catch (err) { toast.error(err); }
    setBusy(false);
  };
  return (
    <div className="stack gap-16">
      <Card>
        <CardHeader title="Change password" />
        <form className="card-pad stack gap-16 narrow-form" onSubmit={change}>
          <Field label="Current password"><Input type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters."><Input type="password" required minLength={8} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password"><Input type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <div><Button variant="primary" type="submit" loading={busy}>Change password</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Sessions" />
        <div className="card-pad stack gap-12">
          <p className="muted small">Sign out of every browser and device, including this one. API keys keep working.</p>
          <div><Button variant="danger" icon={LogOut} onClick={() => setConfirm(true)}>Sign out everywhere</Button></div>
        </div>
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Sign out of all sessions?" confirmLabel="Sign out everywhere"
        body="You’ll need to sign in again."
        onConfirm={async () => { try { await api.auth.logoutAll(); await logout(); } catch (e) { toast.error(e); throw e; } }} />
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');
  const { data, loading, error, reload, setData } = useAsync(() => api.settings.get(), []);
  const body = () => {
    if (tab === 'team') return <Team />;
    if (tab === 'security') return <Security />;
    if (loading) return <Card><LoadingBlock /></Card>;
    if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
    if (tab === 'organization') return <Organization settings={data} onSaved={setData} />;
    if (tab === 'notifications') return <Notifications settings={data} onSaved={setData} />;
    return <Profile settings={data} onSaved={setData} />;
  };
  return (
    <div className="page">
      <PageHeader eyebrow="Account" title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'profile', label: 'Profile' },
        { value: 'organization', label: 'Organization' },
        { value: 'team', label: 'Team' },
        { value: 'notifications', label: 'Notifications' },
        { value: 'security', label: 'Security' },
      ]} />
      {body()}
      {tab === 'team' && <p className="footnote row gap-6"><Users size={14} /> Roles are enforced by the API, not just hidden in the dashboard.</p>}
    </div>
  );
}
