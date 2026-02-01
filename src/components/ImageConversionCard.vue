<script setup lang="ts">
import { computed, ref } from 'vue';
import { useThrottleFn, useDebounceFn } from '@vueuse/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import Button from '@/components/ui/button/Button.vue';
import type { ImageConversionOptions } from '@/logic/printerimage';
import Switch from './ui/switch/Switch.vue';
import { Settings, ChevronLeft, ChevronRight, Loader2 } from 'lucide-vue-next';
import Label from './ui/label/Label.vue';

const props = defineProps<{
    initialOptions?: ImageConversionOptions;
    originalWidth?: number;
    originalHeight?: number;
    pixelPerLine?: number;
    cmPerLine?: number;
    isProcessing?: boolean;
}>();

const emit = defineEmits<{
    (e: 'image-conversion-options-change', value: ImageConversionOptions): void;
}>();

// Throttled emit function - allows updates every 300ms during dragging
const throttledEmit = useThrottleFn(() => {
    emit('image-conversion-options-change', imageConversionOptions.value);
}, 300);

// Debounced emit function - ensures the final value is emitted after user stops
const debouncedEmit = useDebounceFn(() => {
    emit('image-conversion-options-change', imageConversionOptions.value);
}, 300);

// Combined emit - throttle for intermediate updates, debounce ensures final update
function emitChanges() {
    throttledEmit();
    debouncedEmit();
}

// Increment/decrement functions for fine-tuning
function adjustContrast(delta: number) {
    contrast.value = Math.max(0, Math.min(2, contrast.value + delta));
    emitChanges();
}

function adjustExposure(delta: number) {
    exposure.value = Math.max(0, Math.min(2, exposure.value + delta));
    emitChanges();
}

function adjustThreshold(delta: number) {
    threshold.value = Math.max(0, Math.min(255, threshold.value + delta));
    emitChanges();
}

function adjustHeightPercentage(delta: number) {
    heightPercentage.value = Math.max(1, Math.min(100, heightPercentage.value + delta));
    emitChanges();
}

function adjustWidthPercentage(delta: number) {
    widthPercentage.value = Math.max(1, Math.min(100, widthPercentage.value + delta));
    emitChanges();
}


const rotationOptions = [0, 90, 180, 270] as const;
const algorithmOptions = ['Basic', 'Dither', 'Atkinson', 'Bayer', 'SierraLite'] as const;
const paperThicknessOptions = ['none', 'light', 'medium', 'heavy', 'dedicated'] as const;
const filterOptions = ['none', 'portrait', 'pet', 'lineplus', 'auto', 'draft'] as const;

// Initialize with saved settings or defaults
const threshold = ref(props.initialOptions?.threshold ?? 128);
const rotation = ref<number | undefined>(props.initialOptions?.rotation ?? 0);
const invert = ref(props.initialOptions?.invert ?? false);
const algorithm = ref<'Basic' | 'Dither' | 'Atkinson' | 'Bayer' | 'SierraLite'>(props.initialOptions?.algorithm ?? 'Basic');
const contrast = ref(props.initialOptions?.contrast ?? 1.0);
const exposure = ref(props.initialOptions?.exposure ?? 1.0);
const heightPercentage = ref(props.initialOptions?.heightPercentage ?? 100);
const widthPercentage = ref(props.initialOptions?.widthPercentage ?? 100);
const paperThickness = ref<'none' | 'light' | 'medium' | 'heavy' | 'dedicated'>(props.initialOptions?.paperThickness ?? 'none');
const preprocessFilter = ref<'none' | 'portrait' | 'pet' | 'lineplus' | 'auto' | 'draft'>(props.initialOptions?.preprocessFilter ?? 'none');

const imageConversionOptions = computed((): ImageConversionOptions => ({
    threshold: threshold.value,
    rotation: rotation.value ?? 0,
    invert: invert.value,
    algorithm: algorithm.value,
    contrast: contrast.value,
    exposure: exposure.value,
    heightPercentage: heightPercentage.value,
    widthPercentage: widthPercentage.value,
    paperThickness: paperThickness.value,
    preprocessFilter: preprocessFilter.value,
}));

// Calculate CM values based on print dimensions
const widthInCm = computed(() => {
    if (!props.cmPerLine) return null;
    // Width is simply a percentage of the full printer width
    const cm = props.cmPerLine * (widthPercentage.value / 100);
    return cm.toFixed(2);
});

