import {
  Injectable, BadRequestException, NotFoundException,
  ForbiddenException, Logger, Inject, forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DocumentModel, DocumentDocument } from "./document.schema";
import { ChunkingService } from "./chunking.service";
import { EmbeddingService } from "../chat/embedding.service";
import { PermissionService } from "./permission.service";
import { CloudinaryService } from "../../common/services/cloudinary.service";

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(DocumentModel.name)
    private readonly docModel: Model<DocumentDocument>,
    private readonly chunkingService: ChunkingService,
    @Inject(forwardRef(() => EmbeddingService))
    private readonly embeddingService: EmbeddingService,
    private readonly permissionService: PermissionService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async uploadDocument(file: Express.Multer.File, userId: string): Promise<DocumentDocument> {
    const originalName = file.originalname;
    this.logger.log(`Upload: "${originalName}" by user ${userId}`);

    const allowed = ["application/pdf", "text/plain"];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException("File type not supported. Allowed: PDF, TXT");
    }

    // Upload len Cloudinary tu buffer (file.buffer)
    this.logger.log(`Uploading to Cloudinary...`);
    const { url, publicId } = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      originalName,
      file.mimetype,
    );
    this.logger.log(`Cloudinary upload done: ${url}`);

    const doc = await this.docModel.create({
      fileName:            file.originalname,
      originalName,
      mimeType:            file.mimetype,
      fileSize:            file.size,
      fileUrl:             url,
      cloudinaryPublicId:  publicId,
      storagePath:         "", // khong con dung local
      totalChunks:         0,
      chunks:              [],
      status:              "pending",
      visibility:          "private",
      uploadedBy:          new Types.ObjectId(userId),
    });

    // Background: chunk + embed
    this.processDocument(doc._id.toString()).catch(err =>
      this.logger.error(`Background processing failed: ${err.message}`)
    );

    return doc;
  }

  async processDocument(docId: string): Promise<void> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");

    try {
      await this.docModel.findByIdAndUpdate(docId, { status: "processing" });
      this.logger.log(`Processing doc ${docId} (${doc.originalName})`);

      // Tai file tu Cloudinary URL ve buffer de xu ly
      this.logger.log(`Downloading from Cloudinary: ${doc.fileUrl}`);
      const buffer = await this.cloudinaryService.downloadToBuffer(doc.fileUrl);

      // Chunk tu buffer
      const chunks = await this.chunkingService.chunkBuffer(
        buffer,
        doc.mimeType,
        { chunkSize: 500, overlap: 50 },
      );

      await this.docModel.findByIdAndUpdate(docId, { chunks, totalChunks: chunks.length });
      this.logger.log(`Doc ${docId} chunked: ${chunks.length} chunks`);

      if (chunks.length > 0) {
        this.logger.log(`Auto-embedding ${chunks.length} chunks...`);
        const vectors = await this.embeddingService.embedBatch(chunks.map(c => c.content));
        const bulkOps = chunks.map((chunk, i) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(docId), "chunks.index": chunk.index },
            update: { $set: { "chunks.$.embedding": vectors[i], "chunks.$.isEmbedded": true } },
          },
        }));
        await this.docModel.bulkWrite(bulkOps);
        this.logger.log(`Doc ${docId} embedded: ${chunks.length} vectors`);
      }

      await this.docModel.findByIdAndUpdate(docId, { status: "ready" });
      this.logger.log(`Doc ${docId} READY`);
    } catch (error) {
      await this.docModel.findByIdAndUpdate(docId, {
        status: "failed",
        errorMessage: error.message,
      });
      this.logger.error(`Doc ${docId} failed: ${error.message}`);
      throw error;
    }
  }

  async listAccessibleDocuments(userId: string, role: string): Promise<any[]> {
    let query: any;
    if (role === "admin") {
      query = {};
    } else {
      const grantedDocIds = await this.permissionService.getAccessibleDocIds(userId);
      query = {
        $or: [
          { uploadedBy: new Types.ObjectId(userId) },
          { visibility: "public" },
          ...(grantedDocIds.length
            ? [{ _id: { $in: grantedDocIds.map(id => new Types.ObjectId(id)) } }]
            : []),
        ],
      };
    }
    return this.docModel.find(query)
      .select("-chunks")
      .populate("uploadedBy", "email name")
      .sort({ createdAt: -1 })
      .lean();
  }

  async getDocumentWithAccess(docId: string, userId: string, role: string): Promise<DocumentDocument> {
    const hasAccess = await this.permissionService.hasAccess(docId, userId, role, "view");
    if (!hasAccess) throw new ForbiddenException("You do not have access to this document");
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  async setVisibility(docId: string, userId: string, role: string, visibility: "private" | "public"): Promise<any> {
    const hasEdit = await this.permissionService.hasAccess(docId, userId, role, "edit");
    if (!hasEdit) throw new ForbiddenException("You do not have permission to edit this document");
    return this.docModel.findByIdAndUpdate(docId, { visibility }, { new: true }).select("-chunks");
  }

  async deleteDocument(docId: string, userId: string, role: string): Promise<void> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");
    if (role !== "admin" && doc.uploadedBy.toString() !== userId) {
      throw new ForbiddenException("Only the owner or admin can delete this document");
    }
    // Xoa tren Cloudinary
    if (doc.cloudinaryPublicId) {
      await this.cloudinaryService.deleteFile(doc.cloudinaryPublicId);
    }
    await this.docModel.findByIdAndDelete(docId);
    this.logger.log(`Deleted doc ${docId}`);
  }

  async listAllDocuments(): Promise<any[]> {
    return this.docModel.find()
      .select("-chunks")
      .populate("uploadedBy", "email name role")
      .sort({ createdAt: -1 })
      .lean();
  }
}