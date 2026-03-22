import {
  Controller, Post, Get, Delete, Param, Body,
  Request, Res, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { IsString, IsOptional, IsArray, IsNumber } from "class-validator";
import { ChatService } from "./chat.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { Roles } from "../../common/guards/roles.decorator";
import { PermissionGuard, RequirePermission } from "../../common/guards/permission.guard";

class ChatDto {
  @IsString() question: string;
  @IsOptional() @IsString()  sessionId?: string;
  @IsOptional() @IsArray()   docIds?: string[];
  @IsOptional() @IsNumber()  topK?: number;
}

@ApiTags("Chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // Chat â€” can chat:use
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard, PermissionGuard)
  @RequirePermission("chat:use")
  async chat(@Body() dto: ChatDto, @Request() req: any, @Res() res: Response) {
    await this.chatService.chat(
      dto.sessionId || null, dto.question,
      req.user.id, req.user.role, res,
      { docIds: dto.docIds, topK: dto.topK },
    );
  }

  @Post("embed/:docId")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async embedDocument(@Param("docId") docId: string) {
    return { success: true, ...(await this.chatService.embedDocument(docId)) };
  }

  @Get("sessions")
  async getSessions(@Request() req: any) {
    return { success: true, data: await this.chatService.getSessions(req.user.id, req.user.role) };
  }

  @Get("sessions/:id")
  async getSession(@Param("id") id: string, @Request() req: any) {
    return { success: true, data: await this.chatService.getSession(id, req.user.id, req.user.role) };
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param("id") id: string, @Request() req: any) {
    await this.chatService.deleteSession(id, req.user.id, req.user.role);
  }

  @Get("admin/sessions")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async getAllSessions(@Request() req: any) {
    return { success: true, data: await this.chatService.getSessions(req.user.id, "admin") };
  }
}