import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { now } from "../movies/clock.js";
import { deleteMovie, getMovie, saveAdmin, saveMovie } from "../movies/store.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const UPLOAD_TTL_MS = 10 * 60 * 1000;
type UploadSession = { upload?: { awaitingVideo: boolean; expiresAt: number; replacingId?: string } };
type RuntimeCtx = Ctx & { env?: { ADMIN_CHAT_ID?: string } };

registerMainMenuItem({ label: "⬆️ Upload a movie", data: "movie:upload", order: 30 });

const composer = new Composer<Ctx>();

function adminChatId(ctx: RuntimeCtx): string | undefined {
  return ctx.env?.ADMIN_CHAT_ID ?? (typeof process === "undefined" ? undefined : process.env.ADMIN_CHAT_ID);
}

function isAdmin(ctx: RuntimeCtx): boolean {
  const configured = adminChatId(ctx);
  return Boolean(configured && String(ctx.chat?.id) === configured);
}

function session(ctx: Ctx): UploadSession {
  return ctx.session as UploadSession;
}

async function notifyAdmin(ctx: RuntimeCtx, text: string): Promise<boolean> {
  const chatId = adminChatId(ctx);
  if (!chatId) return false;
  try {
    await ctx.api.sendMessage(chatId, text);
    return true;
  } catch {
    return false;
  }
}

async function beginUpload(ctx: RuntimeCtx, edit = false): Promise<void> {
  if (!adminChatId(ctx)) {
    const text = "Movie uploads aren't set up yet. Ask the owner to add the admin chat setting.";
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
    else await ctx.reply(text);
    return;
  }
  if (!isAdmin(ctx)) {
    const text = "Only the library owner can upload movies here.";
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
    else await ctx.reply(text);
    return;
  }
  session(ctx).upload = { awaitingVideo: true, expiresAt: now() + UPLOAD_TTL_MS };
  const text = "Send the MP4 movie now. It can be up to 50 MB.";
  const markup = inlineKeyboard([[inlineButton("Cancel", "movie:upload:cancel")]]);
  if (edit) await ctx.editMessageText(text, { reply_markup: markup });
  else await ctx.reply(text, { reply_markup: markup });
}

async function invalidUpload(ctx: RuntimeCtx, text: string): Promise<void> {
  await notifyAdmin(ctx, `An upload couldn't be added: ${text}`);
  await ctx.reply(text);
}

composer.command("upload", async (ctx) => beginUpload(ctx));
composer.callbackQuery("movie:upload", async (ctx) => {
  await ctx.answerCallbackQuery();
  await beginUpload(ctx, true);
});
composer.callbackQuery("movie:upload:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  delete session(ctx).upload;
  await ctx.editMessageText("Upload cancelled.", { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
});

composer.callbackQuery(/^movie:replace:([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const previous = await getMovie(ctx.match[1]!);
  if (!previous || previous.uploaderAdminId !== ctx.from?.id || !isAdmin(ctx)) {
    await ctx.reply("You can only replace movies you uploaded.");
    return;
  }
  session(ctx).upload = { awaitingVideo: true, expiresAt: now() + UPLOAD_TTL_MS, replacingId: previous.id };
  await ctx.editMessageText(`Send the new MP4 for “${previous.title}”.`, {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "movie:upload:cancel")]]),
  });
});

composer.on("message:video", async (ctx, next) => {
  const active = session(ctx).upload;
  if (!active?.awaitingVideo) return next();
  delete session(ctx).upload;
  if (!isAdmin(ctx)) {
    await ctx.reply("Only the library owner can upload movies here.");
    return;
  }
  if (active.expiresAt < now()) {
    await ctx.reply("That upload timed out. Tap Upload a movie and send the file again.");
    return;
  }
  const video = ctx.message.video;
  const filename = video.file_name ?? "movie.mp4";
  const isMp4 = video.mime_type === "video/mp4" || filename.toLocaleLowerCase().endsWith(".mp4");
  if (!isMp4) {
    await invalidUpload(ctx, "That isn't an MP4 movie. Send an MP4 file instead.");
    return;
  }
  if ((video.file_size ?? 0) > MAX_VIDEO_BYTES) {
    await invalidUpload(ctx, "That movie is larger than Telegram's 50 MB limit. Send a smaller MP4.");
    return;
  }
  const title = (filename.replace(/\.mp4$/i, "").replace(/[._-]+/g, " ").trim() || "Untitled movie").slice(0, 120);
  const movie = await saveMovie({
    title,
    filename,
    alternateTitles: [],
    thumbnail: video.thumbnail?.file_id,
    duration: video.duration,
    fileSize: video.file_size ?? 0,
    uploadTimestamp: now(),
    uploaderAdminId: ctx.from.id,
    visibility: "visible",
    fileId: video.file_id,
  });
  if (active.replacingId) {
    await deleteMovie(active.replacingId);
  }
  await saveAdmin({
    telegramId: ctx.from.id,
    displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Library owner",
    permissions: ["upload", "manage-own"],
  });
  await ctx.reply(`Added “${movie.title}” to the library. People can search for it now.`);
  await notifyAdmin(ctx, `Added “${movie.title}” to the movie library.`);
});

export default composer;
