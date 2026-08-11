<script setup lang="ts">
import { computed } from 'vue'

import type { SoloGamePlan, SoloGameSummary } from '@/game/solo'
import type { StartState } from '@/game/session'

const props = defineProps<{
  plan: SoloGamePlan
  summary: SoloGameSummary
  startState: StartState
}>()

const emit = defineEmits<{
  replay: []
  settings: []
  share: []
}>()

const starting = computed(() => props.startState.status === 'pending')
const scorePercentage = computed(() =>
  props.summary.total === 0 ? 0 : (props.summary.points / props.summary.total) * 100,
)
const poolLabel = computed(() => ({
  mixed: 'Mixed',
  classic: 'Classics',
  'deep-cut': 'Deep Cuts',
})[props.plan.config.pool])
const timerLabel = computed(() =>
  props.plan.config.timerSeconds === 'none'
    ? 'No limit'
    : `${props.plan.config.timerSeconds} seconds`,
)
</script>

<template>
  <section class="game-summary" aria-labelledby="game-summary-title">
    <header class="game-summary__hero">
      <div>
        <p class="panel-kicker">Game complete</p>
        <h1 id="game-summary-title" class="phase-heading" tabindex="-1">Final reconstruction</h1>
        <p>
          {{ plan.roundCount }} {{ plan.roundCount === 1 ? 'archive' : 'archives' }} ·
          {{ poolLabel }} · {{ timerLabel }}
        </p>
      </div>

      <div class="game-summary__score" aria-label="Final score">
        <strong>{{ summary.points }}</strong>
        <span>/ {{ summary.total }}</span>
      </div>
    </header>

    <v-progress-linear
      :model-value="scorePercentage"
      color="primary"
      bg-color="surface-bright"
      height="7"
      rounded
    />

    <p v-if="plan.constrainedByAvailability" class="game-summary__constraint">
      {{ plan.config.rounds }} requested; this game used all {{ plan.roundCount }} available unique
      archives without repeats.
    </p>

    <div class="game-summary__rounds" aria-label="Per-round breakdown">
      <article v-for="round in summary.rounds" :key="round.roundId" class="summary-round">
        <header class="summary-round__header">
          <div>
            <span>Round {{ String(round.roundNumber).padStart(2, '0') }}</span>
            <strong>{{ round.archiveLabel }}</strong>
          </div>
          <div class="summary-round__score">
            <span v-if="round.completionReason === 'timed-out'" class="summary-round__timeout">
              Timed out
            </span>
            <strong>{{ round.result.points }}/{{ round.result.total }}</strong>
          </div>
        </header>

        <div class="summary-round__signals">
          <span
            v-for="line in round.result.lines"
            :key="line.id"
            class="summary-signal"
            :class="{ 'summary-signal--correct': line.correct }"
          >
            <span aria-hidden="true">{{ line.correct ? '✓' : '×' }}</span>
            {{ line.label }}
          </span>
        </div>
      </article>
    </div>

    <div class="game-summary__actions">
      <v-btn
        variant="outlined"
        size="large"
        prepend-icon="mdi-share-variant"
        :disabled="starting"
        @click="emit('share')"
      >
        Share game
      </v-btn>
      <v-btn
        variant="outlined"
        size="large"
        prepend-icon="mdi-tune-variant"
        :disabled="starting"
        @click="emit('settings')"
      >
        Change settings
      </v-btn>
      <v-btn
        color="primary"
        size="large"
        append-icon="mdi-refresh"
        :loading="starting"
        :disabled="starting"
        @click="emit('replay')"
      >
        Play again
      </v-btn>
    </div>
  </section>
</template>
