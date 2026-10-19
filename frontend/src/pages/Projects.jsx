import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, KeyRound, Pencil, Trash2, CreditCard, BarChart3, Gauge, Copy } from 'lucide-react';
import { api } from '../api';
import { TIERS } from '../config';
import { useProjects } from '../context/ProjectsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtDate, fmtMoney, copyText } from '../lib/format';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, LoadingBlock, Menu, Modal, PageHeader,
} from '../components/ui';

function ProjectNameModal({ open, onClose, project, onDone }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(project?.name || ''); setErr(''); setBusy(false); } }, [open, project]);
  return (
    <Modal open={open} onClose={onClose} title={project ? 'Rename project' : 'New project'} width={440}
      description={project ? undefined : 'Projects group keys, usage, limits and billing.'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="proj-form" loading={busy}>{project ? 'Save' : 'Create project'}</Button>
      </>}>
      <form id="proj-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim().length < 2) { setErr('Use at least 2 characters.'); return; }
          setBusy(true);
          try {
            const p = project ? await api.projects.update(project.id, { name: name.trim() }) : await api.projects.create({ name: name.trim() });
            toast.success(project ? 'Project renamed' : 'Project created');
            onDone(p);
            onClose();
          } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
        }}>
        <Field label="Project name" error={err}>
          <Input autoFocus value={name} placeholder="e.g. mobile-app" onChange={(e) => setName(e.target.value)} maxLength={48} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const toast = useToast();
  const { projects, loading, error, reload } = useProjects();
  const [modal, setModal] = useState(null); // {project|null}
  const [confirm, setConfirm] = useState(null);
  const spend = useAsync(() => api.spend.summary(), [projects.length]);
  const spendById = Object.fromEntries((spend.data?.byProject || []).map((s) => [s.projectId, s.monthToDate]));

  return (
    <div className="page">
      <PageHeader eyebrow="Build" title="Projects"
        description="Each project has its own keys, rate-limit tier, spend cap and billing status."
        actions={<Button variant="primary" icon={Plus} onClick={() => setModal({ project: null })}>New project</Button>} />

      {loading ? <Card><LoadingBlock /></Card>
        : error ? <Card><ErrorState error={error} onRetry={reload} /></Card>
        : projects.length === 0 ? (
          <Card><EmptyState icon={FolderKanban} title="No projects yet"
            action={<Button variant="primary" icon={Plus} onClick={() => setModal({ project: null })}>Create project</Button>}>
            Create a project to start issuing keys.
          </EmptyState></Card>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <Card key={p.id} className="project-card">
                <div className="row between">
                  <div className="project-icon"><FolderKanban size={18} /></div>
                  <Menu items={[
                    { label: 'Copy project ID', icon: Copy, onClick: async () => { await copyText(p.ref); toast.success('Project ID copied'); } },
                    { label: 'Rename', icon: Pencil, onClick: () => setModal({ project: p }) },
                    { label: 'View usage', icon: BarChart3, onClick: () => navigate(`/usage?projectId=${p.id}`) },
                    { label: 'Rate limits', icon: Gauge, onClick: () => navigate(`/rate-limits?projectId=${p.id}`) },
                    'divider',
                    { label: 'Delete project', icon: Trash2, danger: true, onClick: () => setConfirm(p) },
                  ]} />
                </div>
                <h3 className="project-name">{p.name}</h3>
                <div className="mono xsmall faint">{p.ref}</div>
                <div className="row gap-6 wrap" style={{ marginTop: 12 }}>
                  <Badge tone={p.billingEnabled ? 'info' : 'neutral'}>{TIERS[p.tier]?.label}</Badge>
                  {p.billingEnabled ? <Badge tone="ok" dot>Billing active</Badge> : <Badge tone="warn" dot>No billing</Badge>}
                </div>
                <dl className="kv">
                  <div><dt>Active keys</dt><dd>{p.keyCount}</dd></div>
                  <div><dt>Spend this month</dt><dd>{spend.loading ? '…' : fmtMoney(spendById[p.id] || 0)}</dd></div>
                  <div><dt>Spend cap</dt><dd>{p.spendCap ? fmtMoney(p.spendCap) : 'None'}</dd></div>
                  <div><dt>Created</dt><dd>{fmtDate(p.createdAt)}</dd></div>
                </dl>
                <div className="row gap-8 project-actions">
                  <Button size="sm" icon={KeyRound} onClick={() => navigate('/keys')}>Keys</Button>
                  {!p.billingEnabled && <Button size="sm" variant="primary" icon={CreditCard} onClick={() => navigate(`/billing?projectId=${p.id}`)}>Set up billing</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}

      <ProjectNameModal open={!!modal} project={modal?.project} onClose={() => setModal(null)} onDone={() => reload()} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title="Delete project?"
        confirmLabel="Delete project" requireText={confirm?.name}
        body={<>All keys, budgets and logs in <strong>{confirm?.name}</strong> are removed. Revoke active keys first.</>}
        onConfirm={async () => {
          try { await api.projects.remove(confirm.id); toast.success('Project deleted'); reload(); } catch (e) { toast.error(e); throw e; }
        }} />
    </div>
  );
}
