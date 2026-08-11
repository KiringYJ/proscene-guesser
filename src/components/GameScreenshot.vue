<script setup lang="ts">
import type { Question } from '@/types/question'

defineProps<{
  question: Question
  revealed: boolean
}>()
</script>

<template>
  <figure class="screenshot-panel">
    <div class="screenshot-panel__topline">
      <span>{{ question.archiveLabel }}</span>
      <span class="signal-state">
        <span class="signal-state__dot" aria-hidden="true"></span>
        Signal restored
      </span>
    </div>

    <div class="screenshot-frame" :class="{ 'screenshot-frame--revealed': revealed }">
      <img :src="question.image" :alt="question.imageAlt" />
      <div class="scanlines" aria-hidden="true"></div>
      <div class="corner corner--top-left" aria-hidden="true"></div>
      <div class="corner corner--top-right" aria-hidden="true"></div>
      <div class="corner corner--bottom-left" aria-hidden="true"></div>
      <div class="corner corner--bottom-right" aria-hidden="true"></div>

      <div class="frame-badge">
        <span>FRAME</span>
        <strong>01</strong>
      </div>
    </div>

    <figcaption>
      <span class="caption-label">Analyst note</span>
      <span>{{ question.clue }}</span>
    </figcaption>
  </figure>
</template>
