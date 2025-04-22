require("dotenv").config();
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { logWithDate } = require("./utils/logger");
const fs = require("fs");
const express = require("express");
const routes = require("./routes");
const { exec } = require("child_process");

const app = express();
const { PORT = 3113 } = process.env;

app.use(express.json({ limit: "50mb" }));
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

const client = new Client({
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // Use single-process mode to reduce memory usage
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-cache",
      "--disable-component-extensions-with-background-pages",
      "--disable-crash-reporter",
      "--disable-extensions",
      "--disable-hang-monitor",
      "--disable-ipc-flooding-protection",
      "--disable-notifications",
      "--disable-popup-blocking",
      "--disable-print-preview",
      "--disable-prompt-on-repost",
      "--disable-renderer-backgrounding",
      "--ignore-certificate-errors",
      "--log-level=3",
    ],
    timeout: 60000, // Increase timeout to 60 seconds
  },
  authStrategy: new LocalAuth(),
  dataPath: "session",
});

routes(app, client);
initializeClientWithRetry();

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("loading_screen", (percent, message) =>
  log(`Loading: ${percent}% - ${message}`)
);
client.on("auth_failure", () => log("Authentication failure!"));
client.on("disconnected", () => log("Client disconnected!"));
client.on("authenticated", () => log("Client authenticated!"));
client.on("ready", () => startServer());
client.on("error", (error) => {
  log(`Client error: ${error.message}`);
  // Optionally attempt to reinitialize the client
  initializeClientWithRetry();
});

client.on("message", async (message) => {
  const { body, from } = message;

  if (body === "!ping") return handlePing(message, from);
  if (body === "!logs") return handleLogs(message, from);
  if (body.startsWith("!deleteMessage,"))
    return handleDeleteMessage(message, body);
  if (body === "!jadwaldeo") return handleSchedule(message, from);
});

function log(message) {
  logWithDate(message);
  console.log(message);
}

function startServer() {
  log("WhatsApp API siap digunakan!");

  const server = app.listen(PORT, () => log(`Server berjalan di port ${PORT}`));
  server.on("error", handleError(server));
}


async function initializeClientWithRetry(maxRetries = 3, retryDelay = 5000) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      await client.initialize();
      log("Client initialized successfully!");
      return;
    } catch (error) {
      attempts++;
      log(`Client initialization failed (attempt ${attempts}/${maxRetries}): ${error.message}`);
      if (attempts === maxRetries) {
        log("Max retries reached. Exiting...");
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

function handleError(server) {
  return (err) => {
    if (err.code === "EADDRINUSE") {
      log(`Port ${PORT} is already in use. Exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  };
}

async function handlePing(message, from) {
  message.reply("pong");
  log(`${from}: pinged!`);
}

function handleLogs(message, from) {
  fs.readFile("logs/status.log", "utf8", (err, data) => {
    if (err) return;
    const recentLines = data.trim().split("\n").slice(-10).join("\n");
    message.reply(recentLines);
    log(`${from}: !logs`);
  });
}

async function handleDeleteMessage(message, body) {
  const messageID = body.split(",")[1];
  try {
    const msg = await client.getMessageById(messageID);
    if (msg.fromMe) {
      msg.delete(true);
      message.reply(`Pesan dengan ID ${messageID} telah dihapus!`);
      log(`Pesan dengan ID ${messageID} telah dihapus!`);
    }
  } catch (error) {
    log(`Error getting message: ${error}`);
  }
}

async function handleSchedule(message, from) {
  exec("python3 getSchedule.py", (error, stdout) => {
    if (error) {
      log(`Error getting schedule: ${error}`);
      return;
    }
    message.reply(stdout);
    log(`Sending schedule to ${from}`);
  });
}
