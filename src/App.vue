<script setup lang="ts">
import { ref, watch } from 'vue';
import 'vue-sonner/style.css'

import ImagePreview from './components/ImagePreview.vue';
import ImageDragAndDrop from './components/ImageDragAndDrop.vue';
import PrinterConnectionCard from './components/PrinterConnectionCard.vue';
import ImageConversionCard from './components/ImageConversionCard.vue';
import TextConversionCard from './components/TextConversionCard.vue';
import AppSettings from './components/AppSettings.vue';
import PrintButton from './components/PrintButton.vue';
import TextEditorCard from './components/TextEditorCard.vue';

import { Printer, RotateCcw } from 'lucide-vue-next';
import { Toaster } from '@/components/ui/sonner'
import Button from './components/ui/button/Button.vue';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { defaultImageConversionOptions, type ImageConversionOptions, type PrinterImage } from './logic/printerimage.ts';
import { useImageConvertersStore } from './stores/imageconverter.ts';
import { useGlobalSettingsStore } from './stores/globalsettings.ts';
import { usePrinterStore } from './stores/printer.ts';
import { useTextDocumentStore } from './stores/textdocument.ts';
import { renderTextDocument, type TextDocument, type TextConversionOptions, defaultTextConversionOptions } from './logic/textprinter.ts';
import { applyFilter } from './logic/phomemofilters.ts';



const imageDataRef = ref<PrinterImage | null>(null);
const adjustedImageRef = ref<HTMLImageElement | null>(null);
const filteredImageRef = ref<HTMLImageElement | null>(null);
const textPreviewImage = ref<PrinterImage | null>(null);
const activeTab = ref<'image' | 'text'>('image');

// Current text being edited (for live preview)
const currentText = ref('');
const currentStyle = ref<import('./logic/textprinter').TextBlockStyle | null>(null);

const converterStore = useImageConvertersStore();
const appSettings = useGlobalSettingsStore();
const printerStore = usePrinterStore();
const textDocumentStore = useTextDocumentStore();

// Load saved settings from localStorage or use defaults
function loadSavedSettings(): ImageConversionOptions {
    try {
        const saved = localStorage.getItem('imageConversionOptions');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Validate the loaded settings have all required fields
            if (parsed && typeof parsed === 'object') {
                // Validate and normalize resizeAlgorithm (handle old values)
                const validResizeAlgorithms = ['canvas', 'nearest', 'linear', 'cubic', 'area', 'lanczos4'];
                let resizeAlgorithm = parsed.resizeAlgorithm ?? defaultImageConversionOptions.resizeAlgorithm;
                if (!validResizeAlgorithms.includes(resizeAlgorithm)) {
                    console.warn(`Invalid resizeAlgorithm "${resizeAlgorithm}" in saved settings, defaulting to "canvas"`);
                    resizeAlgorithm = 'canvas';
                }

                return {
                    rotation: parsed.rotation ?? defaultImageConversionOptions.rotation,
                    threshold: parsed.threshold ?? defaultImageConversionOptions.threshold,
                    invert: parsed.invert ?? defaultImageConversionOptions.invert,
                    algorithm: parsed.algorithm ?? defaultImageConversionOptions.algorithm,
                    contrast: parsed.contrast ?? defaultImageConversionOptions.contrast,
                    exposure: parsed.exposure ?? defaultImageConversionOptions.exposure,
                    heightPercentage: parsed.heightPercentage ?? defaultImageConversionOptions.heightPercentage,
                    widthPercentage: parsed.widthPercentage ?? defaultImageConversionOptions.widthPercentage,
                    paperThickness: parsed.paperThickness ?? defaultImageConversionOptions.paperThickness,
                    preprocessFilter: 'none', // Always start with no filter (not saved)
                    filterOrder: parsed.filterOrder ?? defaultImageConversionOptions.filterOrder,
                    imageSmoothingEnabled: parsed.imageSmoothingEnabled ?? defaultImageConversionOptions.imageSmoothingEnabled,
                    imageSmoothingQuality: parsed.imageSmoothingQuality ?? defaultImageConversionOptions.imageSmoothingQuality,
                    resizeAlgorithm: resizeAlgorithm as 'canvas' | 'nearest' | 'linear' | 'cubic' | 'area' | 'lanczos4',
                    sharpenBeforeResize: parsed.sharpenBeforeResize ?? defaultImageConversionOptions.sharpenBeforeResize,
                    sharpenAfterResize: parsed.sharpenAfterResize ?? defaultImageConversionOptions.sharpenAfterResize,
                };
            }
        }
    } catch (e) {
        console.warn('Failed to load saved settings:', e);
    }
    return { ...defaultImageConversionOptions };
}

