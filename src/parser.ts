import { LIMITS, type Issue, type Run, type TestResult } from './model';

export interface ReportSource { name: string; xml: string }

function fail(name: string, reason: string): never {
  throw new Error(`${name}: ${reason}`);
}

function duration(value: string | null): number | undefined {
  if (!value || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function parseReport(xml: string, name: string, runId: string): Run {
  if (new TextEncoder().encode(xml).byteLength > LIMITS.bytesPerReport) fail(name, 'exceeds the 2 MiB report limit.');
  // Reject before DOMParser can encounter declarations or resolve entities.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) fail(name, 'DOCTYPE and entity declarations are not supported.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const elements = Array.from(document.getElementsByTagName('*'));
  if (elements.some((element) => element.localName === 'parsererror')) fail(name, 'malformed XML. Check that tags and attributes are correctly closed.');
  if (!['testsuite', 'testsuites'].includes(document.documentElement.localName)) fail(name, 'expected a <testsuite> or <testsuites> root.');
  const cases = elements.filter((element) => element.localName === 'testcase');
  if (!cases.length) fail(name, 'no test cases found.');

  const results = new Map<string, TestResult>();
  for (const testcase of cases) {
    const testName = testcase.getAttribute('name')?.trim();
    if (!testName) fail(name, 'every test case needs a non-blank name.');
    let suite = testcase.parentElement;
    while (suite && suite.localName !== 'testsuite') suite = suite.parentElement;
    if (!suite) fail(name, `test case “${testName}” must be inside a <testsuite>.`);
    const scope = testcase.getAttribute('classname')?.trim() || suite.getAttribute('name')?.trim() || undefined;
    // A tuple avoids collisions when names themselves contain separators.
    const identity = JSON.stringify([scope ?? '', testName]);
    if (results.has(identity)) fail(name, `duplicate test identity “${scope ? `${scope} / ` : ''}${testName}”. Use unique class/suite and test names.`);
    const children = Array.from(testcase.children);
    const issues: Issue[] = children
      .filter((child) => child.localName === 'failure' || child.localName === 'error')
      .map((child) => ({
        kind: child.localName as Issue['kind'],
        message: child.getAttribute('message') || undefined,
        type: child.getAttribute('type') || undefined,
        text: child.textContent?.trim() || undefined,
      }));
    const skipped = children.find((child) => child.localName === 'skipped');
    const status = issues.some((issue) => issue.kind === 'error') ? 'error'
      : issues.length ? 'failed' : skipped ? 'skipped' : 'passed';
    results.set(identity, {
      identity, name: testName, scope, runId, status,
      duration: duration(testcase.getAttribute('time')),
      issues,
      skipReason: skipped?.getAttribute('message') || skipped?.textContent?.trim() || undefined,
    });
  }
  return { id: runId, name, results };
}

function validateCount(count: number) {
  if (count < LIMITS.minReports || count > LIMITS.maxReports) throw new Error('Select 2–12 JUnit XML reports together.');
}

export function parseBatch(sources: readonly ReportSource[]): Run[] {
  validateCount(sources.length);
  const runs = sources.map((source, index) => parseReport(source.xml, source.name, `run-${index + 1}`));
  const identities = new Set(runs.flatMap((run) => Array.from(run.results.keys())));
  if (identities.size > LIMITS.tests) throw new Error('This batch exceeds the 1,000 distinct test identity limit. Select a smaller comparison.');
  return runs;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name}: could not read this file. Try selecting it again.`));
    reader.onabort = () => reject(new Error(`${file.name}: file reading was interrupted.`));
    reader.readAsText(file, 'UTF-8');
  });
}

export async function importFiles(files: readonly File[]): Promise<Run[]> {
  validateCount(files.length);
  for (const file of files) {
    if (file.size > LIMITS.bytesPerReport) fail(file.name, 'exceeds the 2 MiB report limit.');
  }
  const sources = await Promise.all(files.map(async (file) => ({ name: file.name, xml: await readFile(file) })));
  return parseBatch(sources);
}
