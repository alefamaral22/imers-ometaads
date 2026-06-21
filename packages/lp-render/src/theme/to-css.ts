// Pure, deterministic Theme -> theme.css serialization (CSS custom properties).
// No I/O, no clock. Output ordering is fixed so the same Theme always yields byte-identical CSS.
import type { Theme } from './theme.js';

// Map of CSS custom property name -> value extractor, in deterministic emission order.
const COLOR_VARS: ReadonlyArray<[string, keyof Theme['colors']]> = [
  ['--color-primary', 'primary'],
  ['--color-primary-foreground', 'primaryForeground'],
  ['--color-secondary', 'secondary'],
  ['--color-accent', 'accent'],
  ['--color-background', 'background'],
  ['--color-foreground', 'foreground'],
  ['--color-muted', 'muted'],
  ['--color-border', 'border'],
  ['--color-success', 'success'],
  ['--color-destructive', 'destructive'],
];

export function themeToCss(theme: Theme): string {
  const lines: string[] = [':root {'];
  for (const [varName, key] of COLOR_VARS) {
    lines.push(`  ${varName}: ${theme.colors[key]};`);
  }
  lines.push(`  --font-heading: ${theme.fonts.heading};`);
  lines.push(`  --font-body: ${theme.fonts.body};`);
  lines.push(`  --radius: ${theme.radius};`);
  lines.push(`  --max-width: ${theme.maxWidth};`);
  lines.push('}');
  // Trailing newline keeps the file POSIX-clean and diff-stable.
  return lines.join('\n') + '\n';
}
