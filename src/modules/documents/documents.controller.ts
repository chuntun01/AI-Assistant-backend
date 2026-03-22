import {
  Controller, Post, Get, Delete, Patch, Param, Body,
  UseInterceptors, UploadedFile, Request, UseGuards,
  HttpCode, HttpStatus, BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { IsString, IsIn, IsOptional } from "class-validator";
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";
import { PermissionService } from "./permission.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/guards/roles.decorator";
import { PermissionGuard, RequirePermission } from "../../common/guards/permission.guard";

class SetVisibilityDto {
  @IsString() @IsIn(["private", "public"])
  visibility: "private" | "public";
}

class GrantPermissionDto {
  @IsString() targetUserId: string;
  @IsOptional() @IsString() @IsIn(["view", "edit"])
  level?: "view" | "edit";
}

class RevokePermissionDto {
  @IsString() targetUserId: string;
}

// Dung memoryStorage thay diskStorage -> file luu vao RAM buffer
// sau do upload len Cloudinary, khong can thu muc uploads nua
const multerConfig = {
  storage: memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760"),
    fieldNameSize: 300,
  },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    // Fix encoding ten file tieng Viet
    file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
    ["application/pdf", "text/plain"].includes(file.mimetype)
      ? cb(null, true)
      : cb(new BadRequestException("Only PDF and TXT files are allowed"), false);
  },
};

@ApiTags("Documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly permissionService: PermissionService,
  ) {}

  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @UseInterceptors(FileInterceptor("file", multerConfig))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException("No file uploaded");
    const doc = await this.documentsService.uploadDocument(file, req.user.id);
    return {
      success: true,
      message: "File uploaded. Processing in background...",
      data: { id: doc._id, originalName: doc.originalName, fileSize: doc.fileSize, status: doc.status },
    };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:read")
  async listDocuments(@Request() req: any) {
    const docs = await this.documentsService.listAccessibleDocuments(req.user.id, req.user.role);
    return { success: true, data: docs };
  }

  @Get("admin/all")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async listAll() {
    return { success: true, data: await this.documentsService.listAllDocuments() };
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:read")
  async getDocument(@Param("id") id: string, @Request() req: any) {
    const doc = await this.documentsService.getDocumentWithAccess(id, req.user.id, req.user.role);
    return {
      success: true,
      data: {
        id: doc._id,
        originalName: doc.originalName,
        totalChunks: doc.totalChunks,
        status: doc.status,
        visibility: doc.visibility,
        fileUrl: doc.fileUrl,
        chunkPreview: doc.chunks.slice(0, 3).map(c => ({
          index: c.index,
          preview: c.content.substring(0, 200) + "...",
          page: c.page,
        })),
      },
    };
  }

  @Patch(":id/visibility")
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:write")
  async setVisibility(@Param("id") id: string, @Body() dto: SetVisibilityDto, @Request() req: any) {
    const doc = await this.documentsService.setVisibility(id, req.user.id, req.user.role, dto.visibility);
    return { success: true, data: doc };
  }

  @Post(":id/permissions/grant")
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:write")
  async grantPermission(@Param("id") id: string, @Body() dto: GrantPermissionDto, @Request() req: any) {
    const perm = await this.permissionService.grantPermission(
      id, dto.targetUserId, req.user.id, req.user.role, dto.level || "view",
    );
    return { success: true, message: `Permission "${perm.level}" granted`, data: perm };
  }

  @Post(":id/permissions/revoke")
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:write")
  async revokePermission(@Param("id") id: string, @Body() dto: RevokePermissionDto, @Request() req: any) {
    await this.permissionService.revokePermission(id, dto.targetUserId, req.user.id, req.user.role);
    return { success: true, message: "Permission revoked" };
  }

  @Get(":id/permissions")
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:read")
  async getPermissions(@Param("id") id: string, @Request() req: any) {
    const perms = await this.permissionService.getDocumentPermissions(id, req.user.id, req.user.role);
    return { success: true, data: perms };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionGuard)
  @RequirePermission("doc:delete")
  async deleteDocument(@Param("id") id: string, @Request() req: any) {
    await this.documentsService.deleteDocument(id, req.user.id, req.user.role);
  }
}