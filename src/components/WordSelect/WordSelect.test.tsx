import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WordSelect from './WordSelect';
import { buildFirstLetterIndex } from '../../data/wordLists';

const OPTIONS = ['crane', 'crate', 'craze', 'clint', 'soare', 'abbot'];
const INDEX = buildFirstLetterIndex(OPTIONS);

function setup(value = '') {
  const onChange = vi.fn();
  render(
    <WordSelect
      label="Word"
      value={value}
      onChange={onChange}
      options={OPTIONS}
      index={INDEX}
    />,
  );
  return { onChange, input: screen.getByRole('combobox') };
}

describe('WordSelect', () => {
  it('filters options by prefix as the user types', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    await user.type(input, 'cra');

    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['crane', 'crate', 'craze']);
    expect(options).not.toContain('clint');
  });

  it('commits a value via keyboard navigation (ArrowDown + Enter)', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    await user.type(input, 'cra');
    await user.keyboard('{ArrowDown}'); // highlight second option (crate)
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('crate');
  });

  it('commits by clicking an option', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    await user.type(input, 'soa');
    await user.click(screen.getByText('soare'));
    expect(onChange).toHaveBeenCalledWith('soare');
  });

  it('cannot commit a value that is not in the options', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    await user.type(input, 'zzzzz');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalledWith('zzzzz');
    // No listbox options for an unmatched prefix.
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('commits a fully-typed valid word on blur (tabbing away)', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.click(input);
    await user.type(input, 'crate');
    await user.tab(); // blur without touching the dropdown
    expect(onChange).toHaveBeenCalledWith('crate');
    expect((input as HTMLInputElement).value).toBe('crate');
  });

  it('reverts an invalid typed value on blur', async () => {
    const user = userEvent.setup();
    const { input } = setup('crane');
    await user.clear(input);
    await user.type(input, 'zzz');
    await user.tab(); // blur
    expect((input as HTMLInputElement).value).toBe('crane');
  });
});
