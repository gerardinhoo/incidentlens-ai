import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IncidentSeverity } from '../types/incident';
import { SeverityBadge } from './SeverityBadge';

const cases: Array<[IncidentSeverity, string]> = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['critical', 'Critical'],
];

describe('SeverityBadge', () => {
  it.each(cases)('renders %s as %s', (severity, label) => {
    render(<SeverityBadge severity={severity} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
