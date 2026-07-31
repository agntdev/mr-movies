import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getMovie, logRequest, matchesExactly, searchMovies, type Movie } from "../movies/store.js";
import { now } from "../movies/clock.js";

registerMainMenuItem({ label: "🔎 Find a movie", data: "movie:search", order: 10 });

const composer = new Composer<Ctx>();

function details(movie: Movie): string {
  const minutes = movie.duration ? `${Math.ceil(movie.duration / 60)} min` : "Duration unavailable";
  return `${movie.title} · ${minutes}`;
}

function playbackMarkup(ctx: Ctx, movie: Movie) {
  if (movie.uploaderAdminId !== ctx.from?.id) return undefined;
  return inlineKeyboard([[inlineButton("Manage movie", `movie:manage:${movie.id}`)]]);
}

async function showSearch(ctx: Ctx, query: string): Promise<void> {
  const results = await searchMovies(query, 5);
  if (results.length === 0) {
    await logRequest({ searchTerm: query, timestamp: now() });
    await ctx.reply("I couldn't find a movie by that name. Try a different title or a few keywords.");
    return;
  }
  const exact = results.filter((movie) => matchesExactly(movie, query));
  if (exact.length === 1) {
    const movie = exact[0]!;
    await logRequest({ searchTerm: query, matchedMovieId: movie.id, timestamp: now() });
    await ctx.replyWithVideo(movie.fileId, { caption: `Here’s ${details(movie)}.`, reply_markup: playbackMarkup(ctx, movie) });
    return;
  }
  await logRequest({ searchTerm: query, timestamp: now() });
  const rows = results.map((movie) => [inlineButton(details(movie).slice(0, 24), `movie:play:${movie.id}`)]);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  await ctx.reply(`I found these matches for “${query}”. Tap one to watch.`, {
    reply_markup: inlineKeyboard(rows),
  });
}

composer.callbackQuery("movie:search", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Send the title you want to watch.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery(/^movie:play:([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const movie = await getMovie(ctx.match[1]!);
  if (!movie || movie.visibility !== "visible") {
    await ctx.reply("That movie isn't available now. Try searching again.");
    return;
  }
  await logRequest({ searchTerm: movie.title, matchedMovieId: movie.id, timestamp: now() });
  await ctx.replyWithVideo(movie.fileId, { caption: `Here’s ${details(movie)}.`, reply_markup: playbackMarkup(ctx, movie) });
});

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith("/")) return next();
  await showSearch(ctx, text);
});

export default composer;
