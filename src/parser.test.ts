import { describe, expect, it, vi } from 'vitest';
import { importFiles, parseBatch, parseReport } from './parser';
import { LIMITS } from './model';

const parse = (xml: string) => parseReport(xml, 'report.xml', 'one');
const suite = (cases: string) => `<testsuite name="Suite" tests="999">${cases}</testsuite>`;
const first = (xml: string) => Array.from(parse(xml).results.values())[0];

describe('JUnit parsing', () => {
  it('derives results from testcases rather than suite summary counters', () => {
    const run = parse(suite('<testcase name="works" classname="Example"/>'));
    expect(run.results.size).toBe(1);
    expect(Array.from(run.results.values())[0]).toMatchObject({ name: 'works', scope: 'Example', runId: 'one', status: 'passed' });
  });

  it('supports wrapper, nested suites, and the nearest suite when classname is absent', () => {
    const run = parse('<testsuites><testsuite name="Outer"><testcase name="outer"/><testsuite name="Inner"><testcase name="inner"/></testsuite></testsuite></testsuites>');
    expect(Array.from(run.results.values()).map((test) => test.scope)).toEqual(['Outer', 'Inner']);
  });

  it('handles optional and blank classname and unnamed suites deterministically', () => {
    expect(first(suite('<testcase name="x" classname=" "/>')).scope).toBe('Suite');
    expect(first('<testsuite><testcase name="x"/></testsuite>').identity).toBe('["","x"]');
  });

  it.each([
    ['', 'passed'], ['<skipped/>', 'skipped'], ['<failure/>', 'failed'], ['<error/>', 'error'],
    ['<skipped/><failure/>', 'failed'], ['<failure/><skipped/><error/>', 'error'],
  ])('normalizes direct children %s as %s', (children, status) => {
    expect(first(suite(`<testcase name="x">${children}</testcase>`)).status).toBe(status);
  });

  it('ignores outcome elements nested inside other children', () => {
    expect(first(suite('<testcase name="x"><system-out><failure/></system-out></testcase>')).status).toBe('passed');
  });

  it('preserves all failure/error messages, types, and available text', () => {
    const result = first(suite('<testcase name="x"><failure type="AssertionError" message="expected one">stack one</failure><error message="fixture">stack two</error></testcase>'));
    expect(result.issues).toEqual([
      { kind: 'failure', type: 'AssertionError', message: 'expected one', text: 'stack one' },
      { kind: 'error', type: undefined, message: 'fixture', text: 'stack two' },
    ]);
  });

  it.each([['0', 0], ['.125', .125], ['1.2e-3', .0012], ['', undefined], ['-1', undefined], ['NaN', undefined], ['Infinity', undefined], ['0x10', undefined], ['1e999', undefined]])('handles duration %s without inventing a value', (time, expected) => {
    expect(first(suite(`<testcase name="x" time="${time}"/>`)).duration).toBe(expected);
  });

  it('keeps absent duration absent', () => expect(first(suite('<testcase name="x"/>')).duration).toBeUndefined());

  it('decodes ordinary XML entities and preserves markup as text', () => {
    const result = first(suite('<testcase name="a &amp; b" classname="A&lt;B"><failure message="&lt;img src=x onerror=alert(1)&gt;">&lt;script&gt;alert(1)&lt;/script&gt; &amp; details</failure></testcase>'));
    expect(result.name).toBe('a & b');
    expect(result.scope).toBe('A<B');
    expect(result.issues[0]).toMatchObject({ message: '<img src=x onerror=alert(1)>', text: '<script>alert(1)</script> & details' });
  });

  it.each([
    ['<testsuite><testcase name="x"></testsuite>', /malformed XML/],
    ['<report><testcase name="x"/></report>', /expected a <testsuite>/],
    ['<testsuite/>', /no test cases/],
    [suite('<testcase/>'), /non-blank name/],
    [suite('<testcase name="   "/>'), /non-blank name/],
    [suite('<testcase name="x"/><testcase name="x"/>'), /duplicate test identity/],
    ['<testsuites><testcase name="x"/></testsuites>', /must be inside/],
    ['<!DOCTYPE testsuite><testsuite><testcase name="x"/></testsuite>', /DOCTYPE/],
    ['<!DOCTYPE testsuite SYSTEM "https://example.com/secret"><testsuite><testcase name="x"/></testsuite>', /DOCTYPE/],
    ['<!ENTITY custom "text"><testsuite><testcase name="x"/></testsuite>', /entity declarations/],
  ])('rejects invalid or unsafe input', (xml, error) => expect(() => parse(xml)).toThrow(error));

  it('detects duplicates across nested suites with the same classname', () => {
    expect(() => parse('<testsuites><testsuite name="A"><testcase name="x" classname="C"/></testsuite><testsuite name="B"><testcase name="x" classname="C"/></testsuite></testsuites>')).toThrow(/duplicate/);
  });

  it('does not collide on separator characters in identities', () => {
    expect(parse(suite('<testcase classname="a:b" name="c"/><testcase classname="a" name="b:c"/>')).results.size).toBe(2);
  });

  it('supports namespaced JUnit elements', () => {
    expect(first('<j:testsuite xmlns:j="urn:junit"><j:testcase name="x"><j:error/></j:testcase></j:testsuite>').status).toBe('error');
  });
});

