import { createWriteStream, promises as fs } from "fs";
import { dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { UploadSession } from "./upload-manager.js";

export interface ChunkUploadResult {
  success: boolean;
  chunkIndex: number;
  bytesWritten: number;
  error?: string;
}

export async function writeChunk(
  session: UploadSession,
  chunkIndex: number,
  chunkData: ReadableStream<Uint8Array>
): Promise<ChunkUploadResult> {
  const chunkSize = session.chunkSize;
  const expectedOffset = chunkIndex * chunkSize;
  const tempFilePath = session.tempFilePath;

  try {
    await fs.mkdir(dirname(tempFilePath), { recursive: true });

    const nodeStream = Readable.fromWeb(chunkData);
    const writeStream = createWriteStream(tempFilePath, {
      flags: chunkIndex === 0 ? "w" : "r+",
      start: expectedOffset,
    });

    let bytesWritten = 0;

    nodeStream.on("data", (chunk: Buffer) => {
      bytesWritten += chunk.length;
    });

    await pipeline(nodeStream, writeStream);

    return {
      success: true,
      chunkIndex,
      bytesWritten,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Error writing chunk ${chunkIndex}:`, errorMessage);

    return {
      success: false,
      chunkIndex,
      bytesWritten: 0,
      error: errorMessage,
    };
  }
}

export async function validateFileIntegrity(
  session: UploadSession
): Promise<{ valid: boolean; actualSize: number; expectedSize: number }> {
  try {
    const stats = await fs.stat(session.tempFilePath);
    const actualSize = stats.size;
    const expectedSize = session.totalSize;

    return {
      valid: actualSize === expectedSize,
      actualSize,
      expectedSize,
    };
  } catch (error) {
    console.error("Error validating file integrity:", error);
    return {
      valid: false,
      actualSize: 0,
      expectedSize: session.totalSize,
    };
  }
}

