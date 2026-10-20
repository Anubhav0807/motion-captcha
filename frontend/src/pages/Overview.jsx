import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, CheckCircle2, Gauge, PieChart, ArrowRight, KeyRound, Circle, CheckCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtInt, fmtPct, fmtRelative, rangeParams } from '../lib/format';
import { Badge, Button, Card, CardHeader, LoadingBlock, PageHeader, Progress, Stat } from '../components/ui';
import { TimeBars, Legend, Sparkline } from '../components/charts';
import { KeyFormModal, NewKeyButton, SecretModal } from '../components/KeyModals';
import { avgRisk, passRate } from './Analytics';

const DAY = 86_400_000;

function Checklist({ keys, totals }) {
  const steps = [
    { done: keys.length > 0, label: 'Create an API key', to: '/keys' },
    { done: totals.assessments > 0, label: 'Add the widget to a form', to: '/integration' },
    { done: totals.passed + totals.failed > 0, label: 'Verify answers from your server', to: '/integration' },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card>
      <CardHeader title="Get set up" subtitle={`${steps.filter((s) => s.done).length} of 3 done`} />
      <div className="card-pad checklist">
        {steps.map((s) => (
          <Link key={s.label} to={s.to} className={`check-step ${s.done ? 'done' : ''}`}>
            {s.done ? <CheckCircle size={18} /> : <Circle size={18} />}
            <span>{s.label}</span>
            {!s.done && <ArrowRight size={15} className="ml-auto" />}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function KeySpark({ keyId }) {
  const { data } = useAsync(() => api.usage.timeseries({ ...rangeParams('30d'), keyId }), [keyId]);
  if (!data) return <div className="skeleton" style={{ height: 28 }} />;
  return <Sparkline data={data.points} dataKey="assessments" height={28} />;
}

export default function Overview() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [secret, setSecret] = useState(null);

  const q = useMemo(() => {
    const to = Date.now();
    return { from: new Date(to - 13 * DAY).toISOString(), to: new Date(to).toISOString(), granularity: 'day' };
  }, []);
  const series = useAsync(() => api.usage.timeseries(q), [q]);
  const day = useAsync(() => api.usage.timeseries(rangeParams('24h')), []);
  const quota = useAsync(() => api.quota.get(), []);
  const keys = useAsync(() => api.keys.list({ status: 'active' }), []);

  const t = series.data?.totals;
  const d = day.data?.totals;
  const hello = user?.name?.split(' ')[0] || 'there';
  const usedPct = quota.data ? (quota.data.used / quota.data.quota) * 100 : 0;

  return (
    <div className="page">
      <PageHeader eyebrow="Overview" title={`Hi ${hello}`}
        description={`How motion-captcha is protecting ${user?.organization?.name}.`}
        actions={can('keys:write') && <NewKeyButton onClick={() => setFormOpen(true)} />} />

      {t && keys.data && <Checklist keys={keys.data} totals={t} />}

      <div className="stats">
        <Stat label="Visitors scored · 24h" icon={Activity} value={d ? fmtInt(d.assessments) : '…'}
          sub={d ? `${fmtInt(d.passed + d.failed)} verification${d.passed + d.failed === 1 ? '' : 's'}` : ''} />
        <Stat label="Pass rate · 14d" icon={CheckCircle2} value={t ? fmtPct(passRate(t)) : '…'}
          sub={t ? `${fmtInt(t.failed)} failed answer${t.failed === 1 ? '' : 's'}` : ''} />
        <Stat label="Average risk · 14d" icon={Gauge} value={t ? (t.riskCount ? avgRisk(t).toFixed(1) : '—') : '…'}
          sub={t ? `${fmtInt(t.challengesDynamic)} shown the motion CAPTCHA` : ''} />
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Verifications this month</span><span className="stat-icon"><PieChart size={15} /></span></div>
          <div className="stat-value">{quota.data ? fmtCompact(quota.data.used) : '…'}</div>
          {quota.data && <>
            <Progress value={quota.data.used} max={quota.data.quota} />
            <div className="stat-sub muted">{usedPct.toFixed(0)}% of {fmtCompact(quota.data.quota)} · {quota.data.plan.name}</div>
          </>}
        </div>
      </div>

      <div className="grid-main">
        <Card>
          <CardHeader title="Verifications" subtitle="Last 14 days (UTC)"
            actions={<Button size="sm" variant="ghost" onClick={() => navigate('/analytics')}>Open analytics <ArrowRight size={14} /></Button>} />
          <div className="card-pad">
            {series.loading ? <LoadingBlock rows={6} /> : <>
              <Legend items={[{ name: 'Passed', color: 'var(--c1)' }, { name: 'Failed', color: 'var(--c4)' }]} />
              <TimeBars data={series.data?.points || []} height={250} series={[
                { key: 'passed', name: 'Passed', color: 'var(--c1)' },
                { key: 'failed', name: 'Failed', color: 'var(--c4)' },
              ]} />
            </>}
          </div>
        </Card>

        <Card>
          <CardHeader title="How it decides" />
          <div className="card-pad stack gap-12 small">
            <div className="flow-step"><span className="flow-num">1</span><div><strong>Score</strong><p className="muted">The widget sends mouse, click and typing rhythm. The model returns a risk score from 0 to 100.</p></div></div>
            <div className="flow-step"><span className="flow-num">2</span><div><strong>Challenge</strong><p className="muted">Low risk gets a static image. High risk gets the motion CAPTCHA, which is readable only while it moves.</p></div></div>
            <div className="flow-step"><span className="flow-num">3</span><div><strong>Verify</strong><p className="muted">Your server sends the token and answer with your secret key and gets back pass/fail plus the risk score.</p></div></div>
            <Link to="/integration" className="link small">Integration guide →</Link>
          </div>
        </Card>
      </div>

      <Card className="table-card">
        <CardHeader title="Active keys" subtitle={keys.data ? `${keys.data.length} active` : ''}
          actions={<Link to="/keys" className="link small">Manage keys</Link>} />
        {keys.loading ? <LoadingBlock rows={3} /> : !keys.data?.length ? (
          <p className="muted small" style={{ padding: 20 }}>No keys yet. Create one to get your site key and secret.</p>
        ) : (
          <div className="table-scroll">
            <table className="table compact">
              <thead><tr><th>Key</th><th>Domains</th><th>Last used</th><th>Visitors (30d)</th><th /></tr></thead>
              <tbody>
                {keys.data.slice(0, 6).map((k) => (
                  <tr key={k.id} className="clickable-row" onClick={() => navigate(`/analytics?keyId=${k.id}`)}>
                    <td><div className="key-cell"><span className="key-icon"><KeyRound size={14} /></span><span className="strong">{k.name}</span></div></td>
                    <td className="small mono">{k.allowedDomains.length ? k.allowedDomains.join(', ') : <Badge tone="warn">Any</Badge>}</td>
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
        onCreated={(res) => { setSecret(res); keys.reload({ silent: true }); }} />
      <SecretModal data={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
