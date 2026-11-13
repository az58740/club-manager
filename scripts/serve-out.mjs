import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";

const root = resolve(import.meta.dirname, "..", "out");
const port = Number(process.argv[2] || 3100);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const clean = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = join(root, clean);
  const candidates = [base, `${base}.html`, join(base, "index.html"), join(root, "404.html")];

  for (const file of candidates) {
    if (!file.startsWith(root)) continue;
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": types[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    } catch {
      // try the next candidate
    }
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(port, () => console.log(`static server on http://localhost:${port}/`));
