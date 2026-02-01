<script setup lang="ts">
import type { PrinterImage } from '@/logic/printerimage';
import { computed, defineProps, ref, watch } from 'vue';
import Card from './ui/card/Card.vue';
import CardHeader from './ui/card/CardHeader.vue';
import CardTitle from './ui/card/CardTitle.vue';
import CardContent from './ui/card/CardContent.vue';
import TabsContent from './ui/tabs/TabsContent.vue';
import TabsList from './ui/tabs/TabsList.vue';
import Tabs from './ui/tabs/Tabs.vue';
import TabsTrigger from './ui/tabs/TabsTrigger.vue';

const props = defineProps<{
    image: PrinterImage | null; // Optional image prop
    originalImage: HTMLImageElement | null; // Optional original image prop
    adjustedImage: HTMLImageElement | null; // Optional adjusted image prop (with contrast/exposure)
    filteredImage: HTMLImageElement | null; // Optional filtered image prop (with preprocessing filter applied)
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

// Computed property for dynamic width based on image
const tabsWidth = computed(() => {
    return props.image ? `${props.image.width}px` : '400px';
});

// on prop change
watch([canvasRef, props], async () => {
    const canvas = canvasRef.value as HTMLCanvasElement | null;
    if (!canvas || !props.image) return;
    await new Promise(resolve => requestAnimationFrame(resolve)); // Ensure DOM is updated

    canvas.width = props.image.width;
    canvas.height = props.image.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    //ctx.fillStyle = '#ffffff'; // Set background to white
    //ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Clear the canvas

    // Create image data
    const imageData = ctx.createImageData(props.image.width, props.image.height);
    const data = imageData.data;
    const { width, height, bits } = props.image;

    // Pre-fill alpha channel to 255 (opaque) - more efficient than setting per pixel
    for (let i = 3; i < data.length; i += 4) {
        data[i] = 255;
    }

    // Optimized: Process 8 pixels at a time (one byte)
    const bytesPerRow = width >> 3; // width / 8
    let pixelIndex = 0;

    for (let y = 0; y < height; y++) {
        const rowByteOffset = y * bytesPerRow;

        for (let byteX = 0; byteX < bytesPerRow; byteX++) {
            const byte = bits[rowByteOffset + byteX];

            // Unroll the 8 bits in this byte for better performance
            // Bit 7 (leftmost)
            let color = ((byte >> 7) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 6
            color = ((byte >> 6) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 5
            color = ((byte >> 5) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 4
            color = ((byte >> 4) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 3
            color = ((byte >> 3) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 2
            color = ((byte >> 2) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 1
            color = ((byte >> 1) & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;

            // Bit 0 (rightmost)
            color = (byte & 1) ? 0 : 255;
            data[pixelIndex] = color;
            data[pixelIndex + 1] = color;
            data[pixelIndex + 2] = color;
            pixelIndex += 4;
        }
    }

    ctx.putImageData(imageData, 0, 0);
});



</script>

<template>
    <Card>
        <CardHeader class="flex flex-row items-center justify-between">
            <CardTitle>Image Preview</CardTitle>
        </CardHeader>
        <CardContent>
            <Tabs default-value="account" :style="{ width: tabsWidth }">
                <TabsList>
                    <TabsTrigger value="account">
                        Preview
                    </TabsTrigger>
                    <TabsTrigger value="adjusted" :disabled="!props.adjustedImage">
                        Adjusted
                    </TabsTrigger>
                    <TabsTrigger value="filtered" :disabled="!props.filteredImage">
                        Filtered
                    </TabsTrigger>
                    <TabsTrigger value="password" :disabled="!props.originalImage">
                        Original
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="account" style="width: 100%; height: 100%;">
                    <canvas ref="canvasRef"></canvas>
                </TabsContent>
                <TabsContent value="adjusted">
                    <img :src="props.adjustedImage?.src" alt="Adjusted Image" style="outline: 2px solid #666;" />
                </TabsContent>
                <TabsContent value="filtered">
                    <img :src="props.filteredImage?.src" alt="Filtered Image" style="outline: 2px solid #666;" />
                </TabsContent>
                <TabsContent value="password">
                    <img :src="props.originalImage?.src" alt="Original Image" style="outline: 2px solid #666;" />
                </TabsContent>
            </Tabs>

        </CardContent>
    </Card>
</template>

<style scoped>
canvas {
    outline: 2px solid #666;
    width: 100%;
    height: 100%;
    min-width: 100%;
    min-height: 100%;
    max-width: 100%;
    max-height: 100%;
}

img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
</style>
