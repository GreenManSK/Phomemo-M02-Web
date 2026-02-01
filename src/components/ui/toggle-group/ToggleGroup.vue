<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority'
import type { toggleVariants } from '@/components/ui/toggle'
import { reactiveOmit } from '@vueuse/core'
import { ToggleGroupRoot, type ToggleGroupRootEmits, type ToggleGroupRootProps, useForwardProps } from 'reka-ui'
import { type HTMLAttributes, provide, ref, watch } from 'vue'
import { cn } from '@/lib/utils'

type ToggleGroupVariants = VariantProps<typeof toggleVariants>

const props = defineProps<ToggleGroupRootProps & {
  class?: HTMLAttributes['class']
  variant?: ToggleGroupVariants['variant']
  size?: ToggleGroupVariants['size']
}>()
const emits = defineEmits<ToggleGroupRootEmits>()

provide('toggleGroup', {
  variant: props.variant,
  size: props.size,
})

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant')
const forwardedProps = useForwardProps(delegatedProps)

// Track the current value to prevent deselection in single mode
const previousValue = ref(props.modelValue)

// Intercept update:modelValue to prevent deselection in single mode
const handleUpdateModelValue = (value: any) => {
  // In single mode, prevent deselecting by clicking the same option
  if (props.type === 'single') {
    // If the new value is empty/undefined and we had a previous value, keep the previous value
    if ((value === undefined || value === null || value === '') && previousValue.value) {
      // Don't emit the change, keep the old value
      return
    }
    // Update previous value for next comparison
    previousValue.value = value
  }

  // Emit the update for all other cases
  emits('update:modelValue', value)
}

// Watch modelValue prop changes to keep previousValue in sync
watch(() => props.modelValue, (newValue) => {
  previousValue.value = newValue
}, { immediate: true })
</script>

<template>
  <ToggleGroupRoot
    v-slot="slotProps"
    data-slot="toggle-group"
    :data-size="size"
    :data-variant="variant"
    v-bind="forwardedProps"
    :class="cn('group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs', props.class)"
    @update:modelValue="handleUpdateModelValue"
  >
    <slot v-bind="slotProps" />
  </ToggleGroupRoot>
</template>