describe('batch validation and file reading', () => {
  const source = { name: 'valid.xml', xml: suite('<testcase name="x"/>') };
  it.each([0, 1, 13])('rejects %i reports', (count) => {
    expect(() => parseBatch(Array.from({ length: count }, () => source))).toThrow(/2–12/);
  });
  it('accepts the report-count boundaries and gives same-named files unique run IDs', () => {
    for (const count of [2, 12]) {
      const runs = parseBatch(Array.from({ length: count }, () => source));
      expect(new Set(runs.map((run) => run.id)).size).toBe(count);
    }
  });
  it('enforces the byte limit before parsing, including multibyte text', () => {
    expect(() => parse('é'.repeat(LIMITS.bytesPerReport / 2 + 1))).toThrow(/2 MiB/);
  });
  it('accepts 1,000 distinct identities and rejects the next distinct identity', () => {
    const thousand = suite(Array.from({ length: 1000 }, (_, index) => `<testcase name="test-${index}"/>`).join(''));
    expect(parseBatch([{ name: 'a.xml', xml: thousand }, { name: 'b.xml', xml: suite('<testcase name="test-0"/>') }])).toHaveLength(2);
  });
  it('rejects a combined union greater than 1,000, even when individual reports fit', () => {
    const cases = (start: number) => suite(Array.from({ length: 501 }, (_, index) => `<testcase name="test-${index + start}"/>`).join(''));
    expect(() => parseBatch([{ name: 'a.xml', xml: cases(0) }, { name: 'b.xml', xml: cases(500) }])).toThrow(/1,000/);
  });
  it('reads local files through the same parser', async () => {
    const files = ['a.xml', 'b.xml'].map((name) => new File([source.xml], name, { type: 'application/xml' }));
    expect((await importFiles(files)).map((run) => run.name)).toEqual(['a.xml', 'b.xml']);
  });
  it('rejects an oversized file before starting any reads', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    await expect(importFiles([new File(['x'.repeat(LIMITS.bytesPerReport + 1)], 'large.xml'), new File([source.xml], 'ok.xml')])).rejects.toThrow(/large.xml.*2 MiB/);
    expect(read).not.toHaveBeenCalled();
  });
  it('reports a file read failure with its filename', async () => {
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) { this.dispatchEvent(new ProgressEvent('error')); });
    await expect(importFiles([new File([''], 'a.xml'), new File([''], 'b.xml')])).rejects.toThrow(/a.xml.*could not read/);
  });
});
