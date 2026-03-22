import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type PermissionLevel = "view" | "edit";

@Schema({ timestamps: true })
export class DocumentPermission {
  @Prop({ type: Types.ObjectId, ref: "DocumentModel", required: true })
  documentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  grantedBy: Types.ObjectId;

  @Prop({ type: String, enum: ["view", "edit"], default: "view" })
  level: PermissionLevel;

  @Prop({ default: true })
  isActive: boolean;
}

export type DocumentPermissionDocument = DocumentPermission & Document;
export const DocumentPermissionSchema = SchemaFactory.createForClass(DocumentPermission);

DocumentPermissionSchema.index({ documentId: 1, userId: 1 }, { unique: true });
DocumentPermissionSchema.index({ userId: 1 });
DocumentPermissionSchema.index({ documentId: 1 });