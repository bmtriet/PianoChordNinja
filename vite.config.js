import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { saveSong, getSongs, updateSong, deleteSong, getSetting, saveSetting } from './server/db.js'

// Helper to buffer and parse JSON request bodies
const getJsonBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      resolve(JSON.parse(body));
    } catch (e) {
      resolve({});
    }
  });
});

// Scraper & DB API middleware for HopAmChuan songs
const dbAndScrapePlugin = () => ({
  name: 'db-and-scrape-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      // 1. Scraper endpoint (with caching)
      if (req.url && req.url.startsWith('/api/scrape')) {
        const urlObj = new URL(req.url, 'http://localhost');
        const songUrl = urlObj.searchParams.get('url');
        
        if (!songUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        try {
          // Check database cache first to bypass external fetch
          const cachedSongs = await getSongs();
          const cached = cachedSongs.find(s => s.url === songUrl);
          if (cached) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(cached));
            return;
          }

          // Fetch song HTML
          const fetchRes = await fetch(songUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });

          if (!fetchRes.ok) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `External server returned status ${fetchRes.status}` }));
            return;
          }

          const html = await fetchRes.text();
          
          // Parse title from title tag
          const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
          let title = "Unknown Song";
          let artist = "Unknown Artist";
          if (titleMatch) {
            const rawTitle = titleMatch[1].replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
            const parts = rawTitle.split("-");
            title = parts[0].replace(/Hợp âm/i, "").trim();
            if (parts.length > 1) {
              artist = parts[1].replace(/(Hợp âm chính thức|Hợp Âm Chuẩn)/gi, "").trim();
            }
          }

          // Find lyrics / chords block lines
          const matches = html.match(/class="chord_lyric_line[^"]*">([\s\S]*?)<\/div>/g);
          const lines = [];

          if (matches) {
            matches.forEach(m => {
              if (m.includes("text_only")) {
                const text = m.replace(/class="chord_lyric_line text_only">/, "").replace(/<\/div>/, "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
                lines.push({ type: "text_only", text });
              } else if (m.includes("empty_line")) {
                lines.push({ type: "empty_line" });
              } else {
                let lineHtml = m.replace(/class="chord_lyric_line">/, "").replace(/<\/div>/, "");
                
                // Replace hopamchuan_chord_inline block with placeholder
                const chordInlineRegex = /<span class="hopamchuan_chord_inline">(?:<i>\[<\/i>)?<span class="hopamchuan_chord">([\s\S]*?)<\/span>(?:<i>\]<\/i>)?<\/span>/g;
                lineHtml = lineHtml.replace(chordInlineRegex, (match, chord) => {
                  return `__CHORD_[${chord.trim()}]__`;
                });

                // Strip any other tags
                const cleanText = lineHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");

                // Split by chord placeholder
                const parts = cleanText.split(/__CHORD_\[(.+?)\]__/g);
                const segments = [];
                parts.forEach((part, index) => {
                  if (index % 2 === 0) {
                    if (part !== "") {
                      segments.push({ type: "lyric", text: part });
                    }
                  } else {
                    segments.push({ type: "chord", chord: part });
                  }
                });
                
                lines.push({ type: "lyric_chords", segments });
              }
            });
          }

          // Save scraped song automatically to SQLite DB
          const saved = await saveSong(songUrl, title, artist, lines);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(saved));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }

      // 2. Saved Songs DB endpoints
      if (req.url && req.url.startsWith('/api/db/songs')) {
        const urlObj = new URL(req.url, 'http://localhost');
        const search = urlObj.searchParams.get('search') || '';
        const favoritesOnly = urlObj.searchParams.get('favorites') === '1';

        // Check if path has ID e.g. /api/db/songs/12
        const parts = urlObj.pathname.split('/');
        const lastPart = parts[parts.length - 1];
        const songId = parseInt(lastPart, 10);

        try {
          if (!isNaN(songId)) {
            if (req.method === 'PUT') {
              const body = await getJsonBody(req);
              const updated = await updateSong(songId, body.transpose, body.is_favorite);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(updated));
              return;
            } else if (req.method === 'DELETE') {
              await deleteSong(songId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
              return;
            }
          } else {
            if (req.method === 'GET') {
              const list = await getSongs(search, favoritesOnly);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(list));
              return;
            }
          }
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      }

      // 3. Settings DB endpoints
      if (req.url && req.url.startsWith('/api/db/settings')) {
        const urlObj = new URL(req.url, 'http://localhost');
        try {
          if (req.method === 'GET') {
            const key = urlObj.searchParams.get('key');
            const defVal = urlObj.searchParams.get('default') || '';
            const value = await getSetting(key, defVal);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ value }));
            return;
          } else if (req.method === 'POST') {
            const body = await getJsonBody(req);
            await saveSetting(body.key, body.value);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
            return;
          }
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      }

      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dbAndScrapePlugin()],
})
