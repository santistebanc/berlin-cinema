import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Minus } from 'lucide-react';
import type { ReviewEvidence } from '../types/review';
import { comparisonStatus, comparisonValue, screeningSubtitles, sourcePageLabel } from '../utils/reviewComparison';

export default function ReviewEvidencePanel({ evidence, selectedCandidate }: { evidence: ReviewEvidence; selectedCandidate: string }) {
  const screening = evidence.layout === 'screening';
  const identity = evidence.layout === 'identity';
  const candidates = evidence.columns.filter(c => c.kind === 'candidate');
  const [compare, setCompare] = useState('');
  const [allCandidates, setAllCandidates] = useState(true);
  const [allFields, setAllFields] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(false);
  useEffect(() => { setCompare(''); }, [selectedCandidate]);
  const selected = selectedCandidate && candidates.some(c => c.id === `candidate:${selectedCandidate}`) ? `candidate:${selectedCandidate}` : '';
  const active = compare || selected || candidates.find(column => column.id.startsWith('geoapify-result:'))?.id || candidates[0]?.id;
  const hasSources = evidence.columns.some(c => c.kind === 'source');
  const columns = evidence.columns.filter(c => (c.kind !== 'current' || currentRecord || !hasSources) && (c.kind !== 'candidate' || allCandidates || c.id === active));
  const related = columns.some(c => c.records.some(r => r.related));
  const currentUrls = columns.find(c => c.kind === 'source')?.fields.sourceFilmUrl ?? [];
  return <>
    <p className="review-question">{evidence.question}</p>
    {evidence.columns.length > 0 ? <section className="review-comparison" aria-label="Source comparison">
      <div className="review-section-heading"><div><h3>{screening ? 'Compare the screening entries' : identity ? 'Compare the film records' : 'Compare the evidence'}</h3><p>{screening ? 'Each column is one entry, even when both come from the same source.' : identity ? 'The current entry and each existing record are shown side by side.' : 'Each source entry and candidate has its own column.'}</p></div>
        {candidates.length > 0 && !allCandidates && <label className="review-compare-picker">Compare candidate<select aria-label="Compare candidate" value={active ?? ''} onChange={event => { setCompare(event.target.value); }}>
          {candidates.map(column => <option key={column.id} value={column.id}>{column.label} · {comparisonValue(column.fields.title?.[0] || column.fields.name?.[0])}</option>)}
        </select></label>}</div>
      <div className="review-legend"><span><i className="review-key conflict" />Different values</span><span><i className="review-key missing" />{screening ? 'Unspecified detail' : 'Missing data'}</span>
        {identity && <span><i className="review-key same-page" />Same source page</span>}
        {candidates.length > 1 && <label><input type="checkbox" checked={allCandidates} onChange={e => setAllCandidates(e.target.checked)} />Compare all candidates</label>}
        {hasSources && evidence.columns.some(c => c.kind === 'current') && <label><input type="checkbox" checked={currentRecord} onChange={e => setCurrentRecord(e.target.checked)} />Show current record</label>}
        {evidence.fields.some(f => f.secondary) && <label><input type="checkbox" checked={allFields} onChange={e => setAllFields(e.target.checked)} />Show all fields</label>}</div>
      <div className="review-comparison-scroll" tabIndex={0} role="region" aria-label="Fields by source; scroll horizontally for more columns">
        <table className="review-comparison-table"><caption className="sr-only">Source values, missing fields and differences for this review item</caption><thead><tr><th scope="col">Field</th>
          {columns.map(column => <th scope="col" key={column.id}><strong>{column.label}</strong><span>{column.description || (screening && column.source ? column.source : column.kind === 'source' ? `${column.records.length} source record${column.records.length === 1 ? '' : 's'}` : column.kind === 'candidate' ? column.accepted ? 'Accepted database identity' : 'Candidate · not accepted' : 'Stored / selected values')}</span>
            {column.records.some(r => r.related) && <small>Includes unlinked context</small>}</th>)}</tr></thead>
          <tbody>{evidence.fields.filter(field => allFields || !field.secondary).map(field => {
            const status = comparisonStatus(field.key, columns);
            return <tr key={field.key} className={`comparison-row-${status}`}><th scope="row">{field.label}
              {status === 'conflict' && <small>Different values</small>}{status === 'different' && <small>Different source pages</small>}{status === 'missing' && <small>{screening ? 'Unspecified detail' : 'Missing data'}</small>}{identity && status === 'empty' && <small>Missing in all records</small>}{(screening || identity) && status === 'same' && <small>Identical</small>}</th>
              {columns.map(column => { const values = column.fields[field.key] ?? [];
                const missing = !values.length && !(screening && field.key === 'subtitleLanguage' && column.fields.subtitled?.[0] === false);
                const samePage = field.key === 'sourceFilmUrl' && values.some(value => currentUrls.includes(value)) && columns.some(other => other.id !== column.id && other.fields.sourceFilmUrl?.some(value => values.includes(value)));
                return <td key={column.id} className={missing ? 'comparison-cell-missing' : samePage ? 'comparison-cell-same-page' : status === 'conflict' ? 'comparison-cell-conflict' : ''}>
                  {screening && field.key === 'subtitleLanguage' ? screeningSubtitles(column) : values.length ? values.map((value, index) => <div className="review-cell-value" key={index}>{field.key === 'plot' ? <details><summary>Read plot</summary>{comparisonValue(value)}</details>
                    : field.key === 'sourceFilmUrl' && typeof value === 'string' && /^https?:\/\//i.test(value)
                      ? <a className="review-page-link" href={value} title={value} target="_blank" rel="noreferrer">{sourcePageLabel(value)} ↗</a> : comparisonValue(value, field.key)}</div>)
                    : <span title={column.kind === 'source' ? 'Not extracted from the source' : 'Not recorded for this identity'}><Minus size={12} aria-hidden="true" />{identity ? 'Missing' : column.kind === 'source' ? 'Not extracted' : column.kind === 'current' ? 'Not set' : 'Not supplied'}</span>}
                  {samePage && <small className="review-page-match">Same source page</small>}</td>;
              })}</tr>;
          })}</tbody></table>
      </div>
      {related && <p className="audit-note">Unlinked context consists of separate records with the same title/name. It is shown for comparison and has not been accepted as the same film or venue.</p>}
      <p className="audit-note">{screening ? 'An unspecified subtitle language is missing detail, not a conflicting language. OmU means subtitles with no language specified; OmenglU explicitly means English subtitles.' : 'A difference needs interpretation: formats and translated titles can legitimately differ. Missing data means it was absent from the extracted record; it may exist on the original page.'}</p>
      <details className="review-source-links"><summary>Open original sources and candidate pages</summary>{columns.filter(c => c.records.length).map(column => <div key={column.id}>
        <strong>{column.label}</strong>{column.records.map(record => { const href = record.url && /^https?:\/\//i.test(record.url) ? record.url : null;
          return <div key={record.id}>{href ? <a href={href} target="_blank" rel="noreferrer">{record.label || href} ↗</a> : <span>{record.label || 'No source URL recorded'}</span>}
            <small>{record.related ? 'Unlinked context · ' : ''}{record.observedAt ? `Observed ${new Date(record.observedAt).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' })}` : record.id}</small></div>;
        })}</div>)}</details>
    </section> : <p className="review-explanation">No field-level source comparison was recorded for this system issue. The reason and available actions are shown below.</p>}
    <section className="review-diagnosis" aria-label="Resolution explanation"><h3>{evidence.reasons.some(reason => ['compatible-descriptions', 'verified-venue-address'].includes(reason.code)) ? 'Resolved automatically' : 'Why automation stopped'}</h3>
      {evidence.reasons.map((reason, index) => <div className="review-stop-reason" key={`${reason.code}:${index}`}><AlertCircle size={16} aria-hidden="true" /><div><strong>{reason.title}</strong><p>{reason.detail}</p></div></div>)}
      <details className="review-rule"><summary>Automatic rule and checks</summary><p>{evidence.rule}</p>
        {evidence.checks.map(check => <div className={`review-rule-check ${check.status}`} key={check.label}>{check.status === 'passed' ? <Check size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}<strong>{check.label}</strong><span>{check.detail}</span></div>)}</details>
      {evidence.metrics.length > 0 && <div className="review-confidence"><h4>Recorded model assessment</h4>{evidence.metrics.map(metric => <div key={metric.question}>
        <strong>{evidence.options.find(option => option.targetId === metric.choice)?.label || metric.choice}</strong>
        <span>Confidence {(metric.confidence * 100).toFixed(1)}% · chosen-option probability {Number.isFinite(metric.probability) ? `${(metric.probability * 100).toFixed(1)}%` : 'not recorded'}
          {metric.threshold !== null ? ` · each must reach ${(metric.threshold * 100).toFixed(1)}%` : ' · threshold not recorded in this older run'}</span></div>)}</div>}
      <div className="review-impact"><strong>Current effect</strong><p>{evidence.impact}</p></div>
    </section>
  </>;
}
