const MAX_PHOTO_BYTES = 4.75 * 1024 * 1024;

// Use the same centered square as object-fit: cover in the viewfinder.
export function getImageCrop(width, height, maxDimension, cropSquare = true) {
  const size = Math.min(width, height);
  const sourceWidth = cropSquare ? size : width;
  const sourceHeight = cropSquare ? size : height;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  return {
    x: (width - sourceWidth) / 2,
    y: (height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

// Encode once from the original. Only retry at a smaller size if the server's
// per-photo upload limit would otherwise reject the image.
export async function optimizeImage(source, maxDimension = 1600, quality = 0.88, cropSquare = true, options = {}) {
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = objectUrl || source;
    });
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error('Image has no dimensions');

    const canvas = document.createElement('canvas');
    let dimension = maxDimension;
    let outputQuality = quality;
    let blob;
    for (let attempt = 0; attempt < 4; attempt++) {
      const crop = getImageCrop(sourceWidth, sourceHeight, dimension, cropSquare);
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (options.brightness && options.brightness !== 1 && 'filter' in ctx) ctx.filter = `brightness(${options.brightness})`;
      if (options.mirror) { ctx.translate(crop.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(image, crop.x, crop.y, crop.sourceWidth, crop.sourceHeight, 0, 0, crop.width, crop.height);
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Failed to encode image')), 'image/webp', outputQuality);
      });
      if (blob.size <= MAX_PHOTO_BYTES) break;
      dimension = Math.round(dimension * 0.8);
      outputQuality = Math.max(0.7, outputQuality - 0.05);
    }
    if (blob.size > MAX_PHOTO_BYTES) throw new Error('Photo is too large to upload');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read the photo'));
      reader.readAsDataURL(blob);
    });
    return { blob, dataUrl, sizeBytes: blob.size, width: canvas.width, height: canvas.height, mimeType: blob.type };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
