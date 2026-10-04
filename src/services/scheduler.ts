import { addLocalDays, getLocalTimeZone, localDateKey } from './dates'
import type { ReviewCard, ReviewEvent, ReviewRating } from '../types'

const INTERVALS: Record<ReviewRating, number> = {
  again: 1,
  hard: 3,
  remembered: 7,
}

export function dueCards(cards: ReviewCard[], today = localDateKey()): ReviewCard[] {
  return cards
    .filter((card) => card.dueDate <= today)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.createdAt.localeCompare(right.createdAt))
}

export function scheduleReview(
  card: ReviewCard,
  rating: ReviewRating,
  reviewedAt = new Date(),
  timeZone = getLocalTimeZone(),
): { card: ReviewCard; event: ReviewEvent } {
  const timestamp = reviewedAt.toISOString()
  const day = localDateKey(reviewedAt, timeZone)
  return {
    card: {
      ...card,
      dueDate: addLocalDays(day, INTERVALS[rating]),
      lastReviewedAt: timestamp,
      reviewCount: card.reviewCount + 1,
    },
    event: {
      id: crypto.randomUUID(),
      cardId: card.id,
      reviewedAt: timestamp,
      day,
      timeZone,
      rating,
    },
  }
}
