export interface AIDraft {
  concept: string
  explanation: string
  hint: string
  recallQuestion: string
  expectedAnswer: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAIDraft(content: string): AIDraft {
  const json = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('The model returned invalid JSON. Try generating again or create the card manually.')
  }

  if (!isRecord(value)) {
    throw new Error('The model returned an incomplete draft. Try again or create the card manually.')
  }

  const record = value
  const fields = ['concept', 'explanation', 'hint', 'recallQuestion', 'expectedAnswer'] as const
  function readField(field: (typeof fields)[number]): string {
    const entry = record[field]
    if (typeof entry !== 'string' || !entry.trim() || entry.length > 1600) {
      throw new Error('The model returned an incomplete draft. Try again or create the card manually.')
    }
    return entry.trim()
  }
  return {
    concept: readField(fields[0]),
    explanation: readField(fields[1]),
    hint: readField(fields[2]),
    recallQuestion: readField(fields[3]),
    expectedAnswer: readField(fields[4]),
  }
}
