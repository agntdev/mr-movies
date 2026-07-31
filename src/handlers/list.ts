import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, paginate, registerMainMenuItem, type InlineButton } from "../toolkit/index.js";
import { listMovies, type Movie } from "../movies/store.js";

registerMainMenuItem({ label: "🎬 Browse movies", data: "movies:list:0", order: 20 });

const composer = new Composer<Ctx>();

function title(movie: Movie): string {
  return movie.duration ? `${movie.title} · ${Math.ceil(movie.duration / 60)} min` : movie.title;
}

async function renderPage(ctx: Ctx, requested: number, edit: boolean): Promise<void> {
  const movies = (await listMovies()).filter((movie) => movie.visibility === "visible");
  if (movies.length === 0) {
    const text = "No movies are available yet — check back soon.";
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
    else await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
    return;
  }
  const page = paginate(movies, { page: requested, perPage: 10, callbackPrefix: "movies", prevLabel: "Previous", nextLabel: "Next" });
  const rows: InlineButton[][] = page.pageItems.map((movie) => [inlineButton(title(movie).slice(0, 24), `movie:play:${movie.id}`)]);
  rows.push(...page.controls.inline_keyboard);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  const text = `Browse movies · page ${page.page + 1} of ${page.totalPages}`;
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.command("list", async (ctx) => renderPage(ctx, 0, false));
composer.callbackQuery(/^movies:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderPage(ctx, Number(ctx.match[1]), true);
});
composer.callbackQuery(/^movies:(?:prev|next):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderPage(ctx, Number(ctx.match[1]), true);
});

export default composer;
