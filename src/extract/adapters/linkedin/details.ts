// Known layouts are promoted here when a supplied example gains dedicated
// recognition rules and regression coverage. Only semantic-fallback warns.
export type LinkedInStrategy = 'sdui-named-slot' | 'sdui-expandable-card'
  | 'legacy' | 'semantic-fallback';

export interface LinkedInDetails {
  strategy: LinkedInStrategy;
  root: Element;
  title: Element | null;
  company: Element | null;
  description: Element;
  primaryRegion: Element | null;
}
