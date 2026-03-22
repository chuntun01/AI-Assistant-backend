import {
  Injectable, NotFoundException, ForbiddenException, Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DocumentPermission, DocumentPermissionDocument, PermissionLevel } from "./document-permission.schema";
import { DocumentModel, DocumentDocument } from "./document.schema";
import { User, UserDocument } from "../auth/user.schema";

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    @InjectModel(DocumentPermission.name)
    private readonly permModel: Model<DocumentPermissionDocument>,
    @InjectModel(DocumentModel.name)
    private readonly docModel: Model<DocumentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async hasAccess(
    docId: string,
    userId: string,
    role: string,
    requiredLevel: PermissionLevel = "view",
  ): Promise<boolean> {
    if (role === "admin") return true;

    const doc = await this.docModel.findById(docId).lean();
    if (!doc) return false;

    if (doc.uploadedBy.toString() === userId) return true;
    if (doc.visibility === "public" && requiredLevel === "view") return true;

    const perm = await this.permModel.findOne({
      documentId: new Types.ObjectId(docId),
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).lean();

    if (!perm) return false;
    if (requiredLevel === "view") return true;
    if (requiredLevel === "edit") return perm.level === "edit";
    return false;
  }

  async grantPermission(
    docId: string,
    targetUserId: string,
    grantorId: string,
    grantorRole: string,
    level: PermissionLevel = "view",
  ): Promise<DocumentPermissionDocument> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");

    if (grantorRole !== "admin" && doc.uploadedBy.toString() !== grantorId) {
      throw new ForbiddenException("Only admin or document owner can grant permissions");
    }

    const targetUser = await this.userModel.findById(targetUserId);
    if (!targetUser) throw new NotFoundException("Target user not found");

    if (targetUserId === grantorId) {
      throw new ForbiddenException("Cannot grant permission to yourself");
    }

    const perm = await this.permModel.findOneAndUpdate(
      { documentId: new Types.ObjectId(docId), userId: new Types.ObjectId(targetUserId) },
      { grantedBy: new Types.ObjectId(grantorId), level, isActive: true },
      { upsert: true, new: true },
    );

    this.logger.log(`Permission granted: doc=${docId} user=${targetUserId} level=${level}`);
    return perm;
  }

  async revokePermission(
    docId: string,
    targetUserId: string,
    revokerId: string,
    revokerRole: string,
  ): Promise<void> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");

    if (revokerRole !== "admin" && doc.uploadedBy.toString() !== revokerId) {
      throw new ForbiddenException("Only admin or document owner can revoke permissions");
    }

    const result = await this.permModel.deleteOne({
      documentId: new Types.ObjectId(docId),
      userId: new Types.ObjectId(targetUserId),
    });

    if (!result.deletedCount) throw new NotFoundException("Permission not found");
    this.logger.log(`Permission revoked: doc=${docId} user=${targetUserId}`);
  }

  async getDocumentPermissions(docId: string, requestorId: string, requestorRole: string) {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");

    if (requestorRole !== "admin" && doc.uploadedBy.toString() !== requestorId) {
      throw new ForbiddenException("Only admin or document owner can view permissions");
    }

    return this.permModel
      .find({ documentId: new Types.ObjectId(docId) })
      .populate("userId", "email name role")
      .populate("grantedBy", "email name")
      .lean();
  }

  async getAccessibleDocIds(userId: string): Promise<string[]> {
    const perms = await this.permModel.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).select("documentId").lean();
    return perms.map(p => p.documentId.toString());
  }

  async getUserPermissions(targetUserId: string) {
    return this.permModel
      .find({ userId: new Types.ObjectId(targetUserId) })
      .populate("documentId", "originalName status visibility")
      .populate("grantedBy", "email name")
      .lean();
  }
}