const FENCE = /(```[\s\S]*?```)/g;

/**
 * Repairs markdown that models often emit in one blob: prose glued to `|col|col|`,
 * and `||` used instead of newline between table rows. GFM tables require blank
 * lines before the block and newlines between rows.
 */
export function normalizeChatMarkdown(source: string): string {
  const parts = source.split(FENCE);
  return parts
    .map((chunk, index) => {
      if (index % 2 === 1) {
        return chunk;
      }

      let s = chunk;

      // Prose ending glued to a plausible header row: "...text.)| Topic | Stat | Source |"
      s = s.replace(
        /([.!?…)])(\s*)\|(\s*[^|\n]+\s*\|\s*[^|\n]+\s*\|)/g,
        "$1$2\n\n|$3",
      );

      // Separator row glued: "| Source ||-------|..."  -> newline before separator
      s = s.replace(/\|\|(\s*-{2,}\s*\|)/g, "|\n|$1");

      // Next data row glued after separator or cell: "...|--------|| Global" / "...|cell||2019"
      s = s.replace(/\|\|(\s*[A-Za-z\u00C0-\u024F(])/g, "|\n|$1");
      s = s.replace(/\|\|(\s*\d)/g, "|\n|$1");

      // Collapse excessive blank lines introduced above
      s = s.replace(/\n{3,}/g, "\n\n");

      return s;
    })
    .join("");
}
