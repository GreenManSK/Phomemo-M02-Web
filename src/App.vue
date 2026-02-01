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



const imageDataRef = ref<PrinterImage | null>(null);
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
                return {
                    rotation: parsed.rotation ?? defaultImageConversionOptions.rotation,
                    threshold: parsed.threshold ?? defaultImageConversionOptions.threshold,
                    invert: parsed.invert ?? defaultImageConversionOptions.invert,
                    algorithm: parsed.algorithm ?? defaultImageConversionOptions.algorithm,
                    contrast: parsed.contrast ?? defaultImageConversionOptions.contrast,
                    exposure: parsed.exposure ?? defaultImageConversionOptions.exposure,
                    heightPercentage: parsed.heightPercentage ?? defaultImageConversionOptions.heightPercentage,
                    widthPercentage: parsed.widthPercentage ?? defaultImageConversionOptions.widthPercentage,
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

// Save settings to localStorage whenever they change
watch(imageConversionOptions, (newOptions) => {
    try {
        localStorage.setItem('imageConversionOptions', JSON.stringify(newOptions));
    } catch (e) {
        console.warn('Failed to save settings:', e);
    }
}, { deep: true });

watch(textConversionOptions, (newOptions) => {
    try {
        localStorage.setItem('textConversionOptions', JSON.stringify(newOptions));
    } catch (e) {
        console.warn('Failed to save text settings:', e);
    }
}, { deep: true });

async function setImage(image: HTMLImageElement) {
    imageRef.value = image;
}

function onCurrentTextChange(text: string, style: import('./logic/textprinter').TextBlockStyle) {
    currentText.value = text;
    currentStyle.value = style;
}

watch([imageRef, imageConversionOptions], async () => {
    if (!imageRef.value) return;
    const options = JSON.parse(JSON.stringify(imageConversionOptions.value));

    try {
        // Convert to printer image (filters applied in worker)
        const image = await createImageBitmap(imageRef.value);
        const result = await converterStore.convertImage(image, appSettings.settings.pixelPerLine, options);
        imageDataRef.value = result;
    } catch {
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
                :adjusted-image="null"
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
