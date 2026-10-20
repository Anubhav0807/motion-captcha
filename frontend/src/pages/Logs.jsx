import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ScrollText, RefreshCw, Download } from 'lucide-react';
import { api } from '../api';
import { ENDPOINT_LABELS, ERROR_CODE_HELP } from '../config';
import { useAsync } from '../hooks/useAsync';
import { fmtDateTime, fmtInt, downloadCSV } from '../lib/format';
import { Badge, Button, Card, CopyButton, Drawer, EmptyState, ErrorState, Input, LoadingBlock, PageHeader, Select } from '../components/ui';
import { KeySelect } from '../components/Filters';

const OUTCOME = {
  ok: { tone: 'ok', label: 'OK' },
  passed: { tone: 'ok', label: 'Passed' },
  failed: { tone: 'danger', label: 'Failed' },
  rejected: { tone: 'warn', label: 'Rejected' },
  rate_limited: { tone: 'warn', label: 'Rate limited' },
  quota_exceeded: { tone: 'warn', label: 'Over quota' },
  error: { tone: 'danger', label: 'Error' },
};

const riskTone = (r) => (r == null ? 'neutral' : r >= 70 ? 'danger' : r >= 40 ? 'warn' : 'ok');

function Outcome({ value }) {
  const o = OUTCOME[value] || { tone: 'neutral', label: value };
  return <Badge tone={o.tone} dot>{o.label}</Badge>;
}

