// server.js - Keep-alive server for Glitch
// This keeps the app awake by responding to HTTP pings

const http = require("http");

// Start the Twitter watcher
require("./twitterapi-watcher-prod.js");

// Simple HTTP server to keep Glitch awake
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Twitter → LinkedIn watcher is running!");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Keep-alive server running on port ${PORT}`);
});
