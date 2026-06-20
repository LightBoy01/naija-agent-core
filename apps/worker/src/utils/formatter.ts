/**
 * Formats text for WhatsApp's limited Markdown support.
 *
 * WhatsApp natively supports: *bold*, _italic_, ~strikethrough~,
 * `inline code`, ```fenced code blocks```, - bullet lists, > quotes,
 * and numbered lists.
 *
 * Does NOT support: standard markdown tables, headings (#),
 * link labels [text](url), or LaTeX math notation.
 *
 * This formatter converts those unsupported features into readable
 * alternatives before the text hits WhatsApp.
 */
export class Formatter {
  /**
   * Main entry point. Convert markdown/LaTeX to WhatsApp-friendly text.
   */
  static format(text: string): string {
    if (!text) return text;

    // 1. Protect code blocks — nothing inside them should be reformatted
    const fences: string[] = [];
    const codes: string[] = [];
    let result = this.protectCodeBlocks(text, fences, codes);

    // 2. Convert markdown tables to monospace blocks
    result = this.renderTables(result);

    // 3. Convert LaTeX symbols to Unicode equivalents
    result = this.renderMath(result);

    // 4. Convert standard markdown to WhatsApp-native format
    result = this.convertMarkdown(result);

    // 5. Restore protected code blocks and inline code
    result = this.restoreProtected(result, fences, codes);

    return result.trim();
  }

  // ─── Code protection ─────────────────────────────────────────────

  private static protectCodeBlocks(
    text: string,
    fences: string[],
    codes: string[],
  ): string {
    // Fenced code blocks first (they may contain inline code markers)
    let result = text.replace(/```[\s\S]*?```/g, (match) => {
      fences.push(match);
      return `\x00FENCE${fences.length - 1}\x00`;
    });

    // Then inline code
    result = result.replace(/`[^`\n]+`/g, (match) => {
      codes.push(match);
      return `\x00CODE${codes.length - 1}\x00`;
    });

    return result;
  }

  private static restoreProtected(
    text: string,
    fences: string[],
    codes: string[],
  ): string {
    let result = text;
    result = result.replace(
      /\x00FENCE(\d+)\x00/g,
      (_, idx) => fences[parseInt(idx)] ?? '',
    );
    result = result.replace(
      /\x00CODE(\d+)\x00/g,
      (_, idx) => codes[parseInt(idx)] ?? '',
    );
    return result;
  }

  // ─── Tables ──────────────────────────────────────────────────────

  /**
   * Converts markdown tables into monospace-wrapped blocks.
   * WhatsApp has no table support, so we wrap them in ``` for
   * monospace rendering — it's the best approximation available.
   */
  private static renderTables(text: string): string {
    // Quick bail-out: must have pipes AND a separator row
    if (!text.includes('|') || !text.includes('---')) return text;

    const lines = text.split('\n');
    const newLines: string[] = [];
    const tableLines: string[] = [];
    let inTable = false;

    const flushTable = () => {
      if (tableLines.length === 0) return;
      newLines.push('```\n' + tableLines.join('\n') + '\n```');
      tableLines.length = 0;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect table row: starts with | and has at least one more |
      if (trimmed.startsWith('|') && (trimmed.match(/\|/g)?.length ?? 0) >= 2) {
        if (!inTable) {
          flushTable(); // flush any previous unfinished table
          inTable = true;
        }
        tableLines.push(line);
      } else {
        if (inTable) flushTable();
        inTable = false;
        newLines.push(line);
      }
    }

    // Flush trailing table
    if (inTable) flushTable();

    return newLines.join('\n');
  }

  // ─── LaTeX / Math ────────────────────────────────────────────────

  private static renderMath(text: string): string {
    const mathMap: Record<string, string> = {
      '\\alpha': 'α',
      '\\beta': 'β',
      '\\gamma': 'γ',
      '\\delta': 'δ',
      '\\epsilon': 'ε',
      '\\theta': 'θ',
      '\\lambda': 'λ',
      '\\mu': 'μ',
      '\\pi': 'π',
      '\\sigma': 'σ',
      '\\omega': 'ω',
      '\\Delta': 'Δ',
      '\\Sigma': 'Σ',
      '\\Omega': 'Ω',
      '\\infty': '∞',
      '\\approx': '≈',
      '\\neq': '≠',
      '\\le': '≤',
      '\\ge': '≥',
      '\\pm': '±',
      '\\times': '×',
      '\\div': '÷',
      '\\sqrt': '√',
      '\\sum': '∑',
      '\\prod': '∏',
      '\\cdot': '·',
      '\\partial': '∂',
      '\\nabla': '∇',
      '\\in': '∈',
      '\\notin': '∉',
      '\\subset': '⊂',
      '\\supset': '⊃',
      '\\cup': '∪',
      '\\cap': '∩',
      '\\rightarrow': '→',
      '\\leftarrow': '←',
      '\\Rightarrow': '⇒',
      '\\Leftarrow': '⇐',
      '^2': '²',
      '^3': '³',
      '^n': 'ⁿ',
    };

    let result = text;
    for (const [key, value] of Object.entries(mathMap)) {
      result = result.split(key).join(value);
    }

    // Strip $ / $$ delimiters
    result = result.replace(/\$\$/g, '').replace(/\$/g, '');

    return result;
  }

  // ─── Markdown → WhatsApp conversion ──────────────────────────────

  private static convertMarkdown(text: string): string {
    let result = text;

    // 1. Bold-italic: ***text*** → *_text_*
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*');

    // 2. Bold (double-asterisk): **text** → *text*
    result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

    // 3. Bold (underscore): __text__ → *text*
    result = result.replace(/__(.+?)__/g, '*$1*');

    // 4. Strikethrough: ~~text~~ → ~text~
    result = result.replace(/~~(.+?)~~/g, '~$1~');

    // 5. Headers: ### Header → *HEADER*
    result = result.replace(/^#{1,6}\s+(.*)$/gm, (_, p1: string) => {
      const clean = p1.replace(/\*\*|__|~~/g, '').trim();
      return `*${clean.toUpperCase()}*`;
    });

    // 6. Links: [text](url) → text (url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // 7. Clean up any triple-star artifacts
    result = result.replace(/\*{3,}/g, '*');

    return result;
  }
}
