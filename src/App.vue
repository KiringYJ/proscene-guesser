<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AnswerForm from '@/components/AnswerForm.vue'
import GameScreenshot from '@/components/GameScreenshot.vue'
import GameSetup from '@/components/GameSetup.vue'
import GameSummary from '@/components/GameSummary.vue'
import ResultCard from '@/components/ResultCard.vue'
import { useActiveGameSession } from '@/composables/use-active-game-session'
import { formatRemainingTime, getRemainingSeconds } from '@/game/round-timer'
import { isAnswerComplete } from '@/game/scoring'
import type { SoloGameConfig } from '@/game/solo'
import { buildGameShareText, buildShareText } from '@/lib/share'
import { createEmptyAnswer, type PlayerAnswer } from '@/types/question'

const { session, snapshot } = useActiveGameSession()
const answer = ref<PlayerAnswer>(createEmptyAnswer())
const toast = ref('')
const snackbarOpen = ref(false)
const remainingSeconds = ref<number | null>(null)
const accessibilityAnnouncement = ref('')
const expiringRoundIds = new Set<string>()
const expirationRetryAt = new Map<string, number>()
let lowTimeAnnouncementRoundId: string | undefined
let countdownInterval: ReturnType<typeof setInterval> | undefined
let expirationRetryTimeout: ReturnType<typeof setTimeout> | undefined

const currentQuestion = computed(() => {
  const state = snapshot.value

  return state.phase === 'answering' || state.phase === 'revealed'
    ? state.prompt
    : undefined
})
const revealedSnapshot = computed(() =>
  snapshot.value.phase === 'revealed' ? snapshot.value : null,
)
const result = computed(() => revealedSnapshot.value?.result ?? null)
const gameplayProgress = computed(() => {
  const state = snapshot.value

  return state.phase === 'answering' || state.phase === 'revealed'
    ? state.progress
    : null
})
const answerComplete = computed(() => {
  const question = currentQuestion.value

  return question ? isAnswerComplete(answer.value, question) : false
})
const answerDisabled = computed(() => {
  const state = snapshot.value

  if (state.phase !== 'answering') {
    return true
  }

  return !(
    state.submission.status === 'editable' ||
    (state.submission.status === 'rejected' && state.submission.retryable)
  )
})
const advancePending = computed(() =>
  snapshot.value.phase === 'revealed' && snapshot.value.advance.status === 'pending',
)
const nextLabel = computed(() =>
  snapshot.value.phase === 'revealed' ? snapshot.value.nextLabel : 'Next archive',
)
const timerDisplay = computed(() => {
  const state = snapshot.value

  if (state.phase === 'answering') {
    return formatRemainingTime(remainingSeconds.value)
  }

  if (state.phase === 'revealed') {
    return state.completionReason === 'timed-out' ? 'Expired' : 'Locked'
  }

  return ''
})
const timerUrgent = computed(() =>
  snapshot.value.phase === 'answering' &&
  remainingSeconds.value !== null &&
  remainingSeconds.value <= 10,
)

watch(
  () => {
    const state = snapshot.value

    return state.phase === 'answering' || state.phase === 'revealed'
      ? state.roundId
      : null
  },
  (roundId, previousRoundId) => {
    if (roundId !== null && roundId !== previousRoundId) {
      answer.value = createEmptyAnswer()
    }
  },
)

watch(
  () => {
    const state = snapshot.value

    if (state.phase !== 'answering') {
      return state.phase
    }

    const deadline = state.timer.kind === 'deadline' ? state.timer.deadlineAt : 'unlimited'

    return `${state.roundId}:${state.submission.status}:${deadline}`
  },
  () => resetCountdown(),
  { immediate: true },
)

watch(
  () => {
    const state = snapshot.value

    return state.phase === 'answering' || state.phase === 'revealed'
      ? `${state.phase}:${state.roundId}`
      : state.phase
  },
  async () => {
    await nextTick()
    const state = snapshot.value
    let headingSelector: string | undefined

    if (state.phase === 'setup') {
      headingSelector = '#game-setup-title'
    } else if (state.phase === 'revealed') {
      accessibilityAnnouncement.value = state.completionReason === 'timed-out'
        ? `Time expired. You scored ${state.result.points} out of ${state.result.total}.`
        : `Answer locked. You scored ${state.result.points} out of ${state.result.total}.`
    } else if (state.phase === 'finished') {
      headingSelector = '#game-summary-title'
      accessibilityAnnouncement.value =
        `Game complete. You scored ${state.summary.points} out of ${state.summary.total}.`
    }

    if (headingSelector) {
      document.querySelector<HTMLElement>(headingSelector)?.focus({ preventScroll: true })
    }
  },
)

