import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  KeyRound, Search, BarChart3, Pencil, RefreshCw, Ban, Trash2, Globe, ScrollText, Copy, Shuffle, Image as ImageIcon,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { copyText, fmtDate, fmtRelative, maskSecret } from '../lib/format';
import {
  Badge, Card, ConfirmDialog, CopyButton, EmptyState, ErrorState, IconButton, Input, LoadingBlock, Menu, PageHeader, Select,
} from '../components/ui';
import { KeyFormModal, NewKeyButton, SecretModal } from '../components/KeyModals';

function modeLabel(t) {
  if (t >= 101) return { text: 'Always static', icon: ImageIcon };
  if (t <= 0) return { text: 'Always motion', icon: Shuffle };
  return { text: `Adaptive · risk ≥ ${t}`, icon: Shuffle };
}

function Domains({ list }) {
  if (!list?.length) return <Badge tone="warn" dot>Any domain</Badge>;
  return (
    <div className="row gap-4 wrap">
      {list.slice(0, 2).map((d) => <span key={d} className="chip mono"><Globe size={11} />{d}</span>)}
      {list.length > 2 && <span className="chip">+{list.length - 2}</span>}
    </div>
  );
}

export default function ApiKeys() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const canWrite = can('keys:write');
  const [params, setParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('active');
  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.keys.list({ status: statusFilter || undefined }), [statusFilter],
  );

  // Brand-new accounts land here with ?new=1 → open the create dialog once.
  useEffect(() => {
    if (params.get('new') && canWrite) {
      setFormOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, canWrite]);

  const keys = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter((k) => !s || k.name.toLowerCase().includes(s) || k.siteKey.toLowerCase().includes(s)
      || k.allowedDomains.some((d) => d.includes(s)));
  }, [data, q]);

  const replaceKey = (k) => setData((list) => (list || []).map((x) => (x.id === k.id ? k : x)));
  const guarded = (fn) => async () => { try { await fn(); } catch (e) { toast.error(e); throw e; } };

  const actions = (k) => [
    { label: 'View analytics', icon: BarChart3, onClick: () => navigate(`/analytics?keyId=${k.id}`) },
    { label: 'View request logs', icon: ScrollText, onClick: () => navigate(`/logs?keyId=${k.id}`) },
    { label: 'Copy site key', icon: Copy, onClick: async () => { await copyText(k.siteKey); toast.success('Site key copied'); } },
    canWrite && k.status === 'active' && { label: 'Edit settings', icon: Pencil, onClick: () => { setEditing(k); setFormOpen(true); } },
    canWrite && k.status === 'active' && { label: 'Roll secret key', icon: RefreshCw, onClick: () => setConfirm({
      title: 'Roll the secret key?', confirmLabel: 'Roll secret', tone: 'primary',
      body: <>The current secret for <strong>{k.name}</strong> stops working immediately, so your server’s calls to <code>/v1/verify</code> will fail until you deploy the new one. The site key doesn’t change.</>,
      run: guarded(async () => {
        const res = await api.keys.rollSecret(k.id);
        replaceKey(res.key);
        setSecret({ ...res, rolled: true });
      }),
    }) },
    canWrite && 'divider',
    canWrite && k.status === 'active' && { label: 'Revoke', icon: Ban, danger: true, onClick: () => setConfirm({
      title: 'Revoke this key?', confirmLabel: 'Revoke key',
      body: <>The widget and verification for <strong>{k.name}</strong> stop working right away. Analytics history is kept. This can’t be undone.</>,
      run: guarded(async () => {
        const updated = await api.keys.revoke(k.id);
        if (statusFilter === 'active') setData((l) => l.filter((x) => x.id !== k.id)); else replaceKey(updated);
        toast.success('Key revoked');
      }),
    }) },
    canWrite && k.status === 'revoked' && { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({
      title: 'Delete this key?', confirmLabel: 'Delete permanently', requireText: k.name,
      body: <>Removes the key from this list. Its usage stays in analytics as “Deleted key”.</>,
      run: guarded(async () => {
        await api.keys.remove(k.id);
        setData((l) => l.filter((x) => x.id !== k.id));
        toast.success('Key deleted');
      }),
    }) },
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Build" title="API keys"
        description="Create a key for each site or app that shows the CAPTCHA. The site key goes in your HTML; the secret key stays on your server."
        actions={canWrite && <NewKeyButton onClick={() => { setEditing(null); setFormOpen(true); }} />} />

      <div className="toolbar">
        <div className="search-input">
          <Search size={15} />
          <Input placeholder="Search name, site key or domain…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ml-auto">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="">All keys</option>
          </Select>
        </div>
      </div>

      {loading ? <Card><LoadingBlock rows={5} /></Card>
        : error ? <Card><ErrorState error={error} onRetry={reload} /></Card>
        : keys.length === 0 ? (
          <Card>
            <EmptyState icon={KeyRound} title={q ? 'No keys match' : statusFilter === 'revoked' ? 'No revoked keys' : 'No API keys yet'}
              action={!q && canWrite && statusFilter !== 'revoked' && <NewKeyButton onClick={() => { setEditing(null); setFormOpen(true); }} />}>
              {q ? 'Try a different search.' : 'Create a key, add the widget to your form, and verify answers from your server.'}
            </EmptyState>
          </Card>
        ) : (
          <Card className="table-card">
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr><th>Key</th><th>Site key</th><th>Secret</th><th>Domains</th><th>Challenge</th><th>Last used</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const mode = modeLabel(k.settings.dynamicThreshold);
                    return (
                      <tr key={k.id} className={k.status === 'revoked' ? 'dim' : ''}>
                        <td>
                          <div className="key-cell">
                            <span className="key-icon"><KeyRound size={15} /></span>
                            <div>
                              <div className="strong">{k.name}</div>
                              <div className="xsmall faint">Created {fmtDate(k.createdAt)}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="row gap-2">
                            <code className="mono small key-code" title={k.siteKey}>{k.siteKey}</code>
                            <CopyButton value={k.siteKey} label="Copy site key" />
                          </div>
                        </td>
                        <td className="mono small muted nowrap">{maskSecret(k)}</td>
                        <td><Domains list={k.allowedDomains} /></td>
                        <td>
                          <span className="chip"><mode.icon size={11} />{mode.text}</span>
                          <div className="xsmall faint" style={{ marginTop: 4 }}>
                            {k.settings.length} chars · {k.settings.challengeTtl}s{k.settings.caseSensitive ? '' : ' · any case'}
                          </div>
                        </td>
                        <td className="nowrap">{fmtRelative(k.lastUsedAt)}</td>
                        <td>{k.status === 'active' ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Revoked</Badge>}</td>
                        <td className="actions">
                          <div className="row gap-2 end">
                            <IconButton icon={BarChart3} label="Analytics" onClick={() => navigate(`/analytics?keyId=${k.id}`)} />
                            <Menu items={actions(k)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      <p className="footnote">
        Secret keys are stored as one-way hashes, so a lost secret can’t be recovered — roll it to get a new one.
      </p>

      <KeyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        keyToEdit={editing}
        onCreated={(res) => {
          if (statusFilter !== 'revoked') setData((l) => [res.key, ...(l || [])]);
          setSecret(res);
        }}
        onSaved={replaceKey}
      />
      <SecretModal data={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm.run()}
        title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} tone={confirm?.tone} requireText={confirm?.requireText} />
    </div>
  );
}
