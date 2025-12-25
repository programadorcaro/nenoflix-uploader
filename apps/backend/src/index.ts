import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { writeFile, mkdir, readdir, copyFile, unlink } from "fs/promises";
import { join, extname, isAbsolute, resolve, normalize, dirname } from "path";
import { existsSync, statSync, accessSync, constants } from "fs";
import { homedir, userInfo } from "os";

const PORT = 8081;
const DEFAULT_TMP_DIR = "tmp";

const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];

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
      const sanitizedFolderName = folderName
        ? folderName.replace(/[^a-zA-Z0-9_-]/g, "")
        : "";

      const fileExtension = extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
        return {
          success: false,
          error: `Invalid file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
        };
      }
      let sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");

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
