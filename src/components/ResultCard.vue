<script setup lang="ts">
import type { ScoreResult } from '@/types/question'

defineProps<{
  result: ScoreResult
  nextLabel: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  share: []
  next: []
}>()
</script>

<template>
  <v-card class="result-card" tag="section">
    <div class="result-card__score">
      <p class="panel-kicker">Reconstruction complete</p>
      <div class="score-lockup">
        <strong>{{ result.points }}</strong>
        <span>/ {{ result.total }}</span>
      </div>
      <p>
        {{ result.points === result.total ? 'Perfect archive read.' : 'The frame kept some secrets.' }}
      </p>
      <v-progress-linear
        :model-value="(result.points / result.total) * 100"
        color="primary"
        bg-color="surface-bright"
        height="6"
        rounded
      />
    </div>

    <div class="result-lines">
      <article v-for="line in result.lines" :key="line.id" class="result-line">
        <div class="result-line__status" :class="{ 'result-line__status--correct': line.correct }">
          {{ line.correct ? '✓' : '×' }}
        </div>
        <div class="result-line__copy">
          <strong>{{ line.label }}</strong>
          <span :class="{ 'result-line__actual--wrong': !line.correct }">{{ line.actual }}</span>
          <small v-if="!line.correct">Answer · {{ line.expected }}</small>
        </div>
      </article>
    </div>

    <div class="result-card__actions">
      <v-btn
        variant="outlined"
        size="large"
        prepend-icon="mdi-share-variant"
        :disabled="disabled"
        @click="emit('share')"
      >
        Share result
      </v-btn>
      <v-btn
        color="primary"
        size="large"
        append-icon="mdi-refresh"
        :loading="disabled"
        :disabled="disabled"
        @click="emit('next')"
      >
        {{ nextLabel }}
      </v-btn>
    </div>
  </v-card>
</template>