onBeforeUnmount(stopCountdown)

function notify(message: string): void {
  toast.value = message
  snackbarOpen.value = true
}

function stopCountdown(): void {
  if (countdownInterval !== undefined) {
    clearInterval(countdownInterval)
    countdownInterval = undefined
  }

  if (expirationRetryTimeout !== undefined) {
    clearTimeout(expirationRetryTimeout)
    expirationRetryTimeout = undefined
  }
}

function updateCountdown(): void {
  const state = snapshot.value

  if (state.phase !== 'answering') {
    remainingSeconds.value = null
    stopCountdown()
    return
  }

  if (state.submission.status === 'pending') {
    stopCountdown()
    return
  }

  const seconds = getRemainingSeconds(state.timer, Date.now())
  remainingSeconds.value = seconds

  if (
    seconds !== null &&
    seconds > 0 &&
    seconds <= 10 &&
    lowTimeAnnouncementRoundId !== state.roundId
  ) {
    lowTimeAnnouncementRoundId = state.roundId
    accessibilityAnnouncement.value = `${seconds} seconds remaining in this round.`
  }

  if (seconds === 0) {
    stopCountdown()
    const retryDelay = (expirationRetryAt.get(state.roundId) ?? 0) - Date.now()

    if (retryDelay > 0) {
      expirationRetryTimeout = setTimeout(resetCountdown, retryDelay)
      return
    }

    expirationRetryAt.delete(state.roundId)

    if (!expiringRoundIds.has(state.roundId)) {
      expiringRoundIds.add(state.roundId)
      void expireCurrentRound(state.roundId)
    }
  }
}

function resetCountdown(): void {
  stopCountdown()
  updateCountdown()

  const state = snapshot.value
  if (
    state.phase === 'answering' &&
    state.timer.kind === 'deadline' &&
    state.submission.status !== 'pending' &&
    remainingSeconds.value !== 0
  ) {
    countdownInterval = setInterval(updateCountdown, 250)
  }
}

async function startGame(config: SoloGameConfig): Promise<void> {
  try {
    const outcome = await session.startGame(config)

    if (!outcome.ok) {
      notify(outcome.message)
    }
  } catch {
    notify('The game could not be started.')
  }
}

async function submitAnswer(): Promise<void> {
  const state = snapshot.value

  if (state.phase !== 'answering' || !answerComplete.value || answerDisabled.value) {
    return
  }

  try {
    const outcome = await session.submitAnswer(answer.value)

    if (!outcome.ok) {
      notify(outcome.message)
    }
  } catch {
    notify('The game session is temporarily unavailable.')
  }
}

async function expireCurrentRound(roundId: string): Promise<void> {
  let shouldRetry = false

  try {
    const outcome = await session.expireRound(roundId, answer.value)

    if (!outcome.ok && outcome.code === 'temporarily-unavailable') {
      notify(outcome.message)
      shouldRetry = true
    }
  } catch {
    notify('The timed answer could not be locked.')
    shouldRetry = true
  } finally {
    expiringRoundIds.delete(roundId)

    const state = snapshot.value
    if (shouldRetry && state.phase === 'answering' && state.roundId === roundId) {
      expirationRetryAt.set(roundId, Date.now() + 1_000)
      resetCountdown()
    } else {
      expirationRetryAt.delete(roundId)
    }
  }
}

async function nextQuestion(): Promise<void> {
  if (snapshot.value.phase !== 'revealed' || advancePending.value) {
    return
  }

  try {
    const outcome = await session.advanceRound()

    if (!outcome.ok) {
      notify(outcome.message)
    }
  } catch {
    notify('The game session is temporarily unavailable.')
  }
}

function changeSettings(): void {
  session.returnToSetup()
}

