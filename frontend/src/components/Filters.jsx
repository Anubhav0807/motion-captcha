import { useEffect, useState } from 'react';
import { api } from '../api';
import { RANGE_PRESETS } from '../lib/format';
import { Select } from './ui';

export function RangeSelect({ value, onChange, presets = RANGE_PRESETS }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Time range">
      {presets.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
    </Select>
  );
}

/** Loads the org's keys once; `keys` can be passed in to avoid a second request. */
export function KeySelect({ value, onChange, keys: provided }) {
  const [keys, setKeys] = useState(provided || []);
  useEffect(() => {
    if (provided) { setKeys(provided); return; }
    api.keys.list().then(setKeys).catch(() => setKeys([]));
  }, [provided]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="API key">
      <option value="">All keys</option>
      {keys.map((k) => <option key={k.id} value={k.id}>{k.name}{k.status === 'revoked' ? ' (revoked)' : ''}</option>)}
    </Select>
  );
}
