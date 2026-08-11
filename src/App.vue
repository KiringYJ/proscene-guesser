<script setup lang="ts">
import { computed, ref } from 'vue'

import AnswerForm from '@/components/AnswerForm.vue'
import GameScreenshot from '@/components/GameScreenshot.vue'
import ResultCard from '@/components/ResultCard.vue'
import { questions } from '@/data/questions'
import { isAnswerComplete, scoreAnswer } from '@/lib/scoring'
import { buildShareText } from '@/lib/share'
import {
  createEmptyAnswer,
  type PlayerAnswer,
  type ScoreResult,
} from '@/types/question'

const currentIndex = ref(0)
const answer = ref<PlayerAnswer>(createEmptyAnswer())
const result = ref<ScoreResult | null>(null)
const roundsPlayed = ref(0)
const sessionBest = ref(0)
const toast = ref('')
const snackbarOpen = ref(false)

const currentQuestion = computed(() => questions[currentIndex.value])

const answerComplete = computed(() => isAnswerComplete(answer.value))
const archiveStatus = computed(() => (currentQuestion.value ? 'Archive online' : 'Archive preparation'))
const nextLabel = computed(() => (questions.length > 1 ? 'Next archive' : 'Replay archive'))

function submitAnswer() {
  const question = currentQuestion.value

  if (!question || !answerComplete.value || result.value) {
    return
  }

  const scored = scoreAnswer(answer.value, question.answer)
  result.value = scored
  roundsPlayed.value += 1
  sessionBest.value = Math.max(sessionBest.value, scored.points)
}

function nextQuestion() {
  if (questions.length === 0) {
    return
  }

  currentIndex.value = (currentIndex.value + 1) % questions.length
  answer.value = createEmptyAnswer()
  result.value = null
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

async function shareResult() {
  const question = currentQuestion.value

  if (!question || !result.value) {
    return
  }

  const siteUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
  const shareText = buildShareText(question.id, result.value, siteUrl)

  try {
    if (navigator.share) {
      await navigator.share({ text: shareText })
      toast.value = 'Share sheet opened.'
      snackbarOpen.value = true
      return
    }

    await copyText(shareText)
    toast.value = 'Result copied to the clipboard.'
    snackbarOpen.value = true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    toast.value = 'Sharing is unavailable in this browser.'
    snackbarOpen.value = true
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

          <div class="topbar__status">
            <span class="topbar__status-dot" aria-hidden="true"></span>
            {{ archiveStatus }}
          </div>
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
                <dd>{{ String(currentQuestion ? currentIndex + 1 : 0).padStart(2, '0') }}/{{ String(questions.length).padStart(2, '0') }}</dd>
              </div>
              <div>
                <dt>Played</dt>
                <dd>{{ String(roundsPlayed).padStart(2, '0') }}</dd>
              </div>
              <div>
                <dt>Best</dt>
                <dd>{{ sessionBest }}/4</dd>
              </div>
            </dl>
          </section>

          <section v-if="currentQuestion" class="game-layout" aria-label="Current question">
            <GameScreenshot :question="currentQuestion" :revealed="Boolean(result)" />

            <Transition name="panel-swap" mode="out-in">
              <ResultCard
                v-if="result"
                key="result"
                :result="result"
                :next-label="nextLabel"
                @share="shareResult"
                @next="nextQuestion"
              />
              <AnswerForm
                v-else
                key="answer"
                v-model="answer"
                :question="currentQuestion"
                :disabled="Boolean(result)"
                :complete="answerComplete"
                @submit="submitAnswer"
              />
            </Transition>
          </section>

          <section v-else class="empty-catalog" aria-labelledby="empty-catalog-title">
            <p class="panel-kicker">Archive maintenance</p>
            <h2 id="empty-catalog-title">New questions are being prepared.</h2>
            <p>
              No playable frame is published yet. Source images stay outside the app until their
              redactions and release checks are complete.
            </p>
          </section>
        </div>

        <footer class="footer">
          <p>Published questions use flattened redactions; originals stay outside the build.</p>
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
