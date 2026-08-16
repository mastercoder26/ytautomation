import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { reviewContextSchema, transcriptSegmentSchema, type ProcessingStatus, type ReviewContext } from "../domain/schemas.js";

const ARTIFACT_ID = /^job-[a-zA-Z0-9_-]{6,64}$/;
const MAX_MANIFEST_BYTES = 5_000_000;

const frameReferenceSchema = z.object({
  id: z.string().regex(/^frame-\d{4}$/),
  timestampMs: z.number().int().min(0).max(7_200_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

const unsignedManifestSchema = z
  .object({
    version: z.literal(1),
    artifactId: z.string().regex(ARTIFACT_ID),
    campaignId: z.string().trim().min(1).max(120),
    campaignDigest: z.string().regex(/^[a-f0-9]{64}$/),
    durationMs: z.number().int().positive().max(7_200_000),
    transcript: z.array(transcriptSegmentSchema).max(2_000),
    transcriptStatus: z.enum(["complete", "failed"]),
    visualStatus: z.enum(["complete", "failed"]),
    frameDigest: z.string().regex(/^[a-f0-9]{64}$/),
    frames: z.array(frameReferenceSchema).max(120).default([]),
    createdAt: z.string().datetime()
  })
  .strict();

const signedManifestSchema = unsignedManifestSchema.extend({
  signature: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

type UnsignedManifest = z.infer<typeof unsignedManifestSchema>;

const isWithin = (candidate: string, root: string): boolean => {
  const fromRoot = relative(root, candidate);
  return fromRoot !== "" && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
};

const ensureDataRoot = async (dataRoot: string): Promise<string> => {
  const resolved = resolve(dataRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const stats = await lstat(resolved);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Artifact root must be a real directory");
  return realpath(resolved);
};

const readBoundedNoFollow = async (path: string, maxBytes: number): Promise<Buffer> => {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > maxBytes) throw new Error("Artifact manifest exceeds its size limit");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
};

const loadOrCreateKey = async (root: string): Promise<Buffer> => {
  const keyPath = join(root, ".manifest-key");
  try {
    const handle = await open(keyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    const key = randomBytes(32);
    try {
      await handle.writeFile(key);
    } finally {
      await handle.close();
    }
    return key;
  } catch (error) {
    if (!(error instanceof Error) || !/EEXIST/.test(error.message)) throw error;
    const key = await readBoundedNoFollow(keyPath, 32);
    if (key.length !== 32) throw new Error("Artifact signing key is invalid");
    return key;
  }
};

const canonical = (manifest: UnsignedManifest): string => JSON.stringify(manifest);
const sign = (manifest: UnsignedManifest, key: Buffer): string =>
  createHmac("sha256", key).update(canonical(manifest)).digest("hex");

export const writeArtifactManifest = async (
  dataRoot: string,
  artifactRoot: string,
  input: Omit<UnsignedManifest, "version" | "createdAt" | "frames"> & { frames?: UnsignedManifest["frames"] }
): Promise<void> => {
  const root = await ensureDataRoot(dataRoot);
  const canonicalArtifact = await realpath(artifactRoot);
  if (!isWithin(canonicalArtifact, root)) throw new Error("Artifact target is outside the data root");
  const key = await loadOrCreateKey(root);
  const unsigned = unsignedManifestSchema.parse({ ...input, version: 1, createdAt: new Date().toISOString() });
  const value = { ...unsigned, signature: sign(unsigned, key) };
  await writeFile(join(canonicalArtifact, "review-manifest.json"), JSON.stringify(value), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
};

export const loadArtifactReview = async (
  dataRoot: string,
  artifactId: string,
  campaignId: string,
  campaignDigest: string
): Promise<{ reviewContext: ReviewContext; processing: ProcessingStatus; frameTimestamps: number[] }> => {
  if (!ARTIFACT_ID.test(artifactId)) throw new Error("Invalid artifact identifier");
  const root = await ensureDataRoot(dataRoot);
  const artifactRoot = resolve(root, artifactId);
  const stats = await lstat(artifactRoot);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Artifact target must be a real directory");
  const canonicalArtifact = await realpath(artifactRoot);
  if (!isWithin(canonicalArtifact, root)) throw new Error("Artifact target is outside the data root");
  const parsed = signedManifestSchema.parse(
    JSON.parse((await readBoundedNoFollow(join(canonicalArtifact, "review-manifest.json"), MAX_MANIFEST_BYTES)).toString("utf8"))
  );
  if (parsed.artifactId !== artifactId) throw new Error("Artifact manifest identifier mismatch");
  if (parsed.campaignId !== campaignId) throw new Error("Artifact manifest campaign mismatch");
  if (parsed.campaignDigest !== campaignDigest) throw new Error("Artifact manifest requirements mismatch");
  const { signature, ...unsigned } = parsed;
  const expected = sign(unsigned, await loadOrCreateKey(root));
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    throw new Error("Artifact manifest signature is invalid");
  }
  return {
    reviewContext: reviewContextSchema.parse({ durationMs: unsigned.durationMs, transcript: unsigned.transcript }),
    processing: {
      transcriptStatus: unsigned.transcriptStatus,
      visualStatus: unsigned.visualStatus,
      modelAnalysisStatus: "complete"
    },
    frameTimestamps: parsed.frames.map((frame) => frame.timestampMs)
  };
};
