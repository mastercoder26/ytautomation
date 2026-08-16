import { PDFParse } from "pdf-parse";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk));
}

const parser = new PDFParse({ data: Buffer.concat(chunks) });
try {
  const result = await parser.getText();
  process.stdout.write(JSON.stringify({ text: result.text, pages: result.total }));
} finally {
  await parser.destroy();
}
