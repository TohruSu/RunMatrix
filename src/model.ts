export const LIMITS = { minReports: 2, maxReports: 12, bytesPerReport: 2 * 1024 * 1024, tests: 1000 } as const;

export type ResultStatus = 'passed' | 'failed' | 'error' | 'skipped';
export type CellStatus = ResultStatus | 'missing';
export type Category = 'mixed' | 'failing' | 'passing' | 'partial';
export type CategoryFilter = Category | 'all';

export const STATUS: Record<CellStatus, { label: string; symbol: string }> = {
  passed: { label: 'Passed', symbol: '✓' },
  failed: { label: 'Failed', symbol: '×' },
  error: { label: 'Error', symbol: '!' },
  skipped: { label: 'Skipped', symbol: '»' },
  missing: { label: 'Missing', symbol: '−' },
};

export const CATEGORIES: Record<Category, string> = {
  mixed: 'Mixed outcomes',
  failing: 'Failed in all observed runs',
  passing: 'Passed in all observed runs',
  partial: 'Skipped / partial',
};

export interface Issue {
  kind: 'failure' | 'error';
  message?: string;
  type?: string;
  text?: string;
}

export interface TestResult {
  identity: string;
  name: string;
  scope?: string;
  runId: string;
  status: ResultStatus;
  duration?: number;
  issues: Issue[];
  skipReason?: string;
}

export interface Run {
  id: string;
  name: string;
  results: ReadonlyMap<string, TestResult>;
}

export interface MatrixRow {
  identity: string;
  name: string;
  scope?: string;
  cells: (TestResult | null)[];
  category: Category;
}
