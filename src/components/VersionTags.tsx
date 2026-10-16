import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { VersionTag } from '../utils/versionTags';

export function VersionTags({ tags, selectedId, onSelect }: { tags: VersionTag[]; selectedId?: string | null; onSelect: (id: string) => void }) {
  return <section className="audit-record-list"><h2>Versions / Tags <span>{tags.length}</span></h2>
    <p className="audit-note audit-tags-intro">Equivalent spellings share one tag. OmU does not specify a subtitle language; OmeU explicitly means English subtitles. Language and projection tags are separate, so one viewing can have both.</p>
    {!tags.length ? <p className="audit-empty">No matching versions or tags.</p> : <div className="audit-table-scroll"><table className="audit-table audit-tags-table">
      <thead><tr><th scope="col">Canonical tag</th><th scope="col">Meaning</th><th scope="col">Confirmed viewings ↓</th><th scope="col">Source-only viewings</th><th scope="col">Source labels</th></tr></thead>
      <tbody>{tags.map(tag => <tr key={tag.id} className={tag.id === selectedId ? 'audit-tag-selected' : undefined}>
        <td><button className="audit-record-link" aria-pressed={tag.id === selectedId} onClick={() => onSelect(tag.id)}>{tag.label}</button><small>{tag.category}</small></td>
        <td>{tag.description}</td><td>{tag.confirmed.length.toLocaleString()}</td><td>{tag.sourceOnly.length.toLocaleString()}</td>
        <td>{tag.labels.join(' · ') || 'No source label recorded'}<small>{tag.sources.join(', ') || 'Resolved description only'}</small></td>
      </tr>)}</tbody>
    </table></div>}
    <p className="audit-note">Each viewing counts once per tag, even when several sources report it. Retained source-only labels can be older, less specific, conflicting or unrecognized; they are not promoted to confirmed tags.</p>
  </section>;
}

export function VersionTagDetails({ tag, onRecord, onClose }: { tag: VersionTag; onRecord: (id: string) => void; onClose: () => void }) {
  const [limit, setLimit] = useState(25);
  useEffect(() => setLimit(25), [tag.id]);
  const confirmedIds = useMemo(() => new Set(tag.confirmed.map(record => record.id)), [tag]);
  const viewings = useMemo(() => [...new Map([...tag.confirmed, ...tag.reported].map(record => [record.id, record])).values()]
    .sort((a, b) => `${a.data.date} ${a.data.time}`.localeCompare(`${b.data.date} ${b.data.time}`)), [tag]);
  return <aside className="audit-record" aria-label={`Details of tag ${tag.label}`}>
    <div className="audit-record-heading"><span className="eyebrow">{tag.category}</span><button onClick={onClose} aria-label="Close tag details"><X size={18} /></button></div>
    <h2>{tag.label}</h2><p className="audit-secondary">{tag.description}</p>
    <dl className="audit-facts"><dt>Confirmed viewings</dt><dd>{tag.confirmed.length.toLocaleString()}</dd><dt>Source-only</dt><dd>{tag.sourceOnly.length.toLocaleString()}</dd>
      <dt>Movies</dt><dd>{tag.movieCount}</dd><dt>Cinemas</dt><dd>{tag.cinemaCount}</dd></dl>
    <h3>Recorded labels</h3><p className="audit-secondary">{tag.labels.join(' · ') || 'No raw label recorded'}</p>
    <h3>Sources</h3><p className="audit-secondary">{tag.sources.join(', ') || 'Resolved description only'}</p>
    <h3>Related viewings ({viewings.length})</h3><div className="audit-viewings">{viewings.slice(0, limit).map(record => <button className="audit-viewing" key={record.id} onClick={() => onRecord(record.id)}>
      <strong>{record.data.movieTitle}</strong><span>{record.data.cinema} · {record.data.date} {record.data.time}</span>
      <small>{confirmedIds.has(record.id) ? 'Confirmed tag' : 'Source description only'}{!record.listed && ' · No longer listed'} · Details & history →</small>
    </button>)}</div>
    {viewings.length > limit && <button className="audit-text-button" onClick={() => setLimit(limit + 25)}>Show more viewings</button>}
  </aside>;
}
