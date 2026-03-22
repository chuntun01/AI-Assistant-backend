import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, trim: true })
  name: string;

  // System role: admin | user
  @Prop({ type: String, enum: ["admin", "user"], default: "user" })
  role: "admin" | "user";

  // Custom role do admin tao va gan (RBAC)
  @Prop({ type: Types.ObjectId, ref: "Role", default: null })
  customRoleId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });