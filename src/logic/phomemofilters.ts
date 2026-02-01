/**
 * Phomemo Image Preprocessing Filters
 * Ported from browser-prototype/filters.js
 *
 * These filters enhance images before the dithering/conversion process
 */

// @ts-ignore
import cv from '@techstark/opencv-js';

export type FilterType = 'none' | 'portrait' | 'pet' | 'lineplus' | 'auto' | 'draft';

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
