// scripts/cron-trigger.js
// This script is called by Render's cron job to trigger the check-tweets API

const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;

async function triggerCheckTweets() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[${new Date().toISOString()}] Cron job triggered`);

  if (!APP_URL) {
    console.error("ERROR: APP_URL not set");
    process.exit(1);
  }

  const url = `https://${APP_URL}/api/check-tweets`;
  console.log(`Calling: ${url}`);

  try {
    const res = await fetch(url);
    const data = await res.json();

    console.log(`Status: ${res.status}`);
    console.log(`Response: ${JSON.stringify(data, null, 2)}`);

    if (data.success) {
      console.log(`✓ Processed ${data.processed} tweet(s)`);
    } else {
      console.error(`✗ Error: ${data.error}`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

triggerCheckTweets();
