import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScorePattern from './ScorePattern';

describe('ScorePattern', () => {
  it('renders five cells for a five-char score', () => {
    const { container } = render(<ScorePattern score="b-w-b" />);
    const cells = container.querySelectorAll('span[aria-hidden="true"]');
    expect(cells).toHaveLength(5);
  });

  it('is case-insensitive and exposes an accessible label', () => {
    render(<ScorePattern score="BBBBB" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAccessibleName(/correct/i);
  });

  it('labels present and absent letters', () => {
    render(<ScorePattern score="-w---" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAccessibleName(/present/i);
    expect(img).toHaveAccessibleName(/absent/i);
  });
});
