import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // Nullable voi Google OAuth user (chua co password)
  @Prop({ default: null })
  password: string | null;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ["admin", "user"], default: "user" })
  role: "admin" | "user";

  @Prop({ type: Types.ObjectId, ref: "Role", default: null })
  customRoleId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  // Google OAuth
  @Prop({ default: null })
  googleId: string | null;

  @Prop({ default: null })
  avatar: string | null;

  // Reset password
  @Prop({ default: null })
  resetPasswordToken: string | null;

  @Prop({ default: null })
  resetPasswordExpires: Date | null;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ googleId: 1 });
UserSchema.index({ resetPasswordToken: 1 });