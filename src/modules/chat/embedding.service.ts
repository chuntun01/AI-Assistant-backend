import {Injectable, Logger} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import OpenAI from "openai";

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly openai: OpenAI;

  static readonly VECTOR_DIM = 1536;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>("OPENAI_API_KEY"),
      baseURL:
        this.config.get<string>("OPENAI_BASE_URL") ||
        "https://api.openai.com/v1",
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3001",
        "X-Title": "AI IAM Assistant",
      },
    });
  }

  async embedText(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model:
        this.config.get<string>("EMBED_MODEL") || "text-embedding-3-sma  ll",
      input: text.replace(/\n/g, " "),
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[], batchSize = 20): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts
        .slice(i, i + batchSize)
        .map((t) => t.replace(/\n/g, " "));
      this.logger.log(
        `Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} texts)`,
      );
      const response = await this.openai.embeddings.create({
        model:
          this.config.get<string>("EMBED_MODEL") || "text-embedding-3-small",
        input: batch,
      });
      const sorted = response.data.sort((a, b) => a.index - b.index);
      results.push(...sorted.map((d) => d.embedding));
      if (i + batchSize < texts.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return results;
  }

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
