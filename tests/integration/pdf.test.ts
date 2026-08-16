import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "../../src/brief/pdf.js";

const buildMinimalPdf = (text: string): Buffer => {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body, "latin1");
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const rows = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `xref\n0 6\n0000000000 65535 f \n${rows}`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

describe("local PDF extraction", () => {
  it("extracts a local PDF without requiring Docker", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-pdf-worker-"));
    const path = join(root, "brief.pdf");
    await writeFile(path, buildMinimalPdf("Sponsored by Acme"));
    await expect(extractPdfText(path, [root])).resolves.toMatchObject({
      text: expect.stringContaining("Sponsored by Acme"),
      pages: 1
    });
  });
});
