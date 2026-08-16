import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { validateImportedFile } from "../media/file-policy.js";

export type PdfTextResult = { text: string; pages: number };
export type PdfTextParser = (data: Uint8Array) => Promise<PdfTextResult>;

const MAX_PAGES = 500;
const MAX_TEXT_BYTES = 2_000_000;

const defaultParser: PdfTextParser = async (data) => {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return { text: result.text, pages: result.total };
  } finally {
    await parser.destroy();
  }
};

export const extractPdfText = async (
  pdfPath: string,
  allowedRoots: readonly string[],
  parser: PdfTextParser = defaultParser
): Promise<PdfTextResult> => {
  const file = await validateImportedFile(pdfPath, allowedRoots, "pdf");
  const data = await readFile(file.path);
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
