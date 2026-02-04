// twitterapi-watcher-prod.js
// Twitter to LinkedIn watcher - Only posts NEW tweets after script starts
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// ----- CONFIG ----- //
const twitterUsername = "mrfoxFDC";
const twitterApiKey = "new1_ce741fa8bfd44464aadebd6a81c2e0d9";
const zapierWebhookURL = "https://hook.eu1.make.com/5l48n5uh4kxoabpmwbmnp1hweahopi9q";
const lastIdFile = path.join(__dirname, "lastTweetId.txt");
const CHECK_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours

// ----- LOGGING ----- //
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// ----- STORAGE ----- //
function readLastTweetId() {
  try {
    if (fs.existsSync(lastIdFile)) {
      return fs.readFileSync(lastIdFile, "utf8").trim();
    }
  } catch (err) {
    log(`ERROR reading lastTweetId: ${err.message}`);
  }
  return null;
}

function saveLastTweetId(id) {
  try {
    fs.writeFileSync(lastIdFile, id, "utf8");
    log(`✓ Saved last tweet ID: ${id}`);
  } catch (err) {
    log(`ERROR saving lastTweetId: ${err.message}`);
  }
}

// ----- TWITTER API ----- //
async function getLatestTweets() {
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${twitterUsername}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-API-Key": twitterApiKey
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      log(`ERROR: Twitter API returned ${res.status}: ${errorText}`);
      return [];
    }

    const data = await res.json();

    // TwitterAPI.io returns data in data.tweets
    const tweets = data.data && data.data.tweets ? data.data.tweets : [];
    log(`Fetched ${tweets.length} tweets from API`);
    return tweets;
  } catch (err) {
    log(`ERROR fetching tweets: ${err.message}`);
    return [];
  }
}

function extractMedia(tweet) {
  const mediaArr = [];

  // TwitterAPI.io uses camelCase: extendedEntities, not extended_entities
  let mediaSource = null;

  if (tweet.extendedEntities && tweet.extendedEntities.media) {
    mediaSource = tweet.extendedEntities.media;
    log(`DEBUG - Found media in extendedEntities`);
  } else if (tweet.entities && tweet.entities.media) {
    mediaSource = tweet.entities.media;
    log(`DEBUG - Found media in entities`);
  } else if (tweet.media) {
    mediaSource = tweet.media;
    log(`DEBUG - Found media in top-level media field`);
  } else {
    log(`DEBUG - No media found in tweet`);
    return mediaArr;
  }

  mediaSource.forEach((m, index) => {
    log(`DEBUG - Media ${index}: type=${m.type}`);

    // For photos
    if (m.type === "photo" && m.media_url_https) {
      mediaArr.push(m.media_url_https);
      log(`DEBUG - Added photo: ${m.media_url_https}`);
    }
    // For videos and GIFs
    else if ((m.type === "video" || m.type === "animated_gif") && m.video_info) {
      // Get the highest quality video variant
      const variants = m.video_info.variants || [];
      const mp4Variants = variants.filter(v => v.content_type === "video/mp4");
      if (mp4Variants.length > 0) {
        // Sort by bitrate and get highest quality
        mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        mediaArr.push(mp4Variants[0].url);
        log(`DEBUG - Added video: ${mp4Variants[0].url}`);
      }
    }
  });

  log(`DEBUG - Total media extracted: ${mediaArr.length}`);
  return mediaArr;
}

