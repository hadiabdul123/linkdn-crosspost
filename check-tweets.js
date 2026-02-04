// check-tweets.js
// GitHub Actions version - runs once per trigger, uses JSONbin for storage
const fetch = require("node-fetch");

// ----- CONFIG ----- //
const twitterUsername = "mrfoxFDC";
const twitterApiKey = "new1_ce741fa8bfd44464aadebd6a81c2e0d9";
const makeWebhookURL = "https://hook.eu1.make.com/5l48n5uh4kxoabpmwbmnp1hweahopi9q";

// JSONbin.io config (you'll create this bin and get the ID)
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;

// ----- LOGGING ----- //
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// ----- JSONBIN STORAGE ----- //
async function readLastTweetId() {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    log("ERROR: JSONBIN_BIN_ID or JSONBIN_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { "X-Access-Key": JSONBIN_API_KEY }
    });

    if (!res.ok) {
      log(`ERROR reading from JSONbin: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.record?.lastTweetId || null;
  } catch (err) {
    log(`ERROR reading lastTweetId: ${err.message}`);
    return null;
  }
}

async function saveLastTweetId(id) {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    log("ERROR: JSONBIN_BIN_ID or JSONBIN_API_KEY not set");
    return false;
  }

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": JSONBIN_API_KEY
      },
      body: JSON.stringify({ lastTweetId: id })
    });

    if (!res.ok) {
      log(`ERROR saving to JSONbin: ${res.status}`);
      return false;
    }

    log(`✓ Saved last tweet ID: ${id}`);
    return true;
  } catch (err) {
    log(`ERROR saving lastTweetId: ${err.message}`);
    return false;
  }
}

// ----- TWITTER API ----- //
async function getLatestTweets() {
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${twitterUsername}`;

  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": twitterApiKey }
    });

    if (!res.ok) {
      const errorText = await res.text();
      log(`ERROR: Twitter API returned ${res.status}: ${errorText}`);
      return [];
    }

    const data = await res.json();
    const tweets = data.data?.tweets || [];
    log(`Fetched ${tweets.length} tweets from API`);
    return tweets;
  } catch (err) {
    log(`ERROR fetching tweets: ${err.message}`);
    return [];
  }
}

// ----- MEDIA EXTRACTION ----- //
function extractMedia(tweet) {
  const mediaArr = [];
  let mediaSource = tweet.extendedEntities?.media || tweet.entities?.media || tweet.media;

  if (!mediaSource) return mediaArr;

  mediaSource.forEach((m) => {
    if (m.type === "photo" && m.media_url_https) {
      mediaArr.push(m.media_url_https);
    } else if ((m.type === "video" || m.type === "animated_gif") && m.video_info) {
      const mp4Variants = (m.video_info.variants || [])
        .filter(v => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (mp4Variants.length > 0) {
        mediaArr.push(mp4Variants[0].url);
      }
    }
  });

  return mediaArr;
}

// ----- MAKE.COM WEBHOOK ----- //
async function sendToMake(tweet) {
  const media = extractMedia(tweet);
  let cleanText = tweet.text.replace(/https:\/\/t\.co\/\w+/g, '').trim();

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
    log(`Sending tweet ${tweet.id} to Make.com...`);

    const res = await fetch(makeWebhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      log(`ERROR: Make.com returned ${res.status}`);
      return false;
    }

    log(`✓ Successfully sent tweet ${tweet.id}`);
    return true;
  } catch (err) {
    log(`ERROR sending to Make.com: ${err.message}`);
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

// ----- MAIN ----- //
async function main() {
  log("╔════════════════════════════════════════════╗");
  log("║   Twitter → LinkedIn Check (GitHub Actions)║");
  log("╚════════════════════════════════════════════╝");
  log(`Checking: @${twitterUsername}`);
  log("");

  // Get last processed tweet ID
  let lastTweetId = await readLastTweetId();
  log(`Last processed tweet ID: ${lastTweetId || "none (first run)"}`);

  // Fetch tweets
  const tweets = await getLatestTweets();
  if (tweets.length === 0) {
    log("No tweets found. Exiting.");
    return;
  }

  // First run - set baseline
  if (!lastTweetId) {
    let newestId = tweets[0].id;
    for (const tweet of tweets) {
      if (compareTweetIds(tweet.id, newestId)) {
        newestId = tweet.id;
      }
    }
    await saveLastTweetId(newestId);
    log(`✓ First run - baseline set to: ${newestId}`);
    log("Future tweets will be posted to LinkedIn.");
    return;
  }

  // Sort tweets oldest first
  tweets.sort((a, b) => {
    try {
      const diff = BigInt(a.id) - BigInt(b.id);
      return diff > 0n ? 1 : (diff < 0n ? -1 : 0);
    } catch {
      return a.id.localeCompare(b.id);
    }
  });

  // Process new tweets
  let newestId = lastTweetId;
  let processedCount = 0;

  for (const tweet of tweets) {
    if (!compareTweetIds(tweet.id, lastTweetId)) continue;

    // Skip retweets and replies
    if (tweet.text?.startsWith("RT @") || tweet.isReply || tweet.inReplyToId) {
      log(`Skipping retweet/reply: ${tweet.id}`);
      continue;
    }

    log(`→ New tweet: ${tweet.id}`);
    log(`  Text: "${tweet.text?.substring(0, 60)}..."`);

    const success = await sendToMake(tweet);
    if (success) {
      newestId = tweet.id;
      processedCount++;
      await new Promise(r => setTimeout(r, 2000));
    } else {
      break;
    }
  }

  // Save progress
  if (newestId !== lastTweetId) {
    await saveLastTweetId(newestId);
  }

  log(`✓ Done! Processed ${processedCount} new tweet(s)`);
}

// Run
main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  process.exit(1);
});
