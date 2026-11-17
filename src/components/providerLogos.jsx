// Provider logos from Lobe Icons (@lobehub/icons-static-svg 1.102.0, MIT; the
// marks are the providers' trademarks, used to name them), in
// public/provider-logos. Shared by Settings → Tools and the onboarding
// provider list.
export const colourIcon = (src) => function ColourIcon({ size }) {
  return <img src={src} alt="" aria-hidden="true" width={size} height={size} />;
};

// Single-colour marks: `className` picks the colour (black by default, as the
// brands draw them; the dark theme turns that white). OpenRouter is green.
export const brandMonoIcon = (src, className = 'text-slate-900') => function BrandMonoIcon({ size }) {
  const mask = `url(${src}) center / contain no-repeat`;
  return <span aria-hidden="true" className={`inline-block bg-current ${className}`} style={{ width: size, height: size, mask, WebkitMask: mask }} />;
};

// A lucide icon in a service's brand colour, for services whose own logo isn't bundled.
export const tinted = (Icon, className) => function TintedIcon({ size }) {
  return <Icon size={size} aria-hidden="true" className={className} />;
};

const LOGO_FILES = {
  deepseek: ['deepseek-color.svg', true],
  anthropic: ['claude-color.svg', true],
  gemini: ['gemini-color.svg', true],
  openai: ['openai.svg', false],
  xai: ['grok.svg', false],
  openrouter: ['openrouter.svg', false, 'text-green-500'],
};
const build = (mono) => Object.fromEntries(Object.entries(LOGO_FILES).map(([id, [file, colour, own]]) => {
  const src = `/provider-logos/${file}`;
  return [id, colour ? colourIcon(src) : brandMonoIcon(src, own || mono)];
}));

// For Settings → Tools (light or dark theme).
export const PROVIDER_LOGOS = build();
// For the always-dark onboarding: mono marks take the surrounding text colour.
export const ONBOARDING_PROVIDER_LOGOS = build('');
