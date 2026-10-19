import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  KeyRound, Search, BarChart3, Pencil, RefreshCw, Ban, Trash2, ShieldCheck, Globe, Cpu, FolderKanban, List, Copy, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { TIERS, modelLabel } from '../config';
import { useAsync } from '../hooks/useAsync';
import { useProjects } from '../context/ProjectsContext';
import { useToast } from '../context/ToastContext';
import { fmtDate, fmtRelative, maskKey, copyText } from '../lib/format';
import {
  Badge, Card, ConfirmDialog, EmptyState, ErrorState, Input, LoadingBlock, Menu, PageHeader, Segmented, Select, IconButton,
} from '../components/ui';
import { KeyFormModal, NewKeyButton, SecretModal } from '../components/KeyModals';

function RestrictionChips({ r }) {
  const chips = [];
  if (r?.models?.length) chips.push({ icon: Cpu, text: r.models.map(modelLabel).join(', ') });
  if (r?.ips?.length) chips.push({ icon: ShieldCheck, text: `${r.ips.length} IP rule${r.ips.length > 1 ? 's' : ''}` });
  if (r?.referrers?.length) chips.push({ icon: Globe, text: `${r.referrers.length} referrer${r.referrers.length > 1 ? 's' : ''}` });
  if (!chips.length) return <span className="faint xsmall">Unrestricted</span>;
  return (
    <div className="row gap-4 wrap">
      {chips.map((c) => <span key={c.text} className="chip"><c.icon size={12} />{c.text}</span>)}
    </div>
  );
}

function statusOf(k) {
  if (k.status === 'revoked') return { tone: 'neutral', label: 'Revoked' };
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return { tone: 'danger', label: 'Expired' };
  if (k.expiresAt && new Date(k.expiresAt) - Date.now() < 14 * 86400000) return { tone: 'warn', label: 'Expiring' };
  return { tone: 'ok', label: 'Active' };
}

