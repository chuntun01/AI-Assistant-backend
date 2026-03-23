import {Module, forwardRef} from "@nestjs/common";
import {MongooseModule} from "@nestjs/mongoose";
import {ChatController} from "./chat.controller";
import {ChatService} from "./chat.service";
import {EmbeddingService} from "./embedding.service";
import {VectorSearchService} from "./vector-search.service";
import {ChatSession, ChatSessionSchema} from "./chat.schema";
import {DocumentModel, DocumentSchema} from "../documents/document.schema";
import {
  DocumentPermission,
  DocumentPermissionSchema,
} from "../documents/document-permission.schema";
import {User, UserSchema} from "../auth/user.schema";
import {Role, RoleSchema} from "../auth/role.schema";
import {DocumentsModule} from "../documents/documents.module";
import {PermissionService} from "../documents/permission.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      {name: ChatSession.name, schema: ChatSessionSchema},
      {name: DocumentModel.name, schema: DocumentSchema},
      {name: DocumentPermission.name, schema: DocumentPermissionSchema},
      {name: User.name, schema: UserSchema},
      {name: Role.name, schema: RoleSchema},
    ]),
    forwardRef(() => DocumentsModule),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    EmbeddingService,
    VectorSearchService,
    PermissionService,
  ],
  exports: [ChatService, EmbeddingService],
})
export class ChatModule {}
