'use client';

import React from 'react';
import { ChapterSplitterWizard } from './ChapterSplitterWizard';

interface ChapterImportModalProps {
  novelId: string;
  novelTitleUrdu?: string;
  novelTitleEnglish?: string;
  isOpen: boolean;
  onClose: () => void;
  suggestedStartNumber?: number;
}

export function ChapterImportModal({
  novelId,
  novelTitleUrdu,
  novelTitleEnglish,
  isOpen,
  onClose,
  suggestedStartNumber,
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
    />
  );
}
