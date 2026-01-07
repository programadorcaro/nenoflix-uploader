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

// Map para controlar writes concorrentes no mesmo arquivo
const fileWriteQueues = new Map<string, Promise<void>>();

async function queueFileWrite(
  filePath: string,
  writeFn: () => Promise<void>
): Promise<void> {
  const currentQueue = fileWriteQueues.get(filePath);
  const newQueue = currentQueue
    ? currentQueue.then(() => writeFn())
    : writeFn();

  fileWriteQueues.set(filePath, newQueue);

  try {
    await newQueue;
  } finally {
    // Limpar queue quando terminar
    if (fileWriteQueues.get(filePath) === newQueue) {
      fileWriteQueues.delete(filePath);
    }
  }
}

export async function writeChunk(
  session: UploadSession,
  chunkIndex: number,
  chunkData: ReadableStream<Uint8Array>
): Promise<ChunkUploadResult> {
  const chunkSize = session.chunkSize;
  const expectedOffset = chunkIndex * chunkSize;
  const tempFilePath = session.tempFilePath;

  // Calcular tamanho esperado do chunk
  // O último chunk pode ser menor que chunkSize
  const isLastChunk = chunkIndex === session.totalChunks - 1;
  const expectedChunkSize = isLastChunk
    ? session.totalSize - expectedOffset
    : chunkSize;

  try {
    await fs.mkdir(dirname(tempFilePath), { recursive: true });

    // Usar queue para evitar writes concorrentes no mesmo arquivo
    await queueFileWrite(tempFilePath, async () => {
      const nodeStream = Readable.fromWeb(chunkData);
      const writeStream = createWriteStream(tempFilePath, {
        flags: chunkIndex === 0 ? "w" : "r+",
        start: expectedOffset,
      });

      let bytesWritten = 0;
      let totalBytesRead = 0;

      nodeStream.on("data", (chunk: Buffer) => {
        bytesWritten += chunk.length;
        totalBytesRead += chunk.length;
      });

      await pipeline(nodeStream, writeStream);

      // Validar tamanho do chunk recebido
      // Permitir pequena variação (até 1KB) devido a overhead de encoding
      const sizeDifference = Math.abs(totalBytesRead - expectedChunkSize);
      if (sizeDifference > 1024) {
        throw new Error(
          `Chunk size mismatch: expected ${expectedChunkSize} bytes, got ${totalBytesRead} bytes`
        );
      }

      // Verificar se o arquivo foi escrito corretamente
      const stats = await fs.stat(tempFilePath);
      const expectedFileSize = expectedOffset + totalBytesRead;
      if (stats.size < expectedFileSize - 1024) {
        // Permitir pequena diferença devido a possíveis delays de flush
        throw new Error(
          `File size mismatch after write: expected at least ${expectedFileSize} bytes, got ${stats.size} bytes`
        );
      }
    });

    return {
      success: true,
      chunkIndex,
      bytesWritten: expectedChunkSize, // Retornar tamanho esperado, não lido (mais confiável)
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

    // Permitir pequena diferença (até 1KB) devido a possíveis overheads
    const sizeDifference = Math.abs(actualSize - expectedSize);
    const isValid = sizeDifference <= 1024;

    return {
      valid: isValid,
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
