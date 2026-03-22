import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document as MongoDocument, Types } from "mongoose";

export class DocumentChunk {
  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  content: string;

  @Prop()
  page?: number;

  @Prop({ type: [Number] })
  embedding?: number[];

  @Prop({ default: false })
  isEmbedded: boolean;
}

@Schema({ timestamps: true })
export class DocumentModel {
  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  fileSize: number;

  // URL tren Cloudinary (thay cho storagePath local)
  @Prop({ default: "" })
  fileUrl: string;

  // Cloudinary public_id de xoa file
  @Prop({ default: "" })
  cloudinaryPublicId: string;

  // Giu lai storagePath de backward compatible (co the bo sau)
  @Prop({ default: "" })
  storagePath: string;

  @Prop({ required: true })
  totalChunks: number;

  @Prop({ type: [DocumentChunk], default: [] })
  chunks: DocumentChunk[];

  @Prop({
    type: String,
    enum: ["pending", "processing", "ready", "failed"],
    default: "pending",
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ type: String, enum: ["private", "public"], default: "private" })
  visibility: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: "User" }], default: [] })
  sharedWith: Types.ObjectId[];

  @Prop()
  errorMessage?: string;
}

export type DocumentDocument = DocumentModel & MongoDocument;
export const DocumentSchema = SchemaFactory.createForClass(DocumentModel);

DocumentSchema.index({ uploadedBy: 1, createdAt: -1 });
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ visibility: 1 });