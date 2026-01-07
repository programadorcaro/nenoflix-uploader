export interface EpisodeInfo {
  season: number | null;
  episode: number | null;
}

// Extrai temporada e episódio do nome do arquivo
export function extractEpisodeInfo(fileName: string): EpisodeInfo {
  // Remove extensão do arquivo
  const lastDotIndex = fileName.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;

  // Verifica se o nome é apenas um número (ex: "13.mp4" -> "13")
  const trimmedName = nameWithoutExt.trim();
  if (/^\d+$/.test(trimmedName)) {
    return {
      season: 1,
      episode: parseInt(trimmedName, 10),
    };
  }

  const normalized = fileName.toUpperCase();

  // Padrões comuns: S01E01, S1E1, 1x01, 1x1, Ep01, Episode 01, etc.
  const patterns = [
    /S(\d+)E(\d+)/i, // S01E01, S1E1
    /(\d+)X(\d+)/i, // 1x01, 01x01
    /EPISODE\s*(\d+)/i, // Episode 01, EPISODE 1
    /EP\s*(\d+)/i, // Ep01, EP 1
    /(\d+)\s*-\s*(\d+)/i, // 01 - 01 (temporada - episódio)
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      if (
        pattern.source.includes("S") &&
        pattern.source.includes("E") &&
        match[2]
      ) {
        // Formato S01E01
        return {
          season: parseInt(match[1], 10),
          episode: parseInt(match[2], 10),
        };
      } else if (pattern.source.includes("X") && match[2]) {
        // Formato 1x01
        return {
          season: parseInt(match[1], 10),
          episode: parseInt(match[2], 10),
        };
      } else if (
        pattern.source.includes("EPISODE") ||
        pattern.source.includes("EP")
      ) {
        // Apenas episódio, assume temporada 1
        return {
          season: 1,
          episode: parseInt(match[1], 10),
        };
      } else if (pattern.source.includes("-") && match[2]) {
        // Formato 01 - 01
        return {
          season: parseInt(match[1], 10),
          episode: parseInt(match[2], 10),
        };
      }
    }
  }

  return { season: null, episode: null };
}

// Gera nome sugerido no formato {nomedapasta} - SXXEXX
export function generateSuggestedName(
  folderName: string,
  originalFileName: string,
  index: number = 0
): string {
  const episodeInfo = extractEpisodeInfo(originalFileName);

  if (episodeInfo.season !== null && episodeInfo.episode !== null) {
    // Formato com temporada e episódio extraídos
    const season = episodeInfo.season.toString().padStart(2, "0");
    const episode = episodeInfo.episode.toString().padStart(2, "0");
    return `${folderName} - S${season}E${episode}`;
  } else {
    // Formato padrão com índice (se não conseguir extrair)
    const episode = (index + 1).toString().padStart(2, "0");
    return `${folderName} - S01E${episode}`;
  }
}





