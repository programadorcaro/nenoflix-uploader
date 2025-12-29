import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { writeFile, mkdir, readdir, copyFile, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { join, extname, isAbsolute, resolve, normalize, dirname } from "path";
import { existsSync, statSync, accessSync, constants } from "fs";
import { homedir, userInfo } from "os";
import { randomUUID } from "crypto";
import { uploadManager } from "./upload-manager.js";
import { writeChunk, validateFileIntegrity } from "./chunk-handler.js";

const PORT = 8098;
const DEFAULT_TMP_DIR = "tmp";
const MAX_CHUNK_SIZE = 200 * 1024 * 1024; // 200MB maximum (permite chunks maiores para arquivos grandes)

const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];

function calculateOptimalChunkSize(totalSize: number): number {
  // Configuração adaptativa baseada no tamanho do arquivo
  // Para arquivos pequenos: mais chunks (melhor paralelização)
  // Para arquivos grandes: menos chunks (menos overhead)

  let targetChunks: number;
  let minChunkSize: number;

  if (totalSize < 500 * 1024 * 1024) {
    // Arquivos pequenos (< 500MB): 20 chunks, mínimo 10MB
    targetChunks = 20;
    minChunkSize = 10 * 1024 * 1024;
  } else if (totalSize < 5 * 1024 * 1024 * 1024) {
    // Arquivos médios (500MB - 5GB): 50 chunks, mínimo 50MB
    targetChunks = 50;
    minChunkSize = 50 * 1024 * 1024;
  } else {
    // Arquivos grandes (> 5GB): 100 chunks, mínimo 50MB
    targetChunks = 100;
    minChunkSize = 50 * 1024 * 1024;
  }

  const idealChunkSize = Math.floor(totalSize / targetChunks);

  if (idealChunkSize < minChunkSize) {
    return minChunkSize;
  }

  if (idealChunkSize > MAX_CHUNK_SIZE) {
    return MAX_CHUNK_SIZE;
  }

  // Round to nearest MB for cleaner numbers
  return Math.floor(idealChunkSize / (1024 * 1024)) * 1024 * 1024;
}

// Helper function to expand environment variables in paths
function expandEnvVars(path: string): string {
  // Expand $HOME or ${HOME}
  path = path.replace(/\$HOME|\$\{HOME\}/g, homedir());

  // Expand $USER or ${USER}
  const username = userInfo().username;
  path = path.replace(/\$USER|\$\{USER\}/g, username);

  // Expand any other environment variables
  path = path.replace(
    /\$\{([^}]+)\}|\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (match, braced, unbraced) => {
      const varName = braced || unbraced;
      const value = process.env[varName];
      return value || match; // Return original if variable not found
    }
  );

  return path;
}

// Helper function to move files, handling cross-device scenarios
async function moveFile(source: string, destination: string): Promise<void> {
  try {
    const { rename } = await import("fs/promises");
    await rename(source, destination);
  } catch (error: any) {
    // If rename fails due to cross-device link (EXDEV), use copy + unlink
    if (error.code === "EXDEV") {
      await copyFile(source, destination);
      await unlink(source);
    } else {
      throw error;
    }
  }
}

