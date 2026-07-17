<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    class="relative inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200"
    :class="modelValue ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute h-[14px] w-[14px] rounded-full transition-[left,background-color] duration-200 motion-reduce:transition-none"
      :class="modelValue ? 'left-[18px] bg-accent' : 'left-[3px] bg-faint'"
    ></span>
  </button>
</template>
