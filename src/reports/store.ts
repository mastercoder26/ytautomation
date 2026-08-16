import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { campaignReadinessReportSchema, type CampaignReadinessReport } from "../domain/report-schema.js";

const reportIdSchema = z.string().regex(/^bp-[A-Z0-9]{6,20}$/);
const MAX_REPORT_BYTES = 5_000_000;

const unsignedReportSchema = z
  .object({
    version: z.literal(1),
    reportId: reportIdSchema,
    reviewId: z.string().regex(/^bp-review-[A-Z0-9]{4,20}$/),
    report: campaignReadinessReportSchema,
    limitations: z.array(z.string().trim().min(1).max(2_000)).max(200),
    createdAt: z.string().datetime()
  })
  .strict();

const signedReportSchema = unsignedReportSchema.extend({
  signature: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

type UnsignedReport = z.infer<typeof unsignedReportSchema>;
export type SavedReport = z.infer<typeof signedReportSchema>;

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== "" && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`);
};

const ensureReportsRoot = async (dataRoot: string): Promise<string> => {
  const root = resolve(dataRoot, "reports");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Report root must be a real directory");
  return realpath(root);
};

const readBoundedNoFollow = async (path: string): Promise<Buffer> => {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_REPORT_BYTES) throw new Error("Report exceeds its size limit");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
};

const loadOrCreateKey = async (root: string): Promise<Buffer> => {
  const path = join(root, ".report-key");
  try {
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    const key = randomBytes(32);
    try {
      await handle.writeFile(key);
    } finally {
      await handle.close();
    }
    return key;
  } catch (error) {
    if (!(error instanceof Error) || !/EEXIST/.test(error.message)) throw error;
    const key = await readBoundedNoFollow(path);
    if (key.length !== 32) throw new Error("Report signing key is invalid");
    return key;
  }
};

const sign = (report: UnsignedReport, key: Buffer): string =>
  createHmac("sha256", key).update(JSON.stringify(report)).digest("hex");

const newReportId = (): string => `bp-${randomBytes(6).toString("hex").toUpperCase()}`;

export const writeReport = async (
  dataRoot: string,
  input: Omit<UnsignedReport, "version" | "reportId" | "createdAt">
): Promise<{ reportId: string; reportPath: string }> => {
  const root = await ensureReportsRoot(dataRoot);
  const reportId = newReportId();
  const directory = join(root, reportId);
  await mkdir(directory, { mode: 0o700 });
  const canonicalDirectory = await realpath(directory);
  if (!isWithin(canonicalDirectory, root)) throw new Error("Report target is outside the report root");
  const unsigned = unsignedReportSchema.parse({
    ...input,
    version: 1,
    reportId,
    createdAt: new Date().toISOString()
  });
  const value = { ...unsigned, signature: sign(unsigned, await loadOrCreateKey(root)) };
  const serialized = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(serialized, "utf8") > MAX_REPORT_BYTES) {
    throw new Error("Report exceeds its size limit");
  }
  const reportPath = join(canonicalDirectory, "report.json");
  await writeFile(reportPath, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { reportId, reportPath };
};

export const loadReport = async (dataRoot: string, reportId: string): Promise<SavedReport> => {
  const parsedId = reportIdSchema.parse(reportId);
  const root = await ensureReportsRoot(dataRoot);
  const directory = resolve(root, parsedId);
  const stats = await lstat(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Report target must be a real directory");
  const canonicalDirectory = await realpath(directory);
  if (!isWithin(canonicalDirectory, root)) throw new Error("Report target is outside the report root");
  const parsed = signedReportSchema.parse(JSON.parse((await readBoundedNoFollow(join(canonicalDirectory, "report.json"))).toString("utf8")));
  if (parsed.reportId !== parsedId) throw new Error("Report identifier mismatch");
  const { signature, ...unsigned } = parsed;
  const expected = sign(unsigned, await loadOrCreateKey(root));
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    throw new Error("Report signature is invalid");
  }
  return parsed;
};
