import type {
  IncidentAnalysis,
  IncidentAnalysisInput,
} from './incident-analysis.js';

/**
 * Provider-independent capability for AI-assisted incident analysis.
 * Implementations may be FakeIncidentAnalyzer (local/tests) or a future
 * Bedrock-backed analyzer — callers depend only on this interface.
 */
export interface IncidentAnalyzer {
  analyze(input: IncidentAnalysisInput): Promise<IncidentAnalysis>;
}
