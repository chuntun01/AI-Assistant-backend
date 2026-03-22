import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

// Danh sach tat ca permissions co the co
export const ALL_PERMISSIONS = [
  "doc:read",    // xem tai lieu
  "doc:write",   // sua (visibility, share)
  "doc:delete",  // xoa
  "chat:use",    // su dung chat
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

@Schema({ timestamps: true })
export class Role {
  @Prop({ required: true, unique: true, trim: true })
  name: string;         // vd: "Viewer", "Editor", "Reviewer"

  @Prop()
  description?: string;

  @Prop({ type: [String], enum: ALL_PERMISSIONS, default: [] })
  permissions: Permission[];

  @Prop({ default: true })
  isActive: boolean;
}

export type RoleDocument = Role & Document;
export const RoleSchema = SchemaFactory.createForClass(Role);

// 2 role mac dinh se duoc seed khi server khoi dong
export const DEFAULT_ROLES = [
  {
    name: "Viewer",
    description: "Chi xem tai lieu va su dung chat",
    permissions: ["doc:read", "chat:use"] as Permission[],
  },
  {
    name: "Editor",
    description: "Xem, sua visibility, su dung chat",
    permissions: ["doc:read", "doc:write", "chat:use"] as Permission[],
  },
];