import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DocumentModel, DocumentDocument } from "../../modules/documents/document.schema";

@Injectable()
export class DocumentAccessGuard implements CanActivate {
  constructor(
    @InjectModel(DocumentModel.name)
    private readonly docModel: Model<DocumentDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req  = context.switchToHttp().getRequest();
    const user = req.user;
    const docId = req.params.id || req.params.docId || req.body?.docIds?.[0];

    if (!docId) return true;

    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");

    if (user.role === "admin") return true;
    if (doc.uploadedBy.toString() === user.id) return true;
    if (doc.visibility === "public") return true;
    if (doc.sharedWith.some((id: Types.ObjectId) => id.toString() === user.id)) return true;

    throw new ForbiddenException("You do not have access to this document");
  }
}