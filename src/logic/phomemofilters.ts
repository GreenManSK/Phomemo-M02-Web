/**
 * Phomemo Image Preprocessing Filters
 * Ported from browser-prototype/filters.js
 *
 * These filters enhance images before the dithering/conversion process
 */

// @ts-ignore
import cv from '@techstark/opencv-js';

export type FilterType = 'none' | 'portrait' | 'pet' | 'lineplus' | 'auto' | 'draft';
export type SharpenStrength = 'none' | 'light' | 'medium' | 'strong';

// OpenCV initialization
let cvReady = false;
let cvReadyPromise: Promise<void> | null = null;

async function ensureOpenCVReady(): Promise<void> {
    if (cvReady) return;

    if (!cvReadyPromise) {
        cvReadyPromise = new Promise((resolve) => {
            if (cv && cv.Mat) {
                cvReady = true;
                resolve();
            } else if (cv && typeof cv.onRuntimeInitialized === 'function') {
                cv.onRuntimeInitialized = () => {
                    cvReady = true;
                    console.log('OpenCV.js initialized');
                    resolve();
                };
            } else {
                // For OffscreenCanvas/Worker environment
                const checkReady = setInterval(() => {
                    if (cv && cv.Mat) {
                        cvReady = true;
                        clearInterval(checkReady);
                        console.log('OpenCV.js initialized');
                        resolve();
                    }
                }, 100);
            }
        });
    }

    return cvReadyPromise;
}

/**
 * Apply selected filter to an ImageBitmap
 */
export async function applyFilter(image: ImageBitmap, filterType: FilterType): Promise<ImageData> {
    // If no filter, return original
    if (filterType === 'none') {
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height);
    }

    // Ensure OpenCV is ready
    await ensureOpenCVReady();

    // Convert ImageBitmap to canvas
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    // Convert ImageData to cv.Mat
    const src = cv.matFromImageData(imageData);

    let result: any;

    try {
        switch (filterType) {
            case 'portrait':
                result = portraitFilter(src);
                break;
            case 'pet':
                result = petFilter(src);
                break;
            case 'lineplus':
                result = linePlusFilter(src);
                break;
            case 'auto':
                result = autoFilter(src);
                break;
            case 'draft':
                result = draftFilter(src);
                break;
            default:
                result = src.clone();
        }

        // Convert result back to ImageData
        const outputImageData = new ImageData(
            new Uint8ClampedArray(result.data),
            result.cols,
            result.rows
        );

        return outputImageData;
    } finally {
        // Cleanup
        src.delete();
        if (result) result.delete();
    }
}

/**
 * Portrait Filter - ID 100
 * Enhances portraits with CLAHE, bilateral filtering, and adjustments
 */
function portraitFilter(src: any): any {
    console.log('Applying Portrait filter...');

    // Convert to LAB color space
    let lab = new cv.Mat();
    cv.cvtColor(src, lab, cv.COLOR_RGBA2RGB);
    cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab);

    // Split LAB channels
    let channels = new cv.MatVector();
    cv.split(lab, channels);

    // Apply CLAHE to L channel
    let clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(channels.get(0), channels.get(0));

    // Merge back
    cv.merge(channels, lab);
    let enhanced = new cv.Mat();
    cv.cvtColor(lab, enhanced, cv.COLOR_Lab2RGB);

    // Bilateral filter for skin smoothing
    let smoothed = new cv.Mat();
    cv.bilateralFilter(enhanced, smoothed, 9, 75, 75);
    enhanced.delete();

    // Apply gamma correction (1.2 brightens midtones)
    gammaCorrection(smoothed, 1.2);

    // Unsharp Mask (USM) sharpening
    let blurred = new cv.Mat();
    cv.GaussianBlur(smoothed, blurred, new cv.Size(0, 0), 3);

    let sharpened = new cv.Mat();
    cv.addWeighted(smoothed, 1.5, blurred, -0.5, 0, sharpened);
    blurred.delete();
    smoothed.delete();

    // Reduce saturation slightly
    adjustSaturation(sharpened, 0.92);

    // Convert back to RGBA
    let result = new cv.Mat();
    cv.cvtColor(sharpened, result, cv.COLOR_RGB2RGBA);
    sharpened.delete();

    // Cleanup
    lab.delete();
    channels.delete();

    return result;
}

/**
 * Pet Filter - ID 103
 * Simple grayscale with adaptive threshold
 */
function petFilter(src: any): any {
    console.log('Applying Pet filter...');

    // Convert to grayscale
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Apply adaptive threshold
    let thresh = new cv.Mat();
    cv.adaptiveThreshold(
        gray,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        11,
        2
    );

    // Convert back to RGBA
    let result = new cv.Mat();
    cv.cvtColor(thresh, result, cv.COLOR_GRAY2RGBA);

    gray.delete();
    thresh.delete();

    return result;
}

