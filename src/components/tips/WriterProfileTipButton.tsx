'use client';

import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';
import { TipCard } from './TipCard';
import { TIP_CARD_COPY } from '@/lib/copy/tips';

interface WriterProfileTipButtonProps {
  writerId: string;
  className?: string;
}

export function WriterProfileTipButton({ writerId, className = '' }: WriterProfileTipButtonProps) {
  const [showTipCard, setShowTipCard] = useState(false);

  return (
    <div className={`space-y-4 ${className}`}>
      {!showTipCard ? (
        <button
          type="button"
          onClick={() => setShowTipCard(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-sm font-medium hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-all min-h-[44px] shadow-xs"
        >
          <Heart className="w-4 h-4 fill-amber-500/20 text-amber-700 dark:text-amber-400" />
          <span>{TIP_CARD_COPY.title}</span>
          <UrduText as="span" size="xs" className="text-secondary py-0">
            {TIP_CARD_COPY.titleUrdu}
          </UrduText>
        </button>
      ) : (
        <div className="pt-2">
          <TipCard writerId={writerId} />
        </div>
      )}
    </div>
  );
}
