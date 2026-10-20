import { useEffect, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PUBLIC_API_URL } from '../config';
import { useToast } from '../context/ToastContext';
import { Button, Checkbox, CopyButton, Field, Input, Modal, Segmented, Select, Textarea, Toggle } from './ui';

const DEFAULT_SETTINGS = {
  uppercase: true, lowercase: true, numbers: true, length: 6, dynamicThreshold: 50, caseSensitive: true, challengeTtl: 120,
};

const modeOf = (t) => (t >= 101 ? 'static' : t <= 0 ? 'dynamic' : 'adaptive');

const lines = (s) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/** Create (keyToEdit = null) or edit a key's name, allowed domains and CAPTCHA settings. */
export function KeyFormModal({ open, onClose, keyToEdit, onCreated, onSaved }) {
  const toast = useToast();
  const editing = !!keyToEdit;
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [threshold, setThreshold] = useState(50);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setName(keyToEdit?.name || '');
    setDomains((keyToEdit?.allowedDomains || []).join('\n'));
    const settings = keyToEdit?.settings || DEFAULT_SETTINGS;
    setS(settings);
    setThreshold(settings.dynamicThreshold > 0 && settings.dynamicThreshold < 101 ? settings.dynamicThreshold : 50);
  }, [open, keyToEdit]);

  const mode = modeOf(s.dynamicThreshold);
  const setMode = (m) => setS({ ...s, dynamicThreshold: m === 'static' ? 101 : m === 'dynamic' ? 0 : threshold });
  const set = (k) => (v) => setS({ ...s, [k]: v });

  const submit = async (ev) => {
    ev.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('Give the key a name of at least 2 characters.'); return; }
    if (!s.uppercase && !s.lowercase && !s.numbers) { setError('Enable at least one character set.'); return; }
    setBusy(true);
    const body = { name: name.trim(), allowedDomains: lines(domains), settings: { ...s, length: Number(s.length), challengeTtl: Number(s.challengeTtl) } };
    try {
      if (editing) {
        const updated = await api.keys.update(keyToEdit.id, body);
        toast.success('Key updated');
        onSaved?.(updated);
      } else {
        onCreated?.(await api.keys.create(body));
      }
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width={620}
      title={editing ? 'Edit API key' : 'Create API key'}
      description="Each key is a site key (public, used by the widget) plus a secret key (private, used by your server)."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="key-form" loading={busy}>{editing ? 'Save changes' : 'Create key'}</Button>
      </>}>
      <form id="key-form" onSubmit={submit} className="stack gap-16">
        <Field label="Name" htmlFor="k-name" hint="Where it’s used, e.g. “Checkout page” or “acme.com login”.">
          <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>

        <Field label="Allowed domains" hint="One per line. A domain also allows its subdomains. Leave empty to allow any site (not recommended in production).">
          <Textarea rows={3} className="mono" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={'example.com\nlocalhost'} />
        </Field>

        <div className="divider-label">Challenge</div>

        <Field label="Which CAPTCHA visitors see">
          <Segmented value={mode} onChange={setMode} options={[
            { value: 'adaptive', label: 'Adaptive' },
            { value: 'static', label: 'Always static' },
            { value: 'dynamic', label: 'Always motion' },
          ]} />
        </Field>
        {mode === 'adaptive' && (
          <Field label={<>Show the motion CAPTCHA when risk score ≥ <strong className="mono">{s.dynamicThreshold}</strong></>}
            hint="Lower = stricter. Visitors below the threshold get the easier static image.">
            <input type="range" min="1" max="100" value={s.dynamicThreshold} className="range"
              onChange={(e) => { const v = Number(e.target.value); setThreshold(v); setS({ ...s, dynamicThreshold: v }); }} />
          </Field>
        )}

        <div className="grid-2">
          <Field label="Characters">
            <div className="check-grid">
              <Checkbox checked={s.uppercase} onChange={set('uppercase')} label="A–Z" />
              <Checkbox checked={s.lowercase} onChange={set('lowercase')} label="a–z" />
              <Checkbox checked={s.numbers} onChange={set('numbers')} label="0–9" />
            </div>
          </Field>
          <div className="grid-2">
            <Field label="Length">
              <Select value={s.length} onChange={(e) => set('length')(Number(e.target.value))}>
                {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Expires after">
              <Select value={s.challengeTtl} onChange={(e) => set('challengeTtl')(Number(e.target.value))}>
                {[60, 120, 180, 300, 600].map((n) => <option key={n} value={n}>{n < 120 ? `${n} sec` : `${n / 60} min`}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        <Toggle checked={s.caseSensitive} onChange={set('caseSensitive')} label="Case-sensitive answers"
          description="Off: “Kx7pQ” and “kx7pq” are both accepted. Turn off if you allow both letter cases." />

        {error && <div className="alert alert-danger">{error}</div>}
      </form>
    </Modal>
  );
}

/** Shows site key + secret right after creation or rolling. The secret is never shown again. */
export function SecretModal({ data, onClose }) {
  const [ack, setAck] = useState(false);
  useEffect(() => setAck(false), [data]);
  const key = data?.key;
  return (
    <Modal open={!!data} onClose={onClose} dismissable={ack} width={600}
      title={data?.rolled ? 'New secret key' : 'Your keys are ready'}
      description={`“${key?.name}” — copy the secret now. It’s stored hashed and can’t be shown again.`}
      footer={<>
        <Link to="/integration" className="btn btn-ghost btn-md" onClick={onClose}><span>Integration guide</span></Link>
        <Button variant="primary" disabled={!ack} onClick={onClose}>Done</Button>
      </>}>
      {key && (
        <div className="stack gap-16">
          <Field label="Site key · public, goes in your HTML">
            <div className="secret-box plain"><code className="mono">{key.siteKey}</code><CopyButton value={key.siteKey} showLabel /></div>
          </Field>
          <Field label="Secret key · private, for your server only">
            <div className="secret-box"><code className="mono">{data.secret}</code><CopyButton value={data.secret} showLabel onCopied={() => setAck(true)} /></div>
          </Field>
          <div className="alert alert-warn">
            <AlertTriangle size={16} />
            <div>Put the secret in an environment variable on your server. Never ship it in front-end code or commit it to git.{data.rolled && ' The previous secret has stopped working.'}</div>
          </div>
          <pre className="code-snippet">{`<div class="motion-captcha" data-sitekey="${key.siteKey}"></div>
<script src="${PUBLIC_API_URL}/v1/widget.js" async defer></script>`}</pre>
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span className="check-box" />
            <span className="check-label">I’ve stored the secret key somewhere safe</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

export const NewKeyButton = (props) => <Button variant="primary" icon={Plus} {...props}>New API key</Button>;
