/** Estimate reading length for Chinese/English Markdown articles. */
export function getReadingStats(source: string) {
  const prose = source
    .replace(/^```[\s\S]*?^```/gm, " ")
    .replace(/^~~~[\s\S]*?^~~~/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`$]/g, " ")
    .replace(/[#>*_~|]/g, " ");

  const han = prose.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const words = prose.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  const characters = han + words;
  const minutes = Math.max(1, Math.ceil(han / 400 + words / 220));

  return { characters, minutes };
}
