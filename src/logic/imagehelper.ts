import type { ImageConversionOptions, PrinterImage } from "./printerimage";
import { applyFilter, applySharpen, applyAutoLevels, applyAutoContrast, applyAutoExposure } from "./phomemofilters";

// @ts-ignore
import cv from '@techstark/opencv-js';

export type ImageConversionResult = {
    printerImage: PrinterImage;
    adjustedImageData: ImageData | null;
    filteredImageData: ImageData | null;
};

// OpenCV initialization state
let cvReady = false;
let cvReadyPromise: Promise<void> | null = null;

/**
 * Ensure OpenCV is loaded and ready (similar to phomemofilters.ts implementation)
 */
async function waitForOpenCV(): Promise<void> {
    if (cvReady) return;

    if (!cvReadyPromise) {
        cvReadyPromise = new Promise((resolve, reject) => {
            if (cv && cv.Mat) {
                cvReady = true;
                console.log('OpenCV.js ready for resize');
                resolve();
            } else if (cv && typeof cv.onRuntimeInitialized === 'function') {
                cv.onRuntimeInitialized = () => {
                    cvReady = true;
                    console.log('OpenCV.js initialized for resize');
                    resolve();
                };
            } else {
                // For OffscreenCanvas/Worker environment
                const checkReady = setInterval(() => {
                    if (cv && cv.Mat) {
                        cvReady = true;
                        clearInterval(checkReady);
                        console.log('OpenCV.js ready (polled)');
                        resolve();
                    }
                }, 100);

                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkReady);
                    reject(new Error('OpenCV failed to load within 10 seconds'));
                }, 10000);
            }
        });
    }

    return cvReadyPromise;
}

/**
 * Resize an ImageBitmap using OpenCV with specified interpolation algorithm
 */
async function resizeWithOpenCV(
    image: ImageBitmap,
    targetWidth: number,
    targetHeight: number,
    algorithm: 'nearest' | 'linear' | 'cubic' | 'area' | 'lanczos4'
): Promise<ImageBitmap> {
    // Ensure OpenCV is loaded
    await waitForOpenCV();

    // Validate inputs
    if (!targetWidth || !targetHeight || isNaN(targetWidth) || isNaN(targetHeight)) {
        throw new Error(`Invalid resize dimensions: ${targetWidth}x${targetHeight}`);
    }

    // Convert ImageBitmap to canvas for OpenCV
    const tempCanvas = new OffscreenCanvas(image.width, image.height);
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Failed to get temp canvas context');
    tempCtx.drawImage(image, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, image.width, image.height);

    // Create OpenCV Mat from ImageData
    const src = cv.matFromImageData(imageData);
    const dst = new cv.Mat();

    try {
        // Map algorithm name to OpenCV interpolation flag
        const interpolationMap: Record<string, number> = {
            'nearest': cv.INTER_NEAREST,
            'linear': cv.INTER_LINEAR,
            'cubic': cv.INTER_CUBIC,
            'area': cv.INTER_AREA,
            'lanczos4': cv.INTER_LANCZOS4,
        };

        const interpolation = interpolationMap[algorithm];
        if (interpolation === undefined) {
            console.error(`Unknown interpolation algorithm: ${algorithm}, falling back to linear`);
            // Fallback to linear interpolation instead of throwing
            const fallbackInterpolation = cv.INTER_LINEAR;
            const dsize = new cv.Size(Math.round(targetWidth), Math.round(targetHeight));
            cv.resize(src, dst, dsize, 0, 0, fallbackInterpolation);
        } else {
            // Perform resize with selected algorithm
            const dsize = new cv.Size(Math.round(targetWidth), Math.round(targetHeight));
            cv.resize(src, dst, dsize, 0, 0, interpolation);
        }

        // Convert back to ImageData
        const resizedCanvas = new OffscreenCanvas(targetWidth, targetHeight);
        const resizedCtx = resizedCanvas.getContext('2d');
        if (!resizedCtx) throw new Error('Failed to get resized canvas context');

        const resizedImageData = new ImageData(
            new Uint8ClampedArray(dst.data),
            dst.cols,
            dst.rows
        );
        resizedCtx.putImageData(resizedImageData, 0, 0);

        // Convert back to ImageBitmap
        return await createImageBitmap(resizedCanvas);
    } finally {
        // Clean up OpenCV Mats
        src.delete();
        dst.delete();
    }
}

