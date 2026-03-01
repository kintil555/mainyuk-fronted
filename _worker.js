export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';

    // Deteksi bot Discord / Telegram / WhatsApp / Twitter
    const isBot = /discord|telegram|whatsapp|twitterbot|facebookexternalhit|slackbot|linkedinbot|bot|crawler|spider/i.test(userAgent);

    if (isBot || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/game.html') {
      const ogHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>GambarYuk! 🎨 — Game Tebak Gambar Multiplayer</title>
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://mainyuk-fronted.pages.dev/">
  <meta property="og:title" content="GambarYuk! 🎨 — Game Tebak Gambar Multiplayer">
  <meta property="og:description" content="Main tebak gambar bareng teman! Gambar, tebak, dan menangkan poin. Buat room sekarang dan ajak teman-temanmu! 🎮">
  <meta property="og:image" content="https://mainyuk-fronted.pages.dev/preview.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="GambarYuk! 🎨 — Game Tebak Gambar Multiplayer">
  <meta name="twitter:description" content="Main tebak gambar bareng teman! Gambar, tebak, dan menangkan poin. 🎮">
  <meta name="twitter:image" content="https://mainyuk-fronted.pages.dev/preview.png">
  ${isBot ? '' : '<meta http-equiv="refresh" content="0;url=/">'}
</head>
<body>
  <p>Loading GambarYuk!...</p>
</body>
</html>`;

      if (isBot) {
        return new Response(ogHtml, {
          headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
      }
    }

    // Bukan bot — serve file biasa dari Pages
    return env.ASSETS.fetch(request);
  }
};
