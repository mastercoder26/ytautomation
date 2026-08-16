import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReport } from "./store.js";

const contentTypeFor = (path: string): string =>
  path.endsWith(".css") ? "text/css; charset=utf-8" : path.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";

export const serveReport = async (input: {
  dataRoot: string;
  reportId: string;
  port?: number;
  uiRoot?: string;
}): Promise<{ url: string; close: () => Promise<void> }> => {
  const report = await loadReport(input.dataRoot, input.reportId);
  const uiRoot = input.uiRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../ui/report-viewer");
  const server: Server = createServer(async (request, response) => {
    try {
      if (request.url === "/report.json") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify(report));
        return;
      }
      if (request.url === "/" || request.url === "/index.html" || request.url === "/styles.css" || request.url === "/app.js") {
        const file = request.url === "/styles.css" ? "styles.css" : request.url === "/app.js" ? "app.js" : "index.html";
        response.writeHead(200, {
          "Content-Type": contentTypeFor(file),
          "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
          "Cache-Control": "no-store"
        });
        response.end(await readFile(resolve(uiRoot, file)));
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load report");
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(input.port ?? 0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Report server did not bind a loopback port");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  };
};