/**
 * Line+ / Text Filter - ID 101
 * Enhances text and line art
 */
function linePlusFilter(src: any): any {
    console.log('Applying Line+ filter...');

    // Convert to grayscale
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Edge enhancement using Laplacian
    let laplacian = new cv.Mat();
    cv.Laplacian(gray, laplacian, cv.CV_16S, 3);
    cv.convertScaleAbs(laplacian, laplacian);

    // Combine original with edges
    let enhanced = new cv.Mat();
    cv.addWeighted(gray, 1.0, laplacian, 0.7, 0, enhanced);
    laplacian.delete();

    // Apply morphological operations to clean up lines
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(enhanced, enhanced, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // Increase contrast
    increaseContrast(enhanced, 1.3);

    // Apply adaptive threshold
    let result = new cv.Mat();
    cv.adaptiveThreshold(
        enhanced,
        result,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        15,
        3
    );

    // Convert back to RGBA
    let rgba = new cv.Mat();
    cv.cvtColor(result, rgba, cv.COLOR_GRAY2RGBA);

    gray.delete();
    enhanced.delete();
    result.delete();

    return rgba;
}

/**
 * Auto Filter - ID 102
 * Automatic enhancement with histogram equalization
 */
function autoFilter(src: any): any {
    console.log('Applying Auto filter...');

    // Convert to YUV
    let yuv = new cv.Mat();
    cv.cvtColor(src, yuv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(yuv, yuv, cv.COLOR_RGB2YUV);

    // Split channels
    let channels = new cv.MatVector();
    cv.split(yuv, channels);

    // Apply histogram equalization to Y channel
    cv.equalizeHist(channels.get(0), channels.get(0));

    // Merge back
    cv.merge(channels, yuv);
    let result = new cv.Mat();
    cv.cvtColor(yuv, result, cv.COLOR_YUV2RGB);
    cv.cvtColor(result, result, cv.COLOR_RGB2RGBA);

    yuv.delete();
    channels.delete();

    return result;
}

/**
 * Draft Filter - ID 104
 * Creates a draft/sketch-like effect
 */
function draftFilter(src: any): any {
    console.log('Applying Draft filter...');

    // Convert to grayscale
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Edge detection using Canny
    let edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    // Invert edges
    cv.bitwise_not(edges, edges);

    // Apply Gaussian blur for smoother look
    cv.GaussianBlur(edges, edges, new cv.Size(3, 3), 0);

    // Convert to RGBA
    let result = new cv.Mat();
    cv.cvtColor(edges, result, cv.COLOR_GRAY2RGBA);

    gray.delete();
    edges.delete();

    return result;
}

/**
 * Apply Auto Levels adjustment to an ImageBitmap
 * Can be used independently of preprocessing filters
 */
export async function applyAutoLevels(image: ImageBitmap): Promise<ImageData> {
    await ensureOpenCVReady();

    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    const src = cv.matFromImageData(imageData);
    let result: any;

    try {
        result = autoLevelsFilter(src);
        const outputImageData = new ImageData(
            new Uint8ClampedArray(result.data),
            result.cols,
            result.rows
        );
        return outputImageData;
    } finally {
        src.delete();
        if (result) result.delete();
    }
}

/**
 * Apply Auto Contrast adjustment to an ImageBitmap
 * Can be used independently of preprocessing filters
 */
export async function applyAutoContrast(image: ImageBitmap): Promise<ImageData> {
    await ensureOpenCVReady();

    console.log(`[applyAutoContrast] Input image: ${image.width}x${image.height}`);

    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    console.log(`[applyAutoContrast] ImageData: ${imageData.width}x${imageData.height}, data length: ${imageData.data.length}`);

    const src = cv.matFromImageData(imageData);
    let result: any;

    try {
        result = autoContrastFilter(src);
        console.log(`[applyAutoContrast] Result mat: ${result.cols}x${result.rows}, channels: ${result.channels()}, type: ${result.type()}`);

        const outputImageData = new ImageData(
            new Uint8ClampedArray(result.data),
            result.cols,
            result.rows
        );
        console.log(`[applyAutoContrast] Output ImageData: ${outputImageData.width}x${outputImageData.height}, data length: ${outputImageData.data.length}`);
        return outputImageData;
    } finally {
        src.delete();
        if (result) result.delete();
    }
}

/**
 * Apply Auto Exposure adjustment to an ImageBitmap
 * Can be used independently of preprocessing filters
 */
export async function applyAutoExposure(image: ImageBitmap): Promise<ImageData> {
    await ensureOpenCVReady();

    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    const src = cv.matFromImageData(imageData);
    let result: any;

    try {
        result = autoExposureFilter(src);
        const outputImageData = new ImageData(
            new Uint8ClampedArray(result.data),
            result.cols,
            result.rows
        );
        return outputImageData;
    } finally {
        src.delete();
        if (result) result.delete();
    }
}

/**
 * Auto Levels Filter (Internal)
 * Automatically adjusts black and white points using histogram analysis
 * Works per channel for best color balance
 */
function autoLevelsFilter(src: any): any {
    console.log('Applying Auto Levels filter...');

    // Convert to RGB for processing
    let rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

    // Split into channels
    let channels = new cv.MatVector();
    cv.split(rgb, channels);

    // Process each channel
    for (let i = 0; i < 3; i++) {
        const channel = channels.get(i);

        // Calculate histogram
        let hist = new cv.Mat();
        let mask = new cv.Mat();
        let srcVec = new cv.MatVector();
        srcVec.push_back(channel);
        cv.calcHist(
            srcVec,
            [0],
            mask,
            hist,
            [256],
            [0, 256]
        );
        srcVec.delete();

        // Find min and max with 1% cutoff (ignore extreme outliers)
        const totalPixels = channel.rows * channel.cols;
        const cutoffPixels = totalPixels * 0.01; // 1% cutoff

        let minVal = 0;
        let maxVal = 255;
        let cumSum = 0;

        // Find minimum (1st percentile)
        for (let j = 0; j < 256; j++) {
            cumSum += hist.data32F[j];
            if (cumSum > cutoffPixels) {
                minVal = j;
                break;
            }
        }

        // Find maximum (99th percentile)
        cumSum = 0;
        for (let j = 255; j >= 0; j--) {
            cumSum += hist.data32F[j];
            if (cumSum > cutoffPixels) {
                maxVal = j;
                break;
            }
        }

        // Normalize channel using found min/max
        if (maxVal > minVal) {
            const alpha = 255.0 / (maxVal - minVal);
            const beta = -minVal * alpha;
            cv.convertScaleAbs(channel, channel, alpha, beta);
        }

        hist.delete();
        mask.delete();
    }

    // Merge channels back
    let result = new cv.Mat();
    cv.merge(channels, result);

    // Convert back to RGBA
    let rgba = new cv.Mat();
    cv.cvtColor(result, rgba, cv.COLOR_RGB2RGBA);

    rgb.delete();
    result.delete();
    channels.delete();

    return rgba;
}

/**
 * Auto Contrast Filter
 * Simple histogram stretching to use full 0-255 range
 */
function autoContrastFilter(src: any): any {
    console.log('Applying Auto Contrast filter...');

    // Convert to RGB for processing
    let rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

    // Split into channels
    let channels = new cv.MatVector();
    cv.split(rgb, channels);

    // Find global min and max across all channels
    let globalMin = 255;
    let globalMax = 0;
    let mask = new cv.Mat(); // Reusable mask for minMaxLoc

    for (let i = 0; i < 3; i++) {
        const channel = channels.get(i);
        let minMax = cv.minMaxLoc(channel, mask);
        if (minMax.minVal < globalMin) globalMin = minMax.minVal;
        if (minMax.maxVal > globalMax) globalMax = minMax.maxVal;
    }

    mask.delete(); // Clean up mask

    console.log(`Auto Contrast: Found min=${globalMin}, max=${globalMax}`);

    // Apply stretch if there's any room for improvement
    let stretched = new cv.Mat();

    if (globalMax > globalMin) {
        // Calculate stretch: map [min, max] to [0, 255]
        const alpha = 255.0 / (globalMax - globalMin);
        const beta = -globalMin * alpha;
        cv.convertScaleAbs(rgb, stretched, alpha, beta);
        console.log(`Auto Contrast: Applied stretch - alpha=${alpha.toFixed(3)}, beta=${beta.toFixed(3)}`);
    } else {
        // Flat image (all same value), return original
        stretched = rgb.clone();
        console.log('Auto Contrast: Skipped - flat image (no range)');
    }

    // Convert back to RGBA
    let result = new cv.Mat();
    cv.cvtColor(stretched, result, cv.COLOR_RGB2RGBA);

    rgb.delete();
    stretched.delete();
    channels.delete();

    return result;
}

/**
 * Auto Exposure Filter
 * Automatically adjusts brightness based on image histogram
 * Targets mean brightness around 128 (middle gray)
 */
function autoExposureFilter(src: any): any {
    console.log('Applying Auto Exposure filter...');

    // Convert to grayscale to analyze brightness
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Calculate mean brightness
    let mean = cv.mean(gray);
    const currentBrightness = mean[0]; // 0-255
    const targetBrightness = 128; // Middle gray

    // Calculate adjustment needed
    const adjustment = targetBrightness - currentBrightness;

    // Convert to RGB for adjustment
    let rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

    // Apply brightness adjustment
    let adjusted = new cv.Mat();
    cv.convertScaleAbs(rgb, adjusted, 1.0, adjustment);

    // Convert back to RGBA
    let result = new cv.Mat();
    cv.cvtColor(adjusted, result, cv.COLOR_RGB2RGBA);

    gray.delete();
    rgb.delete();
    adjusted.delete();

    return result;
}

/**
 * Sharpen Filter
 * Applies unsharp masking with adjustable strength
 * Best applied after resize for thermal printing
 */
export async function applySharpen(image: ImageBitmap, strength: SharpenStrength): Promise<ImageData> {
    if (strength === 'none') {
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height);
    }

    // Ensure OpenCV is ready
    await ensureOpenCVReady();

    // Convert ImageBitmap to ImageData
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    // Convert ImageData to cv.Mat
    const src = cv.matFromImageData(imageData);

    let result: any;

    try {
        result = sharpenFilter(src, strength);

        // Convert result back to ImageData
        const outputImageData = new ImageData(
            new Uint8ClampedArray(result.data),
            result.cols,
            result.rows
        );

        return outputImageData;
    } finally {
        // Cleanup
        src.delete();
        if (result) result.delete();
    }
}

/**
 * Internal sharpen implementation using Unsharp Masking
 */
function sharpenFilter(src: any, strength: SharpenStrength): any {
    console.log(`Applying sharpen filter (${strength})...`);

    // Determine sharpening parameters based on strength
    let blurSigma: number;
    let alpha: number;  // Weight for original image
    let beta: number;   // Weight for blurred image (negative for sharpening)

    switch (strength) {
        case 'light':
            blurSigma = 1.0;
            alpha = 1.3;
            beta = -0.3;
            break;
        case 'medium':
            blurSigma = 1.5;
            alpha = 1.6;
            beta = -0.6;
            break;
        case 'strong':
            blurSigma = 2.0;
            alpha = 2.0;
            beta = -1.0;
            break;
        default:
            return src.clone();
    }

    // Apply Gaussian blur
    let blurred = new cv.Mat();
    cv.GaussianBlur(src, blurred, new cv.Size(0, 0), blurSigma);

    // Unsharp mask: sharpened = original + alpha*(original - blurred)
    // Which is equivalent to: (1+alpha)*original - alpha*blurred
    // Or using addWeighted: alpha*original + beta*blurred where beta = -alpha/(1+alpha)
    let sharpened = new cv.Mat();
    cv.addWeighted(src, alpha, blurred, beta, 0, sharpened);

    blurred.delete();

    return sharpened;
}

// ============= Helper Functions =============

/**
 * Apply gamma correction to an RGB image
 */
function gammaCorrection(mat: any, gamma: number) {
    // Build lookup table
    const lookupTable = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        lookupTable[i] = Math.pow(i / 255.0, 1.0 / gamma) * 255;
    }

    // Apply LUT to each pixel
    for (let i = 0; i < mat.rows; i++) {
        for (let j = 0; j < mat.cols; j++) {
            const pixel = mat.ucharPtr(i, j);
            pixel[0] = lookupTable[pixel[0]]; // R
            pixel[1] = lookupTable[pixel[1]]; // G
            pixel[2] = lookupTable[pixel[2]]; // B
        }
    }
}

