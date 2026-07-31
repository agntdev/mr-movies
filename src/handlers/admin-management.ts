import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { deleteMovie, getMovie } from "../movies/store.js";

const composer = new Composer<Ctx>();

async function ownMovie(ctx: Ctx, id: string) {
  const movie = await getMovie(id);
  return movie?.uploaderAdminId === ctx.from?.id ? movie : undefined;
}

function isConfiguredAdmin(ctx: Ctx): boolean {
  const workerEnv = (ctx as Ctx & { env?: { ADMIN_CHAT_ID?: string } }).env;
  const configured = workerEnv?.ADMIN_CHAT_ID ?? (typeof process === "undefined" ? undefined : process.env.ADMIN_CHAT_ID);
  return Boolean(configured && String(ctx.chat?.id) === configured);
}

composer.callbackQuery(/^movie:manage:([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const movie = isConfiguredAdmin(ctx) ? await ownMovie(ctx, ctx.match[1]!) : undefined;
  if (!movie) {
    await ctx.reply("You can only manage movies you uploaded.");
    return;
  }
  await ctx.reply(`Manage “${movie.title}”.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Replace movie", `movie:replace:${movie.id}`)],
      [inlineButton("Delete movie", `movie:delete:${movie.id}`)],
    ]),
  });
});

composer.callbackQuery(/^movie:delete:([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const movie = isConfiguredAdmin(ctx) ? await ownMovie(ctx, ctx.match[1]!) : undefined;
  if (!movie) {
    await ctx.reply("You can only manage movies you uploaded.");
    return;
  }
  await ctx.editMessageText(`Delete “${movie.title}” from the library?`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Delete", `movie:delete:yes:${movie.id}`), inlineButton("Cancel", `movie:delete:no:${movie.id}`)],
    ]),
  });
});

composer.callbackQuery(/^movie:delete:(yes|no):([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const action = ctx.match[1]!;
  const movie = isConfiguredAdmin(ctx) ? await ownMovie(ctx, ctx.match[2]!) : undefined;
  if (!movie) {
    await ctx.reply("You can only manage movies you uploaded.");
    return;
  }
  if (action === "no") {
    await ctx.editMessageText("Kept the movie in the library.");
    return;
  }
  await deleteMovie(movie.id);
  await ctx.editMessageText(`Removed “${movie.title}” from the library.`);
});

export default composer;
