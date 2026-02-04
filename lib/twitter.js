// lib/twitter.js
// Twitter API helper functions

const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_USERNAME = process.env.TWITTER_USERNAME;

/**
 * Fetch latest tweets from Twitter API
 */
export async function getLatestTweets() {
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${TWITTER_USERNAME}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-API-Key": TWITTER_API_KEY,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Twitter API error ${res.status}: ${errorText}`);
      return [];
    }

    const data = await res.json();
    const tweets = data.data?.tweets || [];
    console.log(`Fetched ${tweets.length} tweets from Twitter API`);
    return tweets;
  } catch (err) {
    console.error(`Error fetching tweets: ${err.message}`);
    return [];
  }
}

/**
 * Filter to only get original tweets (no retweets, no replies)
 */
export function filterOriginalTweets(tweets) {
  return tweets.filter((tweet) => {
    // Skip retweets
    if (tweet.type === "retweet" || tweet.text?.startsWith("RT @")) {
      return false;
    }
    // Skip replies
    if (tweet.isReply || tweet.inReplyToId || tweet.inReplyToUserId) {
      return false;
    }
    return true;
  });
}

/**
 * Extract media URLs from a tweet
 */
export function extractMedia(tweet) {
  const mediaArr = [];

  let mediaSource = null;

  if (tweet.extendedEntities?.media) {
    mediaSource = tweet.extendedEntities.media;
  } else if (tweet.entities?.media) {
    mediaSource = tweet.entities.media;
  } else if (tweet.media) {
    mediaSource = tweet.media;
  }

  if (!mediaSource) return mediaArr;

  mediaSource.forEach((m) => {
    // Photos
    if (m.type === "photo" && m.media_url_https) {
      mediaArr.push(m.media_url_https);
    }
    // Videos and GIFs
    else if ((m.type === "video" || m.type === "animated_gif") && m.video_info) {
      const variants = m.video_info.variants || [];
      const mp4Variants = variants.filter((v) => v.content_type === "video/mp4");
      if (mp4Variants.length > 0) {
        mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        mediaArr.push(mp4Variants[0].url);
      }
    }
  });

  return mediaArr;
}

/**
 * Clean tweet text (remove t.co links)
 */
export function cleanTweetText(text) {
  if (!text) return "";
  return text
    .replace(/https:\/\/t\.co\/\w+/g, "")
    .trim()
    .replace(/\s+$/g, "");
}

/**
 * Compare tweet IDs (handles BigInt)
 */
export function compareTweetIds(id1, id2) {
  try {
    return BigInt(id1) > BigInt(id2);
  } catch {
    return id1 > id2;
  }
}

/**
 * Sort tweets by ID (oldest first)
 */
export function sortTweetsOldestFirst(tweets) {
  return tweets.sort((a, b) => {
    try {
      const diff = BigInt(a.id) - BigInt(b.id);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    } catch {
      return a.id.localeCompare(b.id);
    }
  });
}
