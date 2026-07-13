<script setup lang="ts">
import type { Check } from '../../engine/types.ts'

defineProps<{ checks: readonly Check[] | null }>()
</script>

<template>
  <div class="checks-card">
    <p class="eyebrow">verdict</p>
    <ul id="checks">
      <li v-if="!checks" class="pending">Validate to see the checks.</li>
      <li v-for="check in checks ?? []" :key="check.name" :class="check.pass ? 'pass' : 'fail'">
        {{ check.name }}
        <span class="detail">{{ check.detail }}</span>
      </li>
    </ul>
  </div>
</template>
