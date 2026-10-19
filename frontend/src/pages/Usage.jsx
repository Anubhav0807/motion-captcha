import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Activity, Coins, AlertTriangle, DollarSign } from 'lucide-react';
import { api } from '../api';
import { MODELS, modelLabel } from '../config';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtInt, fmtMoney, fmtPct, rangeParams, downloadCSV } from '../lib/format';
import { Button, Card, CardHeader, ErrorState, LoadingBlock, PageHeader, Stat, Tabs, EmptyState } from '../components/ui';
import { TimeArea, TimeBars, TimeLine, Legend } from '../components/charts';
import { KeySelect, ProjectSelect, RangeSelect } from '../components/Filters';

const METRICS = [
  { value: 'requests', label: 'Requests' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'errors', label: 'Errors' },
  { value: 'cost', label: 'Cost' },
];

export default function Usage() {
  const [params, setParams] = useSearchParams();
  const range = params.get('range') || '30d';
  const projectId = params.get('projectId') || '';
  const keyId = params.get('keyId') || '';
  const [metric, setMetric] = useState('requests');

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    if (k === 'projectId') next.delete('keyId');
    setParams(next, { replace: true });
  };

  const q = useMemo(() => ({ ...rangeParams(range), projectId: projectId || undefined, keyId: keyId || undefined }), [range, projectId, keyId]);
  const series = useAsync(() => api.usage.timeseries(q), [q]);
  const byModel = useAsync(() => api.usage.breakdown({ ...q, by: 'model' }), [q]);
  const byKey = useAsync(() => api.usage.breakdown({ ...q, by: 'key' }), [q]);
  const keysList = useAsync(() => api.keys.list({}), []);
  const keyName = (id) => keysList.data?.find((k) => k.id === id)?.name || 'Deleted key';

  const t = series.data?.totals;
  const points = useMemo(() => (series.data?.points || []).map((p) => ({
    ...p,
    tokens: p.inputTokens + p.outputTokens,
    errorRate: p.requests ? (p.errors / p.requests) * 100 : 0,
    ...Object.fromEntries(MODELS.map((m) => [m.id, p.models?.[m.id] || 0])),
  })), [series.data]);
  const gran = series.data?.granularity;

  const exportCsv = () => downloadCSV(`usage-${range}.csv`, points.map((p) => ({
    timestamp: p.ts, requests: p.requests, input_tokens: p.inputTokens, output_tokens: p.outputTokens,
    errors: p.errors, cost_usd: p.cost.toFixed(4),
  })));

  const chart = () => {
    if (!points.length || !t?.requests) return <EmptyState icon={Activity} title="No traffic in this range">Requests will show up here within a minute of being made.</EmptyState>;
    switch (metric) {
      case 'tokens':
        return <>
          <Legend items={[{ name: 'Input', color: 'var(--c1)' }, { name: 'Output', color: 'var(--c2)' }]} />
          <TimeArea data={points} granularity={gran} stacked height={300}
            series={[{ key: 'inputTokens', name: 'Input', color: 'var(--c1)' }, { key: 'outputTokens', name: 'Output', color: 'var(--c2)' }]} />
        </>;
      case 'errors':
        return <>
          <Legend items={[{ name: 'Errors', color: 'var(--danger)' }]} />
          <TimeLine data={points} granularity={gran} height={300} series={[{ key: 'errors', name: 'Errors', color: 'var(--danger)' }]} />
        </>;
      case 'cost':
        return <>
          <Legend items={[{ name: 'Cost (USD)', color: 'var(--c4)' }]} />
          <TimeArea data={points} granularity={gran} height={300} format={(v) => fmtMoney(v)}
            series={[{ key: 'cost', name: 'Cost', color: 'var(--c4)' }]} />
        </>;
      default:
        return <>
          <Legend items={MODELS.map((m) => ({ name: m.label, color: m.color }))} />
          <TimeBars data={points} granularity={gran} height={300} series={MODELS.map((m) => ({ key: m.id, name: m.label, color: m.color }))} />
        </>;
    }
  };

  const breakdownTable = (state, kind) => {
    if (state.loading) return <LoadingBlock rows={3} />;
    if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
    const items = state.data?.items || [];
    if (!items.length) return <p className="muted small" style={{ padding: 20 }}>No data.</p>;
    const total = items.reduce((a, i) => a + i.requests, 0) || 1;
    return (
      <div className="table-scroll">
        <table className="table compact">
          <thead><tr><th>{kind === 'model' ? 'Model' : 'Key'}</th><th className="num">Requests</th><th className="num">Tokens</th><th className="num">Errors</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="row gap-8">
                    {kind === 'model' && <i className="swatch" style={{ background: MODELS.find((m) => m.id === i.id)?.color }} />}
                    <span className="strong">{kind === 'model' ? modelLabel(i.id) : keyName(i.id)}</span>
                  </div>
                  <div className="share-bar"><i style={{ width: `${(i.requests / total) * 100}%` }} /></div>
                </td>
                <td className="num">{fmtInt(i.requests)}</td>
                <td className="num">{fmtCompact(i.inputTokens + i.outputTokens)}</td>
                <td className="num">{fmtPct(i.requests ? (i.errors / i.requests) * 100 : 0, 2)}</td>
                <td className="num">{fmtMoney(i.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Monitor" title="Usage"
        description="Requests, tokens, errors and cost across your projects and keys."
        actions={<Button icon={Download} onClick={exportCsv} disabled={!points.length}>Export CSV</Button>} />

      <div className="toolbar">
        <RangeSelect value={range} onChange={(v) => setParam('range', v === '30d' ? '' : v)} />
        <ProjectSelect value={projectId} onChange={(v) => setParam('projectId', v)} />
        <KeySelect value={keyId} projectId={projectId} onChange={(v) => setParam('keyId', v)} />
      </div>

      <div className="stats">
        {series.loading && !t ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat"><LoadingBlock rows={2} /></div>) : <>
          <Stat label="Requests" icon={Activity} value={fmtInt(t?.requests)} sub={`${fmtCompact((t?.requests || 0) / Math.max(points.length, 1))} per ${gran === 'hour' ? 'hour' : 'day'}`} />
          <Stat label="Tokens" icon={Coins} value={fmtCompact((t?.inputTokens || 0) + (t?.outputTokens || 0))} sub={`${fmtCompact(t?.inputTokens)} in · ${fmtCompact(t?.outputTokens)} out`} />
          <Stat label="Error rate" icon={AlertTriangle} value={fmtPct(t?.requests ? (t.errors / t.requests) * 100 : 0, 2)} sub={`${fmtInt(t?.errors)} failed`} />
          <Stat label="Cost" icon={DollarSign} value={fmtMoney(t?.cost)} sub="Free-tier usage isn’t billed" />
        </>}
      </div>

      <Card>
        <CardHeader title="Over time" subtitle={gran === 'hour' ? 'Hourly' : 'Daily'} actions={<Tabs value={metric} onChange={setMetric} tabs={METRICS} />} />
        <div className="card-pad">
          {series.loading && !series.data ? <LoadingBlock rows={6} /> : series.error ? <ErrorState error={series.error} onRetry={series.reload} /> : chart()}
        </div>
      </Card>

      <div className="grid-2 gap-16">
        <Card className="table-card"><CardHeader title="By model" />{breakdownTable(byModel, 'model')}</Card>
        <Card className="table-card"><CardHeader title="By API key" />{breakdownTable(byKey, 'key')}</Card>
      </div>
    </div>
  );
}
