'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, X, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { compressImage, type UploadPreset } from '@/lib/uploads/compress';

export interface ImageUploaderProps {
  bucket: 'novel-assets' | 'payment-proofs';
  preset: UploadPreset;
  folder: string; // e.g., auth.uid() or order_id
  value?: string | null; // Existing image path or URL
  onChange: (value: string | null) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
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
  className = '',
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setProgress(15);

    try {
      // 1. Client-side compression and magic-byte inspection
      setProgress(30);
      const compressionResult = await compressImage(file, preset);
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

  const handleRemove = () => {
    setPreviewUrl(null);
    setError(null);
    onChange(null);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-navy mb-1.5">
          {label}
        </label>
      )}

      <div className="relative group rounded-xl border-2 border-dashed border-border bg-surface-muted/60 p-4 transition-all hover:border-brand-gold/60 hover:bg-surface">
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
            <div className="relative overflow-hidden rounded-lg border border-border shadow-md">
              {previewUrl.startsWith('http') || previewUrl.startsWith('blob:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Uploaded preview"
                  className={`object-cover ${
                    preset === 'avatar'
                      ? 'h-24 w-24 rounded-full'
                      : preset === 'cover'
                      ? 'h-48 w-32 rounded-md'
                      : 'max-h-56 w-auto rounded-md'
                  }`}
                />
              ) : (
                <div className="flex h-24 w-48 items-center justify-center gap-2 bg-slate-100 text-slate-700 text-xs p-2 text-center">
                  <ImageIcon className="h-4 w-4 text-brand-gold" />
                  <span>Private proof uploaded</span>
                </div>
              )}

              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  className="absolute top-1 right-1 z-20 rounded-full bg-red-600/90 p-1 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110 hover:bg-red-500 cursor-pointer"
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-emerald-700 flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Image compressed and ready
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-gold mb-2" />
                <p className="text-sm font-medium text-navy">
                  Compressing & uploading ({progress}%)...
                </p>
                <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-brand-gold transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2 rounded-full bg-slate-100 p-3 text-slate-500 group-hover:text-brand-gold group-hover:bg-amber-50 transition-colors">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-navy">
                  Click or drag image to upload
                </p>
                <p className="mt-1 text-xs text-secondary">
                  WebP, JPG, or PNG (auto-compressed to WebP)
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {helperText && !error && (
        <p className="mt-1.5 text-xs text-secondary">{helperText}</p>
      )}
    </div>
  );
}
