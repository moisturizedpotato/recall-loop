export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function localDateKey(date = new Date(), timeZone = getLocalTimeZone()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function addLocalDays(key: string, days: number): string {
  const date = dateFromKey(key)
  date.setUTCDate(date.getUTCDate() + days)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDate(
  key: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    ...(options ?? { month: 'short', day: 'numeric', year: 'numeric' }),
  }).format(dateFromKey(key))
}

export function getGoalForDay(
  changes: { target: number; effectiveDay: string }[],
  day: string,
  defaultTarget = 5,
): number {
  return [...changes]
    .sort((left, right) => left.effectiveDay.localeCompare(right.effectiveDay))
    .filter((change) => change.effectiveDay <= day)
    .at(-1)?.target ?? defaultTarget
}

export function getDailyProgress(reviews: { day: string; cardId: string }[], day: string): number {
  return new Set(reviews.filter((review) => review.day === day).map((review) => review.cardId)).size
}

export function getStudyStreak(
  activityDays: string[],
  today: string,
): { current: number; streakBroken: boolean } {
  const completed = new Set(activityDays.filter((day) => day <= today))
  let cursor = completed.has(today) ? today : addLocalDays(today, -1)
  let current = 0
  while (completed.has(cursor)) {
    current += 1
    cursor = addLocalDays(cursor, -1)
  }

  const yesterday = addLocalDays(today, -1)
  const streakBroken = !completed.has(yesterday)
    && [...completed].some((day) => day < yesterday)

  return { current, streakBroken }
}
