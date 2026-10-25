import { describe, expect, it } from 'vitest';
import { buildMatrix, classify, filterRows, isNewFailure, moveRun, summarize } from './comparison';
import { loadDemo } from './demo';
import { parseReport } from './parser';
import { type Category, type ResultStatus, type TestResult } from './model';

function result(status: ResultStatus): TestResult { return { identity: '["C","test"]', name: 'test', scope: 'C', runId: 'r', status, issues: [] }; }
const history = (statuses: (ResultStatus | null)[]) => statuses.map((status) => status ? result(status) : null);
const run = (id: string, cases: string) => parseReport(`<testsuite name="S">${cases}</testsuite>`, `${id}.xml`, id);

describe('observed outcome classification', () => {
  it.each<[Array<ResultStatus | null>, Category]>([
    [['passed', 'failed'], 'mixed'], [['passed', 'error', 'skipped', null], 'mixed'],
    [['passed', 'passed'], 'passing'], [[null, 'passed', null], 'passing'],
    [['failed', 'error', null], 'failing'], [['error', null], 'failing'],
    [['skipped', 'skipped'], 'partial'], [['passed', 'skipped'], 'partial'],
    [['failed', 'skipped', null], 'partial'], [[null, 'skipped'], 'partial'],
    [[null, null], 'partial'], [[], 'partial'],
  ])('classifies %j as %s', (statuses, expected) => expect(classify(history(statuses))).toBe(expected));
});

describe('comparison matrix', () => {
  it('matches stable identities across files despite suite changes when classname exists', () => {
    const first = parseReport('<testsuite name="A"><testcase name="x" classname="C"/></testsuite>', 'a.xml', 'a');
    const second = parseReport('<testsuite name="B"><testcase name="x" classname="C"/></testsuite>', 'b.xml', 'b');
    expect(buildMatrix([first, second])).toHaveLength(1);
  });
  it('keeps missing distinct from skipped and does not count it as an execution', () => {
    const rows = buildMatrix([run('a', '<testcase name="x"><skipped/></testcase>'), run('b', '<testcase name="y"/>')]);
    expect(rows[0].cells[0]?.status).toBe('skipped');
    expect(rows[0].cells[1]).toBeNull();
    expect(summarize(rows)).toMatchObject({ executions: 2, cells: 4, statuses: { skipped: 1, missing: 2, failed: 0 } });
  });
  it('sorts deterministically by scope then name, independently of input order', () => {
    const a = run('a', '<testcase classname="Z" name="z"/><testcase classname="A" name="b"/>');
    const b = run('b', '<testcase classname="A" name="a"/>');
    const rows = buildMatrix([a, b]);
    expect(rows.map((row) => row.name)).toEqual(['a', 'b', 'z']);
    expect(buildMatrix([b, a]).map((row) => row.identity)).toEqual(rows.map((row) => row.identity));
  });
  it('reorders columns without changing identities, classifications, or original data', () => {
    const runs = loadDemo();
    const original = buildMatrix(runs);
    const reordered = moveRun(runs, runs[0].id, 1);
    expect(reordered.map((item) => item.id)).toEqual(['run-2', 'run-1', 'run-3', 'run-4', 'run-5']);
    buildMatrix(reordered).forEach((row, index) => {
      expect(row.identity).toBe(original[index].identity);
      expect(row.category).toBe(original[index].category);
      expect(row.cells[0]).toBe(original[index].cells[1]);
    });
    expect(runs[0].id).toBe('run-1');
    expect(moveRun(runs, runs[0].id, -1)).toEqual(runs);
    expect(moveRun(runs, runs[4].id, 1)).toEqual(runs);
    expect(moveRun(runs, 'unknown', 1)).toEqual(runs);
  });
  it('filters by name/class and category without modifying underlying results', () => {
    const rows = buildMatrix(loadDemo());
    const snapshot = JSON.stringify(rows);
    expect(filterRows(rows, ' SESSIONtest ', 'mixed').map((row) => row.name)).toEqual(['refreshes the session']);
    expect(filterRows(rows, 'receipt', 'all')).toHaveLength(1);
    expect(filterRows(rows, '', 'mixed')).toHaveLength(3);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
  it('has internally consistent category, execution, and cell totals', () => {
    const rows = buildMatrix(loadDemo());
    const summary = summarize(rows);
    expect(summary).toMatchObject({ tests: 12, executions: 57, cells: 60, categories: { passing: 4, failing: 2, mixed: 3, partial: 3 }, statuses: { missing: 3 } });
    expect(Object.values(summary.categories).reduce((a, b) => a + b, 0)).toBe(summary.tests);
    expect(Object.values(summary.statuses).reduce((a, b) => a + b, 0)).toBe(summary.cells);
    expect(summary.executions + summary.statuses.missing).toBe(summary.cells);
    expect(summarize([]).executions).toBe(0);
  });
  it('highlights a failure only after the previous observed result passed', () => {
    const cells = history(['passed', null, 'error', 'failed', 'skipped', 'failed']);
    expect(cells.map((_, index) => isNewFailure(cells, index))).toEqual([false, false, true, false, false, false]);
    expect(isNewFailure(history(['failed']), 0)).toBe(false);
    expect(isNewFailure(history(['failed', 'passed', 'failed']), 2)).toBe(true);
  });
});
