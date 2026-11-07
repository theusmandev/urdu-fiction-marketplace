'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Image as ImageIcon,
  Camera,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { compressImage, type UploadPreset } from '@/lib/uploads/compress';
import { UrduText } from '@/components/urdu/UrduText';
import { AvatarCropperModal } from './avatar-cropper-modal';

export interface ImageUploaderProps {
  bucket: 'novel-assets' | 'payment-proofs';
  preset: UploadPreset;
  folder: string; // e.g., auth.uid() or order_id
  value?: string | null; // Existing image path or URL
  onChange: (value: string | null) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  helperTextUrdu?: string;
  className?: string;
}

export function ImageUploader({
  bucket,
  preset,
  folder,
  value,
  onChange,
  disabled = false,
  label,
  helperText,
  helperTextUrdu,
  className = '',
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewUrl(value || null);
  }, [value]);

  const processAndUploadFile = async (fileToUpload: File) => {
    setError(null);
    setIsUploading(true);
    setProgress(15);

    try {
      // 1. Client-side compression and magic-byte inspection
      setProgress(30);
      const compressionResult = await compressImage(fileToUpload, preset);
      const compressedFile = compressionResult.file;

      setProgress(50);
      const supabase = createClient();

      // 2. Determine destination storage path
      const fileExt = 'webp';
      const fileId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12);
      const storagePath = `${folder}/${fileId}.${fileExt}`;

      setProgress(70);
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, compressedFile, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Storage upload failed.');
      }

      setProgress(100);

      if (bucket === 'novel-assets') {
        // Public bucket: generate and pass the public URL
        const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
        setPreviewUrl(data.publicUrl);
        onChange(data.publicUrl);
      } else {
        // Private bucket (payment-proofs): store ONLY the relative path
        const objectUrl = URL.createObjectURL(compressedFile);
        setPreviewUrl(objectUrl);
        onChange(storagePath);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // For avatar uploads, open the interactive drag & zoom cropper
    if (preset === 'avatar') {
      const reader = new FileReader();
      reader.onload = () => {
        setCropImageSrc(reader.result as string);
        setIsCropperOpen(true);
      };
      reader.readAsDataURL(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Direct pipeline for covers and payment proofs
    await processAndUploadFile(file);
  };

  const handleCropApply = (croppedFile: File) => {
    processAndUploadFile(croppedFile);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setError(null);
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-semibold text-navy mb-1.5">
          {label}
        </label>
      )}

      <div className="relative group rounded-2xl border-2 border-dashed border-border bg-surface-muted/60 p-4 sm:p-5 transition-all hover:border-border/60 hover:bg-surface">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={label || 'Upload image'}
        />

        {previewUrl ? (
          <div className="relative flex flex-col items-center justify-center">
            <div className="relative">
              {previewUrl.startsWith('http') || previewUrl.startsWith('blob:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Uploaded preview"
                  className={`object-cover border-2 border-border shadow-md ${
                    preset === 'avatar'
                      ? 'h-24 w-24 rounded-full ring-2 ring-accent/30'
                      : preset === 'cover'
                      ? 'h-48 w-32 rounded-xl'
                      : 'max-h-56 w-auto rounded-xl'
                  }`}
                />
              ) : (
                <div className="flex h-24 w-48 items-center justify-center gap-2 bg-surface-muted text-text text-xs p-2 text-center rounded-xl border border-border">
                  <ImageIcon className="h-4 w-4 text-accent-strong" />
                  <span>Private proof uploaded</span>
                </div>
              )}
            </div>

            {/* Warmer Status Badge */}
            <div className="mt-2 text-center space-y-0.5">
              <p className="text-xs text-success-text flex items-center justify-center gap-1 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <span>
                  {preset === 'avatar'
                    ? 'Photo ready — click Save Profile Changes below'
                    : 'Image compressed and ready'}
                </span>
              </p>
              {preset === 'avatar' && (
                <UrduText as="p" size="xs" className="text-success-text/80 py-0">
                  تصویر تیار ہے — نیچے تبدیلی محفوظ کریں
                </UrduText>
              )}
            </div>

            {/* Change & Remove Buttons */}
            {!disabled && (
              <div className="mt-3 flex items-center gap-2 z-20">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-elevated text-xs font-semibold text-secondary hover:text-navy transition-colors min-h-[36px] cursor-pointer shadow-2xs"
                >
                  <Camera className="w-3.5 h-3.5 text-accent-strong" />
                  <span>Change Photo</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-danger-border/40 text-danger-text hover:bg-danger-soft text-xs font-semibold transition-colors min-h-[36px] cursor-pointer"
                  title="Remove photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-accent-strong mb-2" />
                <p className="text-sm font-medium text-navy">
                  Compressing &amp; uploading ({progress}%)...
                </p>
                <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2 rounded-full bg-surface-muted p-3 text-text-muted group-hover:text-accent-strong group-hover:bg-warning-soft transition-colors">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-navy">
                  Click or drag image to upload
                </p>
                <p className="mt-1 text-xs text-secondary">
                  WebP, JPG, or PNG (drag &amp; zoom to frame)
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-danger-text">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {helperText && !error && (
        <div className="mt-2 space-y-0.5">
          <p className="text-xs text-secondary">{helperText}</p>
          {helperTextUrdu && (
            <UrduText as="p" size="xs" className="text-secondary py-0">
              {helperTextUrdu}
            </UrduText>
          )}
        </div>
      )}

      {/* Avatar Drag & Zoom Cropper Modal */}
      <AvatarCropperModal
        isOpen={isCropperOpen}
        imageSrc={cropImageSrc}
        onClose={() => {
          setIsCropperOpen(false);
          setCropImageSrc(null);
        }}
        onApply={handleCropApply}
      />
    </div>
  );
}
