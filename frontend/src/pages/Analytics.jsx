import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Activity, CheckCircle2, ShieldAlert, Gauge } from 'lucide-react';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtInt, fmtPct, plural, rangeParams, downloadCSV } from '../lib/format';
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, Tabs } from '../components/ui';
import { TimeBars, TimeLine, Legend, CategoryBars } from '../components/charts';
import { KeySelect, RangeSelect } from '../components/Filters';

const METRICS = [
  { value: 'verifications', label: 'Verifications' },
  { value: 'challenges', label: 'Challenges' },
  { value: 'risk', label: 'Risk score' },
  { value: 'errors', label: 'Errors' },
];

export const RISK_BUCKETS = [
  { label: '0–19', color: 'var(--c1)' },
  { label: '20–39', color: '#5fa97f' },
  { label: '40–59', color: 'var(--c2)' },
  { label: '60–79', color: '#e07a4f' },
  { label: '80–100', color: 'var(--c4)' },
];

export const passRate = (t) => (t && t.passed + t.failed ? (t.passed / (t.passed + t.failed)) * 100 : 0);
export const avgRisk = (t) => (t && t.riskCount ? t.riskSum / t.riskCount : 0);
export const motionShare = (t) => (t && t.challengesStatic + t.challengesDynamic
  ? (t.challengesDynamic / (t.challengesStatic + t.challengesDynamic)) * 100 : 0);

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const range = params.get('range') || '30d';
  const keyId = params.get('keyId') || '';
  const [metric, setMetric] = useState('verifications');

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const q = useMemo(() => ({ ...rangeParams(range), keyId: keyId || undefined }), [range, keyId]);
  const series = useAsync(() => api.usage.timeseries(q), [q]);
  const byKey = useAsync(() => api.usage.byKey({ from: q.from, to: q.to }), [q.from, q.to]);
  const keys = useAsync(() => api.keys.list(), []);
  const keyName = (id) => keys.data?.find((k) => k.id === id)?.name || 'Deleted key';

  const t = series.data?.totals;
  const gran = series.data?.granularity;
  const points = useMemo(() => (series.data?.points || []).map((p) => ({
    ...p,
    avgRisk: p.riskCount ? Math.round((p.riskSum / p.riskCount) * 10) / 10 : null,
  })), [series.data]);

  const exportCsv = () => downloadCSV(`motion-captcha-${range}.csv`, points.map((p) => ({
    timestamp: p.ts, assessments: p.assessments, static_challenges: p.challengesStatic, motion_challenges: p.challengesDynamic,
    verifications_passed: p.passed, verifications_failed: p.failed, average_risk: p.avgRisk ?? '', errors: p.errors, rate_limited: p.rateLimited,
  })));

  const hasTraffic = t && (t.assessments || t.passed || t.failed || t.errors || t.rateLimited);

  const chart = () => {
    if (!hasTraffic) {
      return <EmptyState icon={Activity} title="No traffic in this range">Data appears here as soon as the widget runs on one of your pages.</EmptyState>;
    }
    switch (metric) {
      case 'challenges':
        return <>
          <Legend items={[{ name: 'Static (low risk)', color: 'var(--c1)' }, { name: 'Motion (high risk)', color: 'var(--c3)' }]} />
          <TimeBars data={points} granularity={gran} height={300} series={[
            { key: 'challengesStatic', name: 'Static', color: 'var(--c1)' },
            { key: 'challengesDynamic', name: 'Motion', color: 'var(--c3)' },
          ]} />
        </>;
      case 'risk':
        return <>
          <Legend items={[{ name: 'Average risk score (0–100)', color: 'var(--c2)' }]} />
          <TimeLine data={points} granularity={gran} height={300} format={(v) => (v == null ? '—' : Math.round(v))}
            series={[{ key: 'avgRisk', name: 'Avg risk', color: 'var(--c2)' }]} />
        </>;
      case 'errors':
        return <>
          <Legend items={[{ name: 'Server errors', color: 'var(--danger)' }, { name: 'Rate limited', color: 'var(--c2)' }]} />
          <TimeBars data={points} granularity={gran} height={300} series={[
            { key: 'errors', name: 'Errors', color: 'var(--danger)' },
            { key: 'rateLimited', name: 'Rate limited', color: 'var(--c2)' },
          ]} />
        </>;
      default:
        return <>
          <Legend items={[{ name: 'Passed', color: 'var(--c1)' }, { name: 'Failed', color: 'var(--c4)' }]} />
          <TimeBars data={points} granularity={gran} height={300} series={[
            { key: 'passed', name: 'Passed', color: 'var(--c1)' },
            { key: 'failed', name: 'Failed', color: 'var(--c4)' },
          ]} />
        </>;
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Monitor" title="Analytics"
        description="How many visitors were scored, which CAPTCHA they got, and how many solved it."
        actions={<Button icon={Download} onClick={exportCsv} disabled={!points.length}>Export CSV</Button>} />

      <div className="toolbar">
        <RangeSelect value={range} onChange={(v) => setParam('range', v === '30d' ? '' : v)} />
        <KeySelect value={keyId} keys={keys.data || undefined} onChange={(v) => setParam('keyId', v)} />
      </div>

      <div className="stats">
        {series.loading && !t ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat"><LoadingBlock rows={2} /></div>) : <>
          <Stat label="Visitors scored" icon={Activity} value={fmtInt(t?.assessments)} sub={`${plural((t?.challengesStatic || 0) + (t?.challengesDynamic || 0), 'challenge')} shown`} />
          <Stat label="Verifications" icon={CheckCircle2} value={fmtInt((t?.passed || 0) + (t?.failed || 0))} sub={`${fmtPct(passRate(t))} passed`} />
          <Stat label="Average risk score" icon={Gauge} value={t?.riskCount ? avgRisk(t).toFixed(1) : '—'} sub="0 = human-like, 100 = bot-like" />
          <Stat label="Got motion CAPTCHA" icon={ShieldAlert} value={fmtPct(motionShare(t))} sub={plural(t?.challengesDynamic, 'high-risk challenge')} />
        </>}
      </div>

      <Card>
        <CardHeader title="Over time" subtitle={gran === 'hour' ? 'Hourly, your local time' : 'Daily, UTC'} actions={<Tabs value={metric} onChange={setMetric} tabs={METRICS} />} />
        <div className="card-pad">
          {series.loading && !series.data ? <LoadingBlock rows={6} /> : series.error ? <ErrorState error={series.error} onRetry={series.reload} /> : chart()}
        </div>
      </Card>

      <div className="grid-2 gap-16">
        <Card>
          <CardHeader title="Risk score distribution" subtitle="Every assessment in this range" />
          <div className="card-pad">
            {!t ? <LoadingBlock rows={4} /> : !t.riskCount ? <p className="muted small">No assessments yet.</p> : (
              <CategoryBars data={RISK_BUCKETS.map((b, i) => ({ ...b, value: t.riskBuckets[i] }))} />
            )}
          </div>
        </Card>
        <Card className="table-card">
          <CardHeader title="By API key" />
          {byKey.loading ? <LoadingBlock rows={3} /> : byKey.error ? <ErrorState error={byKey.error} onRetry={byKey.reload} />
            : !byKey.data.length ? <p className="muted small" style={{ padding: 20 }}>No data.</p> : (
              <div className="table-scroll">
                <table className="table compact">
                  <thead><tr><th>Key</th><th className="num">Scored</th><th className="num">Verified</th><th className="num">Pass rate</th><th className="num">Avg risk</th></tr></thead>
                  <tbody>
                    {byKey.data.map((i) => (
                      <tr key={i.keyId} className="clickable-row" onClick={() => setParam('keyId', i.keyId)}>
                        <td className="strong">{keyName(i.keyId)}</td>
                        <td className="num">{fmtCompact(i.assessments)}</td>
                        <td className="num">{fmtCompact(i.passed + i.failed)}</td>
                        <td className="num">{fmtPct(passRate(i))}</td>
                        <td className="num">{i.riskCount ? avgRisk(i).toFixed(0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}