async function replayGame(): Promise<void> {
  const state = snapshot.value

  if (state.phase === 'finished') {
    await startGame(state.plan.config)
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.append(textArea)
  textArea.select()

  const copied = document.execCommand('copy')
  textArea.remove()

  if (!copied) {
    throw new Error('Clipboard is unavailable')
  }
}

async function shareText(text: string): Promise<void> {
  try {
    if (navigator.share) {
      await navigator.share({ text })
      notify('Share sheet opened.')
      return
    }

    await copyText(text)
    notify('Result copied to the clipboard.')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    notify('Sharing is unavailable in this browser.')
  }
}

async function shareRoundResult(): Promise<void> {
  const state = snapshot.value

  if (state.phase !== 'revealed') {
    return
  }

  const siteUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
  await shareText(buildShareText(state.prompt.id, state.result, siteUrl))
}

async function shareGameResult(): Promise<void> {
  const state = snapshot.value

  if (state.phase !== 'finished') {
    return
  }

  const siteUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
  await shareText(buildGameShareText(state.summary, state.plan, siteUrl))
}
</script>

<template>
  <v-app>
    <div class="ambient-grid" aria-hidden="true"></div>
    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {{ accessibilityAnnouncement }}
    </p>

    <v-main class="app-shell">
      <v-container class="page" max-width="1440">
        <header class="topbar">
          <a class="brand" href="#top" aria-label="ProScene Guesser home">
            <span class="brand__mark" aria-hidden="true">PG</span>
            <span class="brand__wordmark">
              <strong>ProScene</strong>
              <small>Guesser</small>
            </span>
          </a>

          <div class="game-modes" role="group" aria-label="Game modes">
            <div class="game-mode game-mode--active" aria-label="Solo mode, active">
              <span class="game-mode__dot" aria-hidden="true"></span>
              <span>Solo</span>
            </div>
            <div class="game-mode game-mode--planned" aria-label="Multiplayer mode, planned">
              <span>Multiplayer</span>
              <span class="game-mode__badge">Planned</span>
            </div>
          </div>
        </header>

        <div id="top">
          <section v-if="snapshot.phase !== 'finished'" class="hero">
            <div class="hero__copy">
              <p class="eyebrow">Competitive League · Broadcast archaeology</p>
              <h1>One frame.<br /><em>Four answers.</em></h1>
              <p class="hero__lede">
                Rebuild the year, event, teams, and game from a broadcast frame stripped of direct
                identifiers.
              </p>
            </div>

            <dl v-if="gameplayProgress" class="session-stats" aria-label="Game statistics">
              <div>
                <dt>Round</dt>
                <dd>{{ String(gameplayProgress.roundNumber).padStart(2, '0') }}/{{ String(gameplayProgress.roundCount).padStart(2, '0') }}</dd>
              </div>
              <div>
                <dt>Score</dt>
                <dd>{{ gameplayProgress.points }}/{{ gameplayProgress.possiblePoints }}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd
                  role="timer"
                  aria-label="Round time remaining"
                  aria-live="off"
                  :class="{ 'session-stats__urgent': timerUrgent }"
                >
                  {{ timerDisplay }}
                </dd>
              </div>
            </dl>
          </section>

          <GameSetup
            v-if="snapshot.phase === 'setup'"
            :availability="snapshot.availability"
            :initial-config="snapshot.initialConfig"
            :start-state="snapshot.start"
            @start="startGame"
          />

          <section v-else-if="currentQuestion" class="game-layout" aria-label="Current question">
            <GameScreenshot :question="currentQuestion" :revealed="snapshot.phase === 'revealed'" />

            <Transition name="panel-swap" mode="out-in">
              <ResultCard
                v-if="result && revealedSnapshot"
                key="result"
                :result="result"
                :completion-reason="revealedSnapshot.completionReason"
                :next-label="nextLabel"
                :disabled="advancePending"
                @share="shareRoundResult"
                @next="nextQuestion"
              />
              <AnswerForm
                v-else
                key="answer"
                v-model="answer"
                :question="currentQuestion"
                :disabled="answerDisabled"
                :complete="answerComplete"
                @submit="submitAnswer"
              />
            </Transition>
          </section>

          <GameSummary
            v-else-if="snapshot.phase === 'finished'"
            :plan="snapshot.plan"
            :summary="snapshot.summary"
            :start-state="snapshot.start"
            @replay="replayGame"
            @settings="changeSettings"
            @share="shareGameResult"
          />
        </div>

        <footer class="footer">
          <p>Playable questions use flattened redactions; originals stay outside the build.</p>
          <p>
            Event data from
            <a
              href="https://liquipedia.net/leagueoflegends/Main_Page"
              target="_blank"
              rel="noreferrer"
            >Liquipedia</a>
            · CC BY-SA 3.0
          </p>
          <p>Unofficial fan project. Not affiliated with Riot Games.</p>
        </footer>
      </v-container>
    </v-main>

    <v-snackbar v-model="snackbarOpen" color="surface-bright" location="bottom" :timeout="2600">
      {{ toast }}
    </v-snackbar>
  </v-app>
</template>
