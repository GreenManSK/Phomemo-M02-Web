import type { ImageConversionOptions, PrinterImage } from "./printerimage";

export async function convertImageToBits(image: ImageBitmap, outputWidthPixel: number, options: ImageConversionOptions): Promise<PrinterImage> {
    let outputHeight: number;
    if (options.rotation === 90 || options.rotation === 270) {
        outputHeight = Math.round(outputWidthPixel * (image.width / image.height));
    } else {
        outputHeight = Math.round(outputWidthPixel * (image.height / image.width));
    }

    const canvas = new OffscreenCanvas(outputWidthPixel, outputHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log(`Drawing image to canvas: ${image.width}x${image.height} -> ${canvas.width}x${canvas.height} (${outputWidthPixel} pixels wide) with options:`, options);

    // Apply contrast and exposure filters
    ctx.filter = `contrast(${options.contrast}) brightness(${options.exposure})`;

    if (options.rotation !== 0) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(options.rotation * Math.PI / 180);
        if (options.rotation === 90 || options.rotation === 270) {
            ctx.drawImage(image, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
        } else {
            ctx.drawImage(image, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
        }
        ctx.restore();
    } else {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    // Reset filter
    ctx.filter = 'none';

    const sampledImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const bits = new Uint8ClampedArray(outputHeight * outputWidthPixel / 8);

    switch (options.algorithm) {
        case 'Basic': {
            // Basic threshold algorithm
            const getPixel = (x: number, y: number): boolean => (
                sampledImage.data[(y * canvas.width + x) * 4] +
                sampledImage.data[(y * canvas.width + x) * 4 + 1] +
                sampledImage.data[(y * canvas.width + x) * 4 + 2]) < (options.threshold * 3.0);

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
                    const newPixel = oldPixel < options.threshold ? 0 : 255;
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
                        const pixelValue = grayscale[y * outputWidthPixel + pixelX] < options.threshold;
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
        width: outputWidthPixel,
        height: outputHeight,
        bits: bits
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


