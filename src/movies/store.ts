import type { StorageAdapter } from "grammy";
import { resolveSessionStorage } from "../toolkit/index.js";

export interface Movie {
  id: string;
  title: string;
  filename: string;
  alternateTitles: string[];
  description?: string;
  thumbnail?: string;
  duration?: number;
  fileSize: number;
  uploadTimestamp: number;
  uploaderAdminId: number;
  visibility: "visible" | "hidden";
  fileId: string;
}

export interface UserRequest {
  searchTerm: string;
  matchedMovieId?: string;
  timestamp: number;
}

export interface Admin {
  telegramId: number;
  displayName: string;
  permissions: ["upload", "manage-own"];
}

interface MovieIndex {
  ids: string[];
}

interface RequestIndex {
  ids: string[];
}

const MOVIE_INDEX = "mr-movies:index";
const REQUEST_INDEX = "mr-movies:requests";
const movieKey = (id: string) => `mr-movies:movie:${id}`;
const requestKey = (id: string) => `mr-movies:request:${id}`;
const adminKey = (telegramId: number) => `mr-movies:admin:${telegramId}`;

let configuredStore: StorageAdapter<object> | undefined;

/** The Worker entry supplies Durable Object storage; Node uses toolkit Redis storage. */
export function configureMovieStorage(storage: StorageAdapter<object>): void {
  configuredStore = storage;
}

function store(): StorageAdapter<object> {
  return configuredStore ?? resolveSessionStorage<object>(undefined);
}

function hashText(input: string): string {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

function normalise(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

export function matchesExactly(movie: Movie, query: string): boolean {
  const wanted = normalise(query);
  return [movie.title, ...movie.alternateTitles].some((title) => normalise(title) === wanted);
}

export async function listMovies(): Promise<Movie[]> {
  const adapter = store();
  const index = (await adapter.read(MOVIE_INDEX)) as MovieIndex | undefined;
  if (!index) return [];
  const movies = await Promise.all(index.ids.map((id) => adapter.read(movieKey(id))));
  return movies.filter(Boolean) as Movie[];
}

export async function getMovie(id: string): Promise<Movie | undefined> {
  return (await store().read(movieKey(id))) as Movie | undefined;
}

export async function saveMovie(movie: Omit<Movie, "id">): Promise<Movie> {
  const adapter = store();
  const index = ((await adapter.read(MOVIE_INDEX)) as MovieIndex | undefined) ?? { ids: [] };
  let id = hashText(movie.fileId);
  let attempt = 1;
  while (true) {
    const existing = (await adapter.read(movieKey(id))) as Movie | undefined;
    if (!existing || existing.fileId === movie.fileId) break;
    id = `${hashText(movie.fileId)}${attempt}`;
    attempt += 1;
  }
  const saved = { ...movie, id };
  await adapter.write(movieKey(id), saved);
  if (!index.ids.includes(id)) {
    await adapter.write(MOVIE_INDEX, { ids: [...index.ids, id] } satisfies MovieIndex);
  }
  return saved;
}

export async function deleteMovie(id: string): Promise<void> {
  const adapter = store();
  const index = ((await adapter.read(MOVIE_INDEX)) as MovieIndex | undefined) ?? { ids: [] };
  await adapter.delete(movieKey(id));
  await adapter.write(MOVIE_INDEX, { ids: index.ids.filter((item) => item !== id) } satisfies MovieIndex);
}

export async function searchMovies(query: string, limit = 5): Promise<Movie[]> {
  const wanted = normalise(query);
  if (!wanted) return [];
  const candidates = (await listMovies()).filter((movie) => movie.visibility === "visible");
  return candidates
    .map((movie) => {
      const names = [movie.title, ...movie.alternateTitles].map(normalise);
      const score = Math.min(...names.map((name) => {
        if (name === wanted) return 0;
        if (name.includes(wanted) || wanted.includes(name)) return 1;
        return 2 + distance(name, wanted) / Math.max(name.length, wanted.length, 1);
      }));
      return { movie, score };
    })
    .filter(({ score }) => score <= (wanted.length < 4 ? 2.3 : 2.45))
    .sort((a, b) => a.score - b.score || b.movie.uploadTimestamp - a.movie.uploadTimestamp)
    .slice(0, limit)
    .map(({ movie }) => movie);
}

export async function moviesUploadedSince(timestamp: number): Promise<Movie[]> {
  return (await listMovies()).filter((movie) => movie.uploadTimestamp >= timestamp);
}

/** Activity is intentionally anonymous: no Telegram user or chat identifier is stored. */
export async function logRequest(request: UserRequest): Promise<void> {
  const adapter = store();
  const index = ((await adapter.read(REQUEST_INDEX)) as RequestIndex | undefined) ?? { ids: [] };
  const id = `${request.timestamp.toString(36)}-${hashText(`${request.searchTerm}:${request.matchedMovieId ?? ""}`)}`;
  await adapter.write(requestKey(id), request);
  if (!index.ids.includes(id)) {
    await adapter.write(REQUEST_INDEX, { ids: [...index.ids, id] } satisfies RequestIndex);
  }
}

export async function saveAdmin(admin: Admin): Promise<void> {
  await store().write(adminKey(admin.telegramId), admin);
}
