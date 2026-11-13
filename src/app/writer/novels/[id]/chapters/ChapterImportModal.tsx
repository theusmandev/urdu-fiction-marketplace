'use client';

import React from 'react';
import { ChapterSplitterWizard } from './ChapterSplitterWizard';
import type { ChapterRow } from '@/types/database';

interface ChapterImportModalProps {
  novelId: string;
  novelTitleUrdu?: string;
  novelTitleEnglish?: string;
  isOpen: boolean;
  onClose: () => void;
  suggestedStartNumber?: number;
  onSuccess?: (newChapters?: ChapterRow[]) => void;
}

export function ChapterImportModal({
  novelId,
  novelTitleUrdu,
  novelTitleEnglish,
  isOpen,
  onClose,
  suggestedStartNumber,
  onSuccess,
}: ChapterImportModalProps) {
  return (
    <ChapterSplitterWizard
      novelId={novelId}
      novelTitleUrdu={novelTitleUrdu}
      novelTitleEnglish={novelTitleEnglish}
      isOpen={isOpen}
      onClose={onClose}
      mode="import"
      suggestedStartNumber={suggestedStartNumber}
      onSuccess={onSuccess}
    />
  );
}

