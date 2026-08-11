<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AnswerForm from '@/components/AnswerForm.vue'
import GameScreenshot from '@/components/GameScreenshot.vue'
import ResultCard from '@/components/ResultCard.vue'
import { useActiveGameSession } from '@/composables/use-active-game-session'
import { isAnswerComplete } from '@/game/scoring'
import { buildShareText } from '@/lib/share'
import { createEmptyAnswer, type PlayerAnswer } from '@/types/question'

const { session, snapshot } = useActiveGameSession()
const answer = ref<PlayerAnswer>(createEmptyAnswer())
const toast = ref('')
const snackbarOpen = ref(false)

const currentQuestion = computed(() =>
  snapshot.value.phase === 'empty' ? undefined : snapshot.value.prompt,
)
const result = computed(() =>
  snapshot.value.phase === 'revealed' ? snapshot.value.result : null,
)
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

watch(
  () => (snapshot.value.phase === 'empty' ? null : snapshot.value.roundId),
  (roundId, previousRoundId) => {
    if (previousRoundId !== null && roundId !== previousRoundId) {
      answer.value = createEmptyAnswer()
    }
  },
)

function notify(message: string): void {
  toast.value = message
  snackbarOpen.value = true
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

async function shareResult(): Promise<void> {
  const state = snapshot.value

  if (state.phase !== 'revealed') {
    return
  }

  const siteUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
  const shareText = buildShareText(state.prompt.id, state.result, siteUrl)

  try {
    if (navigator.share) {
      await navigator.share({ text: shareText })
      notify('Share sheet opened.')
      return
    }

    await copyText(shareText)
    notify('Result copied to the clipboard.')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    notify('Sharing is unavailable in this browser.')
  }
}
</script>

<template>
  <v-app>
    <div class="ambient-grid" aria-hidden="true"></div>

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
        </header>

        <div id="top">
          <section class="hero">
            <div class="hero__copy">
              <p class="eyebrow">Competitive League · Broadcast archaeology</p>
              <h1>One frame.<br /><em>Four answers.</em></h1>
              <p class="hero__lede">
                Rebuild the year, event, teams, and game from a broadcast frame stripped of direct
                identifiers.
              </p>
            </div>

            <dl class="session-stats" aria-label="Session statistics">
              <div>
                <dt>Round</dt>
                <dd>{{ String(snapshot.progress.roundNumber).padStart(2, '0') }}/{{ String(snapshot.progress.roundCount).padStart(2, '0') }}</dd>
              </div>
              <div>
                <dt>Played</dt>
                <dd>{{ String(snapshot.progress.roundsPlayed).padStart(2, '0') }}</dd>
              </div>
              <div>
                <dt>Best</dt>
                <dd>{{ snapshot.progress.bestPoints }}/4</dd>
              </div>
            </dl>
          </section>

          <section v-if="currentQuestion" class="game-layout" aria-label="Current question">
            <GameScreenshot :question="currentQuestion" :revealed="snapshot.phase === 'revealed'" />

            <Transition name="panel-swap" mode="out-in">
              <ResultCard
                v-if="result"
                key="result"
                :result="result"
                :next-label="nextLabel"
                :disabled="advancePending"
                @share="shareResult"
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

          <section v-else class="empty-catalog" aria-labelledby="empty-catalog-title">
            <p class="panel-kicker">Question archive</p>
            <h2 id="empty-catalog-title">No questions available.</h2>
            <p>
              Add a validated question manifest and its flattened redacted image, then regenerate
              the question catalog.
            </p>
          </section>
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
