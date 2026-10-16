import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Search, X } from 'lucide-react';
import Logo from '../components/Logo';
import type { AuditEntity, AuditIndex, AuditRun } from '../types/audit';
import { fieldHistory, latestChanges, recordEvents } from '../utils/auditHistory';
import { versionTagCatalog } from '../utils/versionTags';
import { VersionTagDetails, VersionTags } from '../components/VersionTags';
import '../admin.css';

const date = (value?: string | null) => value ? new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin',
}).format(new Date(value)) : 'Not recorded';
const label = (key: string) => key.startsWith('source.') ? `Extracted from ${key.slice(7)}`
  : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase());
const Json = ({ value }: { value: unknown }) => <pre className="audit-json">{JSON.stringify(value, null, 2) ?? 'Not recorded'}</pre>;
const Value = ({ value }: { value: unknown }) => value == null || value === '' ? <span className="audit-secondary">Empty</span>
  : typeof value === 'object' ? <Json value={value} /> : <span className="audit-value">{String(value)}</span>;

// Reports are immutable. Cache successful reads; fetch history when a record is opened.
const reportCache = new Map<string, Promise<AuditRun>>();
function loadRun(id: string): Promise<AuditRun> {
  if (!reportCache.has(id)) {
    const request = fetch(`${import.meta.env.BASE_URL}audit/runs/${encodeURIComponent(id)}.json`)
      .then(response => { if (!response.ok) throw new Error('A refresh report is unavailable.'); return response.json(); })
      .then((run: AuditRun) => {
        if (run.id !== id || !Array.isArray(run.changesList) || !Array.isArray(run.decisions)) throw new Error('Invalid refresh report.');
        return run;
      }).catch(error => { reportCache.delete(id); throw error; });
    reportCache.set(id, request);
  }
  return reportCache.get(id)!;
}

