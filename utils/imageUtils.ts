
/**
 * Resizes an image file to fit within a max width and height, preserving aspect ratio,
 * and converts it to WebP format for optimization, using the robust `createImageBitmap` API.
 * @returns A Promise that resolves with the base64-encoded string and MIME type of the resized image.
 */
export const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<{base64: string, mimeType: string}> => {
    return new Promise(async (resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            return reject(new Error(`File "${file.name}" is not a valid image type.`));
        }

        try {
            // createImageBitmap is more efficient and robust for decoding images.
            const bitmap = await createImageBitmap(file);
            let { width, height } = bitmap;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                bitmap.close(); // Release memory
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(bitmap, 0, 0, width, height);
            
            bitmap.close(); // Release memory

            // Get data URL as WebP and extract base64 part. Use quality 0.8 for better compression.
            const dataUrl = canvas.toDataURL('image/webp', 0.8);
            resolve({
                base64: dataUrl.split(',')[1],
                mimeType: 'image/webp'
            });
        } catch (err) {
            console.error(`Error resizing image "${file.name}":`, err);
            reject(new Error(`The image file "${file.name}" could not be processed. It may be corrupted or in an unsupported format.`));
        }
    });
};


/**
 * Converts an image from a base64 string to the WebP format.
 * @param base64 The source base64 string.
 * @param mimeType The source image's MIME type (e.g., 'image/png').
 * @returns A Promise that resolves with the base64-encoded string and MIME type of the WebP image.
 */
export const convertImageToWebP = (base64: string, mimeType: string): Promise<{base64: string, mimeType: string}> => {
    return new Promise(async (resolve, reject) => {
        try {
            const dataUrl = `data:${mimeType};base64,${base64}`;
            // Convert data URL to blob to use with createImageBitmap
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);

            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                bitmap.close();
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
            
            bitmap.close();
            
            // Get data URL as WebP and extract base64 part. Use quality 0.8 for good compression.
            const dataUrlWebP = canvas.toDataURL('image/webp', 0.8);
            resolve({
                base64: dataUrlWebP.split(',')[1],
                mimeType: 'image/webp'
            });
        } catch (err) {
            console.error("Error converting image to WebP:", err);
            reject(new Error("Could not convert generated image to WebP. The source data might be invalid."));
        }
    });
};
