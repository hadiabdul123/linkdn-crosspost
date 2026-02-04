export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Twitter → LinkedIn Cross-Post</h1>
      <p>This service automatically posts your tweets to LinkedIn.</p>
      <hr />
      <h2>API Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/check-tweets</code> - Manually trigger a check for new
          tweets
        </li>
      </ul>
      <h2>How it works</h2>
      <ol>
        <li>Vercel Cron runs every 2 hours</li>
        <li>Fetches your latest tweets from Twitter</li>
        <li>Filters out retweets and replies</li>
        <li>Sends new original tweets to Make.com webhook</li>
        <li>Make.com posts them to LinkedIn</li>
      </ol>
      <p>
        <a href="/api/check-tweets">→ Trigger manual check</a>
      </p>
    </main>
  );
}
