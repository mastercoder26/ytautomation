import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { campaignInputSchema, type CampaignInput } from "../domain/schemas.js";

export const reviewIdSchema = z.string().regex(/^bp-review-[A-Z0-9]{4,20}$/);
const MAX_SESSION_BYTES = 1_000_000;

const unsignedSessionSchema = z.object({
  version: z.literal(1),
  reviewId: reviewIdSchema,
  campaign: campaignInputSchema,
  artifactId: z.string().regex(/^job-[a-zA-Z0-9_-]{6,64}$/),
  createdAt: z.string().datetime()
}).strict();
const signedSessionSchema = unsignedSessionSchema.extend({ signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type UnsignedSession = z.infer<typeof unsignedSessionSchema>;
export type ReviewSession = z.infer<typeof signedSessionSchema>;

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== "" && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`);
};

const ensureRoot = async (dataRoot: string): Promise<string> => {
  const root = resolve(dataRoot, "reviews");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Review root must be a real directory");
  return realpath(root);
};

const readBounded = async (path: string): Promise<Buffer> => {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_SESSION_BYTES) throw new Error("Review session exceeds its size limit");
    return handle.readFile();
  } finally {
    await handle.close();
  }
};

const keyFor = async (root: string): Promise<Buffer> => {
  const path = join(root, ".review-key");
  try {
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    const key = randomBytes(32);
    try { await handle.writeFile(key); } finally { await handle.close(); }
    return key;
  } catch (error) {
    if (!(error instanceof Error) || !/EEXIST/.test(error.message)) throw error;
    const key = await readBounded(path);
    if (key.length !== 32) throw new Error("Review signing key is invalid");
    return key;
  }
};

const sign = (session: UnsignedSession, key: Buffer): string =>
  createHmac("sha256", key).update(JSON.stringify(session)).digest("hex");

const newReviewId = (): string => `bp-review-${randomBytes(5).toString("hex").toUpperCase()}`;

export const writeReviewSession = async (
  dataRoot: string,
  input: { campaign: CampaignInput; artifactId: string }
): Promise<ReviewSession> => {
  const root = await ensureRoot(dataRoot);
  const reviewId = newReviewId();
  const directory = join(root, reviewId);
  await mkdir(directory, { mode: 0o700 });
  const canonicalDirectory = await realpath(directory);
  if (!isWithin(canonicalDirectory, root)) throw new Error("Review target is outside the review root");
  const unsigned = unsignedSessionSchema.parse({ ...input, campaign: campaignInputSchema.parse(input.campaign), version: 1, reviewId, createdAt: new Date().toISOString() });
  const value = { ...unsigned, signature: sign(unsigned, await keyFor(root)) };
  await writeFile(join(canonicalDirectory, "session.json"), JSON.stringify(value), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return value;
};

export const loadReviewSession = async (dataRoot: string, reviewId: string): Promise<ReviewSession> => {
  const parsedId = reviewIdSchema.parse(reviewId);
  const root = await ensureRoot(dataRoot);
  const directory = resolve(root, parsedId);
  const stats = await lstat(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Review target must be a real directory");
  const canonicalDirectory = await realpath(directory);
  if (!isWithin(canonicalDirectory, root)) throw new Error("Review target is outside the review root");
  const session = signedSessionSchema.parse(JSON.parse((await readBounded(join(canonicalDirectory, "session.json"))).toString("utf8")));
  if (session.reviewId !== parsedId) throw new Error("Review identifier mismatch");
  const { signature, ...unsigned } = session;
  const expected = sign(unsigned, await keyFor(root));
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) throw new Error("Review session signature is invalid");
  return session;
};
