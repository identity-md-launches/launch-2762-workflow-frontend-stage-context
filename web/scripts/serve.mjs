import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, extname, resolve } from "node:path";
export function serve() {
  const root = fileURLToPath(new URL("../../dist/", import.meta.url));
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ).replace(/^\/preview\/?/, "/");
      const file = resolve(join(root, path === "/" ? "index.html" : path));
      if (!file.startsWith(root)) throw Error("Invalid path");
      if (!(await stat(file)).isFile()) throw Error("Not a file");
      res.setHeader(
        "Content-Type",
        types[extname(file)] ?? "application/octet-stream",
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "0.0.0.0", () =>
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/preview/`,
      }),
    ),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve();
  console.log(url);
}
