import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ScrollText, RefreshCw, Download } from 'lucide-react';
import { api } from '../api';
import { MODELS, modelLabel } from '../config';
import { useProjects } from '../context/ProjectsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtDateTime, fmtInt, downloadCSV } from '../lib/format';
import {
  Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, LoadingBlock, PageHeader, Select, Toggle, CopyButton,
} from '../components/ui';
import { KeySelect, ProjectSelect } from '../components/Filters';

const statusTone = (s) => (s < 300 ? 'ok' : s === 429 ? 'warn' : 'danger');

function LogDetail({ id, onClose, keyName }) {
  const { data, loading, error } = useAsync(() => (id ? api.logs.get(id) : Promise.resolve(null)), [id]);
  return (
    <Drawer open={!!id} onClose={onClose} title="Request details">
      {loading ? <LoadingBlock rows={8} /> : error ? <ErrorState error={error} /> : data && (
        <div className="stack gap-16">
          <div className="row gap-8 wrap">
            <Badge tone={statusTone(data.status)} dot>{data.status}</Badge>
            <span className="mono small">{data.method} {data.endpoint}</span>
          </div>
          <div className="row gap-6">
            <span className="mono small muted">{data.id}</span>
            <CopyButton value={data.id} label="Copy request ID" />
          </div>
          {data.error && <div className="alert alert-danger">{data.error}</div>}
          <dl className="kv kv-2">
            <div><dt>Time</dt><dd>{fmtDateTime(data.timestamp)}</dd></div>
            <div><dt>Latency</dt><dd>{fmtInt(data.latencyMs)} ms</dd></div>
            <div><dt>Model</dt><dd>{modelLabel(data.model)}</dd></div>
            <div><dt>Streamed</dt><dd>{data.streamed ? 'Yes' : 'No'}</dd></div>
            <div><dt>Input tokens</dt><dd>{fmtInt(data.inputTokens)}</dd></div>
            <div><dt>Output tokens</dt><dd>{fmtInt(data.outputTokens)}</dd></div>
            <div><dt>API key</dt><dd>{keyName(data.keyId)}</dd></div>
            <div><dt>Client IP</dt><dd className="mono">{data.ip}</dd></div>
            <div className="span-2"><dt>User agent</dt><dd className="mono small">{data.userAgent}</dd></div>
          </dl>
          <div>
            <div className="divider-label">Request</div>
            <pre className="code-snippet">{JSON.stringify(data.request, null, 2)}</pre>
          </div>
          <div>
            <div className="divider-label">Response</div>
            <pre className="code-snippet">{JSON.stringify(data.response, null, 2)}</pre>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default function Logs() {
  const toast = useToast();
  const { byId } = useProjects();
  const [filters, setFilters] = useState({ projectId: '', keyId: '', model: '', status: '', q: '' });
  const [qInput, setQInput] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState({ loading: true, more: false, error: null });
  const [selected, setSelected] = useState(null);
  const keysList = useAsync(() => api.keys.list({}), []);
  const keyName = useCallback((id) => keysList.data?.find((k) => k.id === id)?.name || 'Deleted key', [keysList.data]);

  const query = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);

  const load = useCallback(async (append = false, from = null) => {
    setState((s) => ({ ...s, loading: !append, more: append, error: null }));
    try {
      const res = await api.logs.list({ ...query, limit: 50, cursor: from || undefined });
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
      setTotal(res.total ?? 0);
      setState({ loading: false, more: false, error: null });
    } catch (error) {
      setState({ loading: false, more: false, error });
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput })), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, ...(k === 'projectId' ? { keyId: '' } : {}) }));

  // Payload logging setting for the chosen project
  const logging = useAsync(() => (filters.projectId ? api.logs.settings(filters.projectId) : Promise.resolve(null)), [filters.projectId]);
  const updateLogging = async (patch) => {
    try {
      const next = await api.logs.updateSettings(filters.projectId, patch);
      logging.setData(next);
      toast.success('Logging settings saved');
    } catch (e) { toast.error(e); }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Monitor" title="Request logs"
        description="Every API call with status, latency and token counts. Click a row for details."
        actions={<>
          <Button icon={Download} disabled={!items.length} onClick={() => downloadCSV('request-logs.csv', items.map((l) => ({
            id: l.id, timestamp: l.timestamp, status: l.status, endpoint: l.endpoint, model: l.model, key: keyName(l.keyId),
            input_tokens: l.inputTokens, output_tokens: l.outputTokens, latency_ms: l.latencyMs, error: l.error || '',
          })))}>Export</Button>
          <Button icon={RefreshCw} onClick={() => load()}>Refresh</Button>
        </>} />

      <div className="toolbar">
        <div className="search-input">
          <Search size={15} />
          <Input placeholder="Request ID, endpoint or error…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <ProjectSelect value={filters.projectId} onChange={set('projectId')} />
        <KeySelect value={filters.keyId} projectId={filters.projectId} onChange={set('keyId')} />
        <Select value={filters.model} onChange={(e) => set('model')(e.target.value)} aria-label="Model">
          <option value="">All models</option>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
        <Select value={filters.status} onChange={(e) => set('status')(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="success">Success (2xx)</option>
          <option value="error">Errors (4xx/5xx)</option>
        </Select>
      </div>

      {filters.projectId && logging.data && (
        <Card className="card-pad">
          <div className="grid-2 gap-16">
            <Toggle checked={logging.data.enabled} onChange={(v) => updateLogging({ enabled: v })}
              label={`Store request & response bodies for ${byId[filters.projectId]?.name}`}
              description="Off by default. Metadata is always logged; bodies are only kept when this is on." />
            <div className="row gap-8 end">
              <span className="small muted">Retention</span>
              <Select value={logging.data.retentionDays} onChange={(e) => updateLogging({ retentionDays: Number(e.target.value) })} aria-label="Retention">
                {[7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
              </Select>
            </div>
          </div>
        </Card>
      )}

      <Card className="table-card">
        {state.loading ? <LoadingBlock rows={8} /> : state.error ? <ErrorState error={state.error} onRetry={() => load()} />
          : items.length === 0 ? <EmptyState icon={ScrollText} title="No requests match">Adjust the filters or make a request with one of your keys.</EmptyState> : (
            <>
              <div className="table-scroll">
                <table className="table compact clickable">
                  <thead><tr><th>Time</th><th>Status</th><th>Endpoint</th><th>Model</th><th>Key</th><th className="num">Tokens</th><th className="num">Latency</th></tr></thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.id} onClick={() => setSelected(l.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(l.id)}>
                        <td className="nowrap small">{fmtDateTime(l.timestamp)}</td>
                        <td><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                        <td className="mono small">{l.endpoint}</td>
                        <td>{modelLabel(l.model)}</td>
                        <td className="small">{keyName(l.keyId)}</td>
                        <td className="num">{fmtInt(l.inputTokens + l.outputTokens)}</td>
                        <td className="num">{fmtInt(l.latencyMs)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                <span className="muted small">Showing {items.length} of {fmtInt(total)}</span>
                {cursor && <Button size="sm" loading={state.more} onClick={() => load(true, cursor)}>Load more</Button>}
              </div>
            </>
          )}
      </Card>

      <LogDetail id={selected} onClose={() => setSelected(null)} keyName={keyName} />
    </div>
  );
}
