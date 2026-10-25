import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { shouldLoadDemo } from './demo';

const file = (name: string, cases = '<testcase name="checks a total" classname="Cart"/>') => new File([`<testsuite name="Suite">${cases}</testsuite>`], name, { type: 'application/xml' });
const uploadInput = () => screen.getByLabelText('Select JUnit XML reports');
async function demo() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Load demo/ }));
  await screen.findByRole('heading', { name: /Test matrix/ });
  return user;
}
const matrix = () => screen.getByRole('table');
const headings = () => within(matrix()).getAllByRole('columnheader').slice(1).map((heading) => heading.textContent);

describe('comparison workspace', () => {
  it('offers an empty state and opens the demo through one click', async () => {
    const user = userEvent.setup(); render(<App />);
    expect(screen.getByRole('heading', { name: 'Your test runs, side by side.' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Explore the 5-run demo/ }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(headings()).toHaveLength(5);
    expect(within(matrix()).getAllByRole('row')).toHaveLength(13);
    expect(screen.getByText('5 reports · 57 recorded executions · 3 missing cells')).toBeInTheDocument();
  });

  it('automatically loads the demo on the configured GitHub Pages hostname', () => {
    expect(shouldLoadDemo('tohrusu.github.io')).toBe(true);
    expect(shouldLoadDemo('localhost')).toBe(false);
    expect(shouldLoadDemo('tohrusu.github.io.example.com')).toBe(false);
  });

  it('imports a complete valid batch and resets filters and selection', async () => {
    const user = await demo();
    await user.type(screen.getByRole('searchbox'), 'session');
    await user.upload(uploadInput(), [file('local-a.xml'), file('local-b.xml', '<testcase name="checks a total" classname="Cart"><failure message="Total differs">expected 10, got 12</failure></testcase>')]);
    await screen.findByText('2 reports · 2 recorded executions · 0 missing cells');
    expect(headings()[0]).toContain('local-a.xml');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByText('LOCAL FILES')).toBeInTheDocument();
    expect(within(matrix()).getByRole('button', { name: /local-b.xml: Failed/ })).toBeInTheDocument();
  });

  it('preserves reports, ordering, search, and selection when any file is invalid', async () => {
    const user = await demo();
    await user.click(within(matrix()).getByRole('button', { name: /rejects an expired token.*01-baseline.xml: Failed/ }));
    await user.type(screen.getByRole('searchbox'), 'expired');
    const before = headings();
    await user.upload(uploadInput(), [file('valid.xml'), new File(['<testsuite>'], 'broken.xml', { type: 'application/xml' })]);
    expect(await screen.findByRole('alert')).toHaveTextContent('broken.xml: malformed XML');
    expect(headings()).toEqual(before);
    expect(screen.getByRole('searchbox')).toHaveValue('expired');
    expect(screen.getByText(/Expected 401, received 200/)).toBeInTheDocument();
    expect(within(matrix()).getAllByRole('row')).toHaveLength(2);
  });

  it('shows useful errors for report-count and file-size violations', async () => {
    const user = userEvent.setup(); render(<App />);
    await user.upload(uploadInput(), [file('only.xml')]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Select 2–12');
    const oversized = new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'large.xml', { type: 'application/xml' });
    await user.upload(uploadInput(), [oversized, file('ok.xml')]);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('large.xml: exceeds the 2 MiB'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('searches by class or name and clears a no-match state', async () => {
    const user = await demo(); const search = screen.getByRole('searchbox');
    await user.type(search, 'SESSIONTEST');
    expect(within(matrix()).getAllByRole('row')).toHaveLength(4);
    await user.clear(search); await user.type(search, 'does not exist');
    expect(screen.getByRole('heading', { name: 'No matching tests' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(within(matrix()).getAllByRole('row')).toHaveLength(13);
  });

  it('filters mixed outcomes without altering summary totals', async () => {
    const user = await demo();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by observed outcome' }), 'mixed');
    expect(within(matrix()).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('Showing 3 of 12 tests')).toBeInTheDocument();
    expect(screen.getByText('5 reports · 57 recorded executions · 3 missing cells')).toBeInTheDocument();
    const mixedCard = screen.getByRole('button', { name: /Mixed outcomes: 3/ });
    expect(mixedCard).toHaveAttribute('aria-pressed', 'true');
    await user.click(mixedCard);
    expect(within(matrix()).getAllByRole('row')).toHaveLength(13);
  });

  it('reorders runs with labeled Up/Down buttons, retaining the selected execution', async () => {
    const user = await demo();
    await user.click(within(matrix()).getByRole('button', { name: /refreshes the session.*02-session-change.xml: Failed/ }));
    const identities = within(matrix()).getAllByRole('rowheader').map((heading) => heading.textContent);
    await user.click(screen.getByRole('button', { name: 'Move 02-session-change.xml up' }));
    expect(headings()[0]).toContain('02-session-change.xml');
    expect(headings()[1]).toContain('01-baseline.xml');
    expect(within(matrix()).getAllByRole('rowheader').map((heading) => heading.textContent)).toEqual(identities);
    expect(screen.getByRole('button', { name: 'Move 02-session-change.xml up' })).toBeDisabled();
    expect(within(matrix()).getByRole('button', { name: /refreshes the session.*02-session-change.xml: Failed/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Expected a fresh access token/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move 02-session-change.xml down' }));
    expect(headings()[0]).toContain('01-baseline.xml');
  });

  it('exposes all five statuses as accessible labels and reads failure details', async () => {
    const user = await demo();
    const buttons = within(matrix()).getAllByRole('button');
    for (const status of ['Passed', 'Failed', 'Error', 'Skipped', 'Missing']) expect(buttons.some((button) => button.getAttribute('aria-label')?.includes(`: ${status}`))).toBe(true);
    const legend = screen.getByRole('list', { name: 'Result legend' });
    for (const status of ['Passed', 'Failed', 'Error', 'Skipped', 'Missing']) expect(within(legend).getByText(status)).toBeInTheDocument();
    await user.click(within(matrix()).getByRole('button', { name: /returns a payment receipt.*03-checkout-change.xml: Failed/ }));
    const details = screen.getByRole('region', { name: 'Result details' });
    expect(within(details).getByText(/Receipt is missing its order reference/)).toHaveTextContent('PaymentTest.ts:64');
    expect(within(details).getByText('0.282 s')).toBeInTheDocument();
  });

  it('shows missing and skipped details separately', async () => {
    const user = await demo();
    await user.click(within(matrix()).getByRole('button', { name: /shows stock availability.*01-baseline.xml: Missing/ }));
    expect(screen.getByText('Not present in this report')).toBeInTheDocument();
    await user.click(within(matrix()).getByRole('button', { name: /suggests matching products.*01-baseline.xml: Skipped/ }));
    expect(screen.getByText('Suggestion fixture is not enabled')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
  });

  it('supports arrow-key navigation with one result in the tab sequence', async () => {
    const user = await demo();
    const buttons = within(matrix()).getAllByRole('button');
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    buttons[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(buttons[6]).toHaveFocus();
    await user.keyboard('{End}');
    expect(buttons[9]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(buttons[9]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
  });

  it('renders untrusted names and output as text and makes long output accessible', async () => {
    const user = userEvent.setup(); const { container } = render(<App />);
    const text = 'Trace line. '.repeat(200);
    const cases = `<testcase classname="Safe" name="&lt;img src=x&gt;"><failure message="&lt;script&gt;alert(1)&lt;/script&gt;">${text}</failure></testcase>`;
    await user.upload(uploadInput(), [file('safe-a.xml', cases), file('safe-b.xml', cases)]);
    const button = await screen.findByRole('button', { name: /<img src=x>.*safe-a.xml: Failed/ });
    await user.click(button);
    expect(container.querySelector('img, script')).toBeNull();
    expect(screen.getByLabelText('failure output preview')).toHaveTextContent('<script>alert(1)</script>');
    expect(screen.getByLabelText('failure output preview').textContent!.length).toBeLessThan(1300);
    const full = screen.getByText(/Read all available text/);
    await user.click(full);
    expect(screen.getByLabelText('Full failure output')).toBeVisible();
    expect(screen.getByLabelText('Full failure output')).toHaveTextContent(text.trim());
  });

  it('allows retrying the same invalid file selection', async () => {
    render(<App />);
    const files = [file('one.xml')];
    fireEvent.change(uploadInput(), { target: { files } });
    await screen.findByRole('alert');
    fireEvent.change(uploadInput(), { target: { files } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Select 2–12'));
    expect(uploadInput()).toHaveValue('');
  });
});