function loadSavedTextSettings(): TextConversionOptions {
    try {
        const saved = localStorage.getItem('textConversionOptions');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                return {
                    threshold: parsed.threshold ?? defaultTextConversionOptions.threshold,
                    algorithm: parsed.algorithm ?? defaultTextConversionOptions.algorithm,
                    contrast: parsed.contrast ?? defaultTextConversionOptions.contrast,
                    exposure: parsed.exposure ?? defaultTextConversionOptions.exposure,
                    paperThickness: parsed.paperThickness ?? defaultTextConversionOptions.paperThickness,
                    preprocessFilter: 'none', // Always start with no filter (not saved)
                };
            }
        }
    } catch (e) {
        console.warn('Failed to load saved text settings:', e);
    }
    return { ...defaultTextConversionOptions };
}

const imageConversionOptions = ref(loadSavedSettings());
const textConversionOptions = ref(loadSavedTextSettings());
const imageRef = ref<HTMLImageElement | null>(null);
const componentKey = ref(0);
const isProcessingImage = ref(false);

// Cache for preprocessed images
const lastPreprocessFilter = ref<string | null>(null);
const lastFilterOrder = ref<string | null>(null);
const lastSourceImage = ref<HTMLImageElement | null>(null);
const cachedFilteredImage = ref<ImageBitmap | null>(null);

// Save settings to localStorage whenever they change (except preprocessFilter)
watch(imageConversionOptions, (newOptions) => {
    try {
        const { preprocessFilter, ...optionsToSave } = newOptions;
        localStorage.setItem('imageConversionOptions', JSON.stringify(optionsToSave));
    } catch (e) {
        console.warn('Failed to save settings:', e);
    }
}, { deep: true });

watch(textConversionOptions, (newOptions) => {
    try {
        const { preprocessFilter, ...optionsToSave } = newOptions;
        localStorage.setItem('textConversionOptions', JSON.stringify(optionsToSave));
    } catch (e) {
        console.warn('Failed to save text settings:', e);
    }
}, { deep: true });

async function setImage(image: HTMLImageElement) {
    imageRef.value = image;
}

// Helper function to convert ImageData to HTMLImageElement
async function imageDataToImage(imageData: ImageData): Promise<HTMLImageElement> {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.putImageData(imageData, 0, 0);

    return new Promise((resolve, reject) => {
        try {
            // Use toDataURL for better cross-browser compatibility
            const dataUrl = canvas.toDataURL('image/png');
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image from data URL'));
            img.src = dataUrl;
        } catch (error) {
            reject(new Error(`Failed to convert canvas to data URL: ${error}`));
        }
    });
}

function onCurrentTextChange(text: string, style: import('./logic/textprinter').TextBlockStyle) {
    currentText.value = text;
    currentStyle.value = style;
}

