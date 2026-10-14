/**
 * Иллюстрации упражнений — набор Everkinetic (CC BY-SA 4.0).
 * Источник и лицензия: `src/assets/exercises/NOTICE.md`.
 *
 * Файлы лежат в `assets/exercises/<slug>.webp` и подключаются по slug через
 * таблицу соответствия каноническому названию упражнения.
 */
const artUrls = import.meta.glob('../assets/exercises/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const bySlug = new Map<string, string>();
for (const [path, url] of Object.entries(artUrls)) {
  bySlug.set(path.slice(path.lastIndexOf('/') + 1).replace(/\.webp$/, ''), url);
}

/** Каноническое название упражнения → slug файла иллюстрации. */
const NAME_TO_SLUG: Record<string, string> = {
  'Жим в Смите лёжа': 'smith-machine-bench-press',
};

/** URL иллюстрации упражнения или `undefined`, если её ещё нет. */
export function exerciseArt(name: string): string | undefined {
  const slug = NAME_TO_SLUG[name];
  return slug === undefined ? undefined : bySlug.get(slug);
}
