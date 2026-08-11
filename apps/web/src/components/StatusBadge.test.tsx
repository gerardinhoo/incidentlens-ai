import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IncidentStatus } from '../types/incident';
import { StatusBadge } from './StatusBadge';

const cases: Array<[IncidentStatus, string]> = [
  ['open', 'Open'],
  ['investigating', 'Investigating'],
  ['resolved', 'Resolved'],
];

describe('StatusBadge', () => {
  it.each(cases)('renders %s as %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
