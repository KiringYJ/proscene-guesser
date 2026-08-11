<script setup lang="ts">
import { computed } from 'vue'

import type { PlayerAnswer, Question } from '@/types/question'

const props = defineProps<{
  question: Question
  modelValue: PlayerAnswer
  disabled: boolean
  complete: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PlayerAnswer]
  submit: []
}>()

function updateAnswer<Key extends keyof PlayerAnswer>(key: Key, value: PlayerAnswer[Key]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  })
}

const year = computed({
  get: () => props.modelValue.year,
  set: (value: number | null) => updateAnswer('year', value),
})

const tournament = computed({
  get: () => props.modelValue.tournament,
  set: (value: string | null) => updateAnswer('tournament', value),
})

const stage = computed({
  get: () => props.modelValue.stage,
  set: (value: string | null) => updateAnswer('stage', value),
})

const blueTeam = computed({
  get: () => props.modelValue.blueTeam,
  set: (value: string | null) => updateAnswer('blueTeam', value),
})

const redTeam = computed({
  get: () => props.modelValue.redTeam,
  set: (value: string | null) => updateAnswer('redTeam', value),
})

const gameNumber = computed({
  get: () => props.modelValue.gameNumber,
  set: (value: number | null) => updateAnswer('gameNumber', value),
})
</script>

<template>
  <v-card class="answer-card" tag="section">
    <div class="answer-card__header">
      <div>
        <p class="panel-kicker">Reconstruct the match</p>
        <h2>Lock your read</h2>
      </div>
      <span class="answer-card__count">04 signals</span>
    </div>

    <v-form class="answer-form" @submit.prevent="emit('submit')">
      <div class="field-grid field-grid--event">
        <v-select
          v-model="year"
          :items="question.choices.years"
          :disabled="disabled"
          label="Year"
          aria-label="Year"
          hide-details
        />
        <v-select
          v-model="gameNumber"
          :items="question.choices.games"
          :disabled="disabled"
          label="Game"
          aria-label="Game number"
          prefix="Game"
          hide-details
        />
      </div>

      <v-select
        v-model="tournament"
        :items="question.choices.tournaments"
        :disabled="disabled"
        label="Tournament"
        aria-label="Tournament"
        hide-details
      />

      <v-select
        v-model="stage"
        :items="question.choices.stages"
        :disabled="disabled"
        label="Stage"
        aria-label="Tournament stage"
        hide-details
      />

      <div class="side-divider" aria-hidden="true">
        <span>Blue side</span>
        <span>Red side</span>
      </div>

      <div class="field-grid field-grid--teams">
        <v-select
          v-model="blueTeam"
          :items="question.choices.teams"
          :disabled="disabled"
          label="Blue team"
          aria-label="Blue-side team"
          hide-details
        />
        <v-select
          v-model="redTeam"
          :items="question.choices.teams"
          :disabled="disabled"
          label="Red team"
          aria-label="Red-side team"
          hide-details
        />
      </div>

      <div class="answer-form__footer">
        <p>Event and teams score as grouped signals.</p>
        <v-btn
          type="submit"
          color="primary"
          size="large"
          :disabled="disabled || !complete"
          append-icon="mdi-arrow-right"
        >
          Submit reconstruction
        </v-btn>
      </div>
    </v-form>
  </v-card>
</template>
