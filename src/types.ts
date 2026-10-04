export interface MistakeInput {
  subject: string
  question: string
  wrongAnswer: string
  correctAnswer: string
  confusionNote: string
}

export interface CardContent {
  concept: string
  explanation: string
  hint: string
  recallQuestion: string
  expectedAnswer: string
}

export interface ReviewCard extends MistakeInput, CardContent {
  id: string
  createdAt: string
  createdDay?: string
  dueDate: string
  lastReviewedAt: string | null
  reviewCount: number
}

export type ReviewRating = 'again' | 'hard' | 'remembered'

export interface ReviewEvent {
  id: string
  cardId: string
  reviewedAt: string
  day: string
  timeZone?: string
  rating: ReviewRating
}

export interface DailyGoalChange {
  target: number
  effectiveDay: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppPreferences {
  key: 'app'
  dailyGoalChanges: DailyGoalChange[]
  studyTimeZone: string
  theme: ThemePreference
}

export interface StudyTask {
  id: string
  subject: string
  questionCount: number
  createdAt: string
  createdDay: string
  completedDays: string[]
}

export type Page = 'home' | 'add' | 'draft' | 'review' | 'progress' | 'settings'
