import { convertImageToBits } from './imagehelper';
import type { PrinterImage } from './printerimage';

export type TextBlockStyle = {
    fontFamily: string;      // e.g., 'Arial', 'Courier New'
    fontSize: number;        // in pixels
    bold: boolean;
    italic: boolean;
    underline: boolean;
};

export type TextBlock = {
    id: string;              // UUID
    content: string;
    style: TextBlockStyle;
    order: number;
};

export type TextDocument = {
    blocks: TextBlock[];
    paperWidth: number;      // from global settings
};

export type TextConversionOptions = {
    algorithm: 'Basic' | 'Dither' | 'Atkinson' | 'Bayer' | 'SierraLite';
    threshold: number;       // 0-255
    contrast: number;        // 0-2, 1 is normal
    exposure: number;        // 0-2, 1 is normal
    paperThickness: 'none' | 'light' | 'medium' | 'heavy' | 'dedicated';
    preprocessFilter: 'none' | 'portrait' | 'pet' | 'lineplus' | 'auto' | 'draft';
};

export const defaultTextBlockStyle: TextBlockStyle = {
    fontFamily: 'Arial',
    fontSize: 24,
    bold: false,
    italic: false,
    underline: false,
};

export const availableFonts = [
    'Arial',
    'Courier New',
    'Times New Roman',
    'Georgia',
    'Verdana',
] as const;

/**
 * Wraps text to fit within a maximum width
 */
function wrapText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];

    // First split by newlines to preserve explicit line breaks
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
        // Handle empty lines (from consecutive newlines)
        if (!paragraph.trim()) {
            lines.push('');
            continue;
        }

        // Word wrap each paragraph
        const words = paragraph.split(' ');
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }
    }

    return lines;
}

/**
 * Measures the height of a text block including line height
 */
function measureTextBlockHeight(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    block: TextBlock,
    maxWidth: number
): number {
    const { style, content } = block;
    const lineHeight = style.fontSize * 1.2; // 1.2 line height multiplier

    // Set font for measurement
    const fontStyle = `${style.bold ? 'bold ' : ''}${style.italic ? 'italic ' : ''}${style.fontSize}px ${style.fontFamily}`;
    ctx.font = fontStyle;

    // Wrap text and calculate total height
    const lines = wrapText(ctx, content, maxWidth);
    return lines.length * lineHeight;
}

/**
 * Draws a text block on the canvas at the specified y position
 * Returns the y position after drawing (for next block)
 */
function drawTextBlock(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    block: TextBlock,
    y: number,
    maxWidth: number,
    padding: number
): number {
    const { style, content } = block;
    const lineHeight = style.fontSize * 1.2;

    // Set font
    const fontStyle = `${style.bold ? 'bold ' : ''}${style.italic ? 'italic ' : ''}${style.fontSize}px ${style.fontFamily}`;
    ctx.font = fontStyle;
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'top';

    // Wrap text
    const lines = wrapText(ctx, content, maxWidth - padding * 2);

    // Draw each line
    let currentY = y;
    for (const line of lines) {
        const x = padding;

        // Draw text
        ctx.fillText(line, x, currentY);

        // Draw underline if needed
        if (style.underline) {
            const underlineY = currentY + style.fontSize + 2; // 2px below baseline
            const lineWidth = ctx.measureText(line).width;
            ctx.beginPath();
            ctx.moveTo(x, underlineY);
            ctx.lineTo(x + lineWidth, underlineY);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = Math.max(1, style.fontSize * 0.05);
            ctx.stroke();
        }

        currentY += lineHeight;
    }

    return currentY;
}

export const defaultTextConversionOptions: TextConversionOptions = {
    algorithm: 'Atkinson',
    threshold: 128,
    contrast: 1.0,
    exposure: 1.0,
    paperThickness: 'none',
    preprocessFilter: 'none',
};

/**
 * Renders a text document to a PrinterImage
 */
export async function renderTextDocument(document: TextDocument, options: TextConversionOptions = defaultTextConversionOptions): Promise<PrinterImage> {
    const { blocks, paperWidth } = document;

    // Padding
    const padding = 10;
    const maxWidth = paperWidth - padding * 2;

    // Create temporary canvas for measurement
    const measureCanvas = new OffscreenCanvas(paperWidth, 100);
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) {
        throw new Error('Failed to get canvas context');
    }

    // Calculate total height needed
    let totalHeight = padding * 2; // Top and bottom padding
    const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

    for (const block of sortedBlocks) {
        const blockHeight = measureTextBlockHeight(measureCtx, block, maxWidth);
        totalHeight += blockHeight + 10; // 10px spacing between blocks
    }

    // Ensure height is at least something if no blocks
    if (totalHeight < 50) {
        totalHeight = 50;
    }

    // Create final canvas
    const canvas = new OffscreenCanvas(paperWidth, totalHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, paperWidth, totalHeight);

    // Draw all blocks
    let currentY = padding;
    for (const block of sortedBlocks) {
        currentY = drawTextBlock(ctx, block, currentY, paperWidth, padding);
        currentY += 10; // Spacing between blocks
    }

    // Convert canvas to ImageBitmap
    const imageBitmap = await createImageBitmap(canvas);

    // Convert to PrinterImage using existing conversion logic
    const result = await convertImageToBits(
        imageBitmap,
        paperWidth,
        {
            rotation: 0,
            threshold: options.threshold,
            invert: false,
            algorithm: options.algorithm,
            contrast: options.contrast,
            exposure: options.exposure,
            heightPercentage: 100,
            widthPercentage: 100,
            paperThickness: options.paperThickness,
            preprocessFilter: options.preprocessFilter,
        }
    );

    return result.printerImage;
}
