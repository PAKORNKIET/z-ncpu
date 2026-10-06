// บทเรียน Markdown จาก @z-ncpu/content (Vite รวมเข้า bundle ตอน build เป็นข้อความล้วน)
const files = import.meta.glob<string>('../../../../packages/content/lessons/*/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const byKey = new Map<string, string>();
for (const [path, text] of Object.entries(files)) {
  const m = /lessons\/(th|en)\/(.+)\.md$/.exec(path);
  if (m) byKey.set(`${m[1]}:${m[2]}`, text);
}

/** lesson = key ใน LevelDef เช่น "logic/not" */
export function lessonText(lang: 'th' | 'en', lesson: string): string | undefined {
  return byKey.get(`${lang}:${lesson}`);
}
