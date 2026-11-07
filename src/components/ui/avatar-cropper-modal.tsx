'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UrduText } from '@/components/urdu/UrduText';
import { X, ZoomIn, ZoomOut, Check, Move } from 'lucide-react';

interface AvatarCropperModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApply: (croppedFile: File) => void;
}

export function AvatarCropperModal({
  isOpen,
  imageSrc,
  onClose,
  onApply,
}: AvatarCropperModalProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const stageSize = 280; // Stage dimensions (280px x 280px)
  const cropSize = 240; // Circular crop viewport diameter (240px)

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  // Calculate base scale to cover the crop circle
  const getBaseScale = useCallback(() => {
    if (!naturalSize.width || !naturalSize.height) return 1;
    return Math.max(cropSize / naturalSize.width, cropSize / naturalSize.height);
  }, [cropSize, naturalSize]);

  // Clamp pan so image always completely covers the circular cutout
  const clampPan = useCallback(
    (newX: number, newY: number, currentZoom: number) => {
      const baseScale = getBaseScale();
      const currentWidth = naturalSize.width * baseScale * currentZoom;
      const currentHeight = naturalSize.height * baseScale * currentZoom;

      const maxPanX = Math.max(0, (currentWidth - cropSize) / 2);
      const maxPanY = Math.max(0, (currentHeight - cropSize) / 2);

      return {
        x: Math.min(maxPanX, Math.max(-maxPanX, newX)),
        y: Math.min(maxPanY, Math.max(-maxPanY, newY)),
      };
    },
    [cropSize, getBaseScale, naturalSize]
  );

  // Load image when imageSrc changes
  useEffect(() => {
    if (!imageSrc || !isOpen) {
      setImageLoaded(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageElementRef.current = img;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setImageLoaded(true);
    };
    img.src = imageSrc;

    return () => {
      img.onload = null;
    };
  }, [imageSrc, isOpen]);

  // Handle pointer drag events
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan(clampPan(panStart.current.x + dx, panStart.current.y + dy, zoom));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.min(3, Math.max(1, newZoom));
    setZoom(clampedZoom);
    setPan((prev) => clampPan(prev.x, prev.y, clampedZoom));
  };

  // Keyboard navigation for nudging and zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setPan((prev) => clampPan(prev.x - 5, prev.y, zoom));
      } else if (e.key === 'ArrowRight') {
        setPan((prev) => clampPan(prev.x + 5, prev.y, zoom));
      } else if (e.key === 'ArrowUp') {
        setPan((prev) => clampPan(prev.x, prev.y - 5, zoom));
      } else if (e.key === 'ArrowDown') {
        setPan((prev) => clampPan(prev.x, prev.y + 5, zoom));
      } else if (e.key === '+' || e.key === '=') {
        handleZoomChange(zoom + 0.1);
      } else if (e.key === '-') {
        handleZoomChange(zoom - 0.1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, pan, zoom, clampPan]);

  // Render to 400x400 canvas and export
  const handleApply = () => {
    if (!imageElementRef.current || !imageLoaded) return;

    const outputSize = 400; // Final 400x400 resolution
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseScale = getBaseScale();
    const scaleRatio = outputSize / cropSize;

    const renderedW = naturalSize.width * baseScale * zoom;
    const renderedH = naturalSize.height * baseScale * zoom;

    const destW = renderedW * scaleRatio;
    const destH = renderedH * scaleRatio;

    const destX = (outputSize - destW) / 2 + pan.x * scaleRatio;
    const destY = (outputSize - destH) / 2 + pan.y * scaleRatio;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(imageElementRef.current, destX, destY, destW, destH);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], 'avatar.webp', { type: 'image/webp' });
        onApply(croppedFile);
        onClose();
      },
      'image/webp',
      0.92
    );
  };

  if (!isOpen) return null;

  const baseScale = getBaseScale();
  const currentWidth = naturalSize.width * baseScale * zoom;
  const currentHeight = naturalSize.height * baseScale * zoom;

  const displayX = (stageSize - currentWidth) / 2 + pan.x;
  const displayY = (stageSize - currentHeight) / 2 + pan.y;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cropper-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-2xl text-main space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h2 id="cropper-title" className="text-base font-bold text-navy">
              Adjust Profile Photo
            </h2>
            <UrduText as="p" size="xs" className="text-secondary py-0">
              پروفائل تصویر ایڈجسٹ کریں
            </UrduText>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-secondary hover:text-main hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="flex items-center gap-2 text-xs text-secondary bg-surface-muted p-2.5 rounded-xl border border-border/40">
          <Move className="w-4 h-4 text-accent-strong shrink-0" />
          <span>Drag to frame face. Use slider to zoom in or out.</span>
        </div>

        {/* Viewport Stage (280px x 280px) */}
        <div className="flex justify-center">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-[280px] h-[280px] rounded-2xl overflow-hidden bg-black select-none touch-none cursor-grab active:cursor-grabbing border border-border/80 shadow-inner"
          >
            {/* The Scaled and Panned Image */}
            {imageLoaded && imageSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt="Adjustment stage"
                draggable={false}
                style={{
                  width: `${currentWidth}px`,
                  height: `${currentHeight}px`,
                  transform: `translate3d(${displayX}px, ${displayY}px, 0)`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }}
                className="absolute top-0 left-0 pointer-events-none transition-none"
              />
            )}

            {/* Circular Cutout Mask Overlay (SVG) */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${stageSize} ${stageSize}`}
            >
              <defs>
                <mask id="avatar-crop-mask">
                  <rect width={stageSize} height={stageSize} fill="white" />
                  <circle
                    cx={stageSize / 2}
                    cy={stageSize / 2}
                    r={cropSize / 2}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                width={stageSize}
                height={stageSize}
                fill="rgba(15, 23, 42, 0.65)"
                mask="url(#avatar-crop-mask)"
              />
              <circle
                cx={stageSize / 2}
                cy={stageSize / 2}
                r={cropSize / 2}
                fill="none"
                stroke="rgba(255, 255, 255, 0.85)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>
          </div>
        </div>

        {/* Zoom Slider */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-xs text-secondary font-medium">
            <span>Zoom</span>
            <span className="font-mono">{zoom.toFixed(1)}x</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleZoomChange(zoom - 0.2)}
              disabled={zoom <= 1}
              className="p-1 rounded-lg text-secondary hover:text-navy disabled:opacity-30 cursor-pointer"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-full accent-accent h-2 bg-surface-muted rounded-lg cursor-pointer"
              aria-label="Zoom scale"
            />
            <button
              type="button"
              onClick={() => handleZoomChange(zoom + 0.2)}
              disabled={zoom >= 3}
              className="p-1 rounded-lg text-secondary hover:text-navy disabled:opacity-30 cursor-pointer"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border bg-surface text-secondary hover:text-navy hover:bg-surface-elevated text-xs font-semibold transition-colors min-h-[44px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent hover:bg-accent-dark text-navy text-xs font-bold transition-all shadow-sm min-h-[44px] cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Photo • تصویر سیٹ کریں</span>
          </button>
        </div>
      </div>
    </div>
  );
}

