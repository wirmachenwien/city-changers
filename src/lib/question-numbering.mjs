/** Number both question types in book order, independently for each edition. */
export function questionNumbers(works, readChapter) {
  const numbers = new Map();
  for (const [lang, work] of Object.entries(works)) {
    let number = 0;
    for (const chapter of work.chapters) {
      const source = readChapter(lang, chapter.file);
      const questions = source.matchAll(/<Question\b[\s\S]*?\bid\s*=\s*(?:\{\s*)?["']([^"']+)["']/g);
      for (const [, id] of questions) {
        if (numbers.has(id)) throw new Error(`Duplicate question id: ${id}`);
        numbers.set(id, ++number);
      }
    }
  }
  return numbers;
}
