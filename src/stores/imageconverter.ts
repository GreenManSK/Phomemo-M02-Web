import { ref } from 'vue'
import { defineStore } from 'pinia'
import { convertImageWorker } from '@/worker/client';
import type { ImageConversionOptions, PrinterImage } from '@/logic/printerimage';



export const useImageConvertersStore = defineStore('image-converter', () => {
    const abortController = ref<AbortController | null>(null);
    const convertImageWorkerFn = convertImageWorker();

    let lastConversionTime = 0;
    let pendingConversion: { image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions, resolve: (value: PrinterImage) => void, reject: (reason?: any) => void } | null = null;
    let throttleTimeout: number | null = null;

    async function convertImageInternal(image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions): Promise<PrinterImage> {
        abortController.value?.abort()
        const localController = new AbortController();
        abortController.value = localController;
        const optionsPlain = JSON.parse(JSON.stringify(options));
        const startTime = performance.now();
        const result = await convertImageWorkerFn(image, outputWidthPixel, optionsPlain);
        if (localController) {
            localController.signal.throwIfAborted();
        }
        const endTime = performance.now();
        console.log(`Image conversion took ${endTime - startTime} ms`);
        if (result.width !== outputWidthPixel) {
            console.warn(`Image conversion width mismatch: expected ${outputWidthPixel}, got ${result.width}`);
        }
        lastConversionTime = endTime;
        return result;
    }

    function convertImage(image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions): Promise<PrinterImage> {
        const now = performance.now();
        const timeSinceLastConversion = now - lastConversionTime;
        const minInterval = 100; // Minimum 100ms between conversions

        return new Promise((resolve, reject) => {
            // Clear any pending conversion
            if (pendingConversion) {
                pendingConversion.reject(new Error('Superseded by new conversion request'));
            }
            pendingConversion = { image, outputWidthPixel, options, resolve, reject };

            // If enough time has passed, convert immediately
            if (timeSinceLastConversion >= minInterval) {
                if (throttleTimeout !== null) {
                    clearTimeout(throttleTimeout);
                    throttleTimeout = null;
                }
                const current = pendingConversion;
                pendingConversion = null;
                convertImageInternal(current.image, current.outputWidthPixel, current.options)
                    .then(current.resolve)
                    .catch(current.reject);
            } else {
                // Otherwise, schedule conversion after the minimum interval
                if (throttleTimeout !== null) {
                    clearTimeout(throttleTimeout);
                }
                const delay = minInterval - timeSinceLastConversion;
                throttleTimeout = window.setTimeout(() => {
                    throttleTimeout = null;
                    if (pendingConversion) {
                        const current = pendingConversion;
                        pendingConversion = null;
                        convertImageInternal(current.image, current.outputWidthPixel, current.options)
                            .then(current.resolve)
                            .catch(current.reject);
                    }
                }, delay);
            }
        });
    }

    return { convertImage };
})

