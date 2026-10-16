import 'dotenv/config';
import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { parseLabel, modalityTags } from '../api/pipeline/labels';
import { configuredModel, DecisionEngine } from '../api/pipeline/decision-model';
import { PipelineStore } from '../api/pipeline/store';
import { POLICY_VERSION } from '../api/pipeline/domain';
import { labelFixtures, decisionFixtures } from '../pipeline/evaluation-fixtures';

async function main() {
  const results: any[] = [];
  for (const fixture of labelFixtures) {
    const parsed = parseLabel(fixture.input);
    try { assert.equal(parsed.title, fixture.title); assert.equal(parsed.year, fixture.year);
      assert.deepEqual(modalityTags(parsed.modality).sort(), [...fixture.tags].sort()); results.push({ id: fixture.input, passed: true }); }
    catch { results.push({ id: fixture.input, passed: false, expected: fixture, actual: parsed }); }
  }
  const report: any = { at: new Date().toISOString(), policy: POLICY_VERSION,
    mode: process.argv.includes('--live') ? 'live-model-and-rules' : 'offline-rules-only',
    rules: { passed: results.filter(r => r.passed).length, total: results.length, results }, model: null,
    note: 'Fixtures include source-inspired and synthetic cases. A small passing fixture set does not establish production precision. Inspect accepted errors and review rate on representative held-out source data.' };
  if (process.argv.includes('--live')) {
    const model = configuredModel();
    if (!model) throw new Error('Live evaluation requires a configured decision provider. See .env.example; never put its key in VITE_* variables.');
    const store = new PipelineStore(); const owner = randomUUID();
    if (!store.acquireLease(owner)) throw new Error('Another pipeline writer is running');
    const before = store.spend();
    try {
      const engine = new DecisionEngine(store, model);
      const decisions = [];
      for (const fixture of decisionFixtures) {
        const start = Date.now(); const result = await engine.decide(fixture.request);
        const answer = result.response?.answers.resolution;
        decisions.push({ id: fixture.id, split: fixture.split, expected: fixture.expected, choice: answer?.choice ?? null,
          confidence: answer?.confidence ?? null, accepted: result.accepted, correct: answer?.choice === fixture.expected,
          unsafeAcceptance: result.accepted && answer?.choice === 'same' && fixture.expected !== 'same',
          elapsedMs: Date.now() - start, cached: result.cached, reason: result.reason });
      }
      report.model = { provider: model.provider, model: model.model, inputUsdPerMillion: model.inputUsdPerMillion,
        spentUsd: store.spend() - before, correct: decisions.filter(d => d.correct).length, total: decisions.length,
        unsafeAcceptances: decisions.filter(d => d.unsafeAcceptance).length,
        accepted: decisions.filter(d => d.accepted).length, decisions };
    } finally { store.flush(); store.releaseLease(owner); }
  }
  const directory = path.join(__dirname, '../data/evaluations'); fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `${report.at.replace(/[:.]/g, '-')}.json`); fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`Rules: ${report.rules.passed}/${report.rules.total} passed.`);
  console.log(report.model ? `${report.model.provider}/${report.model.model}: ${report.model.correct}/${report.model.total} correct; ${report.model.unsafeAcceptances} unsafe acceptances; $${report.model.spentUsd.toFixed(6)}.`
    : 'No live model was called. Use --live after configuring a provider.');
  console.log(`Report: ${filename}`);
  if (results.some(r => !r.passed) || report.model?.unsafeAcceptances > 0) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
