import { lstat, realpath, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const ARTIFACT_ID = /^job-[a-zA-Z0-9_-]{6,64}$/;

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== "" && !pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..";
};

export const deleteArtifactDirectory = async (
  dataRoot: string,
  artifactId: string,
  confirmation: boolean
): Promise<{ deleted: string }> => {
  if (!confirmation) throw new Error("Artifact deletion requires explicit confirmation");
  if (!ARTIFACT_ID.test(artifactId)) throw new Error("Invalid artifact identifier");

  const rootPath = resolve(dataRoot);
  const rootStats = await lstat(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("Artifact root must be a real directory");
  }
  const canonicalRoot = await realpath(rootPath);
  const targetPath = resolve(canonicalRoot, artifactId);
  const targetStats = await lstat(targetPath);
  if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
    throw new Error("Artifact target must be a real directory");
  }
  const canonicalTarget = await realpath(targetPath);
  if (!isWithin(canonicalTarget, canonicalRoot)) throw new Error("Artifact target is outside the data root");

  await rm(canonicalTarget, { recursive: true });
  return { deleted: artifactId };
};
