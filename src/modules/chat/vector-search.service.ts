import {Injectable, Logger} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {Model, Types} from "mongoose";
import {DocumentModel, DocumentDocument} from "../documents/document.schema";
import {EmbeddingService} from "./embedding.service";
import {PermissionService} from "../documents/permission.service";

export interface SearchResult {
  docId: string;
  docName: string;
  chunkIndex: number;
  content: string;
  page?: number;
  score: number;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @InjectModel(DocumentModel.name)
    private readonly docModel: Model<DocumentDocument>,
    private readonly embeddingService: EmbeddingService,
    private readonly permissionService: PermissionService,
  ) {}

  async search(
    query: string,
    userId: string,
    role: string,
    options: {topK?: number; minScore?: number; docIds?: string[]} = {},
  ): Promise<SearchResult[]> {
    const {topK = 5, minScore = 0.1, docIds} = options;

    this.logger.log(
      `Searching: "${query.substring(0, 60)}..." [role: ${role}]`,
    );
    const queryVector = await this.embeddingService.embedText(query);

    let accessFilter: any;

    if (role === "admin") {
      accessFilter = {status: "ready"};
    } else {
      // Lay docIds tu bang DocumentPermission
      const grantedDocIds =
        await this.permissionService.getAccessibleDocIds(userId);
      this.logger.log(`GrantedDocIds: ${JSON.stringify(grantedDocIds)}`);

      accessFilter = {
        status: "ready",
        $or: [
          {uploadedBy: new Types.ObjectId(userId)},
          {visibility: "public"},
          ...(grantedDocIds.length
            ? [{_id: {$in: grantedDocIds.map((id) => new Types.ObjectId(id))}}]
            : []),
        ],
      };
    }

    if (docIds?.length) {
      accessFilter._id = {$in: docIds.map((id) => new Types.ObjectId(id))};
    }

    const documents = await this.docModel
      .find(accessFilter)
      .select("originalName chunks")
      .lean();

    this.logger.log(`Accessible documents: ${documents.length}`);
    if (!documents.length) return [];

    const allResults: SearchResult[] = [];
    for (const doc of documents) {
      for (const chunk of doc.chunks) {
        if (!chunk.embedding?.length) continue;
        const score = this.embeddingService.cosineSimilarity(
          queryVector,
          chunk.embedding,
        );
        if (score >= minScore) {
          allResults.push({
            docId: doc._id.toString(),
            docName: doc.originalName,
            chunkIndex: chunk.index,
            content: chunk.content,
            page: chunk.page,
            score,
          });
        }
      }
    }

    const topResults = allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    this.logger.log(`Found ${topResults.length} relevant chunks`);
    return topResults;
  }

  buildContext(results: SearchResult[]): string {
    if (!results.length)
      return "Khong tim thay thong tin lien quan trong tai lieu.";
    return results
      .map((r, i) => {
        const source = r.page
          ? `[${r.docName} - trang ${r.page}]`
          : `[${r.docName}]`;
        return `--- Doan ${i + 1} ${source}\n${r.content}`;
      })
      .join("\n\n");
  }
}