export default function ApiKeys() {
  const navigate = useNavigate();
  const toast = useToast();
  const { projects, byId, reload: reloadProjects } = useProjects();
  const [group, setGroup] = useState('key');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.keys.list({ projectId: projectFilter || undefined, status: statusFilter || undefined }),
    [projectFilter, statusFilter],
  );

  const keys = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter((k) => !s || k.name.toLowerCase().includes(s) || k.last4.toLowerCase().includes(s) || k.id.includes(s));
  }, [data, q]);

  const grouped = useMemo(() => {
    const m = new Map();
    keys.forEach((k) => { if (!m.has(k.projectId)) m.set(k.projectId, []); m.get(k.projectId).push(k); });
    return [...m.entries()];
  }, [keys]);

  const replaceKey = (k) => setData((list) => (list || []).map((x) => (x.id === k.id ? k : x)));

  const guarded = (fn) => async () => {
    try { await fn(); } catch (e) { toast.error(e); throw e; }
  };

  const actions = (k) => [
    { label: 'View usage', icon: BarChart3, onClick: () => navigate(`/usage?keyId=${k.id}`) },
    { label: 'Copy key ID', icon: Copy, onClick: async () => { await copyText(k.id); toast.success('Key ID copied'); } },
    k.status === 'active' && { label: 'Edit name & restrictions', icon: Pencil, onClick: () => { setEditing(k); setFormOpen(true); } },
    k.status === 'active' && { label: 'Regenerate secret', icon: RefreshCw, onClick: () => setConfirm({
      title: 'Regenerate this key?', confirmLabel: 'Regenerate', tone: 'primary',
      body: <>The current secret for <strong>{k.name}</strong> stops working immediately. Anything using it will start getting 401 errors until you deploy the new secret.</>,
      run: guarded(async () => {
        const res = await api.keys.regenerate(k.id);
        replaceKey(res.key);
        setSecret({ value: res.secret, name: res.key.name });
      }),
    }) },
    'divider',
    k.status === 'active' && { label: 'Revoke', icon: Ban, danger: true, onClick: () => setConfirm({
      title: 'Revoke API key?', confirmLabel: 'Revoke key',
      body: <>Requests using <strong>{k.name}</strong> ({maskKey(k)}) will be rejected right away. Usage history is kept. This can’t be undone.</>,
      run: guarded(async () => {
        const updated = await api.keys.revoke(k.id);
        if (statusFilter === 'active') setData((l) => l.filter((x) => x.id !== k.id));
        else replaceKey(updated);
        reloadProjects();
        toast.success('Key revoked');
      }),
    }) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({
      title: 'Delete API key?', confirmLabel: 'Delete permanently', requireText: k.name,
      body: <>This revokes the key and removes it from this list. Historical usage will show as “deleted key”.</>,
      run: guarded(async () => {
        await api.keys.remove(k.id);
        setData((l) => l.filter((x) => x.id !== k.id));
        reloadProjects();
        toast.success('Key deleted');
      }),
    }) },
  ];

  const row = (k, showProject = true) => {
    const st = statusOf(k);
    const p = byId[k.projectId];
    return (
      <tr key={k.id} className={k.status === 'revoked' ? 'dim' : ''}>
        <td>
          <div className="key-cell">
            <span className="key-icon"><KeyRound size={15} /></span>
            <div>
              <div className="strong">{k.name}</div>
              <div className="mono small muted">{maskKey(k)}</div>
            </div>
          </div>
        </td>
        {showProject && (
          <td>
            {p ? <Link to="/projects" className="link">{p.name}</Link> : <span className="faint">—</span>}
            <div className="mono xsmall faint">{p?.ref}</div>
          </td>
        )}
        <td><RestrictionChips r={k.restrictions} /></td>
        <td>
          <div>{fmtDate(k.createdAt)}</div>
          <div className="xsmall faint">{k.expiresAt ? `Expires ${fmtDate(k.expiresAt)}` : 'No expiry'}</div>
        </td>
        <td className="nowrap">{fmtRelative(k.lastUsedAt)}</td>
        <td>
          {p && (p.billingEnabled
            ? <Badge tone="info">{TIERS[p.tier]?.label}</Badge>
            : <Link to="/billing" className="link small">Set up billing</Link>)}
          {p && !p.billingEnabled && <div className="xsmall faint">Free tier</div>}
        </td>
        <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
        <td className="actions">
          <div className="row gap-2 end">
            <IconButton icon={BarChart3} label="Usage" onClick={() => navigate(`/usage?keyId=${k.id}`)} />
            <IconButton icon={Wallet} label="Spend" onClick={() => navigate(`/spend?projectId=${k.projectId}`)} />
            <Menu items={actions(k)} />
          </div>
        </td>
      </tr>
    );
  };

  const head = (showProject = true) => (
    <thead>
      <tr>
        <th>Key</th>{showProject && <th>Project</th>}<th>Restrictions</th><th>Created</th><th>Last used</th><th>Billing</th><th>Status</th><th />
      </tr>
    </thead>
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Build"
        title="API keys"
        description="Create, scope, rotate and revoke the keys your apps use to call the API."
        actions={<NewKeyButton onClick={() => { setEditing(null); setFormOpen(true); }} />}
      />

      <div className="toolbar">
        <Segmented value={group} onChange={setGroup} options={[
          { value: 'key', label: 'All keys', icon: List },
          { value: 'project', label: 'By project', icon: FolderKanban },
        ]} />
        <div className="search-input">
          <Search size={15} />
          <Input placeholder="Search name or last 4…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row gap-8 ml-auto wrap">
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="">All statuses</option>
          </Select>
        </div>
      </div>

      {loading ? <Card><LoadingBlock rows={5} /></Card>
        : error ? <Card><ErrorState error={error} onRetry={reload} /></Card>
        : keys.length === 0 ? (
          <Card>
            <EmptyState icon={KeyRound} title={q || projectFilter ? 'No keys match these filters' : 'No API keys yet'}
              action={!q && <NewKeyButton onClick={() => { setEditing(null); setFormOpen(true); }} />}>
              {q || projectFilter ? 'Try clearing the search or picking another project.' : 'Create a key to start calling the API from your app.'}
            </EmptyState>
          </Card>
        ) : group === 'key' ? (
          <Card className="table-card">
            <div className="table-scroll"><table className="table">{head()}<tbody>{keys.map((k) => row(k))}</tbody></table></div>
          </Card>
        ) : (
          <div className="stack gap-16">
            {grouped.map(([pid, list]) => {
              const p = byId[pid];
              return (
                <Card key={pid} className="table-card">
                  <div className="group-head">
                    <div className="row gap-8">
                      <FolderKanban size={16} />
                      <strong>{p?.name || 'Unknown project'}</strong>
                      <span className="mono xsmall faint">{p?.ref}</span>
                    </div>
                    <span className="muted small">{list.length} key{list.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="table-scroll"><table className="table">{head(false)}<tbody>{list.map((k) => row(k, false))}</tbody></table></div>
                </Card>
              );
            })}
          </div>
        )}

      <p className="footnote">
        Full secrets are shown only once, when a key is created or regenerated. We store a one-way hash, so lost keys can’t be recovered — regenerate instead.
      </p>

      <KeyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        keyToEdit={editing}
        defaultProjectId={projectFilter}
        onCreated={(res) => {
          if (!statusFilter || statusFilter === 'active') setData((l) => [res.key, ...(l || [])]);
          setSecret({ value: res.secret, name: res.key.name });
          reloadProjects();
        }}
        onSaved={replaceKey}
      />
      <SecretModal secret={secret?.value} keyName={secret?.name} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm.run()}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        requireText={confirm?.requireText}
      />
    </div>
  );
}
