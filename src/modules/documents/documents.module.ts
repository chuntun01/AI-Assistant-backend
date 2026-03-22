import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { ChunkingService } from "./chunking.service";
import { PermissionService } from "./permission.service";
import { DocumentModel, DocumentSchema } from "./document.schema";
import { DocumentPermission, DocumentPermissionSchema } from "./document-permission.schema";
import { User, UserSchema } from "../auth/user.schema";
import { Role, RoleSchema } from "../auth/role.schema";
import { ChatModule } from "../chat/chat.module";
import { CloudinaryService } from "../../common/services/cloudinary.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentModel.name,      schema: DocumentSchema           },
      { name: DocumentPermission.name, schema: DocumentPermissionSchema },
      { name: User.name,               schema: UserSchema               },
      { name: Role.name,               schema: RoleSchema               },
    ]),
    forwardRef(() => ChatModule),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, ChunkingService, PermissionService, CloudinaryService],
  exports: [DocumentsService, PermissionService],
})
export class DocumentsModule {}