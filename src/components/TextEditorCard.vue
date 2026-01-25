<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import Button from '@/components/ui/button/Button.vue';
import Label from '@/components/ui/label/Label.vue';
import Input from '@/components/ui/input/Input.vue';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Type, Trash2, Edit, Plus } from 'lucide-vue-next';
import { useTextDocumentStore } from '@/stores/textdocument';
import { defaultTextBlockStyle, availableFonts, type TextBlock, type TextBlockStyle } from '@/logic/textprinter';

const textDocumentStore = useTextDocumentStore();

// Emit current editor state for live preview
const emit = defineEmits<{
    (e: 'current-text-change', text: string, style: TextBlockStyle): void;
}>();

// Current editor state
const currentText = ref('');
const currentStyle = ref<TextBlockStyle>({ ...defaultTextBlockStyle });
const editingBlockId = ref<string | null>(null);

// Active styles for toggle group
const activeStyles = ref<string[]>([]);

// Watch active styles and update currentStyle
watch(activeStyles, (newStyles) => {
    currentStyle.value.bold = newStyles.includes('bold');
    currentStyle.value.italic = newStyles.includes('italic');
    currentStyle.value.underline = newStyles.includes('underline');
}, { deep: true });

// Watch currentStyle and update activeStyles
watch(currentStyle, (newStyle) => {
    const styles: string[] = [];
    if (newStyle.bold) styles.push('bold');
    if (newStyle.italic) styles.push('italic');
    if (newStyle.underline) styles.push('underline');
    activeStyles.value = styles;
}, { deep: true, immediate: true });

// Emit current text and style for live preview
watch([currentText, currentStyle], () => {
    emit('current-text-change', currentText.value, currentStyle.value);
}, { deep: true });

/**
 * Add or update text block
 */
function addTextBlock() {
    if (!currentText.value.trim()) {
        return;
    }

    if (editingBlockId.value) {
        // Update existing block
        textDocumentStore.updateBlock(editingBlockId.value, {
            content: currentText.value,
            style: { ...currentStyle.value },
        });
        editingBlockId.value = null;
    } else {
        // Add new block
        const newBlock: TextBlock = {
            id: crypto.randomUUID(),
            content: currentText.value,
            style: { ...currentStyle.value },
            order: textDocumentStore.textBlocks.length,
        };
        textDocumentStore.addBlock(newBlock);
    }

    // Reset editor
    currentText.value = '';
    currentStyle.value = { ...defaultTextBlockStyle };
}

/**
 * Edit an existing block
 */
function editBlock(block: TextBlock) {
    currentText.value = block.content;
    currentStyle.value = { ...block.style };
    editingBlockId.value = block.id;
}

/**
 * Delete a block
 */
function deleteBlock(id: string) {
    textDocumentStore.deleteBlock(id);
    if (editingBlockId.value === id) {
        cancelEdit();
    }
}

/**
 * Cancel editing
 */
function cancelEdit() {
    editingBlockId.value = null;
    currentText.value = '';
    currentStyle.value = { ...defaultTextBlockStyle };
}

/**
 * Clear all blocks
 */
function clearAll() {
    if (confirm('Are you sure you want to clear all text blocks?')) {
        textDocumentStore.clearDocument();
        cancelEdit();
    }
}

// Computed property for sorted blocks
const sortedBlocks = computed(() => textDocumentStore.sortedBlocks);

// Computed property for button text
const actionButtonText = computed(() => {
    return editingBlockId.value ? 'Update Text Block' : 'Add Text Block';
});
</script>

<template>
    <Card>
        <CardHeader class="flex flex-row items-center">
            <Type class="mr-2" />
            <CardTitle>Text Editor</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="space-y-4">
                <!-- Text Input -->
                <div>
                    <Label for="text-input" class="block mb-2 font-medium">Enter Text</Label>
                    <Textarea
                        id="text-input"
                        v-model="currentText"
                        placeholder="Type your text here..."
                        :rows="5"
                        class="w-full"
                    />
                </div>

                <!-- Font Family -->
                <div>
                    <Label for="font-family" class="block mb-2 font-medium">Font</Label>
                    <Select v-model="currentStyle.fontFamily">
                        <SelectTrigger id="font-family" class="w-full">
                            <SelectValue placeholder="Select a font" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="font in availableFonts" :key="font" :value="font">
                                {{ font }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <!-- Font Size -->
                <div>
                    <Label for="font-size" class="block mb-2 font-medium">Size (px)</Label>
                    <Input
                        id="font-size"
                        type="number"
                        v-model.number="currentStyle.fontSize"
                        min="8"
                        max="72"
                        class="w-full"
                    />
                </div>

                <!-- Text Styles -->
                <div>
                    <Label class="block mb-2 font-medium">Text Style</Label>
                    <ToggleGroup type="multiple" v-model="activeStyles">
                        <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
                        <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
                        <ToggleGroupItem value="underline">Underline</ToggleGroupItem>
                    </ToggleGroup>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2">
                    <Button @click="addTextBlock" class="flex-1">
                        <Plus class="mr-2" :size="16" />
                        {{ actionButtonText }}
                    </Button>
                    <Button v-if="editingBlockId" @click="cancelEdit" variant="outline">
                        Cancel
                    </Button>
                </div>

                <!-- Text Blocks List -->
                <div v-if="sortedBlocks.length > 0" class="mt-6">
                    <div class="flex items-center justify-between mb-3">
                        <Label class="font-medium">Text Blocks ({{ sortedBlocks.length }})</Label>
                        <Button @click="clearAll" variant="outline" size="sm">
                            <Trash2 :size="14" class="mr-1" />
                            Clear All
                        </Button>
                    </div>

                    <div class="space-y-2">
                        <div
                            v-for="block in sortedBlocks"
                            :key="block.id"
                            class="border rounded-lg p-3 bg-white"
                            :class="{ 'border-blue-500 bg-blue-50': editingBlockId === block.id }"
                        >
                            <div class="flex justify-between items-start gap-3">
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium text-gray-700 mb-1">
                                        {{ block.style.fontFamily }} - {{ block.style.fontSize }}px
                                        <span v-if="block.style.bold" class="ml-1 text-xs text-gray-500">[B]</span>
                                        <span v-if="block.style.italic" class="ml-1 text-xs text-gray-500">[I]</span>
                                        <span v-if="block.style.underline" class="ml-1 text-xs text-gray-500">[U]</span>
                                    </div>
                                    <div class="text-sm text-gray-600 truncate">{{ block.content }}</div>
                                </div>
                                <div class="flex gap-1 flex-shrink-0">
                                    <Button
                                        @click="editBlock(block)"
                                        size="icon"
                                        variant="outline"
                                        class="h-8 w-8"
                                        title="Edit"
                                    >
                                        <Edit :size="14" />
                                    </Button>
                                    <Button
                                        @click="deleteBlock(block.id)"
                                        size="icon"
                                        variant="outline"
                                        class="h-8 w-8"
                                        title="Delete"
                                    >
                                        <Trash2 :size="14" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