function RecordDetails({ entity, index, onSelect, onClose }: {
  entity: AuditEntity; index: AuditIndex; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(0);
  const [retry, setRetry] = useState(0);
  const [field, setField] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setRuns([]); setMissing(0);
    const relevantRuns = index.recordRuns ? new Set(index.recordRuns[entity.id] ?? []) : null;
    const queue = index.runs.filter(run => relevantRuns ? relevantRuns.has(run.id) : Date.parse(run.recordedAt) >= Date.parse(entity.firstRecordedAt));
    let cursor = 0;
    const reports: AuditRun[] = [];
    let failures = 0;
    const worker = async () => {
      while (!cancelled && cursor < queue.length) {
        const next = queue[cursor++];
        try { reports.push(await loadRun(next.id)); } catch { failures++; }
      }
    };
    Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker)).then(() => {
      if (!cancelled) { setRuns(reports); setMissing(failures); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [index, entity.id, entity.firstRecordedAt, retry]);
  const events = useMemo(() => recordEvents(runs, entity.id), [runs, entity.id]);
  const fields = [...new Set([...Object.keys(entity.data), 'listed', ...Object.keys(entity.sources).map(name => `source.${name}`),
    ...events.flatMap(event => Object.keys(event.change.fields))])];
  const history = fieldHistory(runs, entity.id, field);
  const value = (key: string) => key === 'listed' ? entity.listed : key.startsWith('source.') ? entity.sources[key.slice(7)]?.details : entity.data[key];
  const screenings = Object.values(index.entities).filter(record => record.kind === 'screening'
    && (entity.kind === 'movie' ? record.movieId === entity.id : record.cinemaId === entity.id))
    .sort((a, b) => `${a.data.date} ${a.data.time}`.localeCompare(`${b.data.date} ${b.data.time}`));
  const names = new Set([entity.label, entity.data.title, entity.data.originalTitle, ...(entity.data.sourceTitles ?? []),
    ...Object.values(entity.sources).flatMap(source => [source.firstName, source.lastName])].filter(Boolean));
  const evidence = runs.flatMap(run => run.decisions.filter(decision => decision.entity === entity.kind &&
    [decision.subject, decision.details.canonical, ...(Array.isArray(decision.details.titles) ? decision.details.titles : [])].some(name => names.has(name)))
    .map(decision => ({ ...decision, recordedAt: run.recordedAt, runId: run.id })));

  return <aside className="audit-record" aria-label={`Details of ${entity.label}`}>
    <div className="audit-record-heading"><span className="eyebrow">{entity.kind === 'screening' ? 'Viewing' : entity.kind} record</span><button type="button" onClick={onClose} aria-label="Close record details"><X size={18} /></button></div>
    <h2>{entity.label}</h2><p className="audit-secondary">{entity.listed ? 'Currently listed' : 'No longer listed'}</p>
    <dl className="audit-facts">
      <dt>First recorded</dt><dd>{date(entity.firstRecordedAt)}</dd>
      <dt>First observed</dt><dd>{date(entity.firstSeenAt)}<small>{entity.firstSources.join(', ') || 'Source unknown'}</small></dd>
      <dt>Last observed</dt><dd>{date(entity.lastSeenAt)}<small>{entity.lastSources.join(', ') || 'Source unknown'}</small></dd>
      <dt>Last changed</dt><dd>{date(entity.lastChangedAt)}</dd>
    </dl>
    {entity.movieId && <button className="audit-text-button" onClick={() => onSelect(entity.movieId!)}>Movie: {index.entities[entity.movieId]?.label}</button>}
    {entity.cinemaId && <button className="audit-text-button" onClick={() => onSelect(entity.cinemaId!)}>Cinema: {index.entities[entity.cinemaId]?.label}</button>}
    <h3>Details & value history</h3><p className="audit-secondary">Select a value to see when it changed.</p>
    <div className="audit-fields">{fields.map(key => <div className="audit-field" key={key}>
      <button className="audit-field-button" aria-expanded={field === key} onClick={() => setField(field === key ? '' : key)}><span>{label(key)}</span><span>{field === key ? 'Close history' : 'History'}</span></button>
      <Value value={value(key)} />
      {field === key && <div className="audit-history" aria-label={`${label(key)} history`}>
        {loading ? <p role="status">Loading history…</p> : <>
          {missing > 0 && <p role="alert">{missing} reports could not be loaded; this history is incomplete. <button className="audit-text-button" onClick={() => setRetry(retry + 1)}>Retry</button></p>}
          {history.length ? history.map(event => <div className="audit-history-event" key={event.runId}>
            <strong>{date(event.at)}</strong><small>{event.change.action === 'baseline' ? 'First recorded value · original change date unknown' : event.change.action === 'added' ? 'First added' : 'Value changed'} · {event.change.sources.join(', ') || 'Source not recorded'}</small>
            {event.change.action !== 'baseline' && event.change.action !== 'added' && <div><span className="audit-secondary">Before</span><Value value={event.before} /></div>}
            <div><span className="audit-secondary">{event.change.action === 'baseline' || event.change.action === 'added' ? 'Recorded value' : 'After'}</span><Value value={event.after} /></div>
          </div>) : <p>No value changes were recorded for this field. Earlier history is unavailable.</p>}
        </>}
      </div>}
    </div>)}</div>
    <h3>Source observations</h3>
    {Object.entries(entity.sources).map(([name, source]) => <details key={name} className="audit-detail"><summary>{name}</summary><dl className="audit-facts">
      <dt>First observed</dt><dd>{date(source.firstSeenAt)}</dd><dt>First name</dt><dd>{source.firstName}</dd><dt>First URL</dt><dd><Value value={source.firstUrl} /></dd>
      <dt>Last observed</dt><dd>{date(source.lastSeenAt)}</dd><dt>Last name</dt><dd>{source.lastName}</dd><dt>Last URL</dt><dd><Value value={source.lastUrl} /></dd>
    </dl></details>)}
    {entity.kind !== 'screening' && <><h3>Viewings ({screenings.filter(record => record.listed).length} currently listed)</h3><div className="audit-viewings">
      {screenings.length ? screenings.map(record => <button className="audit-viewing" key={record.id} onClick={() => onSelect(record.id)}>
        <strong>{record.data.date} · {record.data.time}</strong><span>{entity.kind === 'movie' ? record.data.cinema : record.data.movieTitle}</span><small>{(record.data.variants ?? []).join(', ')}{!record.listed && ' · No longer listed'} · Details & history →</small>
      </button>) : <p className="audit-secondary">No viewings recorded.</p>}
    </div></>}
    <details className="audit-detail"><summary>Related matching & API evidence ({evidence.length})</summary><p className="audit-note">Evidence is linked by the recorded source names and titles. Imported snapshots do not contain the original API searches or selection decisions.</p>
      {loading && <p role="status">Loading evidence…</p>}
      {evidence.map((decision, number) => <details className="audit-detail" key={`${decision.runId}-${number}`}><summary>{decision.provider} · {decision.action}<span>{date(decision.at ?? decision.recordedAt)}</span></summary><Json value={decision.details} /></details>)}
    </details>
    <p className="audit-note">History starts when tracking began. Earlier creation dates and unrecorded changes are unknown. “No longer listed” does not confirm cancellation.</p>
  </aside>;
}

function RecordSources({ record }: { record: AuditEntity }) {
  const sources = Object.entries(record.sources).sort(([a], [b]) => a.localeCompare(b));
  return sources.length ? <>{sources.map(([name, source]) => {
    const imported = name === 'published snapshot';
    const url = source.lastUrl || source.firstUrl;
    const title = imported ? 'Imported output; the original extraction source was not recorded.' : `Last observed ${date(source.lastSeenAt)}`;
    const sourceValue = source.lastName;
    const differs = sourceValue && sourceValue !== record.label;
    return <div className="audit-source-record" key={name}>{!imported && url && /^https?:\/\//i.test(url)
      ? <a className="audit-source" href={url} target="_blank" rel="noopener noreferrer" title={title}>{name} ↗</a>
      : <span className="audit-source" title={title}>{imported ? 'Published snapshot' : name}</span>}
      <span className="audit-source-value">{imported ? 'Snapshot value' : 'Extracted value'}: {sourceValue ? <q>{sourceValue}</q> : 'Not recorded'}</span>
      {differs && <small className="audit-source-difference">Differs from final {record.kind === 'movie' ? 'title' : 'name'}</small>}
      {source.firstName && source.firstName !== sourceValue && <small>First observed as: <q>{source.firstName}</q></small>}
      {imported && <small>Original source not recorded</small>}
    </div>;
  })}</> : <span className="audit-secondary">Not recorded</span>;
}

function RecordList({ title, records, viewingCounts, onSelect }: { title: string; records: AuditEntity[]; viewingCounts: Map<string, number>; onSelect: (id: string) => void }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [records]);
  const pageCount = Math.max(1, Math.ceil(records.length / 20));
  const current = Math.min(page, pageCount - 1);
  return <section className="audit-record-list"><h2>{title} <span>{records.length}</span></h2>
    {records.length === 0 ? <p className="audit-secondary">No matching records.</p> : <>
      <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th scope="col">{title === 'Movies' ? 'Final title' : 'Final name'}</th><th scope="col" title="Currently listed viewings, highest first">Viewings ↓</th><th scope="col">Sources & extracted values</th><th scope="col">First observed</th><th scope="col">Last updated</th></tr></thead><tbody>
        {records.slice(current * 20, (current + 1) * 20).map(record => <tr key={record.id}><td><button className="audit-record-link" onClick={() => onSelect(record.id)}>{record.label}</button><small>{record.kind === 'cinema' ? record.data.address : record.data.year}{!record.listed && ' · No longer listed'}</small></td><td>{(viewingCounts.get(record.id) ?? 0).toLocaleString()}</td><td><RecordSources record={record} /></td><td>{date(record.firstSeenAt)}<small>{record.firstSources.join(', ')}</small></td><td>{date(record.lastChangedAt)}</td></tr>)}
      </tbody></table></div>
      {pageCount > 1 && <div className="audit-pagination"><span>Page {current + 1} of {pageCount}</span><div><button disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><button disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Next</button></div></div>}
    </>}
  </section>;
}

