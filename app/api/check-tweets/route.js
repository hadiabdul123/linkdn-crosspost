// app/api/check-tweets/route.js
// Serverless function that checks for new tweets and sends them to Make.com

import { Redis } from "@upstash/redis";
import {
  getLatestTweets,
  filterOriginalTweets,
  extractMedia,
  cleanTweetText,
  compareTweetIds,
  sortTweetsOldestFirst,
} from "@/lib/twitter";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const TWITTER_USERNAME = process.env.TWITTER_USERNAME;
const KV_KEY = "lastTweetId";

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Send a tweet to Make.com webhook
 */
async function sendToMakeWebhook(tweet) {
  const media = extractMedia(tweet);
  const cleanText = cleanTweetText(tweet.text);

  const payload = {
    text: cleanText,
    media: media.length > 0 ? media : undefined,
    mediaUrls: media.length > 0 ? media.join(", ") : "",
    tweetUrl:
      tweet.url ||
      tweet.twitterUrl ||
      `https://twitter.com/${TWITTER_USERNAME}/status/${tweet.id}`,
    tweetId: tweet.id,
    author: TWITTER_USERNAME,
    hasMedia: media.length > 0,
  };

  try {
    console.log(`Sending tweet ${tweet.id} to Make.com...`);

    const res = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Make.com webhook error ${res.status}: ${errorText}`);
      return false;
    }

    console.log(`✓ Successfully sent tweet ${tweet.id}`);
    return true;
  } catch (err) {
    console.error(`Error sending to Make.com: ${err.message}`);
    return false;
  }
}

/**
 * Main handler - GET request triggers the check
 */
export async function GET(request) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Twitter → LinkedIn check started");

  try {
    // Get last processed tweet ID from Redis
    let lastTweetId = await redis.get(KV_KEY);
    console.log(`Last processed tweet ID: ${lastTweetId || "none (first run)"}`);

    // Fetch latest tweets
    const allTweets = await getLatestTweets();

    if (allTweets.length === 0) {
      return Response.json({
        success: true,
        message: "No tweets returned from API",
        processed: 0,
      });
    }

    // Filter to only original tweets (no retweets/replies)
    const originalTweets = filterOriginalTweets(allTweets);
    console.log(
      `Found ${allTweets.length} tweets, ${originalTweets.length} are original`
    );

    // First run: just set baseline, don't post anything
    if (!lastTweetId) {
      // Find newest tweet ID
      let newestId = originalTweets[0]?.id;
      for (const tweet of originalTweets) {
        if (compareTweetIds(tweet.id, newestId)) {
          newestId = tweet.id;
        }
      }

      if (newestId) {
        await redis.set(KV_KEY, newestId);
        console.log(`✓ First run - baseline set to: ${newestId}`);
      }

      return Response.json({
        success: true,
        message: "First run - baseline set. Future tweets will be posted.",
        baselineId: newestId,
        processed: 0,
      });
    }

    // Sort tweets oldest first
    const sortedTweets = sortTweetsOldestFirst(originalTweets);

    // Process new tweets
    let newestId = lastTweetId;
    let processedCount = 0;
    const processedTweets = [];

    for (const tweet of sortedTweets) {
      // Skip if already processed
      if (!compareTweetIds(tweet.id, lastTweetId)) {
        continue;
      }

      console.log(`→ New tweet: ${tweet.id}`);
      console.log(
        `  Text: "${tweet.text?.substring(0, 60)}${tweet.text?.length > 60 ? "..." : ""}"`
      );

      const success = await sendToMakeWebhook(tweet);

      if (success) {
        newestId = tweet.id;
        processedCount++;
        processedTweets.push({
          id: tweet.id,
          text: tweet.text?.substring(0, 100),
        });

        // Small delay between posts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        console.log(`✗ Failed to send tweet ${tweet.id} - stopping`);
        break;
      }
    }

    // Save newest processed ID
    if (newestId !== lastTweetId) {
      await redis.set(KV_KEY, newestId);
      console.log(`✓ Updated lastTweetId to: ${newestId}`);
    }

    console.log(`✓ Processed ${processedCount} new tweet(s)`);

    return Response.json({
      success: true,
      processed: processedCount,
      tweets: processedTweets,
      lastTweetId: newestId,
    });
  } catch (err) {
    console.error(`Error in check-tweets: ${err.message}`);
    return Response.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
