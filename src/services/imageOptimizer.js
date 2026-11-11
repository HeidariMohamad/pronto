/**
 * Client-side image optimizer for Pronto
 * Resizes and compresses photos before uploading to save storage & bandwidth.
 */

export async function optimizeImage(source, maxDimension = 800, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl = null;

    img.onload = () => {
      try {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first, fallback to JPEG
        const tryExport = (type) => {
          return new Promise((res) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  res({ blob, type });
                } else if (type !== 'image/jpeg') {
                  // Fallback to JPEG
                  canvas.toBlob((jpegBlob) => res({ blob: jpegBlob, type: 'image/jpeg' }), 'image/jpeg', quality);
                } else {
                  res({ blob: null, type });
                }
              },
              type,
              quality
            );
          });
        };

        tryExport('image/webp').then(({ blob, type }) => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);

          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              blob,
              dataUrl: reader.result,
              sizeBytes: blob.size,
              width,
              height,
              mimeType: type
            });
          };
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for optimization'));
    };

    if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof Blob || source instanceof File) {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    } else {
      reject(new Error('Invalid image source'));
    }
  });
}

