import { useEffect, useState } from 'react';
import { api } from '../api';
import { useProjects } from '../context/ProjectsContext';
import { RANGE_PRESETS } from '../lib/format';
import { Select } from './ui';

export function RangeSelect({ value, onChange, presets = RANGE_PRESETS }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Time range">
      {presets.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
    </Select>
  );
}

export function ProjectSelect({ value, onChange, allowAll = true, allLabel = 'All projects' }) {
  const { projects } = useProjects();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Project">
      {allowAll && <option value="">{allLabel}</option>}
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select>
  );
}

export function KeySelect({ value, onChange, projectId }) {
  const [keys, setKeys] = useState([]);
  useEffect(() => { api.keys.list({ projectId: projectId || undefined }).then(setKeys).catch(() => setKeys([])); }, [projectId]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="API key">
      <option value="">All keys</option>
      {keys.map((k) => <option key={k.id} value={k.id}>{k.name} (••••{k.last4}){k.status === 'revoked' ? ' — revoked' : ''}</option>)}
    </Select>
  );
}
