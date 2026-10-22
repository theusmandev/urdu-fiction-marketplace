import imageCompression from 'browser-image-compression';

export type UploadPreset = 'avatar' | 'cover' | 'payment-screenshot';

export interface CompressionOptions {
  preset: UploadPreset;
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
}

/**
 * Validates real file MIME type using magic byte inspection (header sniffing).
 * Prevents disguised executable or malicious uploads.
 */
export async function detectRealMimeType(file: File): Promise<string | null> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF (52 49 46 46) .... WEBP (57 45 42 50)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Client-side image compression using browser-image-compression with WebP conversion.
 * Strict limits:
 * - Cover: max width 800px
 * - Avatar: max width 400px
 * - Payment Screenshot: max width 1280px, target <= 150 KB
 * - Hard reject over 2 MB after compression
 */
export async function compressImage(
  file: File,
  preset: UploadPreset
): Promise<CompressionResult> {
  const originalSize = file.size;

  // 1. Verify real MIME type before compression
  const realMime = await detectRealMimeType(file);
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!realMime || !allowedMimes.includes(realMime)) {
    throw new Error(
      'Invalid file format. Only authentic JPG, PNG, and WebP images are accepted.'
    );
  }

  // 2. Configure compression preset
  let maxWidthOrHeight = 800;
  let maxSizeMB = 1.0;

  switch (preset) {
    case 'avatar':
      maxWidthOrHeight = 400;
      maxSizeMB = 0.4;
      break;
    case 'cover':
      maxWidthOrHeight = 800;
      maxSizeMB = 0.8;
      break;
    case 'payment-screenshot':
      maxWidthOrHeight = 1280;
      maxSizeMB = 0.15; // Target <= 150 KB
      break;
  }

  const options = {
    maxSizeMB,
    maxWidthOrHeight,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.85,
  };

  let compressedFile: File;
  try {
    const compressedBlob = await imageCompression(file, options);
    // Ensure WebP extension & name
    const newName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
    compressedFile = new File([compressedBlob], newName, {
      type: 'image/webp',
    });
  } catch (err) {
    // Fallback if browser doesn't support WebP conversion or worker failed
    console.warn('Image compression fallback:', err);
    compressedFile = file;
  }

  // 3. Strict 2 MB hard boundary check
  const hardLimit = 2 * 1024 * 1024;
  if (compressedFile.size > hardLimit) {
    throw new Error(
      `Image size (${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 2 MB.`
    );
  }

  return {
    file: compressedFile,
    originalSize,
    compressedSize: compressedFile.size,
    mimeType: compressedFile.type,
  };
}
