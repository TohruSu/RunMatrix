import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildMatrix, filterRows, isNewFailure, moveRun, summarize } from './comparison';
import { loadDemo, shouldLoadDemo } from './demo';
import { CATEGORIES, STATUS, type Category, type CategoryFilter, type CellStatus, type Issue, type MatrixRow, type Run } from './model';
import { importFiles } from './parser';

type Selection = { identity: string; runId: string };
const categoryOrder: Category[] = ['mixed', 'failing', 'passing', 'partial'];
const shortCategory: Record<Category, string> = { mixed: 'Mixed outcomes', failing: 'All observed failing', passing: 'All observed passing', partial: 'Skipped / partial' };
const cellKey = (identity: string, runId: string) => JSON.stringify([identity, runId]);

function StatusMark({ status }: { status: CellStatus }) {
  return <span className={`status-mark ${status}`} aria-hidden="true">{STATUS[status].symbol}</span>;
}

function FailureOutput({ issue, index }: { issue: Issue; index: number }) {
  const output = [issue.type, issue.message, issue.text].filter(Boolean).join('\n\n') || 'No failure text was included in this report.';
  const long = output.length > 1200;
  return <div className="issue-output">
    <h4>{issue.kind === 'error' ? 'Error' : 'Failure'} {index + 1}</h4>
    <pre tabIndex={0} aria-label={`${issue.kind} output preview`}>{long ? `${output.slice(0, 1200)}\n…` : output}</pre>
    {long && <details><summary>Read all available text ({output.length.toLocaleString()} characters)</summary>
      <pre tabIndex={0} aria-label={`Full ${issue.kind} output`}>{output}</pre>
    </details>}
  </div>;
}

function ResultDetails({ row, run, runs }: { row: MatrixRow | undefined; run: Run | undefined; runs: Run[] }) {
  const result = row && run ? run.results.get(row.identity) : undefined;
  return <section className="panel details-panel" id="result-details" aria-labelledby="details-heading">
    <div className="panel-heading"><h2 id="details-heading">Result details</h2><span className="eyebrow">INSPECT</span></div>
    {!row || !run ? <div className="details-placeholder"><span aria-hidden="true">↖</span><div><strong>Every cell has a story.</strong><p>Select a result to inspect its status, duration, and available failure output.</p></div></div>
      : <div className="details-content">
        <div className="detail-summary">
          <span className={`category-label ${row.category}`}>{CATEGORIES[row.category]}</span>
          <h3>{row.name}</h3><p className="mono scope-name">{row.scope || 'Unnamed suite'}</p>
          <dl><div><dt>Report</dt><dd>{run.name}</dd></div>
            <div><dt>Result</dt><dd className="inline-status"><StatusMark status={result?.status ?? 'missing'} />{STATUS[result?.status ?? 'missing'].label}</dd></div>
            <div><dt>Duration</dt><dd>{result?.duration === undefined ? 'Not reported' : `${result.duration} s`}</dd></div>
            <div><dt>Observed</dt><dd>{row.cells.filter(Boolean).length} of {runs.length} reports</dd></div>
          </dl>
        </div>
        <div className="detail-output">
          {result?.issues.length ? result.issues.map((issue, index) => <FailureOutput key={index} issue={issue} index={index} />)
            : <div className="no-output"><strong>{!result ? 'Not present in this report' : result.status === 'skipped' ? 'Execution skipped' : 'Execution passed'}</strong>
              <p>{!result ? 'No execution was recorded for this identity. Missing is different from skipped.'
                : result.status === 'skipped' ? result.skipReason || 'No skip reason was included in the report.'
                  : 'No failure or error was recorded for this execution.'}</p></div>}
        </div>
      </div>}
  </section>;
}

