import { useEffect, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { api } from '../api';
import { MODELS } from '../config';
import { useProjects } from '../context/ProjectsContext';
import { useToast } from '../context/ToastContext';
import { Button, Checkbox, CopyButton, Field, Input, Modal, Select, Textarea } from './ui';

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-fA-F:]+(\/\d{1,3})?$/;
const lines = (s) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/** Create (key = null) or edit an API key's name and restrictions. */
export function KeyFormModal({ open, onClose, keyToEdit, defaultProjectId, onCreated, onSaved }) {
  const { projects, reload: reloadProjects } = useProjects();
  const toast = useToast();
  const editing = !!keyToEdit;
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newProject, setNewProject] = useState('');
  const [expires, setExpires] = useState('');
  const [models, setModels] = useState([]);
  const [ips, setIps] = useState('');
  const [referrers, setReferrers] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBusy(false);
    setNewProject('');
    if (keyToEdit) {
      setName(keyToEdit.name);
      setProjectId(keyToEdit.projectId);
      setModels(keyToEdit.restrictions?.models || []);
      setIps((keyToEdit.restrictions?.ips || []).join('\n'));
      setReferrers((keyToEdit.restrictions?.referrers || []).join('\n'));
    } else {
      setName('');
      setProjectId(defaultProjectId || projects[0]?.id || '__new');
      setExpires('');
      setModels([]);
      setIps('');
      setReferrers('');
    }
  }, [open, keyToEdit, defaultProjectId, projects]);

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = 'Give the key a name of at least 2 characters.';
    if (!editing && projectId === '__new' && newProject.trim().length < 2) e.project = 'Name the new project.';
    const badIp = lines(ips).find((x) => !IP_RE.test(x));
    if (badIp) e.ips = `“${badIp}” is not a valid IP or CIDR range.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const restrictions = { models, ips: lines(ips), referrers: lines(referrers) };
    try {
      if (editing) {
        const updated = await api.keys.update(keyToEdit.id, { name: name.trim(), restrictions });
        toast.success('Key updated');
        onSaved?.(updated);
        onClose();
      } else {
        let pid = projectId;
        if (pid === '__new') {
          const p = await api.projects.create({ name: newProject.trim() });
          pid = p.id;
          reloadProjects();
        }
        const res = await api.keys.create({
          name: name.trim(), projectId: pid, restrictions,
          expiresInDays: expires ? Number(expires) : null,
        });
        onCreated?.(res);
        onClose();
      }
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  const toggleModel = (id, on) => setModels((m) => (on ? [...m, id] : m.filter((x) => x !== id)));

  return (
    <Modal open={open} onClose={onClose} width={580}
      title={editing ? 'Edit API key' : 'Create API key'}
      description={editing ? 'Rename the key or tighten what it can do.' : 'Keys are scoped to one project and billed to it.'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="key-form" loading={busy}>{editing ? 'Save changes' : 'Create key'}</Button>
      </>}>
      <form id="key-form" onSubmit={submit} className="stack gap-16">
        <Field label="Name" htmlFor="k-name" error={errors.name} hint="Something that tells you where it’s used, e.g. backend-prod.">
          <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={64} />
        </Field>

        {!editing && (
          <div className="grid-2">
            <Field label="Project" error={errors.project}>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__new">+ New project…</option>
              </Select>
            </Field>
            <Field label="Expires">
              <Select value={expires} onChange={(e) => setExpires(e.target.value)}>
                <option value="">Never</option>
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="365">In 1 year</option>
              </Select>
            </Field>
          </div>
        )}
        {!editing && projectId === '__new' && (
          <Field label="New project name">
            <Input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="e.g. mobile-app" />
          </Field>
        )}

        <div className="divider-label">Restrictions <span className="faint">— optional</span></div>

        <Field label="Allowed models" hint="Leave all unchecked to allow every model.">
          <div className="check-grid">
            {MODELS.map((m) => (
              <Checkbox key={m.id} checked={models.includes(m.id)} onChange={(v) => toggleModel(m.id, v)} label={m.label} />
            ))}
          </div>
        </Field>
        <div className="grid-2">
          <Field label="IP allowlist" error={errors.ips} hint="One IP or CIDR per line.">
            <Textarea rows={3} value={ips} onChange={(e) => setIps(e.target.value)} placeholder={'203.0.113.4\n10.0.0.0/16'} className="mono" />
          </Field>
          <Field label="HTTP referrers" hint="For browser use. Wildcards allowed.">
            <Textarea rows={3} value={referrers} onChange={(e) => setReferrers(e.target.value)} placeholder="https://*.example.com/*" className="mono" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/** Shows a newly created / regenerated secret exactly once. */
export function SecretModal({ secret, keyName, onClose }) {
  const [ack, setAck] = useState(false);
  useEffect(() => setAck(false), [secret]);
  return (
    <Modal open={!!secret} onClose={onClose} dismissable={ack} width={560}
      title="Save your secret key"
      description={`This is the only time the full key for “${keyName}” will be shown.`}
      footer={<Button variant="primary" disabled={!ack} onClick={onClose}>Done</Button>}>
      <div className="stack gap-16">
        <div className="secret-box">
          <code className="mono">{secret}</code>
          <CopyButton value={secret || ''} showLabel label="Copy" onCopied={() => setAck(true)} />
        </div>
        <div className="alert alert-warn">
          <AlertTriangle size={16} />
          <div>Store it in a secrets manager or environment variable. Never commit it to source control or ship it in client-side code. If it leaks, regenerate it.</div>
        </div>
        <pre className="code-snippet">{`curl https://api.example.com/v1/chat/completions \\
  -H "Authorization: Bearer $KEYSTONE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"nova-flash","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        <label className="check">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span className="check-box" />
          <span className="check-label">I’ve stored this key somewhere safe</span>
        </label>
      </div>
    </Modal>
  );
}

export const NewKeyButton = (props) => <Button variant="primary" icon={Plus} {...props}>New API key</Button>;
