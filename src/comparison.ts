import { type Category, type CategoryFilter, type MatrixRow, type Run, type TestResult } from './model';

export function classify(cells: readonly (TestResult | null)[]): Category {
  const observed = cells.filter((cell): cell is TestResult => cell !== null);
  const passing = observed.some((cell) => cell.status === 'passed');
  const failing = observed.some((cell) => cell.status === 'failed' || cell.status === 'error');
  // Missing is not an execution. A single observed pass/failure is sufficient
  // for an all-observed category; skipped disqualifies both of those categories.
  if (passing && failing) return 'mixed';
  if (observed.length && observed.every((cell) => cell.status === 'passed')) return 'passing';
  if (observed.length && observed.every((cell) => cell.status === 'failed' || cell.status === 'error')) return 'failing';
  return 'partial';
}

// Code-point sorting is deterministic across browsers and independent of run order.
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function buildMatrix(runs: readonly Run[]): MatrixRow[] {
  const tests = new Map<string, TestResult>();
  runs.forEach((run) => run.results.forEach((result, identity) => tests.set(identity, result)));
  return Array.from(tests.values())
    .sort((a, b) => compareText(a.scope ?? '', b.scope ?? '') || compareText(a.name, b.name) || compareText(a.identity, b.identity))
    .map((test) => {
      const cells = runs.map((run) => run.results.get(test.identity) ?? null);
      return { identity: test.identity, name: test.name, scope: test.scope, cells, category: classify(cells) };
    });
}

export function filterRows(rows: readonly MatrixRow[], query: string, category: CategoryFilter): MatrixRow[] {
  const search = query.trim().toLowerCase();
  return rows.filter((row) => (category === 'all' || row.category === category)
    && `${row.scope ?? ''} ${row.name}`.toLowerCase().includes(search));
}

export function summarize(rows: readonly MatrixRow[]) {
  const categories: Record<Category, number> = { mixed: 0, failing: 0, passing: 0, partial: 0 };
  const statuses = { passed: 0, failed: 0, error: 0, skipped: 0, missing: 0 };
  rows.forEach((row) => {
    categories[row.category]++;
    row.cells.forEach((cell) => statuses[cell?.status ?? 'missing']++);
  });
  const executions = statuses.passed + statuses.failed + statuses.error + statuses.skipped;
  return { tests: rows.length, categories, statuses, executions, cells: executions + statuses.missing };
}

export function moveRun(runs: readonly Run[], runId: string, direction: -1 | 1): Run[] {
  const index = runs.findIndex((run) => run.id === runId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= runs.length) return [...runs];
  const reordered = [...runs];
  [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
  return reordered;
}

// Compare to the previous available execution, skipping missing observations.
export function isNewFailure(cells: readonly (TestResult | null)[], index: number): boolean {
  const current = cells[index];
  if (!current || !['failed', 'error'].includes(current.status)) return false;
  for (let previous = index - 1; previous >= 0; previous--) {
    if (cells[previous]) return cells[previous]?.status === 'passed';
  }
  return false;
}
