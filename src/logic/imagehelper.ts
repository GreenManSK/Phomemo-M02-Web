import type { ImageConversionOptions, PrinterImage } from "./printerimage";

export type ImageConversionResult = {
    printerImage: PrinterImage;
    adjustedImageData: ImageData | null;
};

export async function convertImageToBits(image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions): Promise<ImageConversionResult> {
    // Calculate width percentage (how much of paper width the image takes)
    const widthPercentage = Math.max(1, Math.min(100, options.widthPercentage ?? 100));
    const actualImageWidth = Math.round(outputWidthPixel * (widthPercentage / 100));

    let fullOutputHeight: number;
    if (options.rotation === 90 || options.rotation === 270) {
        fullOutputHeight = Math.round(actualImageWidth * (image.width / image.height));
    } else {
        fullOutputHeight = Math.round(actualImageWidth * (image.height / image.width));
    }

    // Calculate the actual output height based on heightPercentage
    const heightPercentage = Math.max(0, Math.min(100, options.heightPercentage ?? 100));
    const outputHeight = Math.round(fullOutputHeight * (heightPercentage / 100));

    const canvas = new OffscreenCanvas(outputWidthPixel, fullOutputHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    console.log(`Drawing image to canvas: ${image.width}x${image.height} -> ${canvas.width}x${canvas.height} (${outputWidthPixel} pixels wide, image at ${widthPercentage}% width) with options:`, options);

    // Calculate horizontal offset to center the image
    const xOffset = Math.round((outputWidthPixel - actualImageWidth) / 2);

    // Calculate adjusted contrast and exposure based on paper thickness
    let adjustedContrast = options.contrast;
    let adjustedExposure = options.exposure;
    let adjustedThreshold = options.threshold;

    switch (options.paperThickness) {
        case 'light':
            // Light - Lower heat, prevents oversaturation on thin paper
            // Brighten output and use higher threshold
            adjustedExposure = adjustedExposure * 1.15;
            adjustedThreshold = Math.min(255, options.threshold + 12); // Higher threshold = lighter output
            break;
        case 'medium':
            // Medium - Standard balanced output (no adjustments)
            break;
        case 'heavy':
            // Heavy - Higher heat for thick paper, darker output
            // Darken output and use lower threshold
            adjustedExposure = adjustedExposure * 0.92;
            adjustedThreshold = Math.max(0, options.threshold - 13); // Lower threshold = darker output
            break;
        case 'dedicated':
            // Dedicated - Optimized mode with enhanced contrast
            adjustedContrast = adjustedContrast * 1.1;
            adjustedThreshold = Math.max(0, options.threshold - 3);
            break;
        case 'none':
        default:
            // No paper thickness adjustments
            break;
    }

    // Apply contrast and exposure filters
    ctx.filter = `contrast(${adjustedContrast}) brightness(${adjustedExposure})`;

    if (options.rotation !== 0) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(options.rotation * Math.PI / 180);
        if (options.rotation === 90 || options.rotation === 270) {
            ctx.drawImage(image, -fullOutputHeight / 2, -actualImageWidth / 2, fullOutputHeight, actualImageWidth);
        } else {
            ctx.drawImage(image, -actualImageWidth / 2, -fullOutputHeight / 2, actualImageWidth, fullOutputHeight);
        }
        ctx.restore();
    } else {
        ctx.drawImage(image, xOffset, 0, actualImageWidth, fullOutputHeight);
    }

    // Reset filter
    ctx.filter = 'none';

    // Capture the adjusted image data (with contrast/exposure applied) before threshold conversion
    const adjustedImageData = ctx.getImageData(0, 0, canvas.width, outputHeight);

    // Only sample the top portion based on heightPercentage
    const sampledImage = ctx.getImageData(0, 0, canvas.width, outputHeight);

    const bits = new Uint8ClampedArray(outputHeight * outputWidthPixel / 8);

    switch (options.algorithm) {
        case 'Basic': {
            // Basic threshold algorithm
            const getPixel = (x: number, y: number): boolean => (
                sampledImage.data[(y * canvas.width + x) * 4] +
                sampledImage.data[(y * canvas.width + x) * 4 + 1] +
                sampledImage.data[(y * canvas.width + x) * 4 + 2]) < (adjustedThreshold * 3.0);

            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel / 8; x++) {
                    for (let bit = 0; bit < 8; bit++) {
                        const pixelX = x * 8 + bit;
                        if (pixelX >= outputWidthPixel) break;
                        const pixelValue = getPixel(pixelX, y);
                        const result = options.invert
                            ? (pixelValue ? 0 : 1)
                            : (pixelValue ? 1 : 0);
                        bits[y * outputWidthPixel / 8 + x] |= (result << (7 - bit));
                    }
                }
            }
            break;
        }
        case 'Dither': {
            // Dither algorithm (Floyd-Steinberg)
            const grayscale = new Float32Array(outputWidthPixel * outputHeight);

            // Convert to grayscale
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    grayscale[y * outputWidthPixel + x] =
                        (sampledImage.data[idx] + sampledImage.data[idx + 1] + sampledImage.data[idx + 2]) / 3.0;
                }
            }

            // Apply Floyd-Steinberg dithering
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel; x++) {
                    const idx = y * outputWidthPixel + x;
                    const oldPixel = grayscale[idx];
                    const newPixel = oldPixel < adjustedThreshold ? 0 : 255;
                    grayscale[idx] = newPixel;

                    const error = oldPixel - newPixel;

                    // Distribute error to neighboring pixels
                    if (x + 1 < outputWidthPixel) {
                        grayscale[idx + 1] += error * 7 / 16;
                    }
                    if (y + 1 < outputHeight) {
                        if (x > 0) {
                            grayscale[idx + outputWidthPixel - 1] += error * 3 / 16;
                        }
                        grayscale[idx + outputWidthPixel] += error * 5 / 16;
                        if (x + 1 < outputWidthPixel) {
                            grayscale[idx + outputWidthPixel + 1] += error * 1 / 16;
                        }
                    }
                }
            }

            // Convert to bits
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel / 8; x++) {
                    for (let bit = 0; bit < 8; bit++) {
                        const pixelX = x * 8 + bit;
                        if (pixelX >= outputWidthPixel) break;
                        const pixelValue = grayscale[y * outputWidthPixel + pixelX] < adjustedThreshold;
                        const result = options.invert
                            ? (pixelValue ? 0 : 1)
                            : (pixelValue ? 1 : 0);
                        bits[y * outputWidthPixel / 8 + x] |= (result << (7 - bit));
                    }
                }
            }
            break;
        }
        case 'Atkinson': {
            // Atkinson dithering - lighter output, good for thermal printers
            const grayscale = new Float32Array(outputWidthPixel * outputHeight);

            // Convert to grayscale
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    grayscale[y * outputWidthPixel + x] =
                        (sampledImage.data[idx] + sampledImage.data[idx + 1] + sampledImage.data[idx + 2]) / 3.0;
                }
            }

            // Apply Atkinson dithering (only distributes 6/8 of error)
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel; x++) {
                    const idx = y * outputWidthPixel + x;
                    const oldPixel = grayscale[idx];
                    const newPixel = oldPixel < adjustedThreshold ? 0 : 255;
                    grayscale[idx] = newPixel;

                    const error = oldPixel - newPixel;

                    // Distribute error to neighboring pixels (only 6/8 total)
                    //     * 1/8 1/8
                    // 1/8 1/8 1/8
                    //     1/8
                    if (x + 1 < outputWidthPixel) {
                        grayscale[idx + 1] += error / 8;
                    }
                    if (x + 2 < outputWidthPixel) {
                        grayscale[idx + 2] += error / 8;
                    }
                    if (y + 1 < outputHeight) {
                        if (x > 0) {
                            grayscale[idx + outputWidthPixel - 1] += error / 8;
                        }
                        grayscale[idx + outputWidthPixel] += error / 8;
                        if (x + 1 < outputWidthPixel) {
                            grayscale[idx + outputWidthPixel + 1] += error / 8;
                        }
                    }
                    if (y + 2 < outputHeight) {
                        grayscale[idx + 2 * outputWidthPixel] += error / 8;
                    }
                }
            }

            // Convert to bits
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel / 8; x++) {
                    for (let bit = 0; bit < 8; bit++) {
                        const pixelX = x * 8 + bit;
                        if (pixelX >= outputWidthPixel) break;
                        const pixelValue = grayscale[y * outputWidthPixel + pixelX] < adjustedThreshold;
                        const result = options.invert
                            ? (pixelValue ? 0 : 1)
                            : (pixelValue ? 1 : 0);
                        bits[y * outputWidthPixel / 8 + x] |= (result << (7 - bit));
                    }
                }
            }
            break;
        }
        case 'Bayer': {
            // Ordered dithering using 8x8 Bayer matrix
            const bayerMatrix8x8 = [
                [ 0, 32,  8, 40,  2, 34, 10, 42],
                [48, 16, 56, 24, 50, 18, 58, 26],
                [12, 44,  4, 36, 14, 46,  6, 38],
                [60, 28, 52, 20, 62, 30, 54, 22],
                [ 3, 35, 11, 43,  1, 33,  9, 41],
                [51, 19, 59, 27, 49, 17, 57, 25],
                [15, 47,  7, 39, 13, 45,  5, 37],
                [63, 31, 55, 23, 61, 29, 53, 21]
            ];

            // Convert to bits using Bayer threshold
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel / 8; x++) {
                    for (let bit = 0; bit < 8; bit++) {
                        const pixelX = x * 8 + bit;
                        if (pixelX >= outputWidthPixel) break;

                        const idx = (y * canvas.width + pixelX) * 4;
                        const gray = (sampledImage.data[idx] + sampledImage.data[idx + 1] + sampledImage.data[idx + 2]) / 3.0;

                        // Get Bayer threshold for this pixel position
                        const bayerValue = bayerMatrix8x8[y % 8][pixelX % 8];
                        // Scale Bayer matrix value (0-63) to create threshold offset (-32 to +32)
                        const bayerOffset = (bayerValue - 31.5) * 2;

                        // Apply Bayer offset to the adjusted threshold
                        const finalThreshold = adjustedThreshold + bayerOffset;

                        const pixelValue = gray < finalThreshold;
                        const result = options.invert
                            ? (pixelValue ? 0 : 1)
                            : (pixelValue ? 1 : 0);
                        bits[y * outputWidthPixel / 8 + x] |= (result << (7 - bit));
                    }
                }
            }
            break;
        }
        case 'SierraLite': {
            // Sierra Lite dithering - lighter weight error diffusion
            const grayscale = new Float32Array(outputWidthPixel * outputHeight);

            // Convert to grayscale
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    grayscale[y * outputWidthPixel + x] =
                        (sampledImage.data[idx] + sampledImage.data[idx + 1] + sampledImage.data[idx + 2]) / 3.0;
                }
            }

            // Apply Sierra Lite dithering
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel; x++) {
                    const idx = y * outputWidthPixel + x;
                    const oldPixel = grayscale[idx];
                    const newPixel = oldPixel < adjustedThreshold ? 0 : 255;
                    grayscale[idx] = newPixel;

                    const error = oldPixel - newPixel;

                    // Distribute error to neighboring pixels
                    //     * 2/4
                    // 1/4 1/4
                    if (x + 1 < outputWidthPixel) {
                        grayscale[idx + 1] += error * 2 / 4;
                    }
                    if (y + 1 < outputHeight) {
                        if (x > 0) {
                            grayscale[idx + outputWidthPixel - 1] += error / 4;
                        }
                        grayscale[idx + outputWidthPixel] += error / 4;
                    }
                }
            }

            // Convert to bits
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidthPixel / 8; x++) {
                    for (let bit = 0; bit < 8; bit++) {
                        const pixelX = x * 8 + bit;
                        if (pixelX >= outputWidthPixel) break;
                        const pixelValue = grayscale[y * outputWidthPixel + pixelX] < adjustedThreshold;
                        const result = options.invert
                            ? (pixelValue ? 0 : 1)
                            : (pixelValue ? 1 : 0);
                        bits[y * outputWidthPixel / 8 + x] |= (result << (7 - bit));
                    }
                }
            }
            break;
        }
    }

    if (canvas.width !== outputWidthPixel) {
        throw new Error(`Canvas width ${canvas.width} does not match output width ${outputWidthPixel}`);
    }

    console.log(`Image converted to bits: ${outputWidthPixel} pixels wide, ${outputHeight} pixels high`);
    return {
        printerImage: {
            width: outputWidthPixel,
            height: outputHeight,
            bits: bits
        },
        adjustedImageData
    };
}


export function loadImageFromUrl(url: string): Promise<ImageBitmap> {
    return new Promise<ImageBitmap>((resolve, error) => {
        const img = new Image();
        img.onload = async () => createImageBitmap(img).then(resolve).catch(error);
        img.onerror = (err) => error(err);
        img.src = url;
    });
}


