/**
 * Utility to format text for WhatsApp's limited Markdown support.
 * Converts LaTeX and complex Markdown features into readable Unicode/ASCII.
 */
export class Formatter {
  /**
   * Main entry point for formatting.
   */
  static format(text: string): string {
    let formatted = text;

    formatted = this.renderMath(formatted);
    formatted = this.renderTables(formatted);
    formatted = this.cleanupMarkdown(formatted);

    return formatted;
  }

  /**
   * Converts common LaTeX symbols and notation into Unicode equivalents.
   */
  private static renderMath(text: string): string {
    const mathMap: Record<string, string> = {
      '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
      '\\epsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
      '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω', '\\Delta': 'Δ',
      '\\Sigma': 'Σ', '\\Omega': 'Ω', '\\infty': '∞', '\\approx': '≈',
      '\\neq': '≠', '\\le': '≤', '\\ge': '≥', '\\pm': '±', '\\times': '×',
      '\\div': '÷', '\\sqrt': '√', '\\sum': '∑', '\\prod': '∏',
      '^2': '²', '^3': '³', '^n': 'ⁿ', '_i': 'ᵢ', '_n': 'ₙ',
    };

    let result = text;
    // Replace mapped symbols
    for (const [key, value] of Object.entries(mathMap)) {
      result = result.replace(new RegExp(key.replace(/\\/g, '\\\\'), 'g'), value);
    }

    // Clean up $ or $$ delimiters
    result = result.replace(/\$\$/g, '').replace(/\$/g, '');

    return result;
  }

  /**
   * Converts Markdown tables into ASCII fixed-width tables.
   */
  private static renderTables(text: string): string {
    // Detect basic markdown table pattern
    if (!text.includes('|') || !text.includes('---')) return text;

    const lines = text.split('\n');
    let inTable = false;
    let tableLines: string[] = [];
    const newLines: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('|') && line.includes('|')) {
        inTable = true;
        tableLines.push(line);
      } else if (inTable) {
        // End of table detected
        newLines.push('```\n' + tableLines.join('\n') + '\n```');
        tableLines = [];
        inTable = false;
        newLines.push(line);
      } else {
        newLines.push(line);
      }
    }

    // Handle table at the end of text
    if (inTable) {
      newLines.push('```\n' + tableLines.join('\n') + '\n```');
    }

    return newLines.join('\n');
  }

  /**
   * General cleanup of Markdown features WhatsApp doesn't support well.
   * WhatsApp uses: *bold*, _italic_, ~strikethrough~, ```monospace```.
   */
  private static cleanupMarkdown(text: string): string {
    let cleaned = text;

    // 1. Convert Headers (### Header) to Bold (*Header*)
    cleaned = cleaned.replace(/^#{1,6}\s+(.*)$/gm, '*$1*');

    // 2. Handle Bold-Italic (***text***) -> (*_text_*)
    cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '*_$1_*');

    // 3. Handle Bold (**text** or __text__) -> (*text*)
    // Use a more robust regex that handles potential multiline and non-greedy matching
    cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '*$2*');

    // 4. Handle Italic (*text*) -> (_text_) 
    // We do this AFTER bold to avoid double-replacing. 
    // We only match single stars that are NOT part of a bold block.
    cleaned = cleaned.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1_$2_$3');

    // 5. Cleanup redundant spaces or lines caused by math/tables
    cleaned = cleaned.trim();

    return cleaned;
  }
}
