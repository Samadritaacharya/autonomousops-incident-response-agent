import type { EvaluationCase } from './contracts.ts'
import fixtures from './evaluation-fixtures.json' with { type: 'json' }

export const evaluationCases = fixtures as EvaluationCase[]
