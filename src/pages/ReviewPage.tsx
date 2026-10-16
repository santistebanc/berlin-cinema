import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Check, RefreshCw, Search } from 'lucide-react';
import Logo from '../components/Logo';
import ReviewEvidencePanel from '../components/ReviewEvidencePanel';
import type { ReviewEvidence, ReviewOption } from '../types/review';
import '../admin.css';

type Issue = { id: string; subject: string; type: string; title: string; status: string; priority: number;
  fingerprint: string; details: any; firstSeenAt: string; lastSeenAt: string };
type Workspace = { revision: number; issues: Issue[]; corrections: any[]; jobs: any[]; snapshot: any;
  geocoding?: { provider: string; configured: boolean; creditsReserved: number; dailyLimit: number };
  model: { provider: string; model: string } | null; spendUsd: number; limitUsd: number; threshold: number };
async function request(url: string, body?: any) {
  const response = await fetch(url, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Local review server unavailable');
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Local request failed'); return result;
}
const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
const pretty = (value: any) => JSON.stringify(value, null, 2);

export default function ReviewPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('open'); const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState('');
  const [page, setPage] = useState(0);
  const [recordQuery, setRecordQuery] = useState(''); const [records, setRecords] = useState<any[]>([]);
  const refresh = useCallback(async () => {
    try { setWorkspace(await request('/api/review/state')); setError(''); }
    catch (failure) { setError((failure as Error).message); }
  }, []);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);
  const issues = useMemo(() => (workspace?.issues ?? []).filter(issue => (status === 'all' || issue.status === status)
    && `${issue.title} ${issue.type}`.toLowerCase().includes(query.toLowerCase())), [workspace, status, query]);
  const selected = workspace?.issues.find(issue => issue.id === selectedId);
  const processing = workspace?.jobs.some(job => ['queued', 'processing'].includes(job.status));
  const recalculate = async () => {
    setBusy(true); try { await request('/api/review/recalculate', {}); await refresh(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  return <div className="audit-app review-app">
    <Helmet><title>Local review — OV Berlin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
    <header className="audit-header"><div className="audit-brand"><Logo className="h-10 w-10" /><div>
      <h1>OV Berlin <span>Review workspace</span></h1><p>Local only · Changes are saved to your repository</p>
    </div></div><Link to="/"><ArrowLeft size={16} />Back to films</Link></header>
    <nav className="audit-tabs" aria-label="Data workspaces"><Link to="/admin">Public audit</Link><Link to="/admin/review" aria-current="page">Local review</Link></nav>
    {!workspace ? <div className="review-start"><span className="eyebrow">Your local workspace</span><h2>Resolve uncertain listings</h2>
      {error ? <><p>The local review server is not running at this address.</p><p>From the project directory, run <code>npm run admin</code>, then open <a href="http://127.0.0.1:3003/admin/review">127.0.0.1:3003/admin/review</a>.</p><button onClick={refresh}>Try again</button></>
        : <p role="status">Opening review workspace…</p>}</div> : <>
      <div className="review-summary"><div><span className="eyebrow">Evidence before decisions</span><h2>Review queue</h2><p className="audit-secondary">Compare original observations, preview a correction, then regenerate the listings.</p></div>
        <button className="review-button" disabled={busy || processing} onClick={recalculate}><RefreshCw size={15} />{processing ? 'Processing corrections…' : 'Recalculate listings'}</button></div>
      <div className="review-metrics"><div><span>Needs review</span><strong>{workspace.issues.filter(i => i.status === 'open').length}</strong></div>
        <div><span>Resolved with caution</span><strong>{workspace.issues.filter(i => i.status === 'caution').length}</strong></div>
        <div><span>Decision model</span><strong className="review-model">{workspace.model?.model ?? 'Not configured'}</strong><small>{workspace.model?.provider ?? 'Rules and manual corrections remain available'}</small></div>
        <div><span>Model spending this month</span><strong>${workspace.spendUsd.toFixed(4)}</strong><small>Conservative application limit: ${workspace.limitUsd.toFixed(2)}</small></div></div>
      <p className="review-geocoding-status">Location lookup: <strong>{workspace.geocoding?.configured ? 'Geoapify configured' : 'Geoapify not configured'}</strong>
        {workspace.geocoding?.configured && <> · {workspace.geocoding.creditsReserved} credits reserved today / {workspace.geocoding.dailyLimit} application limit</>}
        <span>Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></span></p>
      {error && <p className="review-message" role="alert">{error}</p>}
      {workspace.jobs[0] && <div className="review-job" role="status"><span className="audit-status">{workspace.jobs[0].status}</span>
        <span>{workspace.jobs[0].status === 'published' ? `Listings regenerated ${date(workspace.jobs[0].data.publishedAt)}`
          : workspace.jobs[0].status === 'failed' ? workspace.jobs[0].data.message : 'Your saved corrections are being applied.'}</span>
        {workspace.jobs[0].status === 'failed' && <button className="audit-text-button" onClick={recalculate}>Retry publication</button>}</div>}
      <div className="audit-controls"><label className="audit-search"><Search size={16} /><input aria-label="Search review issues" placeholder="Search films, venues or problems…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
        <select aria-label="Review issue status" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="open">Needs review</option><option value="caution">Resolved with caution</option><option value="resolved">Manually reviewed</option><option value="all">All issues</option></select></div>
      <details className="review-record-search"><summary>Find a film or venue to inspect and correct its fields</summary>
        <form className="review-inline" onSubmit={async event => { event.preventDefault(); try { setRecords(await request(`/api/review/entities?q=${encodeURIComponent(recordQuery)}`)); } catch (failure) { setError((failure as Error).message); } }}>
          <input aria-label="Find a record" placeholder="Film or venue name" value={recordQuery} onChange={e => setRecordQuery(e.target.value)} /><button className="review-button">Find records</button></form>
        <div className="review-record-results">{records.map(record => <button key={record.id} className="review-button" onClick={async () => {
          try { const result = await request('/api/review/open-record', { entityId: record.id }); await refresh(); setSelectedId(result.issueId); }
          catch (failure) { setError((failure as Error).message); }
        }}>{record.name} · {record.kind}{record.data.year ? ` · ${record.data.year}` : ''}</button>)}</div>
      </details>
      <div className={`review-workspace ${selected ? 'has-review' : ''}`}><div className="review-list">
        {issues.slice(page * 30, page * 30 + 30).map(issue => <button key={issue.id} className="review-issue" aria-pressed={selectedId === issue.id} onClick={() => setSelectedId(issue.id)}>
          <span className="review-issue-top"><span className="audit-status">{issue.type.replace(/-/g, ' ')}</span><span className="audit-secondary">{issue.priority >= 85 ? 'High impact' : 'Review'}</span></span>
          <strong>{issue.title}</strong><span className="audit-secondary">Last observed {date(issue.lastSeenAt)}</span>
        </button>)}
        {!issues.length && <p className="audit-empty">No issues match this view.</p>}
        {issues.length > 30 && <div className="audit-pagination"><span>{page * 30 + 1}–{Math.min(issues.length, page * 30 + 30)} of {issues.length}</span><div>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={(page + 1) * 30 >= issues.length} onClick={() => setPage(p => p + 1)}>Next</button></div></div>}
      </div>{selected && <IssueEditor key={selected.id + selected.fingerprint} issue={selected} workspace={workspace} onRefresh={refresh} onClose={() => setSelectedId('')} />}</div>
      <details className="review-corrections"><summary>Saved corrections ({workspace.corrections.filter(c => !c.revokedAt).length} active)</summary>
        <p className="audit-note">Commit and push <code>pipeline/state.json</code> to apply local decisions to scheduled refreshes. Undoing a correction recalculates the listings.</p>
        {workspace.corrections.slice(0, 50).map(correction => <div key={correction.id} className="review-correction"><div><strong>{correction.action}</strong><p>{correction.reason}</p><small>{date(correction.createdAt)}{correction.revokedAt ? ' · Undone' : ''}</small></div>
          {!correction.revokedAt && <button className="review-button" disabled={processing} onClick={async () => {
            try { await request('/api/review/revoke', { overrideIds: [correction.id], revision: workspace.revision }); await refresh(); }
            catch (failure) { setError((failure as Error).message); }
          }}>Undo</button>}</div>)}</details>
    </>}
  </div>;
}

function IssueEditor({ issue, workspace, onRefresh, onClose }: { issue: Issue; workspace: Workspace; onRefresh: () => Promise<void>; onClose: () => void }) {
  const candidates = issue.details.candidates ?? [];
  const observation = issue.details.observation;
  const [action, setAction] = useState(issue.subject.startsWith('metadata:') ? 'metadata' : issue.subject.startsWith('slot:') ? 'screening'
    : issue.subject.startsWith('entity:') ? 'fields' : candidates.length && observation ? 'link' : observation?.kind === 'listing' ? 'parse' : 'dismiss');
  const [target, setTarget] = useState(''); const [reason, setReason] = useState(''); const [values, setValues] = useState('');
  const [preview, setPreview] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [extraCandidates, setExtraCandidates] = useState<any[]>([]); const [search, setSearch] = useState('');
  const [evidence, setEvidence] = useState<ReviewEvidence | null>(null); const [evidenceError, setEvidenceError] = useState('');
  const [optionId, setOptionId] = useState(''); const [customId, setCustomId] = useState('');
  const [field, setField] = useState(issue.details.entity?.kind === 'venue' || observation?.kind === 'venue' ? 'insideBerlin' : 'plot');
  const choices = [...new Map([...candidates, ...extraCandidates].map((c: any) => [c.id, c])).values()];
  let edited: any = {}; try { edited = JSON.parse(values || '{}'); } catch { /* Advanced editing reports invalid JSON on preview. */ }
  const edit = (patch: any) => { setValues(pretty({ ...edited, ...patch })); setPreview(null); };
  useEffect(() => {
    let active = true;
    request(`/api/review/issue?id=${encodeURIComponent(issue.id)}`).then(result => { if (active) { setEvidence(result); setEvidenceError(''); } })
      .catch(failure => { if (active) setEvidenceError(failure.message); });
    return () => { active = false; };
  }, [issue.id, issue.fingerprint, issue.lastSeenAt, workspace.revision]);
  useEffect(() => {
    setPreview(null);
    if (optionId !== 'custom') return;
    if (action === 'parse') setValues(pretty(issue.details.parsed ?? { title: observation?.data?.rawTitle ?? observation?.data?.title ?? '',
      kind: 'film', year: Number(observation?.data?.year) || null, alternateTitles: [],
      modality: { version: 'unknown', spokenLanguage: null, subtitleLanguage: null, subtitled: null, projection: [], edition: null, context: [], unknown: [] } }));
    else if (action === 'screening') setValues(pretty({ mode: 'same', modality: issue.details.alternatives?.[0] ?? {} }));
    else if (action === 'fields') setValues(pretty({ [field]: field === 'insideBerlin' ? true : null }));
  }, [action, issue.id, optionId]);
  const selectOption = (option: ReviewOption) => {
    setOptionId(option.id); setAction(option.action); setTarget(option.targetId ?? '');
    if (option.values) setValues(pretty(option.values)); setPreview(null); setError('');
  };
  const command = () => ({ issueId: issue.id, action, reason: reason.trim() || (optionId === 'custom' ? 'Administrator supplied a custom resolution after reviewing the compared evidence.'
    : `Administrator reviewed the compared evidence and selected: ${evidence?.options.find(option => option.id === optionId)?.label || action}.`), revision: workspace.revision, evidenceFingerprint: issue.fingerprint, targetId: target,
    values: action === 'metadata' ? { tmdbId: target === 'none' ? null : Number(target) } : ['parse', 'screening', 'fields'].includes(action) ? JSON.parse(values) : undefined });
  const submit = async (apply: boolean) => {
    setBusy(true); setError('');
    try {
      const result = await request(`/api/review/${apply ? 'apply' : 'preview'}`, command());
      if (apply) { setPreview(null); await onRefresh(); } else setPreview(result);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  return <aside className="audit-record review-editor" aria-label="Resolve review issue"><div className="audit-record-heading"><span className="eyebrow">Compare · Decide · Preview</span><button aria-label="Close issue" onClick={onClose}>×</button></div>
    <h2>{issue.title}</h2><p className="audit-secondary">{issue.status === 'resolved' ? 'Manually reviewed · you can revise this decision' : issue.status === 'caution' ? 'Resolved automatically · inspection requested' : 'Awaiting a resolution'}</p>
    {issue.details.resolution && <p className="review-explanation">{issue.details.resolution}</p>}
    {evidence ? <ReviewEvidencePanel evidence={evidence} selectedCandidate={target} /> : <p className="review-message" role={evidenceError ? 'alert' : 'status'}>{evidenceError || 'Loading source comparison…'}</p>}
    <form className="review-form" onSubmit={event => { event.preventDefault(); submit(false); }}>
      <fieldset className="review-resolution-options"><legend>Choose a resolution</legend><p>Select the result supported by the evidence. You will preview it before saving.</p>
        {evidence?.options.map(option => <label className={`review-resolution-option ${optionId === option.id ? 'is-selected' : ''}`} key={option.id}>
          <input type="radio" aria-label={option.label} name={`resolution-${issue.id}`} checked={optionId === option.id} onChange={() => selectOption(option)} />
          <span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
        <label className={`review-resolution-option ${optionId === 'custom' ? 'is-selected' : ''}`}><input type="radio" aria-label="Custom resolution" name={`resolution-${issue.id}`} checked={optionId === 'custom'} onChange={() => {
          setOptionId('custom'); setAction(issue.subject.startsWith('metadata:') ? 'metadata' : issue.subject.startsWith('slot:') ? 'screening'
            : observation?.kind === 'listing' ? 'parse' : issue.details.entityId || issue.subject.startsWith('entity:') ? 'fields' : observation ? 'link' : 'dismiss'); setPreview(null);
        }} />
          <span><strong>Custom resolution</strong><small>Find a different identity, correct individual values, or supply your own interpretation.</small></span></label>
      </fieldset>
      {optionId === 'custom' && <div className="review-custom-resolution"><h4>Your custom resolution</h4><label>Action<select value={action} onChange={e => { setAction(e.target.value); setPreview(null); }}>
        {observation && <><option value="link">Link to an identity</option>{observation.kind === 'listing' && <><option value="separate">Keep as a separate film/programme</option><option value="parse">Correct extracted title/properties</option></>}</>}
        {issue.subject.startsWith('metadata:') && <option value="metadata">Choose metadata identity</option>}
        {issue.subject.startsWith('slot:') && <option value="screening">Resolve screening descriptions</option>}
        {(issue.details.entityId || issue.subject.startsWith('entity:')) && <option value="fields">Correct selected fields</option>}
        <option value="dismiss">Mark reviewed without changing data</option></select></label>
      {action === 'link' && <label>Find another identity<div className="review-inline"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Film or venue name" /><button type="button" className="review-button" onClick={async () => {
        try { setExtraCandidates(await request(`/api/review/entities?q=${encodeURIComponent(search)}&kind=${observation?.kind === 'venue' ? 'venue' : issue.details.parsed?.kind || 'film'}`)); }
        catch (failure) { setError((failure as Error).message); }
      }}>Find</button></div></label>}
      {['link', 'metadata'].includes(action) && <label>Selected identity<select required value={target} onChange={e => { setTarget(e.target.value); setPreview(null); }}>
        <option value="">Choose a candidate…</option>{choices.map((c: any) => <option value={c.id} key={c.id}>{c.name || c.title} · {c.year || c.data?.year || c.id}</option>)}
        {action === 'metadata' && <option value="none">None of these — keep source information</option>}</select></label>}
      {action === 'metadata' && <label>Use a different TMDb film<div className="review-inline"><input value={customId} placeholder="TMDb movie ID or URL" onChange={e => setCustomId(e.target.value)} />
        <button type="button" className="review-button" disabled={busy || !customId.trim()} onClick={async () => {
          setBusy(true); setError('');
          try {
            const result = await request('/api/review/metadata-candidate', { issueId: issue.id, revision: workspace.revision, evidenceFingerprint: issue.fingerprint, tmdbId: customId });
            setExtraCandidates(previous => [...previous.filter(c => c.id !== result.candidate.id), result.candidate]); setEvidence(result.evidence);
            setTarget(String(result.candidate.id)); setPreview(null); await onRefresh();
          } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
        }}>Verify film</button></div><small>The film is retrieved from TMDb before it can be selected. Verification does not accept the match.</small></label>}
      {action === 'parse' && <>
        <label>Title<input required value={edited.title ?? ''} onChange={e => edit({ title: e.target.value })} /></label>
        <div className="review-form-grid"><label>Release year<input type="number" min="1800" max="2200" value={edited.year ?? ''} onChange={e => edit({ year: e.target.value ? Number(e.target.value) : null })} /></label>
          <label>Listing type<select value={edited.kind ?? 'film'} onChange={e => edit({ kind: e.target.value })}><option value="film">Film</option><option value="programme">Programme / performance</option></select></label></div>
        <label>Alternate titles, one per line<textarea rows={2} value={(edited.alternateTitles ?? []).join('\n')} onChange={e => edit({ alternateTitles: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) })} /></label>
        <ModalityEditor value={edited.modality} onChange={modality => edit({ modality })} />
      </>}
      {action === 'screening' && <>
        <p>The same film, cinema, date and time identify one viewing. You can correct its description below.</p>
        <ModalityEditor value={edited.modality} onChange={modality => edit({ modality })} />
      </>}
      {action === 'fields' && <>
        <label>Field<select value={field} onChange={e => { setField(e.target.value); setValues(pretty({ [e.target.value]: e.target.value === 'insideBerlin' ? true : null })); setPreview(null); }}>
          {['insideBerlin', 'name', 'address', 'websiteUrl', 'plot', 'posterUrl', 'backdropUrl', 'director', 'year', 'runtime', 'country', 'tagline', 'originalTitle', 'tmdbTitle', 'trailerUrl'].map(key => <option key={key} value={key}>{key === 'insideBerlin' ? 'Located within Berlin city limits' : key.replace(/([A-Z])/g, ' $1')}</option>)}
        </select></label>
        {field === 'insideBerlin' ? <label>Location decision<select value={edited.insideBerlin === true ? 'yes' : 'no'} onChange={e => edit({ insideBerlin: e.target.value === 'yes' })}><option value="yes">Inside Berlin</option><option value="no">Outside Berlin — exclude listings</option></select></label>
          : <label>Corrected value{['year', 'runtime'].includes(field) ? <input type="number" value={edited[field] ?? ''} onChange={e => edit({ [field]: e.target.value ? Number(e.target.value) : null })} />
            : <textarea rows={field === 'plot' ? 5 : 2} value={edited[field] ?? ''} onChange={e => edit({ [field]: e.target.value || null })} />}</label>}
      </>}
      {['parse', 'screening', 'fields'].includes(action) && <details className="audit-detail"><summary>Advanced: edit structured values</summary><label>Corrected values<textarea rows={10} spellCheck={false} value={values} onChange={e => { setValues(e.target.value); setPreview(null); }} /></label></details>}
      </div>}
      <label>Review note <span className="audit-secondary">Optional · add supporting evidence or explain a custom decision</span><textarea rows={2} value={reason} placeholder="For example: source page confirms the director and release year." onChange={e => { setReason(e.target.value); setPreview(null); }} /></label>
      {error && <p role="alert" className="review-message">{error}</p>}
      {preview && <div className="review-preview"><strong>Preview</strong><p>{preview.description}</p><small>Saved locally when you apply. Affected listings regenerate automatically, and the correction can be undone.</small>
        {preview.patch && <details><summary>Exact saved values</summary><pre className="audit-json">{pretty(preview.patch)}</pre></details>}</div>}
      <div className="review-actions"><button className="review-button" disabled={busy || !optionId} type="submit">Preview change</button>
        {preview && <button className="review-button primary" type="button" disabled={busy || workspace.jobs.some(job => ['queued', 'processing'].includes(job.status))} onClick={() => submit(true)}><Check size={15} />Apply and regenerate</button>}</div>
    </form>
    <details className="audit-detail review-technical"><summary>Technical evidence and recorded decision</summary><p className="audit-note">{issue.subject}</p><pre className="audit-json">{pretty(issue.details)}</pre></details>
  </aside>;
}

function ModalityEditor({ value, onChange }: { value: any; onChange: (value: any) => void }) {
  const modality = { version: 'unknown', spokenLanguage: null, subtitleLanguage: null, subtitled: null,
    projection: [], edition: null, context: [], unknown: [], ...value };
  const update = (patch: any) => onChange({ ...modality, ...patch });
  return <fieldset className="review-modality"><legend>Screening properties</legend>
    <div className="review-form-grid"><label>Version<select value={modality.version} onChange={e => update({ version: e.target.value })}>
      <option value="unknown">Unspecified</option><option value="original">Original version</option><option value="dubbed">Dubbed</option></select></label>
      <label>Subtitles<select value={modality.subtitled === null ? '' : String(modality.subtitled)} onChange={e => update({ subtitled: e.target.value === '' ? null : e.target.value === 'true' })}>
        <option value="">Unspecified</option><option value="true">Subtitled</option><option value="false">No subtitles</option></select></label></div>
    <div className="review-form-grid">{(['spokenLanguage', 'subtitleLanguage'] as const).map(key => <label key={key}>{key === 'spokenLanguage' ? 'Spoken language' : 'Subtitle language'}
      <select value={modality[key] ?? ''} onChange={e => update({ [key]: e.target.value || null })}>
        <option value="">Unspecified</option>{Object.entries({ en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', tr: 'Turkish', ar: 'Arabic', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', hi: 'Hindi', pl: 'Polish', ru: 'Russian', pt: 'Portuguese', uk: 'Ukrainian' }).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select></label>)}</div>
    <label>Projection formats, separated by commas<input value={modality.projection.join(', ')} placeholder="IMAX, 3D, 70 mm…" onChange={e => update({ projection: e.target.value.split(',').map(v => v.trim()) })} onBlur={() => update({ projection: modality.projection.filter(Boolean) })} /></label>
    <label>Edition or cut<input value={modality.edition ?? ''} placeholder="Unspecified" onChange={e => update({ edition: e.target.value || null })} /></label>
    <p className="audit-secondary">Use only languages established by the source. “Original version” and “OmU” do not establish English audio or subtitles.</p>
  </fieldset>;
}
