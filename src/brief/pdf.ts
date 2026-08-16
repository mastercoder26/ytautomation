import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readImportedFile } from "../media/file-policy.js";
import { runProcess } from "../media/process.js";

export type PdfTextResult = { text: string; pages: number };
export type PdfTextParser = (data: Uint8Array) => Promise<PdfTextResult>;

const MAX_PAGES = 500;
const MAX_TEXT_BYTES = 2_000_000;

const defaultParser: PdfTextParser = async (data) => {
  const compiledWorkerPath = fileURLToPath(new URL("./pdf-worker.js", import.meta.url));
  const sourceWorkerPath = fileURLToPath(new URL("./pdf-worker.ts", import.meta.url));
  const usingCompiledWorker = await access(compiledWorkerPath).then(
    () => true,
    () => false
  );
  const workerPath = usingCompiledWorker ? compiledWorkerPath : sourceWorkerPath;
  const moduleRoot = resolve(dirname(workerPath), "..");
  const packageRoot = resolve(moduleRoot, "..");
  const nodeModules = resolve(packageRoot, "node_modules");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!usingCompiledWorker && nodeMajor < 22) {
    throw new Error("The restricted PDF worker requires npm run build on Node.js 20");
  }
  const permissionFlag = nodeMajor >= 22 ? "--permission" : "--experimental-permission";
  const result = await runProcess(
    process.execPath,
    [
      permissionFlag,
      "--allow-addons",
      `--allow-fs-read=${moduleRoot}`,
      `--allow-fs-read=${nodeModules}`,
      `--allow-fs-read=${resolve(packageRoot, "package.json")}`,
      ...(usingCompiledWorker ? [] : ["--experimental-strip-types"]),
      workerPath
    ],
    {
      timeoutMs: 30_000,
      maxOutputBytes: MAX_TEXT_BYTES + 100_000,
      stdin: data,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_NO_WARNINGS: "1",
        TSX_DISABLE_CACHE: "1"
      }
    }
  );
  return JSON.parse(result.stdout) as PdfTextResult;
};

export const extractPdfText = async (
  pdfPath: string,
  allowedRoots: readonly string[],
  parser: PdfTextParser = defaultParser
): Promise<PdfTextResult> => {
  const { data } = await readImportedFile(pdfPath, allowedRoots, "pdf");
  if (data.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("File is not a valid PDF");

  const result = await parser(data);
  if (!Number.isInteger(result.pages) || result.pages < 1 || result.pages > MAX_PAGES) {
    throw new Error(`PDF page limit exceeded (maximum ${MAX_PAGES})`);
  }
  if (!result.text.trim()) throw new Error("PDF contains no extractable text");
  if (Buffer.byteLength(result.text, "utf8") > MAX_TEXT_BYTES) {
    throw new Error("Extracted PDF text exceeds the configured limit");
  }
  return { text: result.text, pages: result.pages };
};
