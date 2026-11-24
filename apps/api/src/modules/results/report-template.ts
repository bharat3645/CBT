import { RANK_LABEL, type ResultView } from '@cbt/contracts/results';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmtTime = (sec: number) => `${Math.floor(sec / 60)}m ${sec % 60}s`;

/** Server-side report (SRS 10.4). All dynamic text is escaped. Print-friendly, no external assets. */
export function renderReportHtml(r: ResultView, opts: { studentName?: string; instituteName?: string; testName?: string } = {}): string {
  const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : 0;
  const bar = (v: number) => `<div class="bar"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></div>`;
  const sections = r.sections.map((s) => `<tr><td>${esc(s.sectionId)}</td><td>${s.score} / ${s.maxScore}</td><td>${s.correct}</td><td>${s.incorrect + s.partial}</td><td>${s.unanswered}</td></tr>`).join('');
  const topics = r.topics.map((t) => `<tr><td>${esc(t.topicName ?? t.topicId ?? 'Untagged')}</td><td>${t.correct}/${t.attempted}</td><td>${bar(t.accuracy)}</td><td>${t.accuracy}%</td></tr>`).join('');
  const ranks = r.ranks.map((k) => `<li>${esc(k.scope)} rank <b>${k.rank}</b> of ${k.participants}${k.percentile !== null ? ` &middot; percentile ${k.percentile}` : ''}</li>`).join('');
  const history = r.previousTests.map((p) => `<tr><td>${esc(p.title ?? p.testId)}</td><td>${esc(p.at.slice(0, 10))}</td><td>${p.scorePct}%</td></tr>`).join('');
  const recs = r.recommendations.map((x) => `<li><b>${esc(x.topicName)}</b>: ${esc(x.reason)}<br><i>${esc(x.next)}</i></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Result report</title><style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
.muted{color:#666}.kpis{display:flex;gap:12px;margin:14px 0}.kpi{flex:1;border:1px solid #ddd;border-radius:6px;padding:10px}
.kpi b{display:block;font-size:20px}table{width:100%;border-collapse:collapse}td,th{padding:5px 6px;border-bottom:1px solid #eee;text-align:left}
.bar{background:#eee;height:8px;border-radius:4px;width:140px}.bar span{display:block;height:8px;background:#1d4ed8;border-radius:4px}
.note{margin-top:24px;font-size:11px;color:#666}
</style></head><body>
<h1>${esc(opts.testName ?? r.testTitle ?? 'Test result')}</h1>
<div class="muted">${esc(opts.studentName ?? '')} ${opts.instituteName ? '&middot; ' + esc(opts.instituteName) : ''} &middot; Result v${r.version} (answer key v${r.keyVersion})</div>
<div class="kpis">
<div class="kpi"><b>${r.score} / ${r.maxScore}</b>Score (${pct}%)</div>
<div class="kpi"><b>${r.correct}</b>Correct</div>
<div class="kpi"><b>${r.incorrect + r.partial}</b>Incorrect / partial</div>
<div class="kpi"><b>${r.unanswered}</b>Unanswered</div>
<div class="kpi"><b>${r.accuracy}%</b>Accuracy</div>
<div class="kpi"><b>${fmtTime(r.timeSpentSec)}</b>Time</div>
</div>
${ranks ? `<h2>Rank</h2><ul>${ranks}</ul><div class="muted">${esc(RANK_LABEL)}</div>` : ''}
<h2>Section-wise marks</h2><table><tr><th>Section</th><th>Marks</th><th>Correct</th><th>Wrong</th><th>Unanswered</th></tr>${sections}</table>
<h2>Topic strengths and weaknesses</h2><table><tr><th>Topic</th><th>Correct</th><th></th><th>Accuracy</th></tr>${topics}</table>
${history ? `<h2>Comparison with last tests</h2><table><tr><th>Test</th><th>Date</th><th>Score</th></tr>${history}</table>` : ''}
<h2>Topics to revise and next practice</h2>${recs ? `<ul>${recs}</ul>` : '<div class="muted">No recommendations yet. They appear after 5 attempts on a topic.</div>'}
<div class="note">Recommendations are rule-based and do not predict rank or admission outcomes.</div>
</body></html>`;
}
