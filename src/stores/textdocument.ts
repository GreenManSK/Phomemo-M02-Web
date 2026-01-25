import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TextBlock } from '@/logic/textprinter';
import { useGlobalSettingsStore } from './globalsettings';

export const useTextDocumentStore = defineStore('text-document', () => {
    const textBlocks = ref<TextBlock[]>([]);
    const globalSettings = useGlobalSettingsStore();

    // Paper width from global settings
    const paperWidth = computed(() => globalSettings.settings.pixelPerLine);

    /**
     * Add a new text block
     */
    function addBlock(block: TextBlock) {
        textBlocks.value.push(block);
    }

    /**
     * Update an existing text block
     */
    function updateBlock(id: string, updates: Partial<TextBlock>) {
        const index = textBlocks.value.findIndex(b => b.id === id);
        if (index !== -1) {
            textBlocks.value[index] = { ...textBlocks.value[index], ...updates };
        }
    }

    /**
     * Delete a text block by ID
     */
    function deleteBlock(id: string) {
        textBlocks.value = textBlocks.value.filter(b => b.id !== id);
    }

    /**
     * Reorder blocks based on array of IDs
     */
    function reorderBlocks(newOrder: string[]) {
        textBlocks.value.forEach(block => {
            const newIndex = newOrder.indexOf(block.id);
            if (newIndex !== -1) {
                block.order = newIndex;
            }
        });
    }

    /**
     * Clear all text blocks
     */
    function clearDocument() {
        textBlocks.value = [];
    }

    /**
     * Get sorted blocks by order
     */
    const sortedBlocks = computed(() => {
        return [...textBlocks.value].sort((a, b) => a.order - b.order);
    });

    return {
        textBlocks,
        paperWidth,
        sortedBlocks,
        addBlock,
        updateBlock,
        deleteBlock,
        reorderBlocks,
        clearDocument,
    };
});
