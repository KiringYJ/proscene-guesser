<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  getInternationalEditionOptions,
  getInternationalStageNamesForEdition,
  getInternationalTeamChoicesForEdition,
  getInternationalTournamentNameForEdition,
} from '@/data/catalog'
import {
  applyCatalogEditionSelection,
  applyYearSelection,
  excludeOpposingTeam,
} from '@/lib/answer-cascade'
import type { PlayerAnswer, QuestionPrompt } from '@/types/question'

const props = defineProps<{
  question: QuestionPrompt
  modelValue: PlayerAnswer
  disabled: boolean
  complete: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PlayerAnswer]
  submit: []
}>()

const heading = ref<HTMLElement>()

onMounted(() => heading.value?.focus({ preventScroll: true }))

function updateAnswer<Key extends keyof PlayerAnswer>(key: Key, value: PlayerAnswer[Key]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  })
}

const catalogBacked = computed(() => props.question.catalogEditionIds !== undefined)

const tournamentItems = computed(() => {
  if (!catalogBacked.value) {
    return props.question.choices.tournaments
  }

  if (props.modelValue.year === null) {
    return []
  }

  return getInternationalEditionOptions(
    props.question.catalogEditionIds ?? [],
    props.modelValue.year,
  )
})

const selectedCatalogEditionId = computed(() => {
  const editionId = props.modelValue.catalogEditionId

  if (
    !catalogBacked.value ||
    editionId === null ||
    !tournamentItems.value.some((item) => typeof item !== 'string' && item.value === editionId)
  ) {
    return null
  }

  return editionId
})

const stageItems = computed(() => {
  if (!catalogBacked.value) {
    return props.question.choices.stages
  }

  return selectedCatalogEditionId.value
    ? getInternationalStageNamesForEdition(selectedCatalogEditionId.value)
    : []
})

const teamItems = computed(() => {
  if (!catalogBacked.value) {
    return props.question.choices.teams
  }

  return selectedCatalogEditionId.value
    ? getInternationalTeamChoicesForEdition(selectedCatalogEditionId.value)
    : []
})

const blueTeamItems = computed(() =>
  excludeOpposingTeam(teamItems.value, props.modelValue.redTeamId),
)
const redTeamItems = computed(() =>
  excludeOpposingTeam(teamItems.value, props.modelValue.blueTeamId),
)

const year = computed({
  get: () => props.modelValue.year,
  set: (value: number | null) => {
    emit(
      'update:modelValue',
      applyYearSelection(props.modelValue, value, catalogBacked.value),
    )
  },
})

const tournament = computed({
  get: () => catalogBacked.value
    ? props.modelValue.catalogEditionId
    : props.modelValue.tournament,
  set: (value: string | null) => {
    if (!catalogBacked.value) {
      updateAnswer('tournament', value)
      return
    }

    emit(
      'update:modelValue',
      applyCatalogEditionSelection(
        props.modelValue,
        value,
        value ? getInternationalTournamentNameForEdition(value) : null,
      ),
    )
  },
})

const stage = computed({
  get: () => props.modelValue.stage,
  set: (value: string | null) => updateAnswer('stage', value),
})

const blueTeamId = computed({
  get: () => props.modelValue.blueTeamId,
  set: (value: string | null) => updateAnswer('blueTeamId', value),
})

const redTeamId = computed({
  get: () => props.modelValue.redTeamId,
  set: (value: string | null) => updateAnswer('redTeamId', value),
})

const gameNumber = computed({
  get: () => props.modelValue.gameNumber,
  set: (value: number | null) => updateAnswer('gameNumber', value),
})
</script>

<template>
  <v-card class="answer-card" tag="section" aria-labelledby="answer-panel-title">
    <div class="answer-card__header">
      <div>
        <p class="panel-kicker">Reconstruct the match</p>
        <h2
          id="answer-panel-title"
          ref="heading"
          class="phase-heading"
          tabindex="-1"
        >
          Lock your read
        </h2>
      </div>
      <span class="answer-card__count">04 signals</span>
    </div>

    <v-form class="answer-form" @submit.prevent="emit('submit')">
      <div class="field-grid field-grid--event">
        <v-select
          v-model="year"
          density="compact"
          :items="question.choices.years"
          :disabled="disabled"
          label="Year"
          aria-label="Year"
          hide-details
        />

        <v-select
          v-model="tournament"
          density="compact"
          :items="tournamentItems"
          :disabled="disabled || (catalogBacked && year === null)"
          label="Tournament"
          aria-label="Tournament"
          hide-details
        />
      </div>

      <div class="field-grid field-grid--round">
        <v-select
          v-model="stage"
          density="compact"
          :items="stageItems"
          :disabled="disabled || (catalogBacked && selectedCatalogEditionId === null)"
          label="Stage"
          aria-label="Tournament stage"
          hide-details
        />

        <v-select
          v-model="gameNumber"
          density="compact"
          :items="question.choices.games"
          :disabled="disabled"
          label="Game"
          aria-label="Game number"
          hide-details
        />
      </div>

      <div class="side-divider" aria-hidden="true">
        <span>Blue side</span>
        <span>Red side</span>
      </div>

      <div class="field-grid field-grid--teams">
        <v-select
          v-model="blueTeamId"
          density="compact"
          :items="blueTeamItems"
          item-title="name"
          item-value="id"
          :disabled="disabled || (catalogBacked && selectedCatalogEditionId === null)"
          label="Blue team"
          aria-label="Blue-side team"
          hide-details
        />
        <v-select
          v-model="redTeamId"
          density="compact"
          :items="redTeamItems"
          item-title="name"
          item-value="id"
          :disabled="disabled || (catalogBacked && selectedCatalogEditionId === null)"
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
