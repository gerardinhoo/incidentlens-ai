import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisBadge, getAnalysisIndicatorState } from './AnalysisBadge';

describe('getAnalysisIndicatorState', () => {
  it('maps undefined analysis to none', () => {
    expect(getAnalysisIndicatorState(undefined)).toBe('none');
  });

  it('maps analysis statuses directly', () => {
    expect(getAnalysisIndicatorState({ status: 'completed' })).toBe(
      'completed',
    );
    expect(getAnalysisIndicatorState({ status: 'pending' })).toBe('pending');
    expect(getAnalysisIndicatorState({ status: 'failed' })).toBe('failed');
  });
});

describe('AnalysisBadge', () => {
  it('renders AI Analyzed for completed analysis', () => {
    render(<AnalysisBadge analysis={{ status: 'completed' }} />);
    expect(screen.getByText('AI Analyzed')).toBeInTheDocument();
  });

  it('renders Analyzing… for pending analysis', () => {
    render(<AnalysisBadge analysis={{ status: 'pending' }} />);
    expect(screen.getByText('Analyzing…')).toBeInTheDocument();
  });

  it('renders Analysis failed for failed analysis', () => {
    render(<AnalysisBadge analysis={{ status: 'failed' }} />);
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();
  });

  it('renders Not analyzed when analysis is absent', () => {
    render(<AnalysisBadge analysis={undefined} />);
    expect(screen.getByText('Not analyzed')).toBeInTheDocument();
  });
});
