import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { writeFile, mkdir } from "fs/promises";
import { join, extname, isAbsolute, resolve, normalize } from "path";
import { existsSync } from "fs";
import { homedir } from "os";

const PORT = 8081;
const DEFAULT_TMP_DIR = "tmp";

const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];

const app = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: "http://localhost:3002",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  )
  .get("/", () => "Hello Elysia")
  .post("/upload", async (context) => {
    try {
      const formData = await context.request.formData();
      const folderName = formData.get("folderName") as string | null;
      const fileName = formData.get("fileName") as string | null;
      const file = formData.get("file") as File | null;
      const destinationPath =
        (formData.get("destinationPath") as string | null) || DEFAULT_TMP_DIR;

      if (!folderName || !fileName || !file) {
        return {
          success: false,
          error: "Missing required fields: folderName, fileName, or file",
        };
      }

      const fileExtension = extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
        return {
          success: false,
          error: `Invalid file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
        };
      }

      const sanitizedFolderName = folderName.replace(/[^a-zA-Z0-9_-]/g, "");
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

      if (
        !sanitizedFolderName ||
        !sanitizedFileName ||
        !resolvedDestinationPath
      ) {
        return {
          success: false,
          error: "Invalid folder, file name, or destination path",
        };
      }

      const targetDir = join(resolvedDestinationPath, sanitizedFolderName);
      const targetPath = join(targetDir, sanitizedFileName);

      // Check if destination is the tmp folder
      const tmpBasePath = resolve(process.cwd(), DEFAULT_TMP_DIR);
      const isDestinationTmp = resolvedDestinationPath === tmpBasePath;

      let tmpPath: string | null = null;
      let tmpDir: string | null = null;

      if (!isDestinationTmp) {
        // Use tmp folder for staging only if destination is not tmp
        tmpDir = join(process.cwd(), DEFAULT_TMP_DIR, sanitizedFolderName);
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
  .listen(PORT);

console.log(`🦊 Elysia is running on port ${PORT}`);
