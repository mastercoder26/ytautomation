import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const approvalSchema = z
  .object({
    campaignId: z.string().min(1).max(120),
    campaignDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().positive()
  })
  .strict();
const TOKEN = /^[a-f0-9]{64}$/;

const approvalRoot = async (dataRoot: string): Promise<string> => {
  const root = resolve(dataRoot, "approvals");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Approval root must be a real directory");
  return realpath(root);
};

const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

export const issueShareApproval = async (
  dataRoot: string,
  campaignId: string,
  campaignDigest: string,
  ttlMs = 10 * 60_000
): Promise<{ approvalToken: string; expiresAt: string }> => {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ttlMs;
  const root = await approvalRoot(dataRoot);
  const approval = approvalSchema.parse({ campaignId, campaignDigest, expiresAt });
  await writeFile(join(root, `${tokenHash(token)}.json`), JSON.stringify(approval), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  return { approvalToken: token, expiresAt: new Date(expiresAt).toISOString() };
};

export const consumeShareApproval = async (
  dataRoot: string,
  campaignId: string,
  campaignDigest: string,
  token: string
): Promise<boolean> => {
  if (!TOKEN.test(token)) return false;
  const root = await approvalRoot(dataRoot);
  const path = join(root, `${tokenHash(token)}.json`);
  const claimedPath = `${path}.consuming`;
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  let handle;
  let claimed = false;
  try {
    await rename(path, claimedPath);
    claimed = true;
    handle = await open(claimedPath, constants.O_RDONLY | noFollow);
  } catch {
    if (claimed) await rm(claimedPath, { force: true });
    return false;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > 1_024) return false;
    const approval = approvalSchema.parse(JSON.parse((await handle.readFile()).toString("utf8")));
    const campaignMatches = timingSafeEqual(
      createHash("sha256").update(approval.campaignId).digest(),
      createHash("sha256").update(campaignId).digest()
    );
    const digestMatches = timingSafeEqual(
      Buffer.from(approval.campaignDigest, "hex"),
      Buffer.from(campaignDigest, "hex")
    );
    return campaignMatches && digestMatches && approval.expiresAt >= Date.now();
  } catch {
    return false;
  } finally {
    await handle.close();
    await rm(claimedPath, { force: true });
  }
};
