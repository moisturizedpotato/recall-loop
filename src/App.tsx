import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Flame,
  Gauge,
  Home,
  LockKeyhole,
  Menu,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Target,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  generateCardDraft,
  getAIState,
  getModelLabel,
  loadLocalModel,
  subscribeToAI,
  type AIState,
} from './ai/client'
import {
  addLocalDays,
  formatDate,
  getDailyProgress,
  getGoalForDay,
  getStudyStreak,
  getLocalTimeZone,
  localDateKey,
} from './services/dates'
import { dueCards, scheduleReview } from './services/scheduler'
import {
  createDefaultPreferences,
  deleteAllStudyData,
  exportStudyData,
  loadStudyData,
  saveCard,
  completeStudyTask,
  saveDailyGoal,
  saveReview,
  saveStudyTask,
  saveTheme,
} from './services/storage'
import type { AppPreferences, CardContent, MistakeInput, Page, ReviewCard, ReviewEvent, ReviewRating, StudyTask, ThemePreference } from './types'
import './App.css'

const EMPTY_MISTAKE: MistakeInput = {
  subject: '',
  question: '',
  wrongAnswer: '',
  correctAnswer: '',
  confusionNote: '',
}

const EMPTY_CONTENT: CardContent = {
  concept: '',
  explanation: '',
  hint: '',
  recallQuestion: '',
  expectedAnswer: '',
}

const NAV_ITEMS: { page: Exclude<Page, 'draft' | 'review'>; label: string; icon: LucideIcon }[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'add', label: 'Add a mistake', icon: Plus },
  { page: 'progress', label: 'Progress', icon: Gauge },
  { page: 'settings', label: 'Settings', icon: Settings },
]

