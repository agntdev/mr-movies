import { afterEach, describe, expect, it } from "vitest";
import { buildBot } from "../src/bot.js";
import { configureMovieStorage, saveMovie } from "../src/movies/store.js";
import { MemorySessionStorage, parseBotSpec, runSpecs } from "../src/toolkit/index.js";

const previousAdminChat = process.env.ADMIN_CHAT_ID;

afterEach(() => {
  if (previousAdminChat === undefined) delete process.env.ADMIN_CHAT_ID;
  else process.env.ADMIN_CHAT_ID = previousAdminChat;
});

function resetLibrary(): void {
  configureMovieStorage(new MemorySessionStorage<object>());
}

async function addMovie(title: string, fileId: string, timestamp: number): Promise<string> {
  const movie = await saveMovie({
    title,
    filename: `${title}.mp4`,
    alternateTitles: [],
    fileSize: 1024,
    uploadTimestamp: timestamp,
    uploaderAdminId: 1,
    visibility: "visible",
    fileId,
  });
  return movie.id;
}

describe("movie library flows", () => {
  it("returns five close matches and streams the selected movie", async () => {
    resetLibrary();
    const ids: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      ids.push(await addMovie(["Star Voyage", "Star Garden", "Star Bridge", "Star Light", "Star Harbor", "Star Beyond"][index - 1]!, `video-${index}`, index));
    }
    const suite = await runSpecs(() => buildBot("test-token"), [
      parseBotSpec({
        name: "five-match search then playback",
        steps: [
          { send: { text: "star" }, expect: [{ method: "sendMessage", payload: { text: "I found these matches for “star”. Tap one to watch." } }] },
          { send: { callback: `movie:play:${ids[5]}` }, expect: [{ method: "sendVideo", payload: { video: "video-6" } }] },
        ],
      }),
    ]);
    expect(suite.failed).toBe(0);
  });

  it("paginates ten movies per page", async () => {
    resetLibrary();
    for (let index = 1; index <= 11; index += 1) await addMovie(`Movie ${index}`, `movie-${index}`, index);
    const suite = await runSpecs(() => buildBot("test-token"), [
      parseBotSpec({
        name: "movie list pagination",
        steps: [
          { send: { text: "/list" }, expect: [{ method: "sendMessage", payload: { text: "Browse movies · page 1 of 2" } }] },
          { send: { callback: "movies:next:1" }, expect: [{ method: "editMessageText", payload: { text: "Browse movies · page 2 of 2" } }] },
        ],
      }),
    ]);
    expect(suite.failed).toBe(0);
  });

  it("validates uploads and notifies the configured admin after success", async () => {
    resetLibrary();
    process.env.ADMIN_CHAT_ID = "1";
    const invalidVideoUpdate = {
      update_id: 2,
      message: {
        message_id: 2, date: 0, chat: { id: 1, type: "private" },
        from: { id: 1, is_bot: false, first_name: "Owner" },
        video: { file_id: "bad-video", file_unique_id: "bad-video", width: 1, height: 1, duration: 1, mime_type: "video/webm", file_name: "clip.webm", file_size: 10 },
      },
    };
    const validVideoUpdate = {
      update_id: 4,
      message: {
        message_id: 4, date: 0, chat: { id: 1, type: "private" },
        from: { id: 1, is_bot: false, first_name: "Owner" },
        video: { file_id: "good-video", file_unique_id: "good-video", width: 1, height: 1, duration: 90, mime_type: "video/mp4", file_name: "Good Movie.mp4", file_size: 10 },
      },
    };
    const suite = await runSpecs(() => buildBot("test-token"), [
      parseBotSpec({
        name: "invalid and valid admin uploads",
        steps: [
          { send: { text: "/upload" }, expect: [{ method: "sendMessage", payload: { text: "Send the MP4 movie now. It can be up to 50 MB." } }] },
          { send: { update: invalidVideoUpdate }, expect: [{ method: "sendMessage", payload: { text: "That isn't an MP4 movie. Send an MP4 file instead." } }] },
          { send: { text: "/upload" }, expect: [{ method: "sendMessage", payload: { text: "Send the MP4 movie now. It can be up to 50 MB." } }] },
          { send: { update: validVideoUpdate }, expect: [
            { method: "sendMessage", payload: { text: "Added “Good Movie” to the library. People can search for it now." } },
            { method: "sendMessage", payload: { chat_id: "1", text: "Added “Good Movie” to the movie library." } },
          ] },
        ],
      }),
    ]);
    expect(suite.failed).toBe(0);
  });
});