watch([imageRef, imageConversionOptions], async () => {
    if (!imageRef.value) return;
    const options = JSON.parse(JSON.stringify(imageConversionOptions.value));

    try {
        isProcessingImage.value = true;

        // Check if we need to re-run the preprocessing filter
        const filterChanged = lastPreprocessFilter.value !== options.preprocessFilter;
        const filterOrderChanged = lastFilterOrder.value !== options.filterOrder;
        const imageChanged = lastSourceImage.value !== imageRef.value;

        let imageToConvert: ImageBitmap;
        let filteredImageDataResult: ImageData | null = null;

        // Only apply filter here if filterOrder is 'before-resize'
        const shouldApplyFilterHere = options.filterOrder === 'before-resize' && options.preprocessFilter && options.preprocessFilter !== 'none';

        if ((filterChanged || imageChanged || filterOrderChanged) && shouldApplyFilterHere) {
            // Need to apply/re-apply the preprocessing filter before resize
            console.log(`Applying ${options.preprocessFilter} filter before resize (filterChanged: ${filterChanged}, imageChanged: ${imageChanged})...`);
            const filterStartTime = performance.now();

            const sourceImage = await createImageBitmap(imageRef.value);
            const filteredImageData = await applyFilter(sourceImage, options.preprocessFilter);
            console.log(`Filter applied in ${performance.now() - filterStartTime}ms`);

            // Cache the filtered image
            cachedFilteredImage.value = await createImageBitmap(filteredImageData);
            lastPreprocessFilter.value = options.preprocessFilter;
            lastFilterOrder.value = options.filterOrder;
            lastSourceImage.value = imageRef.value;

            imageToConvert = cachedFilteredImage.value;
            filteredImageDataResult = filteredImageData;
        } else if (shouldApplyFilterHere && cachedFilteredImage.value && !imageChanged && !filterOrderChanged) {
            // Reuse cached filtered image (only if image and filter order haven't changed)
            console.log(`Reusing cached ${options.preprocessFilter} filter`);
            imageToConvert = cachedFilteredImage.value;
            // We don't have the ImageData from cache, but we don't need it for display
        } else {
            // No filter or filter is 'none', or filterOrder is 'after-resize', or cache is invalid
            if (filterChanged || imageChanged || filterOrderChanged) {
                lastSourceImage.value = imageRef.value;
                lastPreprocessFilter.value = options.preprocessFilter;
                lastFilterOrder.value = options.filterOrder;
            }
            // Clear cache when filter is set to 'none' or when using 'after-resize' order
            if (options.preprocessFilter === 'none' || !options.preprocessFilter || options.filterOrder === 'after-resize') {
                cachedFilteredImage.value = null;
            }
            imageToConvert = await createImageBitmap(imageRef.value);
        }

        // Convert to printer image
        // If filterOrder is 'before-resize', set preprocessFilter to 'none' since we've already applied it
        // If filterOrder is 'after-resize', keep preprocessFilter so it's applied after resize in imagehelper
        const conversionOptions = options.filterOrder === 'before-resize'
            ? { ...options, preprocessFilter: 'none' as const }
            : options;
        const result = await converterStore.convertImage(imageToConvert, appSettings.settings.pixelPerLine, conversionOptions);
        imageDataRef.value = result.printerImage;

        // Convert adjusted ImageData to HTMLImageElement
        if (result.adjustedImageData) {
            try {
                adjustedImageRef.value = await imageDataToImage(result.adjustedImageData);
            } catch (error) {
                console.error('Failed to create adjusted image:', error);
                adjustedImageRef.value = null;
            }
        } else {
            adjustedImageRef.value = null;
        }

        // Handle filtered image display
        // If we created a filtered image in App.vue (before-resize), use it
        if (filteredImageDataResult) {
            try {
                filteredImageRef.value = await imageDataToImage(filteredImageDataResult);
            } catch (error) {
                console.error('Failed to create filtered image:', error);
                filteredImageRef.value = null;
            }
        }
        // If filter was applied after resize in imagehelper, use the result from there
        else if (options.filterOrder === 'after-resize' && result.filteredImageData) {
            try {
                filteredImageRef.value = await imageDataToImage(result.filteredImageData);
            } catch (error) {
                console.error('Failed to create filtered image:', error);
                filteredImageRef.value = null;
            }
        }
        // Clear filtered image if no filter is selected
        else if (options.preprocessFilter === 'none' || !options.preprocessFilter) {
            filteredImageRef.value = null;
        }
        // Otherwise keep the existing filteredImageRef.value
    } catch (error) {
        console.error('Image conversion failed:', error);
    } finally {
        isProcessingImage.value = false;
    }
});

// Watch text document changes and render to preview
watch([() => textDocumentStore.textBlocks, currentText, currentStyle, textConversionOptions], async () => {
    // Create blocks array including current text being edited (if any)
    const blocks = [...textDocumentStore.textBlocks];

    // Add temporary block for current text (for live preview)
    if (currentText.value.trim() && currentStyle.value) {
        blocks.push({
            id: 'temp-preview',
            content: currentText.value,
            style: currentStyle.value,
            order: blocks.length,
        });
    }

    // If no blocks and no current text, clear preview
    if (blocks.length === 0) {
        textPreviewImage.value = null;
        return;
    }

    try {
        const document: TextDocument = {
            blocks,
            paperWidth: appSettings.settings.pixelPerLine,
        };
        textPreviewImage.value = await renderTextDocument(document, textConversionOptions.value);
    } catch (error) {
        console.error('Failed to render text document:', error);
        textPreviewImage.value = null;
    }
}, { deep: true });

async function printContent() {
    try {
        if (activeTab.value === 'image') {
            if (!imageDataRef.value) {
                console.error('No image data to print');
                return;
            }
            await printerStore.printImage(imageDataRef.value);
        } else if (activeTab.value === 'text') {
            if (!textPreviewImage.value) {
                console.error('No text document to print');
                return;
            }
            await printerStore.printImage(textPreviewImage.value);
        }
    } catch (error) {
        console.error('Failed to print:', error);
    }
}

