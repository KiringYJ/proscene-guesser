<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  getEligibleQuestionCount,
  QUICK_PLAY_CONFIG,
  type SoloGameAvailability,
  type SoloGameConfig,
  type SoloGamePool,
  type SoloGameRoundOption,
  type SoloGameTimerSeconds,
} from '@/game/solo'
import type { StartState } from '@/game/session'

const props = defineProps<{
  availability: SoloGameAvailability
  initialConfig: SoloGameConfig
  startState: StartState
}>()

const emit = defineEmits<{
  start: [config: SoloGameConfig]
}>()

const customConfig = ref<SoloGameConfig>({ ...props.initialConfig })

const poolItems: readonly { title: string; value: SoloGamePool }[] = [
  { title: 'Mixed', value: 'mixed' },
  { title: 'Classics', value: 'classic' },
  { title: 'Deep Cuts', value: 'deep-cut' },
]
const roundItems: readonly { title: string; value: SoloGameRoundOption }[] = [
  { title: '5 rounds', value: 5 },
  { title: '10 rounds', value: 10 },
  { title: 'All available', value: 'all' },
]
const timerItems: readonly { title: string; value: SoloGameTimerSeconds }[] = [
  { title: '60 seconds', value: 60 },
  { title: '90 seconds', value: 90 },
  { title: '2 minutes', value: 120 },
  { title: 'No limit', value: 'none' },
]

const starting = computed(() => props.startState.status === 'pending')
const eligibleCount = computed(() =>
  getEligibleQuestionCount(props.availability, customConfig.value.pool),
)
const requestedRoundCount = computed(() =>
  customConfig.value.rounds === 'all' ? eligibleCount.value : customConfig.value.rounds,
)
const actualRoundCount = computed(() =>
  Math.min(requestedRoundCount.value, eligibleCount.value),
)
const customGameNote = computed(() => {
  if (eligibleCount.value === 0) {
    return 'No playable archives are available in this pool yet.'
  }

  if (actualRoundCount.value < requestedRoundCount.value) {
    return `${requestedRoundCount.value} requested; playing all ${actualRoundCount.value} available unique archives.`
  }

  return `${actualRoundCount.value} unique ${actualRoundCount.value === 1 ? 'archive' : 'archives'} will be selected without repeats.`
})
const quickPlayNote = computed(() => {
  const actual = Math.min(QUICK_PLAY_CONFIG.rounds, props.availability.total)

  if (actual < QUICK_PLAY_CONFIG.rounds) {
    return `${QUICK_PLAY_CONFIG.rounds} requested; playing all ${actual} available unique archives.`
  }

  return 'Five unique archives selected from both pools.'
})
const startError = computed(() =>
  props.startState.status === 'rejected' ? props.startState.message : null,
)

function startQuickPlay(): void {
  emit('start', { ...QUICK_PLAY_CONFIG })
}

function startCustomGame(): void {
  emit('start', { ...customConfig.value })
}
</script>

<template>
  <section class="game-setup" aria-labelledby="game-setup-title">
    <header class="game-setup__header">
      <div>
        <p class="panel-kicker">Choose your run</p>
        <h2 id="game-setup-title" class="phase-heading" tabindex="-1">Enter the archive</h2>
      </div>
      <p>{{ availability.total }} playable {{ availability.total === 1 ? 'archive' : 'archives' }}</p>
    </header>

    <p v-if="startError" class="setup-error" role="alert">{{ startError }}</p>

    <div class="game-setup__grid">
      <v-card class="setup-card setup-card--quick" tag="article">
        <div class="setup-card__topline">
          <span>Quick Play</span>
          <span class="setup-card__status">Recommended</span>
        </div>
        <h3>Start with one click.</h3>
        <p>Jump straight into a mixed run with the standard game settings.</p>

        <dl class="setup-card__facts">
          <div>
            <dt>Pool</dt>
            <dd>Mixed</dd>
          </div>
          <div>
            <dt>Rounds</dt>
            <dd>5</dd>
          </div>
          <div>
            <dt>Timer</dt>
            <dd>90s</dd>
          </div>
        </dl>

        <p class="setup-card__note">{{ quickPlayNote }}</p>
        <v-btn
          color="primary"
          size="large"
          block
          append-icon="mdi-arrow-right"
          :loading="starting"
          :disabled="starting || availability.total === 0"
          @click="startQuickPlay"
        >
          Start Quick Play
        </v-btn>
      </v-card>

      <v-card class="setup-card" tag="article">
        <div class="setup-card__topline">
          <span>Custom Game</span>
          <span>Solo</span>
        </div>
        <h3>Build your own run.</h3>
        <p>Choose the archive pool, game length, and time pressure.</p>

        <v-form class="setup-form" @submit.prevent="startCustomGame">
          <v-select
            v-model="customConfig.pool"
            :items="poolItems"
            label="Question pool"
            aria-label="Question pool"
            hide-details
          />
          <div class="setup-form__row">
            <v-select
              v-model="customConfig.rounds"
              :items="roundItems"
              label="Rounds"
              aria-label="Number of rounds"
              hide-details
            />
            <v-select
              v-model="customConfig.timerSeconds"
              :items="timerItems"
              label="Timer"
              aria-label="Round timer"
              hide-details
            />
          </div>

          <p class="setup-card__note" :class="{ 'setup-card__note--warning': eligibleCount === 0 }">
            {{ customGameNote }}
          </p>
          <v-btn
            type="submit"
            variant="outlined"
            size="large"
            block
            append-icon="mdi-tune-variant"
            :loading="starting"
            :disabled="starting || eligibleCount === 0"
          >
            Start Custom Game
          </v-btn>
        </v-form>
      </v-card>

      <article class="setup-card setup-card--planned" aria-label="Multiplayer, planned">
        <div class="setup-card__topline">
          <span>Multiplayer</span>
          <span class="game-mode__badge">Planned</span>
        </div>
        <h3>Reconstruct together.</h3>
        <p>
          Create rooms, invite friends, and compare synchronized round scores when multiplayer
          support arrives.
        </p>
        <p class="setup-card__note">Room creation and joining are not available in this version.</p>
      </article>
    </div>
  </section>
</template>
