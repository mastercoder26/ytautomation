import { lstat, realpath } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const EXTENSIONS = {
  video: new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]),
  pdf: new Set([".pdf"])
};
const MAX_BYTES = { video: 5_000_000_000, pdf: 50_000_000 } as const;

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
};

export const validateImportedFile = async (
  inputPath: string,
  allowedRoots: readonly string[],
  kind: keyof typeof EXTENSIONS
): Promise<{ path: string; size: number; extension: string }> => {
  if (inputPath.includes("\0")) throw new Error("File path contains a NUL byte");
  if (allowedRoots.length === 0) throw new Error("At least one allowed root is required");

  const requestedPath = resolve(inputPath);
  const requestedStats = await lstat(requestedPath);
  if (requestedStats.isSymbolicLink()) throw new Error("Imported files cannot be symbolic links");
  if (!requestedStats.isFile()) throw new Error("Imported path must be a regular file");

  const canonicalPath = await realpath(requestedPath);
  const canonicalRoots = await Promise.all(allowedRoots.map((root) => realpath(resolve(root))));
  if (!canonicalRoots.some((root) => isWithin(canonicalPath, root))) {
    throw new Error("Imported file is outside allowed roots");
  }

  const extension = extname(canonicalPath).toLowerCase();
  if (!EXTENSIONS[kind].has(extension)) throw new Error(`Unsupported ${kind} extension: ${extension}`);
  if (requestedStats.size > MAX_BYTES[kind]) throw new Error(`${kind} exceeds the configured size limit`);

  return { path: requestedPath, size: requestedStats.size, extension };
};