function restartApp() {
    imageConversionOptions.value = { ...defaultImageConversionOptions };
    textConversionOptions.value = { ...defaultTextConversionOptions };
    // Clear saved settings from localStorage
    try {
        localStorage.removeItem('imageConversionOptions');
        localStorage.removeItem('textConversionOptions');
    } catch (e) {
        console.warn('Failed to clear saved settings:', e);
    }
    componentKey.value += 1; // Force re-mount of conversion cards to reset UI controls
}

</script>

<template>
    <main>
        <header class="app-header">
            <div class="app-header-titles">
                <h1 class="app-title">
                    <Printer class="printer-icon" />
                    Phomemo M02 Web Printer
                </h1>
                <p class="app-subtitle">Mobile Recipe Printer</p>
            </div>
            <div class="app-settings-corner">
                <Button @click="restartApp" variant="outline" size="icon" title="Reset conversion settings to defaults">
                    <RotateCcw :size="20" />
                </Button>
                <AppSettings />
            </div>
        </header>

        <Tabs v-model="activeTab" class="settings-panel">
            <TabsList class="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="image">Image</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>

            <TabsContent value="image" class="space-y-6">
                <PrinterConnectionCard :show-all-bluetooth-devices="appSettings.settings.showAllBluetoothDevices" />
                <ImageDragAndDrop @imageLoaded="(image) => setImage(image)" />
                <ImageConversionCard
                    :key="componentKey"
                    :initial-options="imageConversionOptions"
                    :original-width="imageRef?.naturalWidth"
                    :original-height="imageRef?.naturalHeight"
                    :pixel-per-line="appSettings.settings.pixelPerLine"
                    :cm-per-line="appSettings.settings.cmPerLine"
                    :is-processing="isProcessingImage"
                    @image-conversion-options-change="(options) => imageConversionOptions = options" />
            </TabsContent>

            <TabsContent value="text" class="space-y-6">
                <PrinterConnectionCard :show-all-bluetooth-devices="appSettings.settings.showAllBluetoothDevices" />
                <TextEditorCard @current-text-change="onCurrentTextChange" />
                <TextConversionCard :key="componentKey" :initial-options="textConversionOptions" @text-conversion-options-change="(options) => textConversionOptions = options" />
            </TabsContent>
        </Tabs>

        <div class="preview-panel">
            <ImagePreview
                :image="activeTab === 'image' ? imageDataRef : textPreviewImage"
                :original-image="activeTab === 'image' ? imageRef : null"
                :adjusted-image="activeTab === 'image' ? adjustedImageRef : null"
                :filtered-image="activeTab === 'image' ? filteredImageRef : null"
                style="width: 100%;"
            />
            <PrintButton
                style="width: 100%;"
                :image-selected="activeTab === 'image' ? !!imageDataRef : !!textPreviewImage"
                :connected="printerStore.isConnected"
                @print="printContent"
            />
        </div>
    </main>

    <Toaster />
</template>

<style scoped>
main {
    display: grid;
    grid-template-areas:
        "header header"
        "settings preview";
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 1fr;
    gap: 2rem;
    align-items: flex-start;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    background-color: #f0f0f0;
}

/* Tabs component fills the settings area */
main > :deep(.settings-panel) {
    display: flex;
    flex-direction: column;
}

.app-header {
    grid-area: header;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
}

.app-header-titles {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}

.app-title {
    font-size: 2rem;
    font-weight: bold;
    margin: 0;
    color: #222;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.printer-icon {
    width: 1.5em;
    height: 1.5em;
    margin-right: 0.25em;
}

.app-subtitle {
    font-size: 1rem;
    color: #666;
    margin-top: 0.25rem;
    margin-left: 0.1rem;
}

.app-settings-corner {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    font-size: 1.5rem;
    margin-left: 1rem;
}

.settings-panel {
    grid-area: settings;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.preview-panel {
    grid-area: preview;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
    position: sticky;
    top: 2rem;
    align-self: start;
}

@media (max-width: 768px) {
    main {
        grid-template-areas:
            "header"
            "settings"
            "preview";
        grid-template-columns: 1fr;
        grid-template-rows: auto auto 1fr;
        gap: 1.5rem;
        min-height: unset;
    }

    .preview-panel {
        align-items: stretch;
    }

    .app-header {
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 0.75rem;
    }

    .app-title {
        font-size: 1.3rem;
    }

    .app-subtitle {
        font-size: 0.95rem;
    }

    .app-settings-corner {
        margin-left: 0;
        font-size: 1.3rem;
    }
}
</style>
