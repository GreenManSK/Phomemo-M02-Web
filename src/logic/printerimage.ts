export type PrinterImage = {
    width: number;
    height: number;
    bits: Uint8ClampedArray; // every pixel is 1 bit (black or white) the image is stored x -> xn for each row
};

export type ImageConversionOptions = {
    rotation: number; // number in degrees
    threshold: number; // 0-255, 0 is black, 255 is white
    invert: boolean; // if true, black becomes white and vice versa
    algorithm: 'Basic' | 'Dither'; // conversion algorithm
    contrast: number; // 0-2, 1 is normal contrast
    exposure: number; // 0-2, 1 is normal exposure (brightness)
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
    algorithm: 'Basic',
    contrast: 1.0,
    exposure: 1.0,
};
