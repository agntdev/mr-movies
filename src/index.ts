import { buildBot } from "./bot.js";
import { setDefaultCommands } from "./toolkit/index.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }
  const bot = await buildBot(token);
  // These are documented power-user shortcuts; every action remains available
  // from the main inline menu for the ordinary button-first experience.
  await setDefaultCommands(bot, [
    { command: "list", description: "Browse the movie library" },
    { command: "upload", description: "Upload a movie (owner)" },
  ]);
  bot.start();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
