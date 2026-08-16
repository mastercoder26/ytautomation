import { constants } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const EXTENSIONS = {
  video: new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]),
  model: new Set([".bin", ".gguf"]),
  pdf: new Set([".pdf"]),
  text: new Set([".txt", ".md"]),
  json: new Set([".json"])
};
const MAX_BYTES = {
  video: 500_000_000,
  model: 2_000_000_000,
  pdf: 50_000_000,
  text: 500_000,
  json: 10_000_000
} as const;

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
};

export const validateImportedFile = async (
  inputPath: string,
  allowedRoots: readonly string[],
  kind: keyof typeof EXTENSIONS
): Promise<{ path: string; size: number; extension: string }> => {
  const opened = await openImportedFile(inputPath, allowedRoots, kind);
  try {
    return { path: opened.path, size: opened.size, extension: opened.extension };
  } finally {
    await opened.handle.close();
  }
};

type OpenedImportedFile = {
  handle: FileHandle;
  path: string;
  size: number;
  extension: string;
};

const openImportedFile = async (
  inputPath: string,
  allowedRoots: readonly string[],
  kind: keyof typeof EXTENSIONS
): Promise<OpenedImportedFile> => {
  if (inputPath.includes("\0")) throw new Error("File path contains a NUL byte");
  if (allowedRoots.length === 0) throw new Error("At least one allowed root is required");

  const requestedPath = resolve(inputPath);
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  let handle: FileHandle;
  try {
    handle = await open(requestedPath, constants.O_RDONLY | noFollow);
  } catch (error) {
    if (error instanceof Error && /symbolic link|ELOOP/i.test(error.message)) {
      throw new Error("Imported files cannot be symbolic links");
    }
    throw error;
  }

  try {
    const [stats, canonicalPath, canonicalRoots] = await Promise.all([
      handle.stat(),
      realpath(requestedPath),
      Promise.all(allowedRoots.map((root) => realpath(resolve(root))))
    ]);
    if (!stats.isFile()) throw new Error("Imported path must be a regular file");
    if (!canonicalRoots.some((root) => isWithin(canonicalPath, root))) {
      throw new Error("Imported file is outside allowed roots");
    }

    const extension = extname(canonicalPath).toLowerCase();
    if (!EXTENSIONS[kind].has(extension)) throw new Error(`Unsupported ${kind} extension: ${extension}`);
    if (stats.size > MAX_BYTES[kind]) throw new Error(`${kind} exceeds the configured size limit`);
    return { handle, path: canonicalPath, size: stats.size, extension };
  } catch (error) {
    await handle.close();
    throw error;
  }
};

export const readImportedFile = async (
  inputPath: string,
  allowedRoots: readonly string[],
  kind: keyof typeof EXTENSIONS
): Promise<{ data: Buffer; path: string; extension: string }> => {
  const opened = await openImportedFile(inputPath, allowedRoots, kind);
  try {
    return { data: await opened.handle.readFile(), path: opened.path, extension: opened.extension };
  } finally {
    await opened.handle.close();
  }
};

export const copyImportedFile = async (
  inputPath: string,
  allowedRoots: readonly string[],
  kind: keyof typeof EXTENSIONS,
  destinationPath: string
): Promise<{ path: string; size: number; extension: string }> => {
  const opened = await openImportedFile(inputPath, allowedRoots, kind);
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  let destination: FileHandle | undefined;
  try {
    destination = await open(
      destinationPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
      0o600
    );
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < opened.size) {
      const length = Math.min(buffer.length, opened.size - position);
      const { bytesRead } = await opened.handle.read(buffer, 0, length, position);
      if (bytesRead === 0) throw new Error("Imported file changed while it was being copied");
      await destination.write(buffer, 0, bytesRead, position);
      position += bytesRead;
    }
    return { path: destinationPath, size: opened.size, extension: opened.extension };
  } finally {
    await destination?.close();
    await opened.handle.close();
  }
};
