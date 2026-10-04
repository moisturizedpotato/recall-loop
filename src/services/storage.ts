import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { addLocalDays, getGoalForDay, getLocalTimeZone, localDateKey } from './dates'
import type { AppPreferences, ReviewCard, ReviewEvent, StudyTask, ThemePreference } from '../types'

export const DEFAULT_DAILY_GOAL = 5

export function createDefaultPreferences(): AppPreferences {
  return {
    key: 'app',
    dailyGoalChanges: [],
    studyTimeZone: getLocalTimeZone(),
    theme: 'system',
  }
}

interface RecallLoopDB extends DBSchema {
  cards: {
    key: string
    value: ReviewCard
    indexes: { 'by-due-date': string }
  }
  reviews: {
    key: string
    value: ReviewEvent
    indexes: { 'by-day': string }
  }
  preferences: {
    key: string
    value: AppPreferences
  }
  studyTasks: {
    key: string
    value: StudyTask
    indexes: { 'by-created-day': string }
  }
}

let databasePromise: Promise<IDBPDatabase<RecallLoopDB>> | undefined

function database(): Promise<IDBPDatabase<RecallLoopDB>> {
  databasePromise ??= openDB<RecallLoopDB>('recall-loop', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' })
        cards.createIndex('by-due-date', 'dueDate')
        const reviews = db.createObjectStore('reviews', { keyPath: 'id' })
        reviews.createIndex('by-day', 'day')
      }
      if (oldVersion < 2) db.createObjectStore('preferences', { keyPath: 'key' })
      if (oldVersion < 3) {
        const tasks = db.createObjectStore('studyTasks', { keyPath: 'id' })
        tasks.createIndex('by-created-day', 'createdDay')
      }
    },
    blocked() {
      window.dispatchEvent(new Event('recall-loop-storage-blocked'))
    },
  })
  return databasePromise
}

export async function loadStudyData(): Promise<{ cards: ReviewCard[]; reviews: ReviewEvent[]; tasks: StudyTask[]; preferences: AppPreferences }> {
  const db = await database()
  const [cards, reviews, tasks] = await Promise.all([db.getAll('cards'), db.getAll('reviews'), db.getAll('studyTasks')])
  const preferences = await getPreferences()
  const normalizedCards = cards.map((card) => ({
    ...card,
    createdDay: card.createdDay ?? localDateKey(new Date(card.createdAt), preferences.studyTimeZone),
  }))
  await Promise.all(normalizedCards.filter((card) => !cards.find((original) => original.id === card.id)?.createdDay).map((card) => db.put('cards', card)))
  return {
    cards: normalizedCards,
    reviews: reviews.map((review) => ({ ...review, timeZone: review.timeZone ?? preferences.studyTimeZone })),
    tasks,
    preferences,
  }
}

export async function getPreferences(): Promise<AppPreferences> {
  const db = await database()
  const transaction = db.transaction('preferences', 'readwrite')
  const existing = await transaction.store.get('app')
  if (existing) {
    await transaction.done
    return existing
  }
  const defaults = createDefaultPreferences()
  await transaction.store.put(defaults)
  await transaction.done
  return defaults
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  await (await database()).put('preferences', preferences)
}

export async function saveDailyGoal(target: number, today: string): Promise<AppPreferences> {
  if (!Number.isInteger(target) || target < 1 || target > 20) {
    throw new Error('Daily goal must be a whole number between 1 and 20.')
  }
  const preferences = await getPreferences()
  const currentTarget = getGoalForDay(preferences.dailyGoalChanges, today, DEFAULT_DAILY_GOAL)
  const pastChanges = preferences.dailyGoalChanges.filter((change) => change.effectiveDay <= today)
  const dailyGoalChanges = target === currentTarget
    ? pastChanges
    : [...pastChanges, { target, effectiveDay: addLocalDays(today, 1) }]
  const updated = { ...preferences, dailyGoalChanges }
  await savePreferences(updated)
  return updated
}

export async function saveTheme(theme: ThemePreference): Promise<AppPreferences> {
  const updated = { ...await getPreferences(), theme }
  await savePreferences(updated)
  return updated
}

export async function saveCard(card: ReviewCard): Promise<void> {
  await (await database()).put('cards', card)
}

export async function saveReview(card: ReviewCard, event: ReviewEvent): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['cards', 'reviews'], 'readwrite')
  await Promise.all([
    transaction.objectStore('cards').put(card),
    transaction.objectStore('reviews').put(event),
    transaction.done,
  ])
}

export async function saveStudyTask(task: StudyTask): Promise<void> {
  await (await database()).put('studyTasks', task)
}

export async function completeStudyTask(taskId: string, day: string): Promise<StudyTask> {
  const db = await database()
  const transaction = db.transaction('studyTasks', 'readwrite')
  const task = await transaction.store.get(taskId)
  if (!task) {
    await transaction.done
    throw new Error('Study task no longer exists.')
  }
  const updated = task.completedDays.includes(day)
    ? task
    : { ...task, completedDays: [...task.completedDays, day].sort() }
  await transaction.store.put(updated)
  await transaction.done
  return updated
}

export async function exportStudyData(): Promise<{ exportedAt: string; cards: ReviewCard[]; reviews: ReviewEvent[]; tasks: StudyTask[]; preferences: AppPreferences }> {
  const data = await loadStudyData()
  return { exportedAt: new Date().toISOString(), ...data }
}

export async function deleteAllStudyData(): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['cards', 'reviews', 'preferences', 'studyTasks'], 'readwrite')
  await Promise.all([
    transaction.objectStore('cards').clear(),
    transaction.objectStore('reviews').clear(),
    transaction.objectStore('preferences').clear(),
    transaction.objectStore('studyTasks').clear(),
    transaction.done,
  ])
}
