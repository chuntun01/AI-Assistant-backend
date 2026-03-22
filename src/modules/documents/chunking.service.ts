import { Injectable, Logger } from "@nestjs/common";
import * as pdfParse from "pdf-parse";

export interface Chunk {
  index: number;
  content: string;
  page?: number;
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  // Chunk tu buffer (Cloudinary tra ve buffer)
  async chunkBuffer(buffer: Buffer, mimeType: string, options: ChunkOptions = {}): Promise<Chunk[]> {
    const { chunkSize = 500, overlap = 50 } = options;
    try {
      if (mimeType === "application/pdf") {
        return await this.chunkPdfBuffer(buffer, chunkSize, overlap);
      } else if (mimeType === "text/plain") {
        const text = buffer.toString("utf-8");
        return this.chunkText(text, chunkSize, overlap);
      }
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    } catch (error) {
      this.logger.error(`Chunking failed: ${error.message}`);
      throw error;
    }
  }

  private async chunkPdfBuffer(buffer: Buffer, chunkSize: number, overlap: number): Promise<Chunk[]> {
    const pdfData = await pdfParse(buffer);
    this.logger.log(`PDF parsed: ${pdfData.numpages} pages, ~${pdfData.text.length} chars`);

    const pageTexts = pdfData.text.split(/\f/);
    const allChunks: Chunk[] = [];
    let globalIndex = 0;

    for (let pageNum = 0; pageNum < pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum].trim();
      if (!pageText) continue;
      const pageChunks = this.splitByTokens(pageText, chunkSize, overlap);
      for (const content of pageChunks) {
        if (content.trim()) {
          allChunks.push({ index: globalIndex++, content: content.trim(), page: pageNum + 1 });
        }
      }
    }

    this.logger.log(`PDF chunked into ${allChunks.length} chunks`);
    return allChunks;
  }

  private chunkText(text: string, chunkSize: number, overlap: number): Chunk[] {
    this.logger.log(`TXT: ~${text.length} chars`);
    const segments = this.splitByTokens(text, chunkSize, overlap);
    return segments.filter(s => s.trim()).map((content, index) => ({ index, content: content.trim() }));
  }

  private splitByTokens(text: string, chunkSize: number, overlap: number): string[] {
    const estimateTokens = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunks: string[] = [];
    let currentChunk = "";
    let currentTokens = 0;

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);
      if (paraTokens > chunkSize) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        currentChunk = ""; currentTokens = 0;
        for (const sentence of sentences) {
          const sTokens = estimateTokens(sentence);
          if (currentTokens + sTokens > chunkSize && currentChunk) {
            chunks.push(currentChunk.trim());
            const words = currentChunk.split(/\s+/);
            currentChunk = words.slice(-overlap).join(" ") + " ";
            currentTokens = overlap;
          }
          currentChunk += sentence + " ";
          currentTokens += sTokens;
        }
        continue;
      }
      if (currentTokens + paraTokens > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(/\s+/);
        currentChunk = words.slice(-overlap).join(" ") + "\n\n";
        currentTokens = overlap;
      }
      currentChunk += para + "\n\n";
      currentTokens += paraTokens;
    }

    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  }
}