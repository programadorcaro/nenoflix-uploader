import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { writeFile, mkdir, readdir } from "fs/promises";
import { join, extname, isAbsolute, resolve, normalize } from "path";
import { existsSync, statSync } from "fs";
import { homedir } from "os";

const PORT = 8081;
const DEFAULT_TMP_DIR = "tmp";

const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];

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

      // Handle destination path - support absolute paths and ~ expansion
      let resolvedDestinationPath = destinationPath.trim();

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
        if (!existsSync(tmpDir)) {
          await mkdir(tmpDir, { recursive: true });
        }
      }

      // Create final destination directory
      if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (tmpPath && !isDestinationTmp) {
        // Write to temporary location first, then move
        await writeFile(tmpPath, buffer);
        const { rename } = await import("fs/promises");
        await rename(tmpPath, targetPath);

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