export default function AdminPage() {
  const location = useLocation();
  const recordsPage = /\/admin\/(?:records|cinemas|movies|versions)\/?$/.test(location.pathname);
  const moviesPage = /\/admin\/movies\/?$/.test(location.pathname);
  const versionsPage = /\/admin\/versions\/?$/.test(location.pathname);
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<AuditIndex | null>(null);
  const [run, setRun] = useState<AuditRun | null>(null);
  const [error, setError] = useState('');
  const [runError, setRunError] = useState('');
  const [status, setStatus] = useState('listed');
  const query = params.get('q') ?? '';
  const selected = index?.entities[params.get('record') ?? ''];
  const updateParams = (values: Record<string, string | null>) => setParams(previous => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key);
    return next;
  }, { replace: true });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}audit/index.json`, { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('The audit dataset has not been published yet.'); return response.json(); })
      .then(data => { if (data.schemaVersion !== 1 || !data.entities || !Array.isArray(data.runs)) throw new Error('Unsupported audit dataset.'); setIndex(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!index) return;
    let cancelled = false;
    loadRun(index.latestRunId).then(report => { if (!cancelled) setRun(report); }).catch(reason => { if (!cancelled) setRunError(reason.message); });
    return () => { cancelled = true; };
  }, [index]);
  const viewingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entity of Object.values(index?.entities ?? {})) {
      if (entity.kind !== 'screening' || !entity.listed) continue;
      for (const id of [entity.movieId, entity.cinemaId]) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [index]);
  const records = useMemo(() => Object.values(index?.entities ?? {}).filter(entity => entity.kind !== 'screening'
    && (status === 'all' || entity.listed === (status === 'listed'))
    && `${entity.label} ${Object.keys(entity.sources).join(' ')} ${JSON.stringify(entity.data)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (viewingCounts.get(b.id) ?? 0) - (viewingCounts.get(a.id) ?? 0) || a.label.localeCompare(b.label)), [index, status, query, viewingCounts]);
  const cinemas = useMemo(() => records.filter(record => record.kind === 'cinema'), [records]);
  const movies = useMemo(() => records.filter(record => record.kind === 'movie'), [records]);
  const tags = useMemo(() => versionTagCatalog(Object.values(index?.entities ?? {}).filter(entity =>
    status === 'all' || entity.listed === (status === 'listed'))), [index, status]);
  const matchingTags = useMemo(() => tags.filter(tag => [tag.label, tag.category, tag.description, ...tag.labels, ...tag.sources]
    .join(' ').toLowerCase().includes(query.toLowerCase())), [tags, query]);
  const selectedTag = versionsPage ? tags.find(tag => tag.id === params.get('tag')) : undefined;
  const pageTitle = versionsPage ? 'Versions / Tags' : moviesPage ? 'Movies' : recordsPage ? 'Cinemas' : 'Latest changes';
  const changes = run ? latestChanges(run) : [];
  const selectRecord = (id: string) => updateParams({ record: id });
  if (/\/admin\/records\/?$/.test(location.pathname)) return <Navigate to={`/admin/cinemas${location.search}`} replace />;
  return <div className="audit-app">
    <Helmet><title>{`${pageTitle} — OV Berlin data audit`}</title><meta name="robots" content="noindex, follow" /></Helmet>
    <header className="audit-header"><div className="audit-brand"><Logo className="h-10 w-10" /><div><h1>OV Berlin <span>Data audit</span></h1><p>Public · Read-only</p></div></div><Link to="/"><ArrowLeft size={16} />Back to films</Link></header>
    <nav className="audit-tabs" aria-label="Audit pages"><Link to="/admin" aria-current={!recordsPage ? 'page' : undefined}>Latest changes</Link><Link to="/admin/cinemas" aria-current={recordsPage && !moviesPage && !versionsPage ? 'page' : undefined}>Cinemas</Link><Link to="/admin/movies" aria-current={moviesPage ? 'page' : undefined}>Movies</Link><Link to="/admin/versions" aria-current={versionsPage ? 'page' : undefined}>Versions / Tags</Link><Link to="/admin/review">Local review</Link></nav>
    {error ? <p className="audit-empty" role="alert">{error}</p> : !index ? <p className="audit-empty" role="status">Loading audit records…</p> : <>
      <div className="audit-page-heading"><h2>{recordsPage ? pageTitle : 'Latest run changes'}</h2><p className="audit-secondary">{versionsPage ? 'Open a tag to compare source labels and inspect related viewings.' : recordsPage ? 'Open a record for its details, viewings, and value history.' : `${date(index.runs.find(item => item.id === index.latestRunId)?.recordedAt)} · Compared with the preceding run`}</p></div>
      {recordsPage && <div className="audit-controls"><label className="audit-search"><Search size={16} /><input aria-label={versionsPage ? 'Search versions and tags' : 'Search audit records'} placeholder={versionsPage ? 'Search tags, meanings, source labels…' : 'Search cinemas, movies, sources…'} value={query} onChange={event => updateParams({ q: event.target.value })} /></label><select aria-label="Record status" value={status} onChange={event => setStatus(event.target.value)}><option value="listed">Currently listed</option><option value="all">All retained records</option><option value="not-listed">No longer listed</option></select></div>}
      <div className={`audit-workspace ${selected || selectedTag ? 'has-record' : ''}`}><div className="audit-results">
        {versionsPage ? <VersionTags tags={matchingTags} selectedId={selectedTag?.id} onSelect={id => updateParams({ tag: id, record: null })} />
          : recordsPage ? <RecordList title={moviesPage ? 'Movies' : 'Cinemas'} records={moviesPage ? movies : cinemas} viewingCounts={viewingCounts} onSelect={selectRecord} />
          : runError ? <p role="alert" className="audit-empty">{runError}</p> : !run ? <p className="audit-empty" role="status">Loading latest report…</p> : <>
            {run.status !== 'success' && <p className="audit-note" role="status">This run was {run.status}. {run.status === 'failed' ? 'The previous dataset was retained.' : 'Some source data was cached or unavailable.'}</p>}
            {changes.length === 0 ? <p className="audit-empty">{run.mode === 'baseline' ? 'Initial baseline recorded. There is no previous run to compare.' : 'No changes in the latest run.'}</p>
              : <div className="audit-change-list">{changes.map(change => <article className="audit-change" key={change.entityId}>
                <div><span className="audit-status">{change.action.split('-').join(' ')}</span><span className="audit-secondary">{change.kind === 'screening' ? 'Viewing' : label(change.kind)}</span></div>
                <button className="audit-record-link" onClick={() => selectRecord(change.entityId)}>{change.label}</button><p className="audit-secondary">{change.sources.join(', ') || 'Source not recorded'}</p>
                <details className="audit-detail"><summary>{Object.keys(change.fields).length} changed values</summary>{Object.entries(change.fields).map(([key, values]) => <div className="audit-diff" key={key}><strong>{label(key)}</strong>{change.action !== 'added' && <div><span className="audit-secondary">Before</span><Value value={values.before} /></div>}<div><span className="audit-secondary">{change.action === 'added' ? 'Added value' : 'After'}</span><Value value={values.after} /></div></div>)}</details>
              </article>)}</div>}
          </>}
      </div>{selected ? <RecordDetails key={selected.id} entity={selected} index={index} onSelect={selectRecord} onClose={() => updateParams({ record: null })} />
        : selectedTag && <VersionTagDetails tag={selectedTag} onRecord={selectRecord} onClose={() => updateParams({ tag: null })} />}</div>
      <p className="audit-note">History retained since {date(index.trackingStartedAt)}. Earlier changes are unknown.</p>
    </>}
  </div>;
}