// ----- ZAPIER WEBHOOK ----- //
async function sendToZapier(tweet) {
  const media = extractMedia(tweet);

  // Clean up text: remove t.co links (Twitter's media links)
  let cleanText = tweet.text;
  // Remove https://t.co/... links (these are Twitter's shortened media links)
  cleanText = cleanText.replace(/https:\/\/t\.co\/\w+/g, '').trim();
  // Remove extra whitespace and newlines at the end
  cleanText = cleanText.replace(/\s+$/g, '');

  // Format payload for Zapier/LinkedIn
  const payload = {
    text: cleanText,
    media: media.length > 0 ? media : undefined,
    mediaUrls: media.length > 0 ? media.join(", ") : "",
    tweetUrl: tweet.url || tweet.twitterUrl || `https://twitter.com/${twitterUsername}/status/${tweet.id}`,
    tweetId: tweet.id,
    author: twitterUsername,
    hasMedia: media.length > 0
  };

  try {
    log(`Sending tweet ${tweet.id} to Zapier...`);
    log(`Payload: ${JSON.stringify(payload, null, 2)}`);
    log(`Webhook URL: ${zapierWebhookURL}`);

    const res = await fetch(zapierWebhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();

    log(`Zapier response status: ${res.status}`);
    log(`Zapier response body: ${responseText}`);

    if (!res.ok) {
      log(`ERROR: Zapier webhook returned ${res.status}: ${responseText}`);
      return false;
    }

    log(`✓ Successfully sent tweet ${tweet.id} to Zapier`);
    return true;
  } catch (err) {
    log(`ERROR sending to Zapier: ${err.message}`);
    console.error(err);
    return false;
  }
}

// ----- TWEET ID COMPARISON ----- //
function compareTweetIds(id1, id2) {
  try {
    return BigInt(id1) > BigInt(id2);
  } catch {
    return id1 > id2;
  }
}

// ----- INITIALIZATION ----- //
async function initializeLastTweetId() {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("INITIALIZATION: Setting baseline...");

  try {
    const tweets = await getLatestTweets();

    if (tweets.length === 0) {
      log("⚠️  No tweets found. Will start monitoring from now.");
      return;
    }

    // Find the newest tweet ID
    let newestId = tweets[0].id;
    for (const tweet of tweets) {
      if (compareTweetIds(tweet.id, newestId)) {
        newestId = tweet.id;
      }
    }

    saveLastTweetId(newestId);
    log(`✓ Baseline set. Will only post tweets NEWER than ID: ${newestId}`);
    log("✓ All existing tweets will be IGNORED");

  } catch (err) {
    log(`ERROR during initialization: ${err.message}`);
  }
}

// ----- MAIN LOGIC ----- //
async function checkTweets() {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("Checking for new tweets...");

  const lastTweetId = readLastTweetId();

  if (!lastTweetId) {
    log("⚠️  No baseline found. Something went wrong during initialization.");
    return;
  }

  log(`Last processed tweet ID: ${lastTweetId}`);

  let newestId = lastTweetId;
  let processedCount = 0;

  try {
    const tweets = await getLatestTweets();

    if (tweets.length === 0) {
      log("No tweets returned from API");
      return;
    }

    // Sort tweets by ID (oldest first)
    tweets.sort((a, b) => {
      try {
        const diff = BigInt(a.id) - BigInt(b.id);
        return diff > 0n ? 1 : (diff < 0n ? -1 : 0);
      } catch {
        return a.id.localeCompare(b.id);
      }
    });

    for (const tweet of tweets) {
      // Skip if we've already processed this tweet
      if (!compareTweetIds(tweet.id, lastTweetId)) {
        continue;
      }

      log(`→ New tweet found: ${tweet.id}`);
      log(`  Text: "${tweet.text.substring(0, 80)}${tweet.text.length > 80 ? '...' : ''}"`);

      const success = await sendToZapier(tweet);

      if (success) {
        newestId = tweet.id;
        processedCount++;

        // Wait 2 seconds between posts
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        log(`✗ Failed to send tweet ${tweet.id} - stopping here`);
        break;
      }
    }

    // Save the newest processed tweet ID
    if (newestId !== lastTweetId) {
      saveLastTweetId(newestId);
      log(`✓ Successfully processed ${processedCount} new tweet(s)`);
    } else {
      log("No new tweets to process");
    }

  } catch (err) {
    log(`ERROR in checkTweets: ${err.message}`);
  }

  log(`Next check in ${CHECK_INTERVAL / 1000 / 60 / 60} hours...`);
}

// ----- STARTUP ----- //
async function start() {
  log("╔════════════════════════════════════════════╗");
  log("║   Twitter → LinkedIn Watcher Started      ║");
  log("╚════════════════════════════════════════════╝");
  log(`Monitoring: @${twitterUsername}`);
  log(`Check interval: ${CHECK_INTERVAL / 1000 / 60 / 60} hours`);
  log("");

  // Check if we need to initialize
  const lastId = readLastTweetId();

  if (!lastId) {
    log("🔄 First run detected - initializing...");
    await initializeLastTweetId();
    log("");
    log("✅ Initialization complete!");
    log("📢 Now monitoring for NEW tweets only");
    log("");
  } else {
    log(`✅ Resuming from last tweet ID: ${lastId}`);
    log("");
  }

  // Start monitoring
  setInterval(checkTweets, CHECK_INTERVAL);
  log("🚀 Monitoring started. Post a new tweet to test!");
}

// Graceful shutdown
process.on('SIGINT', () => {
  log("\n\nShutting down gracefully...");
  process.exit(0);
});

// Start the watcher
start();
