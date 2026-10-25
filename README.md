# RunMatrix

RunMatrix compares local JUnit XML test reports in an interactive test-by-run matrix. See mixed outcomes, repeated failures, skipped executions, and missing tests without uploading your reports.

## Use it

Once deployed, open [RunMatrix](https://tohrusu.github.io/RunMatrix/). GitHub Pages opens with five small synthetic runs; locally, use **Load demo** or start with your own files.

1. Select **Import XML reports** and choose 2–12 files together. A new batch replaces the current comparison only after every report validates.
2. Set the comparison order with each report’s **Up / Down** controls. Columns run from earlier to later in the order you choose; report timestamps are not used to infer chronology.
3. Search by test name or class/suite, or filter by observed outcomes. Summary counts always describe the whole comparison.
4. Select a result cell to read its status, duration, and available failure/error output. Long output has a preview and an expandable full-text view.

The matrix scrolls horizontally on small screens. Use Tab to enter the results, arrow keys to move between cells, Home/End to move within a row, Ctrl+Home/End to reach a corner, and Enter or Space to inspect a result.

Reports stay in browser memory. Refreshing the page clears imported data. No account, server, storage, or external service is used.

## JUnit support

Use UTF-8 XML with a `<testsuite>` root or a `<testsuites>` wrapper. Multiple and nested suites, optional `classname` and `time`, and direct `<failure>`, `<error>`, and `<skipped>` testcase children are supported. Results come from actual `<testcase>` elements, regardless of suite counters.

```xml
<testsuites>
  <testsuite name="Checkout">
    <testcase classname="CartTest" name="calculates the total" time="0.025" />
    <testcase classname="CartTest" name="applies a promotion" time="0.032">
      <failure type="AssertionError" message="Expected 90, received 100">CartTest:72</failure>
    </testcase>
  </testsuite>
</testsuites>
```

Test identity is the pair **(classname, testcase name)**. When classname is absent or blank, the nearest containing testsuite’s name is used instead. Names are trimmed; matching is case-sensitive. An unnamed suite uses an empty scope. The pair is encoded as a tuple, so separator characters do not cause collisions. Duplicate identities within a report are rejected; separate suites need distinct class/suite names when testcase names overlap. Parameterized executions must have distinct names.

| Cell | Meaning |
| --- | --- |
| Passed ✓ | No direct failure, error, or skipped child |
| Failed × | At least one direct failure child |
| Error ! | At least one direct error child; takes priority over failure |
| Skipped » | A direct skipped child, with no failure or error |
| Missing − | This identity is absent from the report; no execution recorded |

All failure/error children retain their available message, type, and text. Missing, negative, nonnumeric, or nonfinite durations are shown as **Not reported**. Valid nonnegative durations are interpreted as seconds.

The native XML `DOMParser` parses XML, and parser errors are handled explicitly. Malformed XML, unexpected roots, empty reports, blank testcase names, duplicate identities, DOCTYPE/entity declaration markers, and over-limit inputs are rejected. Testcases must belong to a testsuite. Imported names and output are rendered as plain text; XML content is never inserted as HTML or used to load external resources.

## Reading the comparison

Categories are based on available executions, with missing cells excluded:

- **Mixed outcomes:** at least one pass and one failure/error, including histories that also contain skipped results.
- **Failed in all observed runs:** every available execution is failed or error, with no pass or skip.
- **Passed in all observed runs:** every available execution passed, with no failure, error, or skip.
- **Skipped / partial:** remaining histories, such as all skipped, pass + skip, or fail + skip.

A single observed pass or failure can qualify for an “all observed” category even when other reports are missing that test. Rows are sorted by scope and test name using deterministic, case-sensitive ordering. Reordering reports changes columns and change markers, while identities and categories remain stable.

The **↑** marker means a failure/error follows the previous available passing execution in the selected order, looking past missing cells. A skipped execution interrupts that comparison. Mixed outcomes and change markers describe the supplied reports; code revisions, environments, or configurations may differ, so they do not establish flakiness or a code regression.

Summary cards count distinct tests out of all distinct tests. Recorded executions include passed, failed, error, and skipped results. Matrix cells equal distinct tests × reports; missing cells are counted separately and never as execution failures.

## Limits

- 2–12 reports per batch
- 2 MiB (2,097,152 bytes) per report
- 1,000 distinct test identities across the batch

The matrix renders without virtualization within these limits. This version focuses on inspecting local reports; it does not execute tests or retain historical data.

## Development

Use Node.js 22 (22.12 or newer) and npm.

```sh
npm ci
npm run dev
```

```sh
npm test           # Vitest + React Testing Library; one complete run
npm run test:watch # Interactive tests
npm run build      # TypeScript checking + production bundle in dist/
npm run preview    # Serve the production build locally
```

React and TypeScript handle the UI, plain CSS handles layout, and pure comparison functions build and filter the matrix. The five XML files in `src/demo/` go through the same parser and batch validation as imports. Tests cover parsing, identities, limits, classification, totals, safe text rendering, and user interactions.

CI installs with `npm ci`, tests, and builds on main pushes and pull requests. The separate Pages workflow tests and builds before deploying `dist/` on main pushes or manual dispatch. When publishing the repository, set **Settings → Pages → Source** to **GitHub Actions**. Relative asset paths support the `/RunMatrix/` project path. The workflows are prepared; running local commands does not publish the app. Workflow structure follows the [official GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages); asset configuration follows [Vite’s relative-base guidance](https://vite.dev/guide/build#relative-base).

## License

[MIT](LICENSE) © 2026 TohruSu.
