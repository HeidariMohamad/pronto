const MAX_PHOTO_BYTES = 200 * 1024;

// The viewfinder displays the entire frame; this guide marks the saved square.
export function getSquareGuide(width, height) {
  if (!width || !height) return { width: '100%', height: '100%' };
  return {
    width: `${Math.min(1, height / width) * 100}%`,
    height: `${Math.min(1, width / height) * 100}%`
  };
}

// Crop the same centered square marked by the viewfinder guide.
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

// Keep photos readable while avoiding large uploads and device backups.
export async function optimizeImage(source, maxDimension = 1024, quality = 0.75, cropSquare = true, options = {}) {
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
      outputQuality = Math.max(0.55, outputQuality - 0.07);
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
