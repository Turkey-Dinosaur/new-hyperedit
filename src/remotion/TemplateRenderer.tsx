import React from 'react';
import { AbsoluteFill } from 'remotion';
import {
  AnimatedText,
  LowerThird,
  CallToAction,
  Counter,
  LogoReveal,
  ScreenFrame,
  SocialProof,
  ProgressBar,
  Comparison,
  ZoomPan,
  DataChart,
} from './templates';

export type TemplateId =
  | 'animated-text'
  | 'lower-third'
  | 'call-to-action'
  | 'counter'
  | 'logo-reveal'
  | 'screen-frame'
  | 'social-proof'
  | 'progress-bar'
  | 'comparison'
  | 'zoom-pan'
  | 'data-chart';

const componentMap: Record<TemplateId, React.ComponentType<Record<string, unknown>>> = {
  'animated-text': AnimatedText as unknown as React.ComponentType<Record<string, unknown>>,
  'lower-third': LowerThird as unknown as React.ComponentType<Record<string, unknown>>,
  'call-to-action': CallToAction as unknown as React.ComponentType<Record<string, unknown>>,
  'counter': Counter as unknown as React.ComponentType<Record<string, unknown>>,
  'logo-reveal': LogoReveal as unknown as React.ComponentType<Record<string, unknown>>,
  'screen-frame': ScreenFrame as unknown as React.ComponentType<Record<string, unknown>>,
  'social-proof': SocialProof as unknown as React.ComponentType<Record<string, unknown>>,
  'progress-bar': ProgressBar as unknown as React.ComponentType<Record<string, unknown>>,
  'comparison': Comparison as unknown as React.ComponentType<Record<string, unknown>>,
  'zoom-pan': ZoomPan as unknown as React.ComponentType<Record<string, unknown>>,
  'data-chart': DataChart as unknown as React.ComponentType<Record<string, unknown>>,
};

export interface TemplateRendererProps {
  templateId: TemplateId;
  templateProps: Record<string, unknown>;
}

export const TemplateRenderer: React.FC<TemplateRendererProps> = ({ templateId, templateProps }) => {
  const Component = componentMap[templateId];

  if (!Component) {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
        <div style={{ color: '#ef4444', fontSize: 32, fontFamily: 'system-ui' }}>
          Unknown template: {templateId}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <Component {...templateProps} />
    </AbsoluteFill>
  );
};