/**
 * Internal implementation of convertImageToBits
 * This is wrapped by the public function with error handling and retry logic
 */
async function convertImageToBitsInternal(image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions): Promise<ImageConversionResult> {
    let processedImage: ImageBitmap = image;
    let filteredImageData: ImageData | null = null;

    // Apply preprocessing filter if specified AND filterOrder is 'before-resize' (or not specified for backwards compatibility)
    const shouldFilterBeforeResize = !options.filterOrder || options.filterOrder === 'before-resize';

    if (shouldFilterBeforeResize && options.preprocessFilter && options.preprocessFilter !== 'none') {
        console.log(`Applying ${options.preprocessFilter} filter before resize...`);
        const filterStartTime = performance.now();
        filteredImageData = await applyFilter(processedImage, options.preprocessFilter);
        console.log(`Filter applied in ${performance.now() - filterStartTime}ms`);

        // Convert filtered ImageData back to ImageBitmap
        processedImage = await createImageBitmap(filteredImageData);
    }

    // Apply auto adjustments after preprocessing filter (before resize)
    if (options.autoLevels) {
        console.log('Applying auto levels adjustment...');
        const autoLevelsStartTime = performance.now();
        const autoLevelsImageData = await applyAutoLevels(processedImage);
        console.log(`Auto levels applied in ${performance.now() - autoLevelsStartTime}ms`);
        processedImage = await createImageBitmap(autoLevelsImageData);
    }

    if (options.autoContrast) {
        console.log('Applying auto contrast adjustment...');
        const autoContrastStartTime = performance.now();
        const autoContrastImageData = await applyAutoContrast(processedImage);
        console.log(`Auto contrast applied in ${performance.now() - autoContrastStartTime}ms`);
        processedImage = await createImageBitmap(autoContrastImageData);
    }

    if (options.autoExposure) {
        console.log('Applying auto exposure adjustment...');
        const autoExposureStartTime = performance.now();
        const autoExposureImageData = await applyAutoExposure(processedImage);
        console.log(`Auto exposure applied in ${performance.now() - autoExposureStartTime}ms`);
        processedImage = await createImageBitmap(autoExposureImageData);
    }

    // Apply sharpening before resize if specified
    if (options.sharpenBeforeResize && options.sharpenBeforeResize !== 'none') {
        console.log(`Applying ${options.sharpenBeforeResize} sharpening before resize...`);
        const sharpenStartTime = performance.now();
        const sharpenedImageData = await applySharpen(processedImage, options.sharpenBeforeResize);
        console.log(`Sharpening applied in ${performance.now() - sharpenStartTime}ms`);

        // Convert sharpened ImageData back to ImageBitmap
        processedImage = await createImageBitmap(sharpenedImageData);
    }

    // Calculate width percentage (how much of paper width the image takes)
    const widthPercentage = Math.max(1, Math.min(100, options.widthPercentage ?? 100));
    const actualImageWidth = Math.round(outputWidthPixel * (widthPercentage / 100));

    let fullOutputHeight: number;
    if (options.rotation === 90 || options.rotation === 270) {
        fullOutputHeight = Math.round(actualImageWidth * (processedImage.width / processedImage.height));
    } else {
        fullOutputHeight = Math.round(actualImageWidth * (processedImage.height / processedImage.width));
    }

    // Calculate the actual output height based on heightPercentage
    const heightPercentage = Math.max(0, Math.min(100, options.heightPercentage ?? 100));
    const outputHeight = Math.round(fullOutputHeight * (heightPercentage / 100));

    // Resize image using OpenCV if a non-canvas algorithm is selected
    let resizedImage = processedImage;
    if (options.resizeAlgorithm !== 'canvas') {
        console.log(`Resizing with OpenCV algorithm: ${options.resizeAlgorithm}`);
        const resizeStartTime = performance.now();

        // Calculate target dimensions based on rotation
        let targetWidth: number, targetHeight: number;
        if (options.rotation === 90 || options.rotation === 270) {
            targetWidth = fullOutputHeight;
            targetHeight = actualImageWidth;
        } else {
            targetWidth = actualImageWidth;
            targetHeight = fullOutputHeight;
        }

        resizedImage = await resizeWithOpenCV(
            processedImage,
            targetWidth,
            targetHeight,
            options.resizeAlgorithm
        );
        console.log(`OpenCV resize completed in ${performance.now() - resizeStartTime}ms`);
    }

    const canvas = new OffscreenCanvas(outputWidthPixel, fullOutputHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Configure image smoothing
    // Disable smoothing if using OpenCV (already resized) or if user disabled it
    if (options.resizeAlgorithm !== 'canvas') {
        ctx.imageSmoothingEnabled = false;
    } else {
        ctx.imageSmoothingEnabled = options.imageSmoothingEnabled;
        ctx.imageSmoothingQuality = options.imageSmoothingQuality;
    }

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    console.log(`Drawing image to canvas: ${processedImage.width}x${processedImage.height} -> ${canvas.width}x${canvas.height} (${outputWidthPixel} pixels wide, image at ${widthPercentage}% width) with options:`, options);

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

    // Don't apply manual contrast/exposure during draw - will apply after auto adjustments
    // ctx.filter is left at 'none'

    if (options.rotation !== 0) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(options.rotation * Math.PI / 180);
        if (options.rotation === 90 || options.rotation === 270) {
            // When using OpenCV, image is already resized, so draw at actual size
            if (options.resizeAlgorithm !== 'canvas') {
                ctx.drawImage(resizedImage, -resizedImage.width / 2, -resizedImage.height / 2);
            } else {
                ctx.drawImage(resizedImage, -fullOutputHeight / 2, -actualImageWidth / 2, fullOutputHeight, actualImageWidth);
            }
        } else {
            if (options.resizeAlgorithm !== 'canvas') {
                ctx.drawImage(resizedImage, -resizedImage.width / 2, -resizedImage.height / 2);
            } else {
                ctx.drawImage(resizedImage, -actualImageWidth / 2, -fullOutputHeight / 2, actualImageWidth, fullOutputHeight);
            }
        }
        ctx.restore();
    } else {
        // When using OpenCV, image is already resized, so draw at actual size
        if (options.resizeAlgorithm !== 'canvas') {
            ctx.drawImage(resizedImage, xOffset, 0);
        } else {
            ctx.drawImage(resizedImage, xOffset, 0, actualImageWidth, fullOutputHeight);
        }
    }

    // Reset filter
    ctx.filter = 'none';

    // Capture the initial image data
    let adjustedImageData = ctx.getImageData(0, 0, canvas.width, outputHeight);

    // Apply preprocessing filter AFTER resize if filterOrder is 'after-resize'
    let sampledImage: ImageData;
    if (options.filterOrder === 'after-resize' && options.preprocessFilter && options.preprocessFilter !== 'none') {
        console.log(`Applying ${options.preprocessFilter} filter after resize...`);
        const filterStartTime = performance.now();

        // Create a bitmap from the resized canvas (without contrast/exposure)
        const resizedBitmap = await createImageBitmap(adjustedImageData);

        // Apply the filter
        filteredImageData = await applyFilter(resizedBitmap, options.preprocessFilter);
        console.log(`Filter applied in ${performance.now() - filterStartTime}ms`);

        // Use the filtered image (manual contrast/exposure will be applied later)
        sampledImage = filteredImageData;
        adjustedImageData = filteredImageData;
    } else {
        // No filter or already filtered before resize (with contrast/exposure already applied)
        sampledImage = adjustedImageData;
    }

    // Apply auto adjustments after preprocessing filter (after resize if filterOrder is 'after-resize')
    if (options.filterOrder === 'after-resize') {
        if (options.autoLevels) {
            console.log('Applying auto levels adjustment after filter...');
            const autoLevelsStartTime = performance.now();
            const autoLevelsBitmap = await createImageBitmap(sampledImage);
            const autoLevelsImageData = await applyAutoLevels(autoLevelsBitmap);
            console.log(`Auto levels applied in ${performance.now() - autoLevelsStartTime}ms`);
            sampledImage = autoLevelsImageData;
            adjustedImageData = autoLevelsImageData;
        }

        if (options.autoContrast) {
            console.log('Applying auto contrast adjustment after filter...');
            const autoContrastStartTime = performance.now();
            const autoContrastBitmap = await createImageBitmap(sampledImage);
            const autoContrastImageData = await applyAutoContrast(autoContrastBitmap);
            console.log(`Auto contrast applied in ${performance.now() - autoContrastStartTime}ms`);
            sampledImage = autoContrastImageData;
            adjustedImageData = autoContrastImageData;
        }

        if (options.autoExposure) {
            console.log('Applying auto exposure adjustment after filter...');
            const autoExposureStartTime = performance.now();
            const autoExposureBitmap = await createImageBitmap(sampledImage);
            const autoExposureImageData = await applyAutoExposure(autoExposureBitmap);
            console.log(`Auto exposure applied in ${performance.now() - autoExposureStartTime}ms`);
            sampledImage = autoExposureImageData;
            adjustedImageData = autoExposureImageData;
        }
    }

    // Apply manual contrast and exposure adjustments AFTER all preprocessing and auto adjustments
    // Note: adjustedContrast/adjustedExposure include paper thickness adjustments
    if (options.contrast !== 1.0 || options.exposure !== 1.0 || adjustedContrast !== 1.0 || adjustedExposure !== 1.0) {
        console.log(`Applying manual adjustments: contrast=${options.contrast} (adjusted: ${adjustedContrast}), exposure=${options.exposure} (adjusted: ${adjustedExposure})`);
        const manualAdjustCanvas = new OffscreenCanvas(canvas.width, outputHeight);
        const manualAdjustCtx = manualAdjustCanvas.getContext('2d');
        if (!manualAdjustCtx) throw new Error('Failed to get manual adjust canvas context');

        // Apply manual contrast/exposure using CSS filters (includes paper thickness adjustments)
        manualAdjustCtx.filter = `contrast(${adjustedContrast}) brightness(${adjustedExposure})`;
        const preAdjustBitmap = await createImageBitmap(sampledImage);
        manualAdjustCtx.drawImage(preAdjustBitmap, 0, 0);
        manualAdjustCtx.filter = 'none';

        // Update sampledImage with manually adjusted version
        sampledImage = manualAdjustCtx.getImageData(0, 0, canvas.width, outputHeight);
        adjustedImageData = sampledImage;
    }

    // Apply sharpening after resize if specified (before dithering)
    if (options.sharpenAfterResize && options.sharpenAfterResize !== 'none') {
        console.log(`Applying ${options.sharpenAfterResize} sharpening after resize...`);
        const sharpenStartTime = performance.now();

        // Create a bitmap from the current sampledImage
        const preSharpenBitmap = await createImageBitmap(sampledImage);

        // Apply sharpening
        const sharpenedImageData = await applySharpen(preSharpenBitmap, options.sharpenAfterResize);
        console.log(`Sharpening applied in ${performance.now() - sharpenStartTime}ms`);

        // Use the sharpened image for dithering and display
        sampledImage = sharpenedImageData;
        adjustedImageData = sharpenedImageData; // Update display preview with sharpened version
    }

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
        adjustedImageData,
        filteredImageData
    };
}