const heightInCm = computed(() => {
    if (!props.originalWidth || !props.originalHeight || !props.pixelPerLine || !props.cmPerLine) return null;

    // Account for rotation - 90 and 270 degrees swap width/height
    const isRotated = rotation.value === 90 || rotation.value === 270;
    const effectiveWidth = isRotated ? props.originalHeight : props.originalWidth;
    const effectiveHeight = isRotated ? props.originalWidth : props.originalHeight;

    if (!effectiveWidth || !effectiveHeight) return null;

    // Calculate aspect ratio
    const aspectRatio = effectiveHeight / effectiveWidth;

    // Calculate final height in pixels:
    // 1. Image is scaled to printer width (pixelPerLine)
    // 2. Height is scaled proportionally based on aspect ratio
    // 3. Apply height percentage
    const heightInPixels = props.pixelPerLine * aspectRatio * (heightPercentage.value / 100);

    // Convert to cm
    const cm = (heightInPixels / props.pixelPerLine) * props.cmPerLine;
    return cm.toFixed(2);
});
</script>

<template>
    <Card>
        <CardHeader class="flex flex-row items-center">
            <Settings class="mr-2" />
            <CardTitle>Select Image</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="mb-4">
                <div class="flex items-center gap-2 mb-2">
                    <Label class="font-medium" for="preprocess-filter">Preprocessing Filter</Label>
                    <Loader2 v-if="props.isProcessing && preprocessFilter !== 'none'" :size="16" class="animate-spin text-blue-500" />
                    <span v-if="props.isProcessing && preprocessFilter !== 'none'" class="text-sm text-blue-500">Processing...</span>
                </div>
                <ToggleGroup type="single" v-model="preprocessFilter" id="preprocess-filter" :disabled="props.isProcessing">
                    <ToggleGroupItem v-for="option in filterOptions" :key="option" :value="option"
                        @click="emit('image-conversion-options-change', imageConversionOptions)">
                        {{ option === 'lineplus' ? 'Line+' : option.charAt(0).toUpperCase() + option.slice(1) }}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="paper-thickness">Paper Thickness</Label>
                <ToggleGroup type="single" v-model="paperThickness" id="paper-thickness">
                    <ToggleGroupItem v-for="option in paperThicknessOptions" :key="option" :value="option"
                        @click="emit('image-conversion-options-change', imageConversionOptions)">
                        {{ option.charAt(0).toUpperCase() + option.slice(1) }}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="algorithm">Algorithm</Label>
                <ToggleGroup type="single" v-model="algorithm" id="algorithm">
                    <ToggleGroupItem v-for="option in algorithmOptions" :key="option" :value="option"
                        @click="emit('image-conversion-options-change', imageConversionOptions)">
                        {{ option }}
                    </ToggleGroupItem>
                </ToggleGroup>
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
                    @input="emitChanges" />
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
                    @input="emitChanges" />
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
                    @input="emitChanges" />
            </div>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="rotation">Rotation</Label>
                <ToggleGroup type="single" v-model="rotation" id="rotation">
                    <ToggleGroupItem v-for="option in rotationOptions" :key="option" :value="option"
                        @click="emit('image-conversion-options-change', imageConversionOptions)">
                        {{ option }}°
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div class="mb-4">
                <Label class="block mb-2 font-medium" for="invert-colors">Invert Colors</Label>
                <div class="flex items-center space-x-2">
                    <Switch id="invert-colors" v-model="invert"
                        @update:model-value="emit('image-conversion-options-change', imageConversionOptions)" />
                    <Label for="invert-colors">
                        Invert Colors
                    </Label>
                </div>
            </div>
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <Label class="font-medium" for="width-percentage">Print Width</Label>
                    <div class="flex items-center gap-1">
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustWidthPercentage(-1)" title="Decrease width by 1%">
                            <ChevronLeft :size="14" />
                        </Button>
                        <Badge variant="outline" class="text-xs font-semibold min-w-[3rem] text-center">{{ widthPercentage }}%</Badge>
                        <Badge v-if="widthInCm" variant="secondary" class="text-xs font-semibold min-w-[3rem] text-center">{{ widthInCm }}cm</Badge>
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustWidthPercentage(1)" title="Increase width by 1%">
                            <ChevronRight :size="14" />
                        </Button>
                    </div>
                </div>
                <input id="width-percentage" type="range" min="1" max="100" v-model.number="widthPercentage" class="w-full"
                    @input="emitChanges" />
            </div>
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <Label class="font-medium" for="height-percentage">Print Height</Label>
                    <div class="flex items-center gap-1">
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustHeightPercentage(-1)" title="Decrease height by 1%">
                            <ChevronLeft :size="14" />
                        </Button>
                        <Badge variant="outline" class="text-xs font-semibold min-w-[3rem] text-center">{{ heightPercentage }}%</Badge>
                        <Badge v-if="heightInCm" variant="secondary" class="text-xs font-semibold min-w-[3rem] text-center">{{ heightInCm }}cm</Badge>
                        <Button variant="outline" size="icon" class="h-6 w-6" @click="adjustHeightPercentage(1)" title="Increase height by 1%">
                            <ChevronRight :size="14" />
                        </Button>
                    </div>
                </div>
                <input id="height-percentage" type="range" min="1" max="100" v-model.number="heightPercentage" class="w-full"
                    @input="emitChanges" />
            </div>

            <!-- todo crop -->
        </CardContent>
    </Card>
</template>