// Helper function to safely create directories, checking parent permissions
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (existsSync(dirPath)) {
    // Check if it's actually a directory
    const stats = statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${dirPath}`);
    }
    return;
  }

  // Check if parent directory exists and is writable
  const parentDir = dirname(dirPath);

  // Don't try to create root directory itself
  if (parentDir === dirPath) {
    throw new Error(
      `Cannot create root directory: ${dirPath}. ` +
        `Please ensure the directory path is valid.`
    );
  }

  // Special handling for root-level directories (like /mnt)
  if (parentDir === "/") {
    // Don't check write permissions on / as it may be read-only (EROFS)
    // Just try to create the directory directly
    try {
      await mkdir(dirPath, { recursive: false });
      return;
    } catch (error: any) {
      if (error.code === "EACCES" || error.code === "EPERM") {
        throw new Error(
          `Permission denied: Cannot create directory ${dirPath}. ` +
            `Please ensure you have permissions to create directories in ${parentDir}. ` +
            `You may need to run: sudo mkdir -p ${dirPath} && sudo chown $USER:$USER ${dirPath}`
        );
      } else if (error.code === "EROFS") {
        throw new Error(
          `Read-only file system: Cannot create directory ${dirPath}. ` +
            `The root filesystem (/) is mounted as read-only. ` +
            `Please ensure ${dirPath} exists before running the application, or remount the filesystem as read-write. ` +
            `You may need to run: sudo mkdir -p ${dirPath} && sudo chown $USER:$USER ${dirPath}`
        );
      } else if (error.code === "ENOENT") {
        throw new Error(
          `Parent directory does not exist: ${parentDir}. ` +
            `Please ensure the parent directory exists before creating ${dirPath}.`
        );
      }
      throw error;
    }
  }

  if (!existsSync(parentDir)) {
    // Check if parent is a root-level directory (like /mnt)
    // If so, don't try to create it as it may be on a read-only filesystem
    const parentParentDir = dirname(parentDir);
    if (parentParentDir === "/") {
      // Parent is a root-level directory that doesn't exist
      // Don't try to create it, just return a clear error
      throw new Error(
        `Parent directory does not exist: ${parentDir}. ` +
          `This directory is on the root filesystem which may be read-only. ` +
          `Please create it manually before running the application: ` +
          `sudo mkdir -p ${parentDir} && sudo chown $USER:$USER ${parentDir}`
      );
    }
    // Recursively ensure parent exists first (for non-root-level directories)
    await ensureDirectoryExists(parentDir);
  } else {
    // Check if parent is writable (skip for root directory as it may be read-only)
    try {
      accessSync(parentDir, constants.W_OK);
    } catch (error: any) {
      // Handle read-only filesystem error
      if (error.code === "EROFS") {
        // If parent is read-only, check if it's a root-level directory
        // If so, we can still try to create subdirectories (they might be on a different mount)
        const parentParentDir = dirname(parentDir);
        if (parentParentDir === "/") {
          // Parent is a root-level directory that's read-only
          // We can still try to create the child directory (it might be on a different filesystem)
          // The mkdir below will fail with a clearer error if it can't create
        } else {
          throw new Error(
            `Read-only file system: Cannot create directory in ${parentDir}. ` +
              `The filesystem is mounted as read-only. ` +
              `Please ensure ${dirPath} exists before running the application.`
          );
        }
      } else {
        throw new Error(
          `Permission denied: Cannot create directory in ${parentDir}. ` +
            `Please ensure the parent directory exists and is writable. ` +
            `You may need to run: sudo chmod 755 ${parentDir} or check ownership. ` +
            `Original error: ${error.message}`
        );
      }
    }
  }

  // Now create the directory
  try {
    await mkdir(dirPath, { recursive: false });
  } catch (error: any) {
    if (error.code === "EEXIST") {
      // Directory was created by another process, verify it exists
      if (!existsSync(dirPath)) {
        throw error;
      }
    } else if (error.code === "EACCES" || error.code === "EPERM") {
      throw new Error(
        `Permission denied: Cannot create directory ${dirPath}. ` +
          `Please check permissions on parent directory ${parentDir}.`
      );
    } else if (error.code === "EROFS") {
      throw new Error(
        `Read-only file system: Cannot create directory ${dirPath}. ` +
          `The filesystem containing ${parentDir} is mounted as read-only. ` +
          `Please ensure ${dirPath} exists before running the application, or remount the filesystem as read-write. ` +
          `You may need to run: sudo mkdir -p ${dirPath} && sudo chown $USER:$USER ${dirPath}`
      );
    } else if (error.code === "ENOENT") {
      throw new Error(
        `Parent directory does not exist: ${parentDir}. ` +
          `Please ensure the parent directory exists before creating ${dirPath}.`
      );
    } else {
      throw error;
    }
  }
}

function sanitizeFileName(fileName: string): string {
  // Remove apenas caracteres perigosos para sistema de arquivos
  // Permite: letras, números, espaços, pontos, underscores, hífens
  // Remove: /, \, :, *, ?, ", <, >, |, e caracteres de controle
  return fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
}

function sanitizeFolderName(folderName: string | null): string {
  if (!folderName) return "";
  // Remove apenas caracteres perigosos para sistema de arquivos
  // Permite: letras, números, espaços, underscores, hífens
  // Remove: /, \, :, *, ?, ", <, >, |, ., e caracteres de controle
  return folderName.replace(/[<>:"/\\|?*.\x00-\x1F]/g, "").trim();
}

function resolveDestinationPath(destinationPath: string): string {
  let resolved = destinationPath.trim();
  resolved = expandEnvVars(resolved);

  if (resolved.startsWith("~/")) {
    resolved = join(homedir(), resolved.slice(2));
  } else if (resolved === "~") {
    resolved = homedir();
  } else if (isAbsolute(resolved)) {
    resolved = normalize(resolved);
  } else {
    resolved = resolve(process.cwd(), resolved);
  }

  return normalize(resolved);
}

function buildTargetPath(
  destinationPath: string,
  folderName: string,
  fileName: string
): { targetDir: string; targetPath: string } {
  const targetDir = folderName
    ? join(destinationPath, folderName)
    : destinationPath;
  const targetPath = join(targetDir, fileName);
  return { targetDir, targetPath };
}

const app = new Elysia({ adapter: node() })
  .use(
    cors({
      // TODO: Change to the frontend URL
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  )
  .get("/", () => "Hello Elysia")
  .get("/folders", async (context) => {
    try {
      const path = (context.query.path as string) || "";

      if (!path) {
        return {
          success: false,
          error: "Path parameter is required",
        };
      }

      let resolvedPath = path.trim();

      // Expand environment variables first (e.g., $HOME, $USER)
      resolvedPath = expandEnvVars(resolvedPath);

      if (resolvedPath.startsWith("~/")) {
        resolvedPath = join(homedir(), resolvedPath.slice(2));
      } else if (resolvedPath === "~") {
        resolvedPath = homedir();
      } else if (isAbsolute(resolvedPath)) {
        resolvedPath = normalize(resolvedPath);
      } else {
        resolvedPath = resolve(process.cwd(), resolvedPath);
      }

      resolvedPath = normalize(resolvedPath);

      if (!existsSync(resolvedPath)) {
        return {
          success: true,
          folders: [],
        };
      }

      const entries = await readdir(resolvedPath);
      const folders = entries.filter((entry) => {
        const entryPath = join(resolvedPath, entry);
        try {
          return statSync(entryPath).isDirectory();
        } catch {
          return false;
        }
      });

      return {
        success: true,
        folders: folders.sort(),
      };
    } catch (error) {
      console.error("List folders error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .post("/upload/init", async (context) => {
    try {
      const body = (await context.request.json()) as {
        fileName?: string;
        folderName?: string | null;
        destinationPath?: string;
        totalSize?: number;
        chunkSize?: number;
        originalFileName?: string;
      };
      const {
        fileName,
        folderName,
        destinationPath,
        totalSize,
        chunkSize,
        originalFileName,
      } = body;

      if (!totalSize || totalSize <= 0) {
        return {
          success: false,
          error: "Invalid totalSize",
        };
      }

      const optimalChunkSize =
        chunkSize || calculateOptimalChunkSize(totalSize);

      if (!fileName || !totalSize) {
        return {
          success: false,
          error: "Missing required fields: fileName, totalSize",
        };
      }

      const sanitizedFolderName = sanitizeFolderName(folderName ?? null);

      // Get extension from original file name if provided, otherwise from fileName
      const originalExtension = originalFileName
        ? extname(originalFileName).toLowerCase()
        : extname(fileName).toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(originalExtension)) {
        return {
          success: false,
          error: `Invalid file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
        };
      }

      let sanitizedFileName = sanitizeFileName(fileName);
      // Always append the original extension to ensure file has extension
      if (!sanitizedFileName.toLowerCase().endsWith(originalExtension)) {
        sanitizedFileName = sanitizedFileName + originalExtension;
      }

      const resolvedDestinationPath = resolveDestinationPath(
        destinationPath || DEFAULT_TMP_DIR
      );
      const { targetDir, targetPath } = buildTargetPath(
        resolvedDestinationPath,
        sanitizedFolderName,
        sanitizedFileName
      );

      await ensureDirectoryExists(targetDir);

      const uploadId = randomUUID();
      const tempFilePath = join(
        process.cwd(),
        DEFAULT_TMP_DIR,
        `upload_${uploadId}_${sanitizedFileName}`
      );

      await ensureDirectoryExists(dirname(tempFilePath));

      const session = uploadManager.createSession(
        uploadId,
        sanitizedFileName,
        sanitizedFolderName,
        resolvedDestinationPath,
        totalSize,
        optimalChunkSize,
        tempFilePath
      );

      return {
        success: true,
        uploadId: session.uploadId,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
      };
    } catch (error) {
      console.error("Upload init error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .post("/upload/chunk", async (context) => {
    try {
      const formData = await context.request.formData();
      const uploadId = formData.get("uploadId") as string | null;
      const chunkIndexStr = formData.get("chunkIndex") as string | null;
      const chunkData = formData.get("chunk") as File | null;

      if (!uploadId || chunkIndexStr === null || !chunkData) {
        return {
          success: false,
          error: "Missing required fields: uploadId, chunkIndex, chunk",
        };
      }

      const chunkIndex = parseInt(chunkIndexStr, 10);
      if (isNaN(chunkIndex) || chunkIndex < 0) {
        return {
          success: false,
          error: "Invalid chunkIndex",
        };
      }

      const session = uploadManager.getSession(uploadId);
      if (!session) {
        return {
          success: false,
          error: "Upload session not found",
        };
      }

      if (session.receivedChunks.has(chunkIndex)) {
        return {
          success: true,
          chunkIndex,
          message: "Chunk already received",
        };
      }

      const chunkStream = chunkData.stream();
      const result = await writeChunk(session, chunkIndex, chunkStream);

      if (result.success) {
        uploadManager.markChunkReceived(uploadId, chunkIndex);
      }

      return {
        success: result.success,
        chunkIndex: result.chunkIndex,
        bytesWritten: result.bytesWritten,
        error: result.error,
      };
    } catch (error) {
      console.error("Chunk upload error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .post("/upload/complete", async (context) => {
    try {
      const body = (await context.request.json()) as {
        uploadId?: string;
      };
      const { uploadId } = body;

      if (!uploadId) {
        return {
          success: false,
          error: "Missing required field: uploadId",
        };
      }

      const session = uploadManager.getSession(uploadId);
      if (!session) {
        return {
          success: false,
          error: "Upload session not found",
        };
      }

      if (!uploadManager.isComplete(uploadId)) {
        const status = uploadManager.getSessionStatus(uploadId);
        return {
          success: false,
          error: "Upload not complete",
          missingChunks: status?.missingChunks || [],
        };
      }

      const { targetDir, targetPath } = buildTargetPath(
        session.destinationPath,
        session.folderName,
        session.fileName
      );

      await ensureDirectoryExists(targetDir);

      const tmpBasePath = resolve(process.cwd(), DEFAULT_TMP_DIR);
      const isDestinationTmp = session.destinationPath === tmpBasePath;

      // Validate integrity before moving
      const integrity = await validateFileIntegrity(session);
      if (!integrity.valid) {
        console.error(
          `File integrity check failed. Expected: ${integrity.expectedSize}, Got: ${integrity.actualSize}`
        );
        return {
          success: false,
          error: `File size mismatch. Expected: ${integrity.expectedSize}, Got: ${integrity.actualSize}`,
        };
      }

      // If destination is tmp and paths match, no need to move
      if (isDestinationTmp && session.tempFilePath === targetPath) {
        // File is already in the right place
      } else {
        // Use streaming copy for large files instead of move
        // This is more reliable for cross-device scenarios
        try {
          const { createReadStream } = await import("fs");
          const { pipeline } = await import("stream/promises");
          const readStream = createReadStream(session.tempFilePath);
          const writeStream = createWriteStream(targetPath);

          await pipeline(readStream, writeStream);

          // Delete temp file after successful copy
          await unlink(session.tempFilePath).catch(() => {
            // Ignore if already deleted
          });
        } catch (error: any) {
          console.error("Streaming copy failed, falling back to move:", error);
          // Fallback to moveFile if copy fails
          if (error.code !== "ENOENT") {
            await moveFile(session.tempFilePath, targetPath);
          }
        }
      }

      // Always clean up temp file if it still exists (in case of errors or edge cases)
      try {
        if (existsSync(session.tempFilePath)) {
          await unlink(session.tempFilePath).catch(() => {
            // Ignore if already deleted
          });
        }
      } catch {
        // Ignore cleanup errors
      }

      // Clean up temp directory if empty (only for this user's upload)
      try {
        const tempDir = dirname(session.tempFilePath);
        if (existsSync(tempDir) && tempDir !== tmpBasePath) {
          const entries = await readdir(tempDir);
          if (entries.length === 0) {
            const { rmdir } = await import("fs/promises");
            await rmdir(tempDir).catch(() => {
              // Ignore if directory not empty or other error
            });
          }
        }

        // Also try to remove base tmp directory if empty (only if no other uploads)
        if (existsSync(tmpBasePath)) {
          const baseEntries = await readdir(tmpBasePath);
          if (baseEntries.length === 0) {
            const { rmdir } = await import("fs/promises");
            await rmdir(tmpBasePath).catch(() => {
              // Ignore if directory not empty or other error
            });
          }
        }
      } catch {
        // Ignore cleanup errors
      }

      uploadManager.deleteSession(uploadId);

      // Delay de 10 segundos para aliviar stress do HD antes do próximo upload
      await new Promise((resolve) => setTimeout(resolve, 10000));

      return {
        success: true,
        message: "File uploaded successfully",
        path: targetPath,
      };
    } catch (error) {
      console.error("Upload complete error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .get("/upload/status/:uploadId", async (context) => {
    try {
      const uploadId = context.params.uploadId;
      const status = uploadManager.getSessionStatus(uploadId);

      if (!status) {
        return {
          success: false,
          error: "Upload session not found",
        };
      }

      return {
        success: true,
        ...status,
      };
    } catch (error) {
      console.error("Upload status error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .post("/upload", async (context) => {
    try {
      const formData = await context.request.formData();
      const folderName = formData.get("folderName") as string | null;
      const fileName = formData.get("fileName") as string | null;
      const file = formData.get("file") as File | null;
      const destinationPath =
        (formData.get("destinationPath") as string | null) || DEFAULT_TMP_DIR;

      if (!fileName || !file) {
        return {
          success: false,
          error: "Missing required fields: fileName or file",
        };
      }

      // folderName é opcional (usado apenas para séries/animes)
      const sanitizedFolderName = sanitizeFolderName(folderName ?? null);

      const fileExtension = extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
        return {
          success: false,
          error: `Invalid file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
        };
      }
      let sanitizedFileName = sanitizeFileName(fileName);

      // Add extension from original file if not present in fileName
      if (!sanitizedFileName.toLowerCase().endsWith(fileExtension)) {
        sanitizedFileName = sanitizedFileName + fileExtension;
      }

      // Handle destination path - support absolute paths, ~ expansion, and env vars
      let resolvedDestinationPath = destinationPath.trim();

      // Expand environment variables first (e.g., $HOME, $USER)
      resolvedDestinationPath = expandEnvVars(resolvedDestinationPath);

      // Expand ~ to home directory
      if (resolvedDestinationPath.startsWith("~/")) {
        resolvedDestinationPath = join(
          homedir(),
          resolvedDestinationPath.slice(2)
        );
      } else if (resolvedDestinationPath === "~") {
        resolvedDestinationPath = homedir();
      } else if (isAbsolute(resolvedDestinationPath)) {
        // Already absolute, normalize to resolve .. and .
        resolvedDestinationPath = normalize(resolvedDestinationPath);
      } else {
        // Relative path, resolve from process.cwd()
        resolvedDestinationPath = resolve(
          process.cwd(),
          resolvedDestinationPath
        );
      }

      // Normalize the path to prevent path traversal attacks
      resolvedDestinationPath = normalize(resolvedDestinationPath);

      if (!sanitizedFileName || !resolvedDestinationPath) {
        return {
          success: false,
          error: "Invalid file name or destination path",
        };
      }

      // Se folderName estiver vazio, arquivo vai direto no destinationPath
      // Caso contrário, cria pasta intermediária (para séries/animes)
      const targetDir = sanitizedFolderName
        ? join(resolvedDestinationPath, sanitizedFolderName)
        : resolvedDestinationPath;
      const targetPath = join(targetDir, sanitizedFileName);

      // Check if destination is the tmp folder
      const tmpBasePath = resolve(process.cwd(), DEFAULT_TMP_DIR);
      const isDestinationTmp = resolvedDestinationPath === tmpBasePath;

      let tmpPath: string | null = null;
      let tmpDir: string | null = null;

      if (!isDestinationTmp) {
        // Use tmp folder for staging only if destination is not tmp
        tmpDir = sanitizedFolderName
          ? join(process.cwd(), DEFAULT_TMP_DIR, sanitizedFolderName)
          : join(process.cwd(), DEFAULT_TMP_DIR);
        tmpPath = join(tmpDir, sanitizedFileName);

        // Create temporary directory for staging
        await ensureDirectoryExists(tmpDir);
      }

      // Create final destination directory
      await ensureDirectoryExists(targetDir);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (tmpPath && !isDestinationTmp) {
        // Write to temporary location first, then move
        await writeFile(tmpPath, buffer);
        await moveFile(tmpPath, targetPath);

        // Clean up: remove tmp directory if empty
        try {
          if (tmpDir && existsSync(tmpDir)) {
            const { readdir, rmdir } = await import("fs/promises");
            const entries = await readdir(tmpDir);
            // Only remove if directory is empty
            if (entries.length === 0) {
              await rmdir(tmpDir);
              // Also try to remove parent tmp directory if empty
              const tmpBaseDir = join(process.cwd(), DEFAULT_TMP_DIR);
              if (existsSync(tmpBaseDir)) {
                try {
                  const baseEntries = await readdir(tmpBaseDir);
                  if (baseEntries.length === 0) {
                    await rmdir(tmpBaseDir);
                  }
                } catch {
                  // Ignore if directory not empty or other error
                }
              }
            }
          }
        } catch {
          // Ignore cleanup errors
        }
      } else {
        // Write directly to final destination if destination is tmp
        await writeFile(targetPath, buffer);
      }

      return {
        success: true,
        message: "File uploaded successfully",
        path: targetPath,
      };
    } catch (error) {
      console.error("Upload error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .listen({
    port: PORT,
    hostname: "0.0.0.0",
  });

console.log(`🦊 Elysia is running on http://0.0.0.0:${PORT}`);
