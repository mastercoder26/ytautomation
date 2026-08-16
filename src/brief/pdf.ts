import { PDFParse } from "pdf-parse";
import { buildPdfContainerInvocation, type MediaContainerConfig } from "../media/container.js";
import { readImportedFile } from "../media/file-policy.js";
import { runProcess } from "../media/process.js";

export type PdfTextResult = { text: string; pages: number };
export type PdfTextParser = (data: Uint8Array) => Promise<PdfTextResult>;

const MAX_PAGES = 500;
const MAX_TEXT_BYTES = 2_000_000;

const localParser: PdfTextParser = async (data) => {
  const parser = new PDFParse({ data: Buffer.from(data) });
  try {
    const result = await parser.getText();
    return { text: result.text, pages: result.total };
  } finally {
    await parser.destroy();
  }
};

const containerParser = async (
  data: Uint8Array,
  mediaContainer: MediaContainerConfig
): Promise<PdfTextResult> => {
  const restricted = buildPdfContainerInvocation(mediaContainer);
  const result = await runProcess(
    restricted.command,
    restricted.args,
    {
      timeoutMs: 30_000,
      maxOutputBytes: MAX_TEXT_BYTES + 100_000,
      stdin: data,
      terminationCleanup: restricted.terminationCleanup,
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
  parser?: PdfTextParser,
  mediaContainer?: MediaContainerConfig
): Promise<PdfTextResult> => {
  const { data } = await readImportedFile(pdfPath, allowedRoots, "pdf");
  if (data.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("File is not a valid PDF");

  const selectedParser = parser ?? (mediaContainer ? (input: Uint8Array) => containerParser(input, mediaContainer) : localParser);
  const result = await selectedParser(data);
  if (!Number.isInteger(result.pages) || result.pages < 1 || result.pages > MAX_PAGES) {
    throw new Error(`PDF page limit exceeded (maximum ${MAX_PAGES})`);
  }
  if (!result.text.trim()) throw new Error("PDF contains no extractable text");
  if (Buffer.byteLength(result.text, "utf8") > MAX_TEXT_BYTES) {
    throw new Error("Extracted PDF text exceeds the configured limit");
  }
  return { text: result.text, pages: result.pages };
};
