export const metadata = {
  title: "Twitter to LinkedIn Cross-Post",
  description: "Automatically cross-posts tweets to LinkedIn",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
