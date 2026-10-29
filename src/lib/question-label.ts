import works from '../data/works.json';
import { questionNumbers } from './question-numbering.mjs';

const chapters = import.meta.glob<string>('../content/book/**/*.mdx', {
  query: '?raw', import: 'default', eager: true,
});
const numbers = questionNumbers(works, (lang: string, file: string) =>
  chapters[`../content/book/${lang}/${file}.mdx`] ?? '');

export function questionLabel(id: string, question: string): string {
  const number = numbers.get(id);
  return `Question${number === undefined ? '' : ` ${number}`}: ${question}`;
}
