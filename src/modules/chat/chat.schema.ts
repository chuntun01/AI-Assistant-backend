import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export class ChatMessage {
  @Prop({ enum: ["user", "assistant"], required: true })
  role: "user" | "assistant";

  @Prop({ required: true })
  content: string;

  @Prop({ type: [Object], default: [] })
  sources: Array<{ docId: string; docName: string; page?: number; score: number }>;

  @Prop({ default: Date.now })
  createdAt: Date;
}

@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ required: true })
  title: string;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ type: [ChatMessage], default: [] })
  messages: ChatMessage[];

  @Prop({ type: [{ type: Types.ObjectId, ref: "DocumentModel" }], default: [] })
  linkedDocIds: Types.ObjectId[];
}

export type ChatSessionDocument = ChatSession & Document;
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
ChatSessionSchema.index({ userId: 1, createdAt: -1 });