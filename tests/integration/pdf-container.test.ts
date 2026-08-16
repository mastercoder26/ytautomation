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
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

const enabled = process.env.BRANDPREFLIGHT_CONTAINER_SMOKE === "1";

describe.skipIf(!enabled)("PDF container smoke", () => {
  it("parses stdin with Linux-native dependencies baked into the image", async () => {
    const runtime = process.env.BRANDPREFLIGHT_MEDIA_RUNTIME;
    const image = process.env.BRANDPREFLIGHT_MEDIA_IMAGE;
    if ((runtime !== "docker" && runtime !== "podman") || !image) {
      throw new Error("Container smoke environment is incomplete");
    }
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-pdf-container-"));
    const path = join(root, "brief.pdf");
    await writeFile(path, buildMinimalPdf("Sponsored by Acme"));
    await expect(extractPdfText(path, [root], undefined, { runtime, image })).resolves.toMatchObject({
      pages: 1,
      text: expect.stringContaining("Sponsored by Acme")
    });
  });
});