/**
 * Adjust image saturation
 */
function adjustSaturation(mat: any, factor: number) {
    // Convert to HSV
    let hsv = new cv.Mat();
    cv.cvtColor(mat, hsv, cv.COLOR_RGB2HSV);

    // Adjust saturation channel
    for (let i = 0; i < hsv.rows; i++) {
        for (let j = 0; j < hsv.cols; j++) {
            const pixel = hsv.ucharPtr(i, j);
            pixel[1] = Math.min(255, pixel[1] * factor); // S channel
        }
    }

    // Convert back to RGB
    cv.cvtColor(hsv, mat, cv.COLOR_HSV2RGB);
    hsv.delete();
}

/**
 * Increase image contrast
 */
function increaseContrast(mat: any, factor: number) {
    const alpha = factor; // Contrast control
    const beta = 0; // Brightness control

    for (let i = 0; i < mat.rows; i++) {
        for (let j = 0; j < mat.cols; j++) {
            const pixel = mat.ucharPtr(i, j);
            pixel[0] = Math.min(255, Math.max(0, alpha * pixel[0] + beta));
        }
    }
}

/**
 * Get human-readable filter name
 */
export function getFilterName(filterType: FilterType): string {
    const names: Record<FilterType, string> = {
        'none': 'None',
        'portrait': 'Portrait',
        'pet': 'Pet',
        'lineplus': 'Line+',
        'auto': 'Auto',
        'draft': 'Draft'
    };
    return names[filterType];
}