/**
 * Public API: Convert image to bits with error handling and retry logic
 * Catches OpenCV errors and retries from scratch if needed
 */
export async function convertImageToBits(image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions): Promise<ImageConversionResult> {
    const maxRetries = 1;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.warn(`⚠️ Retry attempt ${attempt} after OpenCV error...`);
                // Wait a bit before retry to let things settle
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Attempt conversion
            const result = await convertImageToBitsInternal(image, outputWidthPixel, options);

            if (attempt > 0) {
                console.log('✅ Retry successful!');
            }

            return result;
        } catch (error) {
            lastError = error;
            const errorMessage = typeof error === 'number' ? `OpenCV Error ${error}` : String(error);
            console.error(`❌ Image conversion failed (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMessage);

            if (attempt < maxRetries) {
                // Try to clean up OpenCV state
                try {
                    console.log('🧹 Attempting cleanup before retry...');
                    // Force garbage collection if available (dev tools)
                    if (typeof (globalThis as any).gc === 'function') {
                        (globalThis as any).gc();
                    }
                } catch (cleanupError) {
                    console.warn('Cleanup failed:', cleanupError);
                }
            }
        }
    }

    // All retries failed
    const errorMessage = typeof lastError === 'number'
        ? `OpenCV Error ${lastError}. Try refreshing the page or using a simpler image.`
        : `Conversion failed: ${lastError}`;

    console.error('💥 All retry attempts failed. Last error:', lastError);
    throw new Error(errorMessage);
}


export function loadImageFromUrl(url: string): Promise<ImageBitmap> {
    return new Promise<ImageBitmap>((resolve, error) => {
        const img = new Image();
        img.onload = async () => createImageBitmap(img).then(resolve).catch(error);
        img.onerror = (err) => error(err);
        img.src = url;
    });
}


