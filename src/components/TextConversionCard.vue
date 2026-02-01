<script setup lang="ts">
import { computed, ref } from 'vue';
import { useThrottleFn } from '@vueuse/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import Button from '@/components/ui/button/Button.vue';
import type { TextConversionOptions } from '@/logic/textprinter';
import { Settings2, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import Label from './ui/label/Label.vue';

const props = defineProps<{
    initialOptions?: TextConversionOptions;
}>();

const emit = defineEmits<{
    (e: 'text-conversion-options-change', value: TextConversionOptions): void;
}>();

// Throttled emit function - allows updates every 300ms during dragging
const throttledEmit = useThrottleFn(() => {
    emit('text-conversion-options-change', textConversionOptions.value);
}, 300);

// Increment/decrement functions for fine-tuning
function adjustContrast(delta: number) {
    contrast.value = Math.max(0, Math.min(2, contrast.value + delta));
    throttledEmit();
}

function adjustExposure(delta: number) {
    exposure.value = Math.max(0, Math.min(2, exposure.value + delta));
    throttledEmit();
}

function adjustThreshold(delta: number) {
    threshold.value = Math.max(0, Math.min(255, threshold.value + delta));
    throttledEmit();
}

const algorithmOptions = ['Basic', 'Dither', 'Atkinson', 'Bayer', 'SierraLite'] as const;
const paperThicknessOptions = ['none', 'light', 'medium', 'heavy', 'dedicated'] as const;
const filterOptions = ['none', 'portrait', 'pet', 'lineplus', 'auto', 'draft'] as const;

// Initialize with saved settings or defaults
const threshold = ref(props.initialOptions?.threshold ?? 128);
const algorithm = ref<'Basic' | 'Dither' | 'Atkinson' | 'Bayer' | 'SierraLite'>(props.initialOptions?.algorithm ?? 'Atkinson');
const contrast = ref(props.initialOptions?.contrast ?? 1.0);
const exposure = ref(props.initialOptions?.exposure ?? 1.0);
const paperThickness = ref<'none' | 'light' | 'medium' | 'heavy' | 'dedicated'>(props.initialOptions?.paperThickness ?? 'none');
const preprocessFilter = ref<'none' | 'portrait' | 'pet' | 'lineplus' | 'auto' | 'draft'>(props.initialOptions?.preprocessFilter ?? 'none');

const textConversionOptions = computed((): TextConversionOptions => ({
    threshold: threshold.value,
    algorithm: algorithm.value,
    contrast: contrast.value,
    exposure: exposure.value,
    paperThickness: paperThickness.value,
    preprocessFilter: preprocessFilter.value,
}));
</script>

<template>
    <Card>
        <CardHeader class="flex flex-row items-center">
            <Settings2 class="mr-2" />
            <CardTitle>Text Conversion</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="preprocess-filter">Preprocessing Filter</Label>
                <ToggleGroup type="single" v-model="preprocessFilter" id="preprocess-filter">
                    <ToggleGroupItem v-for="option in filterOptions" :key="option" :value="option"
                        @click="emit('text-conversion-options-change', textConversionOptions)">
                        {{ option === 'lineplus' ? 'Line+' : option.charAt(0).toUpperCase() + option.slice(1) }}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="paper-thickness">Paper Thickness</Label>
                <ToggleGroup type="single" v-model="paperThickness" id="paper-thickness">
                    <ToggleGroupItem v-for="option in paperThicknessOptions" :key="option" :value="option"
                        @click="emit('text-conversion-options-change', textConversionOptions)">
                        {{ option.charAt(0).toUpperCase() + option.slice(1) }}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="algorithm">Algorithm</Label>
                <ToggleGroup type="single" v-model="algorithm" id="algorithm">
                    <ToggleGroupItem v-for="option in algorithmOptions" :key="option" :value="option"
                        @click="emit('text-conversion-options-change', textConversionOptions)">
                        {{ option }}
                    </ToggleGroupItem>
                </ToggleGroup>
                <p class="text-xs text-gray-500 mt-2">
                    <span v-if="algorithm === 'Basic'">Simple threshold - fast but jagged edges</span>
                    <span v-else-if="algorithm === 'Dither'">Floyd-Steinberg - high quality, darker output</span>
                    <span v-else-if="algorithm === 'Atkinson'">Recommended for text - lighter, cleaner edges</span>
                    <span v-else-if="algorithm === 'Bayer'">Ordered pattern - good for gradients</span>
                    <span v-else-if="algorithm === 'SierraLite'">Lightweight error diffusion</span>
                </p>
            </div>
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <Label class="font-medium" for="contrast">Contrast</Label>
                    <div class="flex items-center gap-1">
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustContrast(-0.01)" title="Decrease contrast by 0.01">
                            <ChevronLeft :size="14" />
                        </Button>
                        <Badge variant="outline" class="text-xs font-semibold min-w-[3rem] text-center">{{ contrast.toFixed(2) }}</Badge>
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustContrast(0.01)" title="Increase contrast by 0.01">
                            <ChevronRight :size="14" />
                        </Button>
                    </div>
                </div>
                <input id="contrast" type="range" min="0" max="2" step="0.01" v-model.number="contrast" class="w-full"
                    @input="throttledEmit" />
            </div>
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <Label class="font-medium" for="exposure">Exposure</Label>
                    <div class="flex items-center gap-1">
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustExposure(-0.01)" title="Decrease exposure by 0.01">
                            <ChevronLeft :size="14" />
                        </Button>
                        <Badge variant="outline" class="text-xs font-semibold min-w-[3rem] text-center">{{ exposure.toFixed(2) }}</Badge>
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustExposure(0.01)" title="Increase exposure by 0.01">
                            <ChevronRight :size="14" />
                        </Button>
                    </div>
                </div>
                <input id="exposure" type="range" min="0" max="2" step="0.01" v-model.number="exposure" class="w-full"
                    @input="throttledEmit" />
            </div>
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <Label class="font-medium" for="threshold">Threshold</Label>
                    <div class="flex items-center gap-1">
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustThreshold(-1)" title="Decrease threshold by 1">
                            <ChevronLeft :size="14" />
                        </Button>
                        <Badge variant="outline" class="text-xs font-semibold min-w-[3rem] text-center">{{ threshold }}</Badge>
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustThreshold(1)" title="Increase threshold by 1">
                            <ChevronRight :size="14" />
                        </Button>
                    </div>
                </div>
                <input id="threshold" type="range" min="0" max="255" v-model.number="threshold" class="w-full"
                    @input="throttledEmit" />
            </div>
        </CardContent>
    </Card>
</template>
