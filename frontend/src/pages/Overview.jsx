import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, KeyRound, Wallet, AlertTriangle, ArrowRight, Terminal, BookOpen } from 'lucide-react';
import { api } from '../api';
import { DOCS_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { useProjects } from '../context/ProjectsContext';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtInt, fmtMoney, fmtPct, fmtRelative, maskKey, rangeParams } from '../lib/format';
import { Badge, Card, CardHeader, LoadingBlock, PageHeader, Progress, Stat, Button } from '../components/ui';
import { TimeArea, Sparkline } from '../components/charts';
import { KeyFormModal, NewKeyButton, SecretModal } from '../components/KeyModals';

const DAY = 86_400_000;

export default function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { projects, reload: reloadProjects } = useProjects();
  const [formOpen, setFormOpen] = useState(false);
  const [secret, setSecret] = useState(null);

  const q = useMemo(() => {
    const to = Date.now();
    return { from: new Date(to - 27 * DAY).toISOString(), to: new Date(to).toISOString(), granularity: 'day' };
  }, []);
  const series = useAsync(() => api.usage.timeseries(q), [q]);
  const day = useAsync(() => api.usage.timeseries(rangeParams('24h')), []);
  const spend = useAsync(() => api.spend.summary(), []);
  const keys = useAsync(() => api.keys.list({ status: 'active' }), []);
  const budgets = useAsync(() => api.budgets.list(), []);

  const pts = series.data?.points || [];
  const last14 = pts.slice(-14);
  const prev14 = pts.slice(0, Math.max(0, pts.length - 14));
  const sum = (arr, k) => arr.reduce((a, p) => a + p[k], 0);
  const trend = (a, b) => (b ? ((a - b) / b) * 100 : null);
  const req14 = sum(last14, 'requests');
  const err14 = sum(last14, 'errors');
  const hello = user?.name?.split(' ')[0] || 'there';

  const alerts = (budgets.data || []).filter((b) => b.spent / b.amount >= 0.5);

  return (
    <div className="page">
      <PageHeader eyebrow="Overview" title={`Good to see you, ${hello}`}
        description="Here’s how your API is doing across all projects."
        actions={<NewKeyButton onClick={() => setFormOpen(true)} />} />

      <div className="stats">
        <Stat label="Requests · 24h" icon={Activity} value={day.data ? fmtInt(day.data.totals.requests) : '…'}
          sub={day.data ? `${fmtCompact(day.data.totals.inputTokens + day.data.totals.outputTokens)} tokens` : ''} />
        <Stat label="Requests · 14d" icon={Activity} value={series.data ? fmtCompact(req14) : '…'}
          trend={series.data ? trend(req14, sum(prev14, 'requests')) : null} sub="vs previous 14 days" />
        <Stat label="Error rate · 14d" icon={AlertTriangle} value={series.data ? fmtPct(req14 ? (err14 / req14) * 100 : 0, 2) : '…'}
          sub={series.data ? `${fmtInt(err14)} failed requests` : ''} />
        <Stat label="Spend this month" icon={Wallet} value={spend.data ? fmtMoney(spend.data.monthToDate) : '…'}
          sub={spend.data ? `Forecast ${fmtMoney(spend.data.forecast)}` : ''} />
      </div>

      <div className="grid-main">
        <Card>
          <CardHeader title="Traffic" subtitle="Requests per day, last 14 days"
            actions={<Button size="sm" variant="ghost" onClick={() => navigate('/usage')}>Open usage <ArrowRight size={14} /></Button>} />
          <div className="card-pad">
            {series.loading ? <LoadingBlock rows={6} /> : (
              <TimeArea data={last14} height={260} series={[{ key: 'requests', name: 'Requests', color: 'var(--accent)' }]} />
            )}
          </div>
        </Card>

        <div className="stack gap-16">
          <Card>
            <CardHeader title="Budgets" subtitle="This month" actions={<Link to="/spend" className="link small">Manage</Link>} />
            <div className="card-pad stack gap-12">
              {budgets.loading ? <LoadingBlock rows={2} /> : (budgets.data || []).length === 0 ? (
                <p className="muted small">No budgets yet. <Link className="link" to="/spend">Create one</Link> to get alerted before costs surprise you.</p>
              ) : budgets.data.map((b) => (
                <div key={b.id}>
                  <div className="row between small"><span className="strong">{b.name}</span><span className="muted">{fmtMoney(b.spent)} / {fmtMoney(b.amount)}</span></div>
                  <Progress value={b.spent} max={b.amount} />
                </div>
              ))}
              {alerts.length > 0 && <div className="alert alert-warn"><AlertTriangle size={15} />{alerts.length} budget{alerts.length > 1 ? 's are' : ' is'} over 50% used.</div>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Quick start" />
            <div className="card-pad stack gap-8">
              <pre className="code-snippet small">{`export KEYSTONE_API_KEY="ks_live_…"
pip install keystone`}</pre>
              <div className="row gap-8">
                <a className="btn btn-secondary btn-sm" href={DOCS_URL} target="_blank" rel="noreferrer"><BookOpen size={14} /><span>Docs</span></a>
                <a className="btn btn-ghost btn-sm" href={DOCS_URL} target="_blank" rel="noreferrer"><Terminal size={14} /><span>API reference</span></a>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="table-card">
        <CardHeader title="Active keys" subtitle={`${keys.data?.length ?? '…'} keys across ${projects.length} projects`}
          actions={<Link to="/keys" className="link small">All keys</Link>} />
        {keys.loading ? <LoadingBlock rows={3} /> : (
          <div className="table-scroll">
            <table className="table compact">
              <thead><tr><th>Key</th><th>Project</th><th>Last used</th><th>Activity (28d)</th><th /></tr></thead>
              <tbody>
                {(keys.data || []).slice(0, 5).map((k) => (
                  <tr key={k.id}>
                    <td><div className="key-cell"><span className="key-icon"><KeyRound size={14} /></span><div><div className="strong">{k.name}</div><div className="mono xsmall muted">{maskKey(k)}</div></div></div></td>
                    <td>{projects.find((p) => p.id === k.projectId)?.name}</td>
                    <td>{fmtRelative(k.lastUsedAt)}</td>
                    <td style={{ width: 160 }}><KeySpark keyId={k.id} /></td>
                    <td className="actions"><Badge tone="ok" dot>Active</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <KeyFormModal open={formOpen} onClose={() => setFormOpen(false)}
        onCreated={(res) => { setSecret({ value: res.secret, name: res.key.name }); keys.reload({ silent: true }); reloadProjects(); }} />
      <SecretModal secret={secret?.value} keyName={secret?.name} onClose={() => setSecret(null)} />
    </div>
  );
}

function KeySpark({ keyId }) {
  const { data } = useAsync(() => api.usage.timeseries({ ...rangeParams('30d'), keyId }), [keyId]);
  if (!data) return <div className="skeleton" style={{ height: 28 }} />;
  return <Sparkline data={data.points} dataKey="requests" height={28} />;
}