function Matrix({ rows, runs, selection, onSelect }: {
  rows: MatrixRow[]; runs: Run[]; selection: Selection | null; onSelect: (selection: Selection) => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const focusVisible = rows.some((row) => runs.some((run) => cellKey(row.identity, run.id) === focus));
  function navigate(event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) {
    let nextRow = row;
    let nextColumn = column;
    switch (event.key) {
      case 'ArrowUp': nextRow--; break;
      case 'ArrowDown': nextRow++; break;
      case 'ArrowLeft': nextColumn--; break;
      case 'ArrowRight': nextColumn++; break;
      case 'Home': nextColumn = 0; if (event.ctrlKey) nextRow = 0; break;
      case 'End': nextColumn = runs.length - 1; if (event.ctrlKey) nextRow = rows.length - 1; break;
      default: return;
    }
    event.preventDefault();
    nextRow = Math.max(0, Math.min(rows.length - 1, nextRow));
    nextColumn = Math.max(0, Math.min(runs.length - 1, nextColumn));
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${nextRow}-${nextColumn}"]`)?.focus();
  }
  return <div className="matrix-scroll" role="region" aria-label="Test comparison matrix; scroll horizontally for more runs" tabIndex={0}>
    <table className="matrix" ref={tableRef}>
      <caption className="sr-only">Test results by report in comparison order. Use arrow keys to move between result buttons, then Enter to inspect.</caption>
      <thead><tr><th scope="col" className="test-column">Test case <span>CLASS / SUITE</span></th>
        {runs.map((run, index) => <th scope="col" key={run.id} title={run.name}><span className="column-index">RUN {String(index + 1).padStart(2, '0')}</span><span className="column-name">{run.name}</span></th>)}
      </tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={row.identity} className={selection?.identity === row.identity ? 'selected-row' : ''}>
        <th scope="row" className="test-column"><span className="test-name">{row.name}</span><span className="test-scope mono">{row.scope || 'Unnamed suite'}</span></th>
        {row.cells.map((cell, column) => {
          const status = cell?.status ?? 'missing';
          const changed = isNewFailure(row.cells, column);
          const selected = selection?.identity === row.identity && selection.runId === runs[column].id;
          const key = cellKey(row.identity, runs[column].id);
          return <td key={runs[column].id}><button
            className={`result-cell ${status}${selected ? ' selected' : ''}`}
            data-cell={`${rowIndex}-${column}`}
            tabIndex={focusVisible ? focus === key ? 0 : -1 : rowIndex === 0 && column === 0 ? 0 : -1}
            aria-label={`${row.name}, ${row.scope || 'Unnamed suite'}, ${runs[column].name}: ${STATUS[status].label}${changed ? '; failed after a previous observed pass' : ''}`}
            aria-pressed={selected} aria-controls="result-details"
            onFocus={() => setFocus(key)} onKeyDown={(event) => navigate(event, rowIndex, column)}
            onClick={() => onSelect({ identity: row.identity, runId: runs[column].id })}
            title={`${STATUS[status].label}${cell?.duration === undefined ? '' : ` · ${cell.duration} s`}${changed ? ' · after a previous observed pass' : ''}`}>
            <StatusMark status={status} />{changed && <span className="change-marker" aria-hidden="true">↑</span>}
          </button></td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}

export default function App() {
  const [runs, setRuns] = useState<Run[]>(() => shouldLoadDemo(window.location.hostname) ? loadDemo() : []);
  const [isDemo, setIsDemo] = useState(() => shouldLoadDemo(window.location.hostname));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => buildMatrix(runs), [runs]);
  const visible = useMemo(() => filterRows(rows, query, category), [rows, query, category]);
  const summary = useMemo(() => summarize(rows), [rows]);

  function replaceComparison(next: Run[], demo: boolean) {
    setRuns(next); setIsDemo(demo); setSelection(null); setQuery(''); setCategory('all'); setError('');
    setAnnouncement(`Loaded ${next.length} reports. ${buildMatrix(next).length} distinct tests.`);
  }
  function demo() {
    try { replaceComparison(loadDemo(), true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The demo could not be loaded.'); }
  }
  async function importBatch(files: File[]) {
    if (!files.length) return;
    setBusy(true); setError(''); setAnnouncement('Reading reports…');
    try { replaceComparison(await importFiles(files), false); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read these reports. Try again.');
      setAnnouncement('Import failed. The previous comparison is unchanged.');
    } finally { setBusy(false); }
  }
  function reorder(run: Run, direction: -1 | 1) {
    const next = moveRun(runs, run.id, direction);
    setRuns(next);
    setAnnouncement(`${run.name} moved to position ${next.findIndex((item) => item.id === run.id) + 1} of ${next.length}.`);
  }
  const selectedRow = rows.find((row) => row.identity === selection?.identity);
  const selectedRun = runs.find((run) => run.id === selection?.runId);

  return <>
    <a href="#workspace" className="skip-link">Skip to comparison</a>
    <header className="app-header"><div className="header-inner">
      <div className="brand"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span><span>RunMatrix</span><span className="version">v0.1.0</span></div>
      <span className="privacy"><span aria-hidden="true">◉</span> Browser local <span className="privacy-extra">· No uploads</span></span>
    </div></header>
    <main className="app-main">
      <div className="page-heading"><div><p className="eyebrow">JUNIT REPORT COMPARISON</p><h1>A clearer view of every run.</h1><p>Compare test results. Find the changes. Read the details.</p></div>
        <div className="actions"><button className="button secondary" disabled={busy} onClick={demo}>Load demo <span aria-hidden="true">↗</span></button>
          <button className="button primary" disabled={busy} onClick={() => inputRef.current?.click()}><span aria-hidden="true">＋</span>{busy ? 'Reading reports…' : 'Import XML reports'}</button></div>
      </div>
      <input ref={inputRef} className="sr-only" type="file" multiple accept=".xml,application/xml,text/xml" aria-label="Select JUnit XML reports" disabled={busy} onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = ''; void importBatch(files);
      }} />
      <p role="status" className="sr-only">{announcement}</p>
      {error && <div role="alert" className="error-banner"><strong>Reports couldn’t be imported.</strong><span>{error}</span>{runs.length > 0 && <span>Your current comparison is unchanged.</span>}</div>}
      <div className="workspace-layout">
        <aside className="run-sidebar" aria-label="Loaded reports">
          <div className="panel run-panel"><div className="panel-heading"><h2>Comparison order</h2><span className="count">{runs.length.toString().padStart(2, '0')}</span></div>
            <p className="panel-intro">Earlier → later, from left to right.<br />{' '}Use Up / Down to set the order.</p>
            {runs.length ? <ol className="run-list">{runs.map((run, index) => <li key={run.id}>
              <span className="run-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="run-info"><strong title={run.name}>{run.name}</strong><span>{run.results.size} test cases</span></div>
              <div className="reorder-controls"><button aria-label={`Move ${run.name} up`} disabled={index === 0 || busy} onClick={() => reorder(run, -1)} title="Move up">↑</button>
                <button aria-label={`Move ${run.name} down`} disabled={index === runs.length - 1 || busy} onClick={() => reorder(run, 1)} title="Move down">↓</button></div>
            </li>)}</ol> : <div className="empty-runs"><span aria-hidden="true">≡</span><p>No reports loaded yet.</p></div>}
            {isDemo && <div className="demo-note"><span className="demo-dot" />Synthetic demo · 5 reports</div>}
          </div>
          <div className="local-note"><span aria-hidden="true">⌁</span><h3>Your files stay here.</h3><p>Reports are read in your browser and kept in memory for this session.</p><ul><li>2–12 XML reports per comparison</li><li>Up to 2 MiB per report</li><li>Up to 1,000 distinct tests</li></ul><p className="encoding-note">Use UTF-8 encoded XML.</p></div>
        </aside>
        <div className="workspace" id="workspace" tabIndex={-1} aria-busy={busy}>
          {!runs.length ? <section className="panel empty-state" aria-labelledby="empty-heading">
            <div className="empty-matrix" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
            <span className="eyebrow">THE WHOLE PICTURE, IN ONE PLACE</span><h2 id="empty-heading">Your test runs, side by side.</h2><p>Bring a few JUnit reports together to see what passed,<br className="desktop-break" /> what failed, and what changed between runs.</p>
            <button className="button primary" onClick={demo}>Explore the 5-run demo <span aria-hidden="true">→</span></button><span className="empty-hint">Or import 2–12 local XML reports to get started.</span>
            <div className="empty-features"><span>✓ Compare every test</span><span>↑ Spot changed outcomes</span><span>≡ Inspect failure details</span></div>
          </section> : <>
            <section className="summary-grid" aria-label="Test history summary">
              {categoryOrder.map((item) => <button key={item} className={`summary-card ${item}${category === item ? ' active' : ''}`} aria-label={`${CATEGORIES[item]}: ${summary.categories[item]} of ${summary.tests} tests; filter results`} aria-pressed={category === item} onClick={() => setCategory(category === item ? 'all' : item)}>
                <span>{shortCategory[item]}</span><strong>{summary.categories[item]}<small> / {summary.tests} tests</small></strong>
              </button>)}
            </section>
            <p className="summary-description">Categories use available executions across all {summary.tests} tests. Missing is excluded; skipped disqualifies “always” passing / failing.</p>
            <section className="panel matrix-panel" aria-labelledby="matrix-heading">
              <div className="matrix-title"><div><h2 id="matrix-heading">Test matrix <span className="count">{summary.tests}</span></h2><p>{runs.length} reports · {summary.executions} recorded executions · {summary.statuses.missing} missing cells</p></div>
                <span className="dataset-label">{isDemo ? 'DEMO DATA' : 'LOCAL FILES'}</span></div>
              <div className="filter-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search tests by name or class" placeholder="Search test name or class…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <label className="category-filter"><span className="sr-only">Filter by observed outcome</span><select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)}>
                  <option value="all">All outcomes</option>{categoryOrder.map((item) => <option key={item} value={item}>{CATEGORIES[item]}</option>)}
                </select></label>
              </div>
              <div className="matrix-meta"><span aria-live="polite">Showing {visible.length} of {rows.length} tests</span><span>Comparison order →</span></div>
              {visible.length ? <Matrix rows={visible} runs={runs} selection={selection} onSelect={(next) => {
                setSelection(next); setAnnouncement('Result selected. Details are below the matrix.');
              }} /> : <div className="no-matches"><h3>No matching tests</h3><p>Try another search or outcome category.</p><button className="text-button" onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</button></div>}
              <div className="matrix-footer"><ul className="legend" aria-label="Result legend">{(Object.keys(STATUS) as CellStatus[]).map((status) => <li key={status}><StatusMark status={status} /><span>{STATUS[status].label}</span></li>)}</ul>
                <p><span className="change-symbol" aria-hidden="true">↑</span> Failed after a previous observed pass</p>
              </div>
              <p className="keyboard-hint">Select a cell for details. Arrow keys move between cells; Enter selects. Mixed outcomes describe these reports; revisions and environments may differ.</p>
            </section>
            <div className="execution-totals" aria-label="Recorded execution totals"><span>Of {summary.executions} recorded executions:</span><span>{summary.statuses.passed} passed</span><span>{summary.statuses.failed} failed</span><span>{summary.statuses.error} errors</span><span>{summary.statuses.skipped} skipped</span></div>
            <ResultDetails row={selectedRow} run={selectedRun} runs={runs} />
          </>}
        </div>
      </div>
      <footer className="app-footer"><span>RunMatrix <span className="footer-divider">/</span> A little clarity for your test runs.</span><span>Local files. Clear outcomes.</span></footer>
    </main>
  </>;
}
