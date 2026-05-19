import { useMemo } from 'react';
import type { CaptionWord, CaptionStyle } from '@/react-app/hooks/useProject';

interface CaptionRendererProps {
  words: CaptionWord[];
  style: CaptionStyle;
  currentTime: number;  // Time within the caption clip
  scaleFactor?: number; // Scaling factor for font size, padding, stroke, etc.
  inline?: boolean;     // When true, skip absolute positioning (parent handles it)
}

export default function CaptionRenderer({ words, style, currentTime, scaleFactor = 1, inline }: CaptionRendererProps) {
  // Apply time offset (negative = captions appear earlier, positive = later)
  const adjustedTime = currentTime - (style.timeOffset || 0);

  // Find which words are visible and which is currently active
  const { visibleWords, activeWordIndex } = useMemo(() => {
    const visible: { word: CaptionWord; index: number }[] = [];
    let activeIndex = -1;

    words.forEach((word, index) => {
      // For most animations, show all words
      // For typewriter, only show words that have started
      if (style.animation === 'typewriter') {
        if (adjustedTime >= word.start) {
          visible.push({ word, index });
        }
      } else {
        visible.push({ word, index });
      }

      // Track the currently active word
      if (adjustedTime >= word.start && adjustedTime < word.end) {
        activeIndex = index;
      }
    });

    return { visibleWords: visible, activeWordIndex: activeIndex };
  }, [words, adjustedTime, style.animation]);

  // Get position styles
  const positionStyles = useMemo((): React.CSSProperties => {
    // When inline, parent handles positioning
    if (inline) {
      return { textAlign: 'center', width: '100%' };
    }

    const w = style.boxWidth || 90;
    const base: React.CSSProperties = {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      textAlign: 'center',
      width: `${w}%`,
      maxWidth: '100%',
    };

    switch (style.position) {
      case 'top':
        return { ...base, top: '8%' };
      case 'center':
        return { ...base, top: '50%', transform: 'translate(-50%, -50%)' };
      case 'bottom':
      default:
        return { ...base, bottom: '8%' };
    }
  }, [style.position, inline]);

  // Get text styles
  const textStyles = useMemo((): React.CSSProperties => {
    const fontSize = style.fontSize * scaleFactor;
    const strokeWidth = (style.strokeWidth || 0) * scaleFactor;
    return {
      fontFamily: style.fontFamily,
      fontSize: `${fontSize}px`,
      fontWeight: style.fontWeight === 'black' ? 900 : style.fontWeight === 'bold' ? 700 : 400,
      color: style.color,
      textShadow: strokeWidth
        ? `
          -${strokeWidth}px -${strokeWidth}px 0 ${style.strokeColor},
          ${strokeWidth}px -${strokeWidth}px 0 ${style.strokeColor},
          -${strokeWidth}px ${strokeWidth}px 0 ${style.strokeColor},
          ${strokeWidth}px ${strokeWidth}px 0 ${style.strokeColor}
        `
        : undefined,
      backgroundColor: style.backgroundColor,
      padding: style.backgroundColor ? `${4 * scaleFactor}px ${12 * scaleFactor}px` : undefined,
      borderRadius: style.backgroundColor ? `${4 * scaleFactor}px` : undefined,
      lineHeight: 1.4,
    };
  }, [style, scaleFactor]);

  // Get animation class/style for a word
  const getWordStyle = (wordIndex: number, word: CaptionWord): React.CSSProperties => {
    const isActive = wordIndex === activeWordIndex;
    const hasStarted = adjustedTime >= word.start;

    switch (style.animation) {
      case 'karaoke':
        return {
          color: isActive ? style.highlightColor || '#FFD700' : style.color,
          transition: 'color 0.1s ease',
        };

      case 'fade':
        return {
          opacity: hasStarted ? 1 : 0.3,
          transition: 'opacity 0.3s ease',
        };

      case 'pop':
        return {
          transform: isActive ? 'scale(1.2)' : 'scale(1)',
          display: 'inline-block',
          transition: 'transform 0.15s ease',
        };

      case 'bounce':
        return {
          transform: isActive ? `translateY(-${4 * scaleFactor}px)` : 'translateY(0)',
          display: 'inline-block',
          transition: 'transform 0.15s ease',
        };

      case 'typewriter':
      case 'none':
      default:
        return {};
    }
  };

  if (visibleWords.length === 0) {
    return null;
  }

  return (
    <div style={positionStyles} className="pointer-events-none">
      <div style={textStyles}>
        {visibleWords.map(({ word, index }, i) => (
          <span
            key={`${index}-${word.text}`}
            style={getWordStyle(index, word)}
          >
            {word.text}
            {i < visibleWords.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
