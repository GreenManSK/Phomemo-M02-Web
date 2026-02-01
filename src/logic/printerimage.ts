export type PrinterImage = {
    width: number;
    height: number;
    bits: Uint8ClampedArray; // every pixel is 1 bit (black or white) the image is stored x -> xn for each row
};

export type ImageConversionOptions = {
    rotation: number; // number in degrees
    threshold: number; // 0-255, 0 is black, 255 is white
    invert: boolean; // if true, black becomes white and vice versa
    algorithm: 'Basic' | 'Dither' | 'Atkinson' | 'Bayer' | 'SierraLite'; // conversion algorithm
    contrast: number; // 0-2, 1 is normal contrast
    exposure: number; // 0-2, 1 is normal exposure (brightness)
    heightPercentage: number; // 0-100, percentage of image height to print (from top)
    widthPercentage: number; // 0-100, percentage of paper width the image takes (centered, white on sides)
    paperThickness: 'none' | 'light' | 'medium' | 'heavy' | 'dedicated'; // paper thickness / heat intensity setting
    preprocessFilter: 'none' | 'portrait' | 'pet' | 'lineplus' | 'auto' | 'draft'; // preprocessing filter to apply before conversion
    filterOrder: 'before-resize' | 'after-resize'; // when to apply the preprocessing filter
    imageSmoothingEnabled: boolean; // if true, applies interpolation when resizing (default: true)
    imageSmoothingQuality: 'low' | 'medium' | 'high'; // quality of image smoothing interpolation
    resizeAlgorithm: 'canvas' | 'nearest' | 'linear' | 'cubic' | 'area' | 'lanczos4'; // resize interpolation algorithm
    sharpenBeforeResize: 'none' | 'light' | 'medium' | 'strong'; // sharpening applied before resize (preserves detail during downscaling)
    sharpenAfterResize: 'none' | 'light' | 'medium' | 'strong'; // sharpening applied after resize (compensates for resize blur, recommended for thermal printing)
    // flip: boolean; // if true, the image is flipped horizontally
    // scale: number; // scale the image, 1 is no scaling, 2 is double size, etc.
    // crop: {
    //     x: number; // x coordinate of the top left corner of the crop area
    //     y: number; // y coordinate of the top left corner of the crop area
    //     width: number; // width of the crop area
    //     height: number; // height of the crop area
    // };
};

export const defaultImageConversionOptions: ImageConversionOptions = {
    rotation: 0,
    threshold: 128,
    invert: false,
    algorithm: 'Bayer',
    contrast: 1.0,
    exposure: 1.0,
    heightPercentage: 100,
    widthPercentage: 100,
    paperThickness: 'none',
    preprocessFilter: 'none',
    filterOrder: 'before-resize',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    resizeAlgorithm: 'canvas',
    sharpenBeforeResize: 'none',
    sharpenAfterResize: 'none',
};