function LogDetail({ id, onClose, keyName }) {
  const { data, loading, error } = useAsync(() => (id ? api.logs.get(id) : Promise.resolve(null)), [id]);
  return (
    <Drawer open={!!id} onClose={onClose} title="Request details">
      {loading ? <LoadingBlock rows={8} /> : error ? <ErrorState error={error} /> : data && (
        <div className="stack gap-16">
          <div className="row gap-8 wrap">
            <Outcome value={data.outcome} />
            <span className="strong">{ENDPOINT_LABELS[data.type]}</span>
            <span className="mono small muted">HTTP {data.statusCode}</span>
          </div>
          {data.errorCode && (
            <div className={`alert ${data.outcome === 'failed' ? 'alert-warn' : 'alert-danger'}`}>
              <div><strong className="mono">{data.errorCode}</strong>{ERROR_CODE_HELP[data.errorCode] && <> — {ERROR_CODE_HELP[data.errorCode]}</>}</div>
            </div>
          )}
          <dl className="kv kv-2">
            <div><dt>Time</dt><dd>{fmtDateTime(data.timestamp)}</dd></div>
            <div><dt>Latency</dt><dd>{fmtInt(data.latencyMs)} ms</dd></div>
            <div><dt>Risk score</dt><dd>{data.riskScore ?? '—'}</dd></div>
            <div><dt>Challenge</dt><dd>{data.challengeType === 'dynamic' ? 'Motion' : data.challengeType === 'static' ? 'Static' : '—'}</dd></div>
            <div><dt>API key</dt><dd>{keyName(data.keyId)}</dd></div>
            <div><dt>Origin</dt><dd className="mono small">{data.origin || '—'}</dd></div>
            <div><dt>Client IP</dt><dd className="mono small">{data.ip || '—'}</dd></div>
            <div><dt>Request ID</dt><dd className="mono small">{data.id}</dd></div>
            <div className="span-2"><dt>Token</dt><dd className="row gap-4"><span className="mono small">{data.token || '—'}</span>{data.token && <CopyButton value={data.token} label="Copy token" />}</dd></div>
            <div className="span-2"><dt>User agent</dt><dd className="mono xsmall">{data.userAgent || '—'}</dd></div>
          </dl>
          {data.flow?.length > 1 && (
            <div>
              <div className="divider-label">Whole flow for this token</div>
              <ol className="timeline">
                {data.flow.map((f) => (
                  <li key={f.id} className={f.id === data.id ? 'current' : ''}>
                    <span className="strong">{ENDPOINT_LABELS[f.type]}</span>
                    <Outcome value={f.outcome} />
                    {f.errorCode && <span className="mono xsmall muted">{f.errorCode}</span>}
                    <span className="xsmall faint ml-auto">{fmtDateTime(f.timestamp)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default function Logs() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ keyId: params.get('keyId') || '', type: '', outcome: '', q: '' });
  const [qInput, setQInput] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [retention, setRetention] = useState(null);
  const [state, setState] = useState({ loading: true, more: false, error: null });
  const [selected, setSelected] = useState(null);
  const keys = useAsync(() => api.keys.list(), []);
  const keyName = useCallback((id) => keys.data?.find((k) => k.id === id)?.name || 'Deleted key', [keys.data]);

  const query = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);

  const load = useCallback(async (append = false, from = null) => {
    setState((s) => ({ ...s, loading: !append, more: append, error: null }));
    try {
      const res = await api.logs.list({ ...query, limit: 50, cursor: from || undefined });
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
      setRetention(res.retentionDays);
      setState({ loading: false, more: false, error: null });
    } catch (error) {
      setState({ loading: false, more: false, error });
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === qInput.trim() ? f : { ...f, q: qInput.trim() })), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="page">
      <PageHeader eyebrow="Monitor" title="Request logs"
        description={`Every assess, challenge and verify call${retention ? `, kept for ${retention} days on your plan` : ''}. Click a row to see the whole flow.`}
        actions={<>
          <Button icon={Download} disabled={!items.length} onClick={() => downloadCSV('motion-captcha-logs.csv', items.map((l) => ({
            id: l.id, timestamp: l.timestamp, endpoint: l.type, outcome: l.outcome, status: l.statusCode, error_code: l.errorCode || '',
            risk_score: l.riskScore ?? '', challenge: l.challengeType || '', key: keyName(l.keyId), origin: l.origin || '',
            ip: l.ip || '', latency_ms: l.latencyMs, token: l.token || '',
          })))}>Export</Button>
          <Button icon={RefreshCw} onClick={() => load()}>Refresh</Button>
        </>} />

      <div className="toolbar">
        <div className="search-input">
          <Search size={15} />
          <Input placeholder="Token, IP, domain or error code…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <KeySelect value={filters.keyId} keys={keys.data || undefined} onChange={set('keyId')} />
        <Select value={filters.type} onChange={(e) => set('type')(e.target.value)} aria-label="Endpoint">
          <option value="">All endpoints</option>
          <option value="assess">Assess</option>
          <option value="challenge">Challenge</option>
          <option value="verify">Verify</option>
        </Select>
        <Select value={filters.outcome} onChange={(e) => set('outcome')(e.target.value)} aria-label="Outcome">
          <option value="">All outcomes</option>
          <option value="success">Successful</option>
          <option value="failure">Unsuccessful</option>
          <option value="failed">Wrong answer</option>
          <option value="rejected">Rejected</option>
          <option value="rate_limited">Rate limited</option>
          <option value="error">Server error</option>
        </Select>
      </div>

      <Card className="table-card">
        {state.loading ? <LoadingBlock rows={8} /> : state.error ? <ErrorState error={state.error} onRetry={() => load()} />
          : items.length === 0 ? <EmptyState icon={ScrollText} title="No requests match">Change the filters, or load a page that has the widget on it.</EmptyState> : (
            <>
              <div className="table-scroll">
                <table className="table compact clickable">
                  <thead><tr><th>Time</th><th>Endpoint</th><th>Outcome</th><th>Risk</th><th>Challenge</th><th>Key</th><th>Origin / IP</th><th className="num">Latency</th></tr></thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.id} onClick={() => setSelected(l.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(l.id)}>
                        <td className="nowrap small">{fmtDateTime(l.timestamp)}</td>
                        <td className="strong">{ENDPOINT_LABELS[l.type]}</td>
                        <td>
                          <Outcome value={l.outcome} />
                          {l.errorCode && l.outcome !== 'ok' && <div className="mono xsmall faint">{l.errorCode}</div>}
                        </td>
                        <td>{l.riskScore != null ? <Badge tone={riskTone(l.riskScore)}>{l.riskScore}</Badge> : <span className="faint">—</span>}</td>
                        <td className="small">{l.challengeType === 'dynamic' ? 'Motion' : l.challengeType === 'static' ? 'Static' : '—'}</td>
                        <td className="small">{keyName(l.keyId)}</td>
                        <td className="small"><div className="mono">{l.origin || '—'}</div><div className="mono xsmall faint">{l.ip}</div></td>
                        <td className="num">{fmtInt(l.latencyMs)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                <span className="muted small">Showing {items.length}{cursor ? '+' : ''} requests</span>
                {cursor && <Button size="sm" loading={state.more} onClick={() => load(true, cursor)}>Load more</Button>}
              </div>
            </>
          )}
      </Card>

      <LogDetail id={selected} onClose={() => setSelected(null)} keyName={keyName} />
    </div>
  );
}
