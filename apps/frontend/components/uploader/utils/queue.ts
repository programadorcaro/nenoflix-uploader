import type { ExistingFile, QueueItem } from "../types";
import { extractEpisodeInfo } from "./name-suggestion";

const TYPE_DIRS = { movies: "Movies", series: "Series", animes: "Animes" } as const;

/** Lower-case extension with the dot, e.g. ".mkv". */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.substring(dot).toLowerCase();
}

/** Same cleanup the server does in `cleanName`, so previews and conflicts match. */
export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex -- mirrors the server cleanName
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
}

/** File name the server will write for this item. */
export function finalFileName(item: Pick<QueueItem, "file" | "name">): string {
  const ext = extensionOf(item.file.name);
  const name = cleanName(item.name);
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}

/** Path shown to the user, e.g. "/Series/Reacher/Reacher - S03E07.mkv". */
export function destinationPath(type: keyof typeof TYPE_DIRS, folder: string, file?: string): string {
  return ["", TYPE_DIRS[type], folder.trim(), file].filter((p, i) => i === 0 || p).join("/");
}

/** "S03E07", or null when the name has no episode marker. */
export function episodeTag(name: string): string | null {
  const { season, episode } = extractEpisodeInfo(name);
  if (season === null || episode === null) return null;
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

/**
 * Why each item cannot be sent, by id: an empty name, a file that already
 * exists in the folder, or two items with the same final name.
 */
export function findConflicts(items: QueueItem[], existing: ExistingFile[]): Map<string, string> {
  const onServer = new Set(existing.map((f) => f.name.toLowerCase()));
  const seen = new Map<string, number>();
  for (const it of items) {
    const k = finalFileName(it).toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const it of items) {
    if (it.status === "done") continue;
    const k = finalFileName(it).toLowerCase();
    if (!cleanName(it.name)) out.set(it.id, "Nome vazio");
    else if (onServer.has(k)) out.set(it.id, "Já existe na pasta");
    else if ((seen.get(k) ?? 0) > 1) out.set(it.id, "Nome repetido na fila");
  }
  return out;
}

/** Episodes first, in season/episode order; the rest keep their order. */
export function sortByEpisode(items: QueueItem[]): QueueItem[] {
  const key = (it: QueueItem): [number, number] => {
    let info = extractEpisodeInfo(it.file.name);
    if (info.season === null || info.episode === null) info = extractEpisodeInfo(it.name);
    return [info.season ?? Infinity, info.episode ?? Infinity];
  };
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.index - b.index)
    .map(({ item }) => item);
}

/** Summary of a destination folder, e.g. for "12 arquivos · até S03E06". */
export function folderSummary(files: ExistingFile[]) {
  const media = files.filter((f) => /\.(mkv|mp4)$/i.test(f.name));
  let last: string | null = null;
  let lastKey = -1;
  for (const f of media) {
    const { season, episode } = extractEpisodeInfo(f.name);
    if (season === null || episode === null) continue;
    const k = season * 10000 + episode;
    if (k > lastKey) {
      lastKey = k;
      last = episodeTag(f.name);
    }
  }
  return { count: media.length, bytes: files.reduce((n, f) => n + f.size, 0), lastEpisode: last };
}
