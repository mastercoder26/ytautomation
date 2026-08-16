import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'site/src/styles.css'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'site/src/App.tsx'), 'utf8');

describe('homepage Spline hero', () => {
  it('lets pointer movement reach the Spline canvas while keeping controls interactive', () => {
    expect(styles).toMatch(
      /\.portfolio-hero-foreground\s*\{[^}]*pointer-events:\s*none;/s
    );
    expect(styles).toMatch(
      /\.centered-prompt,\s*\.portfolio-scroll-button,\s*\.home-logo\s*\{[^}]*pointer-events:\s*auto;/s
    );
  });

  it('includes a BrandPreflight home logo in the hero', () => {
    expect(app).toContain('className="home-logo"');
    expect(app).toContain('<BrandMark />');
  });
});