const RATING_LABELS: Record<ReviewRating, string> = {
  again: 'Again',
  hard: 'Hard',
  remembered: 'Remembered',
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [cards, setCards] = useState<ReviewCard[]>([])
  const [reviews, setReviews] = useState<ReviewEvent[]>([])
  const [studyTasks, setStudyTasks] = useState<StudyTask[]>([])
  const [preferences, setPreferences] = useState<AppPreferences | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [aiState, setAIState] = useState<AIState>(getAIState())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [mistake, setMistake] = useState<MistakeInput>(EMPTY_MISTAKE)
  const [draft, setDraft] = useState<CardContent>(EMPTY_CONTENT)
  const [draftMode, setDraftMode] = useState<'ai' | 'manual'>('manual')
  const [draftApproved, setDraftApproved] = useState(false)
  const [formError, setFormError] = useState('')
  const [working, setWorking] = useState(false)
  const [reviewQueue, setReviewQueue] = useState<string[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    const storageWaitTimeout = window.setTimeout(() => {
      if (!mounted) return
      setLoading(false)
      setLoadError('Saved data is still waiting to open. Close any older Recall Loop tab, then reload this page to release the database safely.')
    }, 5000)
    const handleStorageBlocked = () => {
      if (!mounted) return
      window.clearTimeout(storageWaitTimeout)
      setLoading(false)
      setLoadError('Another Recall Loop tab is holding your saved data open. Close the older tab, then reload this page to finish the update safely.')
    }
    window.addEventListener('recall-loop-storage-blocked', handleStorageBlocked)
    loadStudyData()
      .then((data) => {
        if (!mounted) return
        window.clearTimeout(storageWaitTimeout)
        setCards(data.cards)
        setReviews(data.reviews)
        setStudyTasks(data.tasks)
        setPreferences(data.preferences)
        setLoadError('')
      })
      .catch(() => {
        window.clearTimeout(storageWaitTimeout)
        if (mounted) setLoadError('Your saved study data could not be opened. Try reloading this page.')
      })
      .finally(() => {
        window.clearTimeout(storageWaitTimeout)
        if (mounted) setLoading(false)
      })
    const unsubscribe = subscribeToAI(setAIState)
    const clockInterval = window.setInterval(() => setClock(Date.now()), 30_000)
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      mounted = false
      unsubscribe()
      window.clearInterval(clockInterval)
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
      window.removeEventListener('recall-loop-storage-blocked', handleStorageBlocked)
    }
  }, [])

  const studyTimeZone = preferences?.studyTimeZone ?? getLocalTimeZone()
  const now = new Date(clock)
  const today = localDateKey(now, studyTimeZone)
  const due = useMemo(() => dueCards(cards, today), [cards, today])
  const dailyGoal = preferences ? getGoalForDay(preferences.dailyGoalChanges, today) : 5
  const todayProgress = useMemo(() => getDailyProgress(reviews, today), [reviews, today])
  const activityDays = useMemo(() => [...new Set([
    ...cards.map((card) => card.createdDay ?? localDateKey(new Date(card.createdAt), studyTimeZone)),
    ...studyTasks.flatMap((task) => task.completedDays),
  ].filter((day) => day <= today))].sort(), [cards, studyTasks, studyTimeZone, today])
  const streak = useMemo(() => getStudyStreak(activityDays, today), [activityDays, today])
  const reviewCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const review of reviews) counts.set(review.day, (counts.get(review.day) ?? 0) + 1)
    return counts
  }, [reviews])
  const activeCard = cards.find((card) => card.id === reviewQueue[reviewIndex])

  useEffect(() => {
    if (!preferences) return
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = preferences.theme === 'system'
        ? systemTheme.matches ? 'dark' : 'light'
        : preferences.theme
    }
    applyTheme()
    systemTheme.addEventListener('change', applyTheme)
    return () => systemTheme.removeEventListener('change', applyTheme)
  }, [preferences])

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setNotice('')
    setFormError('')
    setMobileNavOpen(false)
  }

  function validateMistake(): string {
    if (!mistake.subject.trim()) return 'Add a subject before continuing.'
    if (!mistake.question.trim()) return 'Add the question you got wrong.'
    if (!mistake.wrongAnswer.trim()) return 'Add the answer you gave.'
    if (!mistake.correctAnswer.trim()) return 'Add the correct answer.'
    return ''
  }

  function openManualDraft() {
    const error = validateMistake()
    if (error) {
      setFormError(error)
      return
    }
    setDraft(EMPTY_CONTENT)
    setDraftMode('manual')
    setDraftApproved(false)
    setFormError('')
    navigate('draft')
  }

  async function generateDraft() {
    const error = validateMistake()
    if (error) {
      setFormError(error)
      return
    }
    if (aiState.status !== 'ready') {
      navigate('settings')
      setNotice('Set up the local model here, then return to your mistake to draft a card.')
      return
    }
    setWorking(true)
    setFormError('')
    try {
      const generated = await generateCardDraft({
        ...mistake,
        subject: mistake.subject.trim(),
        question: mistake.question.trim(),
        wrongAnswer: mistake.wrongAnswer.trim(),
        correctAnswer: mistake.correctAnswer.trim(),
        confusionNote: mistake.confusionNote.trim(),
      })
      setDraft(generated)
      setDraftMode('ai')
      setDraftApproved(false)
      navigate('draft')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The local model could not create a draft.')
    } finally {
      setWorking(false)
    }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draftMode === 'ai' && !draftApproved) {
      setFormError('Review the AI draft and confirm before saving.')
      return
    }
    const missing = Object.entries(draft).find(([, value]) => !value.trim())
    if (missing) {
      setFormError('Complete every card field before saving.')
      return
    }
    setWorking(true)
    const now = new Date()
    const card: ReviewCard = {
      ...mistake,
      ...draft,
      subject: mistake.subject.trim(),
      question: mistake.question.trim(),
      wrongAnswer: mistake.wrongAnswer.trim(),
      correctAnswer: mistake.correctAnswer.trim(),
      confusionNote: mistake.confusionNote.trim(),
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      createdDay: localDateKey(now, studyTimeZone),
      dueDate: localDateKey(now, studyTimeZone),
      lastReviewedAt: null,
      reviewCount: 0,
    }
    try {
      await saveCard(card)
      setCards((current) => [...current, card])
      setMistake(EMPTY_MISTAKE)
      setDraft(EMPTY_CONTENT)
      setDraftApproved(false)
      setNotice('Card saved. It counts as today’s streak activity.')
      setPage('home')
    } catch {
      setFormError('Your card could not be saved. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  async function setupModel() {
    setFormError('')
    setWorking(true)
    try {
      await loadLocalModel()
      setNotice('The local model is ready. Your study details stay on this device.')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The local model could not be loaded.')
    } finally {
      setWorking(false)
    }
  }

  async function updateDailyGoal(target: number) {
    setFormError('')
    try {
      const updated = await saveDailyGoal(target, today)
      setPreferences(updated)
      const nextTarget = getGoalForDay(updated.dailyGoalChanges, addLocalDays(today, 1))
      setNotice(
        nextTarget === dailyGoal
          ? `Your goal remains ${dailyGoal} cards per day.`
          : `Your new goal of ${nextTarget} cards per day takes effect tomorrow.`,
      )
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Your daily goal could not be saved.')
    }
  }

  async function updateTheme(theme: ThemePreference) {
    setFormError('')
    try {
      const updated = await saveTheme(theme)
      setPreferences(updated)
      setNotice(`Theme set to ${theme === 'system' ? 'follow your device' : theme} mode.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Your theme preference could not be saved.')
    }
  }

  async function createStudyTask(subject: string, questionCount: number): Promise<boolean> {
    const normalizedSubject = subject.trim()
    if (!normalizedSubject || !Number.isSafeInteger(questionCount) || questionCount < 1) {
      setFormError('Enter a subject and a positive whole number of questions.')
      return false
    }
    setFormError('')
    const createdAt = new Date()
    setClock(createdAt.getTime())
    const task: StudyTask = {
      id: crypto.randomUUID(),
      subject: normalizedSubject,
      questionCount,
      createdAt: createdAt.toISOString(),
      createdDay: localDateKey(createdAt, studyTimeZone),
      completedDays: [],
    }
    try {
      await saveStudyTask(task)
      setStudyTasks((current) => [...current, task])
      setNotice(`Study task created for ${questionCount} ${questionCount === 1 ? 'question' : 'questions'} in ${normalizedSubject}. Mark it complete when you finish.`)
      return true
    } catch {
      setFormError('Your study task could not be saved. Please try again.')
      return false
    }
  }

  async function finishStudyTask(taskId: string): Promise<boolean> {
    setFormError('')
    try {
      const completedAt = new Date()
      setClock(completedAt.getTime())
      const task = await completeStudyTask(taskId, localDateKey(completedAt, studyTimeZone))
      setStudyTasks((current) => current.map((item) => item.id === task.id ? task : item))
      setNotice(`Task complete. Your ${task.subject} practice counts toward today’s streak.`)
      return true
    } catch {
      setFormError('This task could not be marked complete. Please try again.')
      return false
    }
  }

  function startReview(includeSavedCards = false) {
    const dueNow = dueCards(cards, today)
    const completedToday = new Set(reviews.filter((review) => review.day === today).map((review) => review.cardId))
    const queue = includeSavedCards
      ? [...cards].sort((left, right) => {
          const leftDue = left.dueDate <= today
          const rightDue = right.dueDate <= today
          if (leftDue !== rightDue) return leftDue ? -1 : 1
          const leftComplete = completedToday.has(left.id)
          const rightComplete = completedToday.has(right.id)
          if (leftComplete !== rightComplete) return leftComplete ? 1 : -1
          return left.dueDate.localeCompare(right.dueDate) || left.createdAt.localeCompare(right.createdAt)
        })
      : dueNow
    if (!queue.length) return
    setReviewQueue(queue.map((card) => card.id))
    setReviewIndex(0)
    setAnswer('')
    setRevealed(false)
    navigate('review')
  }

  async function rateCard(rating: ReviewRating) {
    if (!activeCard) return
    setWorking(true)
    const result = scheduleReview(activeCard, rating, new Date(), studyTimeZone)
    try {
      await saveReview(result.card, result.event)
      setCards((current) => current.map((card) => card.id === result.card.id ? result.card : card))
      setReviews((current) => [...current, result.event])
      setAnswer('')
      setRevealed(false)
      setReviewIndex((current) => current + 1)
    } catch {
      setFormError('This review could not be saved. Your card has not been rescheduled.')
    } finally {
      setWorking(false)
    }
  }

  async function exportData() {
    setFormError('')
    try {
      const data = await exportStudyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `recall-loop-${localDateKey(new Date(), studyTimeZone)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Your study data has been exported to this device.')
    } catch {
      setFormError('Your data could not be exported. Please try again.')
    }
  }

  async function deleteData() {
    if (!window.confirm('Delete all your saved cards, study tasks, and review history from this browser? This cannot be undone.')) return
    setFormError('')
    try {
      await deleteAllStudyData()
      const data = await loadStudyData()
      setCards(data.cards)
      setReviews(data.reviews)
      setStudyTasks(data.tasks)
      setPreferences(data.preferences)
      setReviewQueue([])
      setReviewIndex(0)
      setNotice('All Recall Loop study data has been deleted from this browser.')
    } catch {
      setFormError('Your data could not be deleted. Please try again.')
    }
  }

  const currentPage = page === 'draft' ? 'add' : page === 'review' ? 'home' : page

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate('home') }}>
          <span className="brand-mark" aria-hidden="true"><RotateCcw size={20} strokeWidth={2.6} /></span>
          <span>recall loop<span className="brand-period">.</span></span>
        </a>
        <div className="nav-label">YOUR SPACE</div>
        <nav className="main-nav">
          {NAV_ITEMS.map(({ page: itemPage, label, icon: Icon }) => (
            <button
              className={`nav-item ${currentPage === itemPage ? 'nav-active' : ''}`}
              key={itemPage}
              onClick={() => navigate(itemPage)}
              aria-label={label}
              aria-current={currentPage === itemPage ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {itemPage === 'add' && <span className="nav-add"><Plus size={15} /></span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-chip"><LockKeyhole size={15} /><span>Your study stays yours</span></div>
          <div className="sidebar-footnote">A little better, one recall at a time.</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="topbar-breadcrumb"><span>Study space</span><ChevronRight size={15} /><strong>{page === 'draft' ? 'Review draft' : page === 'review' ? 'Review session' : NAV_ITEMS.find((item) => item.page === page)?.label}</strong></div>
          <div className="topbar-status"><span className={`status-dot ${aiState.status === 'ready' ? 'status-ready' : ''}`} />{aiState.status === 'ready' ? 'AI ready on device' : 'Private by default'}</div>
        </header>

        <div className="content-wrap">
          {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
          {notice && <div className="alert alert-success" role="status"><Check size={16} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
          {!isOnline && <div className="alert alert-offline" role="status"><LockKeyhole size={15} />You’re offline. Saved cards and manual reviews still work; a model not already cached can’t be downloaded.</div>}
          {loading ? (
            <div className="loading-state"><span className="loader" /><p>Opening your study space…</p></div>
          ) : loadError ? null : (
            <>
              {page === 'home' && (
                <HomePage
                  cards={cards}
                  due={due}
                  streak={streak}
                  streakBroken={streak.streakBroken}
                  tasks={studyTasks}
                  onCreateTask={createStudyTask}
                  onCompleteTask={finishStudyTask}
                  dailyGoal={dailyGoal}
                  todayProgress={todayProgress}
                  onAdd={() => navigate('add')}
                  onReview={startReview}
                  onPractice={() => startReview(true)}
                  reviewCounts={reviewCounts}
                  reviews={reviews}
                  today={today}
                />
              )}
              {page === 'add' && (
                <AddPage
                  mistake={mistake}
                  setMistake={setMistake}
                  onManual={openManualDraft}
                  onGenerate={generateDraft}
                  aiState={aiState}
                  working={working}
                  error={formError}
                  clearError={() => setFormError('')}
                  onSetup={() => navigate('settings')}
                />
              )}
              {page === 'draft' && (
                <DraftPage
                  mistake={mistake}
                  draft={draft}
                  setDraft={setDraft}
                  mode={draftMode}
                  approved={draftApproved}
                  setApproved={setDraftApproved}
                  error={formError}
                  working={working}
                  onSubmit={saveDraft}
                  onCancel={() => navigate('add')}
                />
              )}
              {page === 'review' && (
                <ReviewPage
                  card={activeCard}
                  index={reviewIndex}
                  total={reviewQueue.length}
                  answer={answer}
                  setAnswer={setAnswer}
                  revealed={revealed}
                  setRevealed={setRevealed}
                  onRate={rateCard}
                  onExit={() => navigate('home')}
                  onProgress={() => navigate('progress')}
                  onPractice={() => startReview(true)}
                  goalProgress={todayProgress}
                  goalTarget={dailyGoal}
                  savedCards={cards.length}
                  working={working}
                  error={formError}
                  clearError={() => setFormError('')}
                />
              )}
              {page === 'progress' && (
                <ProgressPage
                  cards={cards}
                  reviews={reviews}
                  streak={streak}
                  activityDays={activityDays}
                  tasks={studyTasks}
                  reviewCounts={reviewCounts}
                  today={today}
                  todayProgress={todayProgress}
                  dailyGoal={dailyGoal}
                  timeZone={studyTimeZone}
                />
              )}
              {page === 'settings' && (
                <SettingsPage
                  aiState={aiState}
                  working={working}
                  error={formError}
                  onSetup={setupModel}
                  onExport={exportData}
                  onDelete={deleteData}
                  cardCount={cards.length}
                  studyTaskCount={studyTasks.length}
                  reviewCount={reviews.length}
                  preferences={preferences ?? createDefaultPreferences()}
                  today={today}
                  dailyGoal={dailyGoal}
                  studyTimeZone={studyTimeZone}
                  onGoalChange={updateDailyGoal}
                  onThemeChange={updateTheme}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function HomePage({
  cards,
  due,
  streak,
  streakBroken,
  tasks,
  onCreateTask,
  onCompleteTask,
  dailyGoal,
  todayProgress,
  onAdd,
  onReview,
  onPractice,
  reviewCounts,
  reviews,
  today,
}: {
  cards: ReviewCard[]
  due: ReviewCard[]
  streak: { current: number; streakBroken: boolean }
  streakBroken: boolean
  tasks: StudyTask[]
  onCreateTask: (subject: string, questionCount: number) => Promise<boolean>
  onCompleteTask: (taskId: string) => Promise<boolean>
  dailyGoal: number
  todayProgress: number
  onAdd: () => void
  onReview: () => void
  onPractice: () => void
  reviewCounts: Map<string, number>
  reviews: ReviewEvent[]
  today: string
}) {
  const remaining = Math.max(0, dailyGoal - todayProgress)
  const latestReviews = [...reviews].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).slice(0, 4)
  return (
    <>
      <PageHeading eyebrow="YOUR STUDY SPACE" title="A little practice goes a long way." description="Every mistake is a clue. Turn it into something you’ll remember." />
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-overline"><span className="hero-sparkle"><Sparkles size={14} /></span> TODAY’S RECALL</div>
          <h2>{due.length ? <>Ready to pick up<br />where you left off?</> : cards.length && remaining ? <>A little practice<br />goes a long way.</> : <>Make a little room<br />for what you know.</>}</h2>
          <p>{due.length ? `${due.length} ${due.length === 1 ? 'card is' : 'cards are'} due for review.` : cards.length && remaining ? 'No cards are due. Practice a saved card early to work toward your daily goal.' : 'No cards due right now. Add a mistake while it’s fresh, or enjoy the breathing room.'}</p>
          <button className="button button-primary hero-button" onClick={due.length ? onReview : cards.length && remaining ? onPractice : onAdd}>
            {due.length ? 'Review now' : cards.length && remaining ? 'Practice a card' : 'Add a mistake'}<ArrowRight size={17} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="flower flower-one">✳</div><div className="flower flower-two">✳</div>
          <div className="art-card art-card-back"><span /><span /><span /></div>
          <div className="art-card art-card-front"><span className="art-sun">✦</span><div className="art-card-line" /><div className="art-card-line short" /><span className="art-card-check"><Check size={14} /></span></div>
        </div>
        <div className="hero-counter"><span className="counter-number">{due.length}</span><span>due today</span></div>
      </section>

      <GoalProgressCard progress={todayProgress} target={dailyGoal} savedCards={cards.length} />
      {streakBroken && (
        <div className="streak-broken-message" role="status">
          <span aria-hidden="true">😔</span>
          <div><strong>Your streak broke yesterday.</strong><p>A day without a completed study task or a new card resets the streak. You can start again today.</p></div>
        </div>
      )}
      <StudyTasksSection tasks={tasks} today={today} onCreateTask={onCreateTask} onCompleteTask={onCompleteTask} />
      {due.length > 0 && due.length < remaining && cards.length > due.length && (
        <div className="practice-nudge">
          <span>Fewer due cards than your remaining goal? You can practice saved cards early after this session.</span>
          <button className="text-button" onClick={onPractice}>Practice saved cards <ArrowRight size={14} /></button>
        </div>
      )}

      <section className="stats-grid" aria-label="Study stats">
        <div className="stat-card">
          <span className="stat-icon stat-icon-peach"><Flame size={19} /></span>
          <div><div className="stat-label">CURRENT STREAK</div><div className="stat-value">{streak.current} <small>{streak.current === 1 ? 'day' : 'days'}</small></div></div>
          <span className="stat-note">{streak.current ? 'Study task or new card activity' : 'Complete a task or add a card'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue"><BookOpen size={19} /></span>
          <div><div className="stat-label">CARDS IN YOUR DECK</div><div className="stat-value">{cards.length} <small>{cards.length === 1 ? 'card' : 'cards'}</small></div></div>
          <span className="stat-note">{cards.length ? 'Built from your mistakes' : 'Your first card is one mistake away'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-green"><CheckCheck size={19} /></span>
          <div><div className="stat-label">TASKS COMPLETED TODAY</div><div className="stat-value">{tasks.filter((task) => task.completedDays.includes(today)).length} <small>of {tasks.length}</small></div></div>
          <span className="stat-note">Each task can count once a day</span>
        </div>
      </section>

      <div className="home-lower">
        <section className="surface-card week-card">
          <div className="section-heading"><div><span className="eyebrow">STEADY MOMENTS</span><h2>Your recent rhythm</h2></div><span className="soft-tag">Last 7 days</span></div>
          <WeekBars reviewCounts={reviewCounts} days={7} today={today} />
        </section>
        <section className="surface-card recent-card">
          <div className="section-heading"><div><span className="eyebrow">KEEPING IT FRESH</span><h2>Recently reviewed</h2></div><span className="soft-tag">{reviews.length} total</span></div>
          {latestReviews.length ? (
            <ul className="recent-list">
              {latestReviews.map((review) => {
                const card = cards.find((item) => item.id === review.cardId)
                return <li key={review.id}><span className="recent-mark"><Check size={14} /></span><span className="recent-title">{card?.subject ?? 'Study card'}<small>{formatDate(review.day, { month: 'short', day: 'numeric' })}</small></span><span className={`rating-pill rating-${review.rating}`}>{RATING_LABELS[review.rating]}</span></li>
              })}
            </ul>
          ) : <EmptyMessage icon={CircleHelp} title="Your history starts here" text="Finish a review and you’ll see it here." />}
        </section>
      </div>
      {cards.length === 0 && (
        <div className="first-card-note"><span className="first-card-icon"><Sparkles size={18} /></span><span><strong>Start with one question.</strong><small>No demo data here — your deck begins with your own mistakes.</small></span><button className="text-button" onClick={onAdd}>Add your first <ArrowRight size={15} /></button></div>
      )}
      <p className="today-caption">Today · {formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    </>
  )
}

function StudyTasksSection({
  tasks,
  today,
  onCreateTask,
  onCompleteTask,
}: {
  tasks: StudyTask[]
  today: string
  onCreateTask: (subject: string, questionCount: number) => Promise<boolean>
  onCompleteTask: (taskId: string) => Promise<boolean>
}) {
  const [subject, setSubject] = useState('')
  const [questionCount, setQuestionCount] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const todayTasks = tasks.filter((task) => task.createdDay <= today)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const count = Number(questionCount)
    if (!subject.trim() || !Number.isSafeInteger(count) || count < 1) {
      setError('Enter a subject and a positive whole number of questions.')
      return
    }
    setWorking(true)
    setError('')
    const created = await onCreateTask(subject, count)
    setWorking(false)
    if (created) {
      setSubject('')
      setQuestionCount('')
    } else {
      setError('Your task could not be saved. Please check your details and try again.')
    }
  }

  async function completeTask(taskId: string) {
    setWorking(true)
    setError('')
    if (!await onCompleteTask(taskId)) setError('This task could not be marked complete. Please try again.')
    setWorking(false)
  }

  return (
    <section className="surface-card study-tasks-card" aria-labelledby="study-tasks-heading">
      <div className="section-heading">
        <div><span className="eyebrow">A GOAL YOU CAN FINISH</span><h2 id="study-tasks-heading">Plan a study task</h2></div>
        <span className="soft-tag">Finishing a task keeps your streak</span>
      </div>
      <p className="tasks-intro">Choose a subject and how many questions you want to solve. When you’re done, mark the task complete. You can complete each saved task once per study day.</p>
      <form className="study-task-form" onSubmit={submitTask}>
        <label>
          <span>Subject</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} placeholder="e.g. Physics" required />
        </label>
        <label>
          <span>Questions to solve</span>
          <input value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} type="number" min="1" step="1" placeholder="e.g. 10" required />
        </label>
        <button className="button button-primary" type="submit" disabled={working}><Plus size={16} />Create task</button>
      </form>
      {error && <p className="task-error" role="alert">{error}</p>}
      {todayTasks.length ? (
        <ul className="study-task-list">
          {todayTasks.map((task) => {
            const completedToday = task.completedDays.includes(today)
            return (
              <li key={task.id}>
                <div className="task-subject-icon"><BookOpen size={17} /></div>
                <div className="study-task-copy">
                  <strong>{task.subject}</strong>
                  <span>{task.questionCount} {task.questionCount === 1 ? 'question' : 'questions'} · created {task.createdDay === today ? 'today' : formatDate(task.createdDay, { month: 'short', day: 'numeric' })}</span>
                  {completedToday && <small>Completed today — you can use this task again tomorrow.</small>}
                </div>
                <button className={`button ${completedToday ? 'button-secondary' : 'button-primary'}`} type="button" onClick={() => void completeTask(task.id)} disabled={working || completedToday}>
                  {completedToday ? <><Check size={15} />Done today</> : 'Mark complete'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyMessage icon={Target} title="No study tasks yet" text="Set a small, specific goal above. It will count toward your streak once you finish and mark it complete." />
      )}
    </section>
  )
}

function GoalProgressCard({
  progress,
  target,
  savedCards,
  compact = false,
}: {
  progress: number
  target: number
  savedCards: number
  compact?: boolean
}) {
  const remaining = Math.max(0, target - progress)
  const percent = Math.min(100, (progress / target) * 100)
  const message = remaining === 0
    ? 'Goal met — any more practice is a bonus.'
    : savedCards === 0
      ? 'Add your first card to start building today’s progress.'
      : savedCards < remaining
        ? 'You can practice saved cards early. Repeats still help, but count once.'
        : remaining === 1
          ? 'You’re close — one more different card will do it.'
          : `${remaining} more ${remaining === 1 ? 'card' : 'different cards'} to reach today’s goal.`
  return (
    <section className={`goal-progress-card ${compact ? 'goal-progress-compact' : ''}`} aria-label="Daily goal progress">
      <span className="goal-icon"><Target size={19} /></span>
      <div className="goal-progress-body">
        <div className="goal-progress-heading">
          <span className="eyebrow">TODAY’S GOAL</span>
          <strong>{Math.min(progress, target)} of {target} cards</strong>
        </div>
        <div
          className="goal-progress-track"
          role="progressbar"
          aria-label="Daily card goal"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(progress, target)}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <p>{message}</p>
      </div>
      <span className={`goal-completion-mark ${remaining === 0 ? 'goal-done' : ''}`} aria-hidden="true">
        {remaining === 0 ? <Check size={17} /> : `${Math.round(percent)}%`}
      </span>
    </section>
  )
}

function AddPage({
  mistake,
  setMistake,
  onManual,
  onGenerate,
  aiState,
  working,
  error,
  clearError,
  onSetup,
}: {
  mistake: MistakeInput
  setMistake: (mistake: MistakeInput) => void
  onManual: () => void
  onGenerate: () => void
  aiState: AIState
  working: boolean
  error: string
  clearError: () => void
  onSetup: () => void
}) {
  function update(field: keyof MistakeInput, value: string) {
    setMistake({ ...mistake, [field]: value })
    if (error) clearError()
  }
  return (
    <>
      <PageHeading eyebrow="A QUESTION WORTH KEEPING" title="Add a mistake" description="Capture what happened. We’ll turn it into a small card you can come back to." />
      <div className="form-layout">
        <form className="surface-card mistake-form" onSubmit={(event) => { event.preventDefault(); onGenerate() }}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <label className="field">
            <span>Subject <em>Required</em></span>
            <input value={mistake.subject} onChange={(event) => update('subject', event.target.value)} placeholder="e.g. Biology, Cell division" maxLength={120} autoComplete="off" />
          </label>
          <label className="field">
            <span>The question <em>Required</em></span>
            <textarea value={mistake.question} onChange={(event) => update('question', event.target.value)} placeholder="Write the question as you saw it…" rows={3} maxLength={2000} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>What I answered <em>Required</em></span>
              <textarea value={mistake.wrongAnswer} onChange={(event) => update('wrongAnswer', event.target.value)} placeholder="Your answer…" rows={3} maxLength={1000} />
            </label>
            <label className="field">
              <span>The correct answer <em>Required</em></span>
              <textarea value={mistake.correctAnswer} onChange={(event) => update('correctAnswer', event.target.value)} placeholder="The answer key’s answer…" rows={3} maxLength={1000} />
            </label>
          </div>
          <label className="field">
            <span>What confused me <small>Optional</small></span>
            <textarea value={mistake.confusionNote} onChange={(event) => update('confusionNote', event.target.value)} placeholder="A detail you mixed up, or what made this tricky…" rows={2} maxLength={1000} />
          </label>
          <div className="form-divider" />
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={working || aiState.status === 'loading'}>
              <Sparkles size={16} />{working ? 'Generating locally…' : aiState.status === 'ready' ? 'Draft with local AI' : 'Set up local AI'}<ArrowRight size={16} />
            </button>
            <button type="button" className="button button-secondary" onClick={onManual} disabled={working}>Create manually</button>
          </div>
          <p className="form-privacy"><LockKeyhole size={14} />Your answers stay in this browser. Nothing is sent to an AI service.</p>
        </form>
        <aside className="form-aside">
          <div className="aside-note">
            <span className="aside-icon"><Sparkles size={18} /></span>
            <h3>A small card, not a lecture.</h3>
            <p>Your card will focus on one key concept, one clear explanation, a hint, and a new question to recall later.</p>
          </div>
          <div className={`model-status-card ${aiState.status === 'ready' ? 'model-status-ready' : ''}`}>
            <div className="model-status-top"><span className="status-dot" /><strong>{aiState.status === 'ready' ? 'Local AI is ready' : 'Local AI is optional'}</strong></div>
            <p>{aiState.status === 'ready' ? 'Draft cards on this device. You’ll review every field before saving.' : 'Set up the model in Settings, or fill the card in yourself.'}</p>
            {aiState.status !== 'ready' && <button className="inline-link" onClick={onSetup}>Model and privacy details <ArrowRight size={14} /></button>}
          </div>
        </aside>
      </div>
    </>
  )
}

function DraftPage({
  mistake,
  draft,
  setDraft,
  mode,
  approved,
  setApproved,
  error,
  working,
  onSubmit,
  onCancel,
}: {
  mistake: MistakeInput
  draft: CardContent
  setDraft: (draft: CardContent) => void
  mode: 'ai' | 'manual'
  approved: boolean
  setApproved: (approved: boolean) => void
  error: string
  working: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const fields: { key: keyof CardContent; label: string; hint: string; rows: number }[] = [
    { key: 'concept', label: 'Key concept', hint: 'What’s the core idea to remember?', rows: 2 },
    { key: 'explanation', label: 'Why the correct answer is right', hint: 'A short explanation in your own words is best.', rows: 3 },
    { key: 'hint', label: 'A hint for later', hint: 'A small nudge to help you retrieve it.', rows: 2 },
    { key: 'recallQuestion', label: 'New recall question', hint: 'Ask yourself this when the card comes up.', rows: 2 },
    { key: 'expectedAnswer', label: 'Expected answer', hint: 'The short answer you’ll compare your recall against.', rows: 2 },
  ]
  return (
    <>
      <PageHeading eyebrow="YOUR CARD, YOUR WORDS" title="Review this draft" description="Nothing is saved until you’re happy with it." />
      <div className="draft-layout">
        <form className="surface-card draft-form" onSubmit={onSubmit}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {mode === 'ai' && (
            <div className="draft-caution"><Sparkles size={16} /><span><strong>AI draft · not verified</strong><small>Check each claim against your question or study materials. The model can add incorrect explanations; edit or remove anything you can’t confirm.</small></span></div>
          )}
          {mode === 'manual' && <div className="draft-caution manual-caution"><BookOpen size={16} /><span><strong>Manual card</strong><small>Fill in each field with what you want to remember.</small></span></div>}
          <div className="draft-fields">
            {fields.map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}</span>
                <textarea value={draft[field.key]} onChange={(event) => { setDraft({ ...draft, [field.key]: event.target.value }); setApproved(false) }} placeholder={field.hint} rows={field.rows} maxLength={1600} />
              </label>
            ))}
          </div>
          <div className="form-divider" />
          {mode === 'ai' && (
            <label className="approve-check">
              <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
              <span>I’ve reviewed this AI draft and want to save it.</span>
            </label>
          )}
          <div className="form-actions draft-actions">
            <button type="submit" className="button button-primary" disabled={working || (mode === 'ai' && !approved)}><Check size={16} />Save review card</button>
            <button type="button" className="button button-secondary" onClick={onCancel} disabled={working}>Cancel</button>
          </div>
        </form>
        <aside className="surface-card source-card">
          <span className="eyebrow">YOUR ORIGINAL MISTAKE</span>
          <h2>{mistake.subject || 'Study note'}</h2>
          <div className="source-item"><span>QUESTION</span><p>{mistake.question}</p></div>
          <div className="source-item source-wrong"><span>YOUR ANSWER</span><p>{mistake.wrongAnswer}</p></div>
          <div className="source-item source-right"><span>CORRECT ANSWER</span><p>{mistake.correctAnswer}</p></div>
          {mistake.confusionNote && <div className="source-item"><span>WHAT CONFUSED YOU</span><p>{mistake.confusionNote}</p></div>}
          <div className="source-privacy"><LockKeyhole size={14} />Saved on this device only</div>
        </aside>
      </div>
    </>
  )
}

function ReviewPage({
  card,
  index,
  total,
  answer,
  setAnswer,
  revealed,
  setRevealed,
  onRate,
  onExit,
  onProgress,
  onPractice,
  goalProgress,
  goalTarget,
  savedCards,
  working,
  error,
  clearError,
}: {
  card: ReviewCard | undefined
  index: number
  total: number
  answer: string
  setAnswer: (answer: string) => void
  revealed: boolean
  setRevealed: (revealed: boolean) => void
  onRate: (rating: ReviewRating) => void
  onExit: () => void
  onProgress: () => void
  onPractice: () => void
  goalProgress: number
  goalTarget: number
  savedCards: number
  working: boolean
  error: string
  clearError: () => void
}) {
  if (!card) {
    return (
      <div className="session-finished">
        <div className="finish-icon"><CheckCheck size={28} /></div>
        <span className="eyebrow">THAT’S TODAY’S LOOP</span>
        <h1>You showed up for yourself.</h1>
        <p>{total} {total === 1 ? 'card' : 'cards'} practiced in this session. Extra practice does not move a card’s goal credit above one for today.</p>
        <GoalProgressCard progress={goalProgress} target={goalTarget} savedCards={savedCards} compact />
        <div className="finish-actions">
          {goalProgress < goalTarget && savedCards > 0 && <button className="button button-primary" onClick={onPractice}>Practice saved cards <ArrowRight size={16} /></button>}
          <button className="button button-secondary" onClick={onProgress}>See your progress <ArrowRight size={16} /></button>
          <button className="button button-secondary" onClick={onExit}>Back home</button>
        </div>
      </div>
    )
  }
  return (
    <>
      <div className="session-top">
        <button className="back-link" onClick={onExit}><ArrowLeft size={16} />Leave session</button>
        <span className="session-count">CARD {Math.min(index + 1, total)} <span>/</span> {total}</span>
      </div>
      <div className="session-progress"><span style={{ width: `${Math.min(100, ((index + 1) / total) * 100)}%` }} /></div>
      <GoalProgressCard progress={goalProgress} target={goalTarget} savedCards={savedCards} compact />
      <div className="review-wrap">
        <div className="review-subject"><span className="subject-dot" />{card.subject}<span>·</span>Recall</div>
        <article className="review-card">
          <div className="review-card-top"><span className="eyebrow">RECALL QUESTION</span><span className="question-mark">?</span></div>
          <h1>{card.recallQuestion}</h1>
          <label className="answer-field">
            <span>Your answer <small>Think it through, or jot it down.</small></span>
            <textarea value={answer} onChange={(event) => { setAnswer(event.target.value); if (error) clearError() }} placeholder="Type your answer here…" rows={3} disabled={revealed} />
          </label>
          {!revealed ? (
            <button className="button button-primary reveal-button" onClick={() => setRevealed(true)}>Reveal answer <ArrowRight size={16} /></button>
          ) : (
            <div className="reveal-content" aria-live="polite">
              <div className="expected-answer"><span>EXPECTED ANSWER</span><p>{card.expectedAnswer}</p></div>
              <div className="review-explanation"><span>KEY CONCEPT</span><strong>{card.concept}</strong><p>{card.explanation}</p></div>
              <div className="hint-line"><span>HINT</span>{card.hint}</div>
              <div className="not-verified"><ShieldCheck size={14} />Saved card content is yours to edit; explanations are not independently verified.</div>
            </div>
          )}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
        </article>
        {revealed && (
          <section className="rating-panel" aria-label="Choose how well you remembered">
            <div className="rating-prompt"><strong>How did that feel?</strong><span>We’ll bring it back based on your answer.</span></div>
            <div className="rating-buttons">
              <button className="rating-button rating-again-button" onClick={() => onRate('again')} disabled={working}><RotateCcw size={17} /><strong>Again</strong><small>Tomorrow</small></button>
              <button className="rating-button rating-hard-button" onClick={() => onRate('hard')} disabled={working}><Gauge size={17} /><strong>Hard</strong><small>In 3 days</small></button>
              <button className="rating-button rating-remembered-button" onClick={() => onRate('remembered')} disabled={working}><Check size={17} /><strong>Remembered</strong><small>In 7 days</small></button>
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function ProgressPage({
  cards,
  reviews,
  streak,
  activityDays,
  tasks,
  reviewCounts,
  today,
  todayProgress,
  dailyGoal,
  timeZone,
}: {
  cards: ReviewCard[]
  reviews: ReviewEvent[]
  streak: { current: number; streakBroken: boolean }
  activityDays: string[]
  tasks: StudyTask[]
  reviewCounts: Map<string, number>
  today: string
  todayProgress: number
  dailyGoal: number
  timeZone: string
}) {
  const historyDays = Array.from({ length: 8 }, (_, index) => addLocalDays(today, index - 7))
  return (
    <>
      <PageHeading eyebrow="A RECORD OF SHOWING UP" title="Your progress" description="Small sessions add up. Here’s a look at the effort you’ve put in." />
      <GoalProgressCard progress={todayProgress} target={dailyGoal} savedCards={cards.length} />
      {streak.streakBroken && (
        <div className="streak-broken-message" role="status">
          <span aria-hidden="true">😔</span>
          <div><strong>Your streak broke yesterday.</strong><p>A day without a completed study task or a new card resets the streak. You can start again today.</p></div>
        </div>
      )}
      <section className="stats-grid progress-stats">
        <div className="stat-card"><span className="stat-icon stat-icon-peach"><Flame size={19} /></span><div><div className="stat-label">CURRENT STREAK</div><div className="stat-value">{streak.current} <small>{streak.current === 1 ? 'day' : 'days'}</small></div></div><span className="stat-note">Tasks completed or new cards added</span></div>
        <div className="stat-card"><span className="stat-icon stat-icon-green"><CheckCheck size={19} /></span><div><div className="stat-label">STUDY DAYS</div><div className="stat-value">{activityDays.length} <small>{activityDays.length === 1 ? 'day' : 'days'}</small></div></div><span className="stat-note">Days with a task or new card</span></div>
        <div className="stat-card"><span className="stat-icon stat-icon-blue"><BookOpen size={19} /></span><div><div className="stat-label">TOTAL REVIEWS</div><div className="stat-value">{reviews.length} <small>{reviews.length === 1 ? 'review' : 'reviews'}</small></div></div><span className="stat-note">{cards.length} {cards.length === 1 ? 'card' : 'cards'} in your deck</span></div>
      </section>
      <section className="surface-card progress-chart-card">
        <div className="section-heading"><div><span className="eyebrow">ONE DAY AT A TIME</span><h2>Last 14 days</h2></div><span className="soft-tag">{reviews.length} reviews total</span></div>
        <WeekBars reviewCounts={reviewCounts} days={14} today={today} />
      </section>
      <section className="surface-card history-card">
        <div className="section-heading"><div><span className="eyebrow">LOOKING BACK</span><h2>Study activity history</h2></div></div>
        {historyDays.length ? (
          <ul className="history-list">
            {historyDays.map((day) => {
              const attempts = reviewCounts.get(day) ?? 0
              const completed = getDailyProgress(reviews, day)
              const dayReviews = reviews.filter((item) => item.day === day)
              const cardsAdded = cards.filter((card) => card.createdDay === day).length
              const tasksFinished = tasks.filter((task) => task.completedDays.includes(day)).length
              const hadActivity = activityDays.includes(day)
              const status = hadActivity ? 'Streak activity' : day === today ? 'In progress' : 'No streak activity'
              return (
                <li key={day}>
                  <span className={`history-day-dot ${day === today ? 'history-today' : ''}`} />
                  <span>{day === today ? 'Today' : formatDate(day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <strong>{tasksFinished} {tasksFinished === 1 ? 'task' : 'tasks'} · {cardsAdded} {cardsAdded === 1 ? 'new card' : 'new cards'}</strong>
                  <small>{status} · {completed} distinct cards reviewed · {attempts} {attempts === 1 ? 'review' : 'reviews'}{dayReviews.length ? ` · ${dayReviews.map((item) => RATING_LABELS[item.rating]).join(' · ')}` : ''}</small>
                </li>
              )
            })}
          </ul>
        ) : <EmptyMessage icon={BookOpen} title="A fresh start" text="Create a study task or add a card to begin your streak history." />}
      </section>
      <p className="progress-footnote">A day extends your streak when you mark at least one study task complete or add a new card. Reviews alone and creating an unfinished task do not count. Days use your saved timezone ({timeZone}); changing device timezone won’t rewrite history. Daily review goals remain separate from streak activity.</p>
    </>
  )
}

function GoalSettingsForm({
  today,
  dailyGoal,
  pendingGoal,
  studyTimeZone,
  onGoalChange,
}: {
  today: string
  dailyGoal: number
  pendingGoal: number
  studyTimeZone: string
  onGoalChange: (target: number) => Promise<void>
}) {
  const [goalInput, setGoalInput] = useState(String(pendingGoal))
  const goalIsValid = /^\d+$/.test(goalInput) && Number(goalInput) >= 1 && Number(goalInput) <= 20
  return (
    <form
      className="surface-card settings-card goal-settings-card"
      onSubmit={(event) => {
        event.preventDefault()
        if (goalIsValid) void onGoalChange(Number(goalInput))
      }}
    >
      <div className="goal-setting-copy">
        <label htmlFor="daily-goal-target"><strong>Cards per day</strong></label>
        <p>Each card counts once per day after you try the recall question, reveal the answer, and choose Again, Hard, or Remembered. Extra attempts still reschedule cards normally.</p>
      </div>
      <div className="goal-setting-control">
        <input
          id="daily-goal-target"
          type="number"
          min="1"
          max="20"
          step="1"
          value={goalInput}
          onChange={(event) => setGoalInput(event.target.value)}
          aria-describedby="goal-effective-note"
        />
        <span>cards / day</span>
        <button className="button button-primary" type="submit" disabled={!goalIsValid || Number(goalInput) === pendingGoal}>Save goal</button>
      </div>
      <p className="goal-effective-note" id="goal-effective-note">
        {pendingGoal === dailyGoal
          ? `Your target is ${dailyGoal} today and tomorrow. Changes take effect tomorrow (${formatDate(addLocalDays(today, 1), { weekday: 'long', month: 'long', day: 'numeric' })}).`
          : `Your target is ${dailyGoal} today. The scheduled target of ${pendingGoal} starts tomorrow; saving a new value replaces it.`}
      </p>
      <p className="goal-effective-note">Your study day is anchored to {studyTimeZone}. Dates and past goal targets stay fixed if your device timezone changes.</p>
    </form>
  )
}

function SettingsPage({
  aiState,
  working,
  error,
  onSetup,
  onExport,
  onDelete,
  cardCount,
  studyTaskCount,
  reviewCount,
  preferences,
  today,
  dailyGoal,
  studyTimeZone,
  onGoalChange,
  onThemeChange,
}: {
  aiState: AIState
  working: boolean
  error: string
  onSetup: () => void
  onExport: () => void
  onDelete: () => void
  cardCount: number
  studyTaskCount: number
  reviewCount: number
  preferences: AppPreferences
  today: string
  dailyGoal: number
  studyTimeZone: string
  onGoalChange: (target: number) => Promise<void>
  onThemeChange: (theme: ThemePreference) => Promise<void>
}) {
  const compatible = aiState.status !== 'unavailable'
  const pendingGoal = getGoalForDay(preferences.dailyGoalChanges, addLocalDays(today, 1))
  return (
    <>
      <PageHeading eyebrow="YOUR DEVICE, YOUR CHOICE" title="Settings" description="Your study space is personal. Here’s how it works and how to take your data with you." />
      {error && <div className="alert alert-error settings-error" role="alert">{error}</div>}
      <section className="settings-section">
        <div className="settings-section-heading"><span className="section-icon section-icon-green"><Target size={17} /></span><div><h2>Daily study goal</h2><p>Distinct cards completed each local study day</p></div></div>
        <GoalSettingsForm
          key={`${today}:${pendingGoal}`}
          today={today}
          dailyGoal={dailyGoal}
          pendingGoal={pendingGoal}
          studyTimeZone={studyTimeZone}
          onGoalChange={onGoalChange}
        />
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><span className="section-icon section-icon-blue"><Sparkles size={17} /></span><div><h2>Appearance</h2><p>Choose the tone that feels comfortable</p></div></div>
        <div className="surface-card settings-card theme-settings-card">
          <div><strong>Color theme</strong><p>System follows your device preference. Your choice is saved on this device.</p></div>
          <div className="theme-options" role="group" aria-label="Color theme">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                type="button"
                className={`button ${preferences.theme === theme ? 'button-primary' : 'button-secondary'}`}
                aria-pressed={preferences.theme === theme}
                key={theme}
                onClick={() => void onThemeChange(theme)}
              >
                {theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-heading"><span className="section-icon"><Sparkles size={17} /></span><div><h2>Local AI model</h2><p>Optional · runs on this device</p></div></div>
        <div className="surface-card settings-card model-card">
          <div className="model-card-head">
            <div><span className="model-name">{getModelLabel()}</span><span className={`model-state ${aiState.status === 'ready' ? 'state-good' : aiState.status === 'error' ? 'state-error' : ''}`}>{aiState.status === 'ready' ? 'Ready' : aiState.status === 'loading' ? 'Downloading' : aiState.status === 'error' ? 'Needs attention' : compatible ? 'Not loaded' : 'Unavailable'}</span></div>
            <p className="model-caption">{aiState.message}</p>
          </div>
          {aiState.status === 'loading' && (
            <div className="download-progress" aria-live="polite">
              <div className="download-label"><span>{aiState.message}</span><strong>{Math.round(aiState.progress * 100)}%</strong></div>
              <progress value={Math.round(aiState.progress * 100)} max="100" aria-label="Model download progress" />
            </div>
          )}
          {compatible ? (
            <button className="button button-primary setup-button" onClick={onSetup} disabled={working || aiState.status === 'loading' || aiState.status === 'ready'}>
              {working || aiState.status === 'loading' ? <><span className="button-loader" />Setting up…</> : aiState.status === 'ready' ? <><Check size={16} />Model ready</> : <><ArrowDownToLine size={16} />{aiState.status === 'error' ? 'Try again' : 'Set up local model'}</>}
            </button>
          ) : (
            <div className="compatibility-warning"><CircleHelp size={16} /><span>WebGPU needs a compatible, up-to-date browser and a secure context (HTTPS or localhost). Manual card creation is always available.</span></div>
          )}
          <div className="model-facts">
            <div><span>Browser requirement</span><strong>{compatible ? 'WebGPU detected' : 'WebGPU not detected'}</strong></div>
            <div><span>Download</span><strong>Large first download</strong></div>
            <div><span>Model cache</span><strong>Browser Cache API</strong></div>
          </div>
          <p className="model-disclaimer">The browser may later evict cached model files, so a download can be needed again. Model files stay in the browser’s supported cache; generated text is not independently verified.</p>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><span className="section-icon section-icon-green"><ShieldCheck size={17} /></span><div><h2>Privacy, plainly</h2><p>No account. No study-data server. No AI API.</p></div></div>
        <div className="surface-card privacy-card">
          <div className="privacy-row"><LockKeyhole size={18} /><div><strong>Your study data lives in IndexedDB</strong><p>Cards, study tasks, task completions, review history, daily goals, streak activity, theme, and study timezone stay locally in this browser.</p></div></div>
          <div className="privacy-row"><Sparkles size={18} /><div><strong>AI generation stays on-device</strong><p>WebLLM and WebGPU generate drafts in your browser. Only the fields you enter are given to the local model; nothing is sent to a third-party AI service.</p></div></div>
          <div className="privacy-row"><CircleHelp size={18} /><div><strong>Local means this browser</strong><p>Clearing site data or switching browsers/devices can remove or leave behind your cards. Export a copy if you want a backup.</p></div></div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><span className="section-icon section-icon-blue"><ArrowDownToLine size={17} /></span><div><h2>Your data</h2><p>{cardCount} {cardCount === 1 ? 'card' : 'cards'} · {studyTaskCount} {studyTaskCount === 1 ? 'study task' : 'study tasks'} · {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</p></div></div>
        <div className="surface-card data-card">
          <div><strong>Keep a copy, or start fresh.</strong><p>Export downloads a JSON file of your cards, study tasks, review history, daily goal settings, theme, and study timezone. Delete removes all Recall Loop study data and preferences from this browser.</p></div>
          <div className="data-actions"><button className="button button-secondary" onClick={onExport}><ArrowDownToLine size={16} />Export data</button><button className="button button-danger" onClick={onDelete}><Trash2 size={16} />Delete all data</button></div>
        </div>
      </section>
    </>
  )
}

function WeekBars({ reviewCounts, days, today }: { reviewCounts: Map<string, number>; days: number; today: string }) {
  const bars = Array.from({ length: days }, (_, index) => {
    const day = addLocalDays(today, index - days + 1)
    return { day, count: reviewCounts.get(day) ?? 0 }
  })
  const max = Math.max(1, ...bars.map((bar) => bar.count))
  return (
    <div className={`week-bars ${days > 7 ? 'week-bars-long' : ''}`} role="img" aria-label={`Review activity over the last ${days} days`}>
      {bars.map(({ day, count }) => (
        <div className="week-bar-column" key={day} aria-label={`${formatDate(day, { month: 'short', day: 'numeric' })}: ${count} ${count === 1 ? 'review' : 'reviews'}`}>
          <div className="bar-track"><span className={`bar-fill ${day === today ? 'bar-today' : ''}`} style={{ height: `${count ? Math.max(12, (count / max) * 100) : 3}%` }} /></div>
          <span className="bar-label">{formatDate(day, { weekday: days > 7 ? undefined : 'short', day: days > 7 ? 'numeric' : undefined })}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyMessage({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className="empty-message"><span><Icon size={18} /></span><strong>{title}</strong><p>{text}</p></div>
}

export default App
