import { describe, expect, it } from 'vitest';
import { buildSetupPrompt } from '../site/src/content.js';

describe('BrandPreflight setup prompt', () => {
  it('includes the selected agent context and hosted skill URL', () => {
    const prompt = buildSetupPrompt('Codex', 'https://brandpreflight.test/skill.md');

    expect(prompt).toContain('Codex');
    expect(prompt).toContain('https://brandpreflight.test/skill.md');
    expect(prompt).toContain('sponsored video');
  });

  it('keeps the setup instructions consistent across supported agents', () => {
    const skillUrl = 'https://brandpreflight.test/skill.md';
    const codexPrompt = buildSetupPrompt('Codex', skillUrl);
    const cursorPrompt = buildSetupPrompt('Cursor', skillUrl);

    expect(codexPrompt).not.toEqual(cursorPrompt);
    expect(cursorPrompt).toContain('Cursor');
    expect(cursorPrompt).toContain(skillUrl);
  });
});
