# RunMatrix

**Compare JUnit XML test runs side by side.**

RunMatrix turns multiple test reports into an interactive test-by-run matrix. See which tests passed, failed, were skipped, or were absent—and how their results changed across runs.

**[Try the live demo](https://tohrusu.github.io/RunMatrix/)**

## Features

- **Visual comparison:** Compare 2–12 local JUnit XML reports in a single matrix.
- **Outcome patterns:** Find mixed results, consistently passing or failing tests, and skipped or missing cases.
- **Flexible navigation:** Reorder reports, search test names, filter results, and inspect individual cells.
- **Failure details:** Read available error messages, failure output, and execution times.
- **Local by design:** Reports are processed in your browser, with a responsive layout for desktop and mobile.

## Getting started

The [live app](https://tohrusu.github.io/RunMatrix/) opens with five synthetic test runs so you can explore the matrix immediately. To compare your own results:

1. Select **Import XML reports** and choose 2–12 files together. A valid batch replaces the current comparison.
2. Use **Up / Down** beside each report to set the order of runs. The matrix follows your chosen order rather than assuming report timestamps are chronological.
3. Search by test or class name, or select a summary card to filter by outcome.
4. Select any matrix cell to inspect its status, duration, and available failure details.

The matrix scrolls horizontally on smaller screens. For keyboard navigation, use Tab to enter the matrix, arrow keys to move between results, and Enter or Space to open details. Home/End and Ctrl+Home/End provide faster navigation.

Your imported reports stay in browser memory until you reload the page. An invalid batch leaves the current comparison intact.

## Supported JUnit XML

RunMatrix accepts UTF-8 XML reports with a `<testsuite>` root or a `<testsuites>` wrapper, including nested suites. Test results come from `<testcase>` elements and their `<failure>`, `<error>`, or `<skipped>` children.

```xml
<testsuites>
  <testsuite name="Checkout">
    <testcase classname="CartTest" name="calculates the total" time="0.025" />
    <testcase classname="CartTest" name="applies a promotion">
      <failure message="Expected 90, received 100">CartTest:72</failure>
    </testcase>
  </testsuite>
</testsuites>
```

Tests are matched across reports by **classname + testcase name**. When `classname` is absent or blank, the nearest containing suite name is used. Names are trimmed, and matching is case-sensitive. Each test identity must be unique within its report.

| Result | Meaning |
| --- | --- |
| Passed | No failure, error, or skipped result |
| Failed | A `<failure>` result |
| Error | An `<error>` result; takes priority over failure |
| Skipped | A `<skipped>` result without failure or error |
| Missing | The test does not appear in that report |

Reported execution times are interpreted as seconds. Missing or invalid durations appear as **Not reported**. Failure and error messages are shown as plain text.

Malformed XML, duplicate test identities, invalid test cases, and reports outside the supported limits are rejected with a useful error.

## Understanding the matrix

RunMatrix groups tests by their **observed** outcomes:

- **Mixed outcomes:** At least one passing result and one failure or error.
- **Failed in all observed runs:** Every recorded result is Failed or Error.
- **Passed in all observed runs:** Every recorded result is Passed.
- **Skipped / partial:** Other combinations, including skipped executions.

Missing cells are not counted as executions. A test can therefore be classified as passing or failing in all *observed* runs even when it is absent from some reports. The summary cards describe the full comparison, regardless of active search or filters.

An **↑** marker highlights a failure or error following the previous available passing result in the chosen run order. Missing cells are skipped when looking backward; a Skipped result interrupts that sequence.

These patterns describe the reports you selected. A change in status does not, by itself, establish why a test behaved differently.

## Limits

- **2–12 reports** per comparison
- **2 MiB** per report
- **1,000 distinct tests** across all reports

Long reports may produce a wide or lengthy matrix. Data is kept for the current browser session only.

## Development

Requires Node.js 22.12 or newer in the Node.js 22 series and npm.

```sh
npm ci
npm run dev
```

To run tests and build:

```sh
npm test
npm run build
npm run preview
```

Built with React, TypeScript, Vite, Vitest, and plain CSS. The included demo XML files use the same parsing and comparison logic as imported reports. Automated tests cover parsing, classification, totals, and interface behavior.

GitHub Actions runs tests and builds on pushes and pull requests. A separate workflow publishes the production build to GitHub Pages.

## License

[MIT](LICENSE) © 2026 TohruSu.
