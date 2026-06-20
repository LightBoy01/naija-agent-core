import { describe, it, expect } from 'vitest';
import { Formatter } from '../../src/utils/formatter.js';

describe('Formatter', () => {
  describe('bold and italic', () => {
    it('converts **bold** to *bold*', () => {
      expect(Formatter.format('**bold**')).toBe('*bold*');
    });

    it('converts __bold__ to *bold*', () => {
      expect(Formatter.format('__bold__')).toBe('*bold*');
    });

    it('converts ***bold italic*** to *_bold italic_*', () => {
      expect(Formatter.format('***bold italic***')).toBe('*_bold italic_*');
    });

    it('leaves single *italic* untouched', () => {
      expect(Formatter.format('*italic*')).toBe('*italic*');
    });

    it('leaves _italic_ untouched', () => {
      expect(Formatter.format('_italic_')).toBe('_italic_');
    });
  });

  describe('strikethrough', () => {
    it('converts ~~strikethrough~~ to ~strikethrough~', () => {
      expect(Formatter.format('~~strikethrough~~')).toBe('~strikethrough~');
    });
  });

  describe('headers', () => {
    it('converts # Header to *HEADER*', () => {
      expect(Formatter.format('# Hello World')).toBe('*HELLO WORLD*');
    });

    it('converts ## Subheader to *SUBHEADER*', () => {
      expect(Formatter.format('## Subheader')).toBe('*SUBHEADER*');
    });

    it('converts ### Deep to *DEEP*', () => {
      expect(Formatter.format('### Deep')).toBe('*DEEP*');
    });
  });

  describe('links', () => {
    it('converts [text](url) to text (url)', () => {
      expect(Formatter.format('[click here](https://example.com)')).toBe(
        'click here (https://example.com)',
      );
    });

    it('handles multiple links in one message', () => {
      const input = 'See [docs](https://docs.example.com) and [api](https://api.example.com)';
      const expected =
        'See docs (https://docs.example.com) and api (https://api.example.com)';
      expect(Formatter.format(input)).toBe(expected);
    });
  });

  describe('code block protection', () => {
    it('preserves **bold** inside triple backticks', () => {
      const input = 'before **bold** ```\n**not bold**\n``` after **bold**';
      const result = Formatter.format(input);
      expect(result).toContain('```\n**not bold**\n```');
      expect(result).toContain('*bold*');
    });

    it('respects code blocks with language tags', () => {
      const input = '```python\n**preserve**\n```';
      expect(Formatter.format(input)).toBe('```python\n**preserve**\n```');
    });

    it('protects inline code from formatting', () => {
      const input = 'use `**raw**` here';
      const result = Formatter.format(input);
      expect(result).toContain('`**raw**`');
    });

    it('handles multiple code blocks', () => {
      const input =
        '```\nblock1\n```\nnormal **bold**\n```\nblock2\n```';
      const result = Formatter.format(input);
      expect(result).toContain('```\nblock1\n```');
      expect(result).toContain('```\nblock2\n```');
      expect(result).toContain('*bold*');
    });
  });

  describe('tables', () => {
    it('wraps markdown tables in monospace code blocks', () => {
      const input = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |';
      const result = Formatter.format(input);
      expect(result).toContain('```\n| Name | Age |');
      expect(result).toContain('| Bob | 25 |\n```');
    });

    it('preserves non-table content around tables', () => {
      const input =
        'Here is data:\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nThat is all.';
      const result = Formatter.format(input);
      expect(result).toContain('Here is data:');
      expect(result).toContain('```\n| A | B |');
      expect(result).toContain('```');
      expect(result).toContain('That is all.');
    });

    it('does not wrap bare pipes as tables', () => {
      const input = 'Use | for pipe in shell';
      expect(Formatter.format(input)).toBe(input);
    });

    it('handles multiple tables', () => {
      const input =
        'First:\n| X | Y |\n|---|---|\n| 1 | 2 |\n\nSecond:\n| A | B |\n|---|---|\n| 3 | 4 |';
      const result = Formatter.format(input);
      expect(result).toContain('```\n| X | Y |');
      expect(result).toContain('```\n\nSecond:');
      expect(result).toContain('```\n| A | B |');
    });
  });

  describe('LaTeX / math', () => {
    it('converts \\alpha to α', () => {
      expect(Formatter.format('\\alpha')).toBe('α');
    });

    it('converts \\infty to ∞', () => {
      expect(Formatter.format('\\infty')).toBe('∞');
    });

    it('strips $ delimiters', () => {
      expect(Formatter.format('$E=mc^2$')).toBe('E=mc²');
    });

    it('strips $$ delimiters', () => {
      expect(Formatter.format('$$\\alpha$$')).toBe('α');
    });
  });

  describe('mixed content', () => {
    it('handles full message with multiple features', () => {
      const input =
        '# Report\n\n**Important** update: see [docs](https://docs.example.com)\n\n```\ncode **here**\n```\n\n| Metric | Value |\n|--------|-------|\n| Speed | 42 |\n\nDone.';
      const result = Formatter.format(input);

      expect(result).toContain('*REPORT*');
      expect(result).toContain('*Important*');
      expect(result).toContain('docs (https://docs.example.com)');
      expect(result).toContain('```\ncode **here**\n```');
      expect(result).toContain('```\n| Metric | Value |');
      expect(result).toContain('Done.');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(Formatter.format('')).toBe('');
    });

    it('returns trimmed result', () => {
      expect(Formatter.format('  hello  ')).toBe('hello');
    });

    it('preserves plain text unchanged', () => {
      expect(Formatter.format('hello world')).toBe('hello world');
    });

    it('handles nullish gracefully', () => {
      expect(Formatter.format('')).toBe('');
    });
  });
});
