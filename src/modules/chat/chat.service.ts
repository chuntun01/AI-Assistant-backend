import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import OpenAI from "openai";
import { ChatSession, ChatSessionDocument } from "./chat.schema";
import { VectorSearchService } from "./vector-search.service";
import { DocumentModel, DocumentDocument } from "../documents/document.schema";
import { EmbeddingService } from "./embedding.service";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectModel(ChatSession.name) private readonly sessionModel: Model<ChatSessionDocument>,
    @InjectModel(DocumentModel.name) private readonly docModel: Model<DocumentDocument>,
    private readonly vectorSearch: VectorSearchService,
    private readonly embeddingService: EmbeddingService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey:  this.config.get<string>("OPENAI_API_KEY"),
      baseURL: this.config.get<string>("OPENAI_BASE_URL") || "https://api.openai.com/v1",
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3001",
        "X-Title":      "AI IAM Assistant",
      },
    });
  }

  async embedDocument(docId: string): Promise<{ embedded: number }> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException("Document not found");

    const unembedded = doc.chunks.filter(c => !c.isEmbedded);
    if (!unembedded.length) {
      this.logger.log(`Doc ${docId}: all chunks already embedded`);
      return { embedded: 0 };
    }

    this.logger.log(`Embedding ${unembedded.length} chunks for doc ${docId}`);
    await this.docModel.findByIdAndUpdate(docId, { status: "processing" });

    const vectors = await this.embeddingService.embedBatch(unembedded.map(c => c.content));

    const bulkOps = unembedded.map((chunk, i) => ({
      updateOne: {
        filter: { _id: doc._id, "chunks.index": chunk.index },
        update: { $set: { "chunks.$.embedding": vectors[i], "chunks.$.isEmbedded": true } },
      },
    }));

    await this.docModel.bulkWrite(bulkOps);
    await this.docModel.findByIdAndUpdate(docId, { status: "ready" });
    this.logger.log(`Doc ${docId}: embedding complete (${unembedded.length} chunks)`);
    return { embedded: unembedded.length };
  }

  async chat(
    sessionId: string | null,
    question: string,
    userId: string,
    role: string,
    res: Response,
    options: { docIds?: string[]; topK?: number } = {},
  ): Promise<void> {
    let session = sessionId
      ? await this.sessionModel.findOne({ _id: sessionId, userId: new Types.ObjectId(userId) })
      : null;

    if (!session) {
      session = await this.sessionModel.create({
        title: question.substring(0, 60),
        userId: new Types.ObjectId(userId),
        messages: [],
        linkedDocIds: [],
      });
    }

    const searchResults = await this.vectorSearch.search(question, userId, role, {
      topK: options.topK || 5,
      docIds: options.docIds,
    });
    const context = this.vectorSearch.buildContext(searchResults);

    const systemPrompt = `Ban la AI Assistant giup nguoi dung tim hieu thong tin tu tai lieu.
NGUYEN TAC:
- Chi tra loi dua tren CONTEXT ben duoi
- Neu khong co thong tin, hay noi "Toi khong tim thay thong tin nay trong tai lieu"
- Tra loi bang ngon ngu cua cau hoi (Vietnamese hoac English)
- Trich dan nguon khi co the

CONTEXT:
${context}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...session.messages.slice(-10).map(m => ({ role: m.role as "user"|"assistant", content: m.content })),
      { role: "user", content: question },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ type: "session", sessionId: session._id })}\n\n`);

    let fullAnswer = "";

    try {
      const stream = await this.openai.chat.completions.create({
        model:       this.config.get<string>("LLM_MODEL") || "gpt-4o-mini",
        messages,
        stream:      true,
        temperature: 0.3,
        max_tokens:  1000,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullAnswer += delta;
          res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
        }
      }

      const sources = searchResults.map(r => ({
        docId: r.docId, docName: r.docName, page: r.page,
        score: Math.round(r.score * 100) / 100,
      }));
      res.write(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (err) {
      this.logger.error(`OpenAI error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
    } finally {
      res.end();
    }

    const sources = searchResults.map(r => ({ docId: r.docId, docName: r.docName, page: r.page, score: r.score }));
    session.messages.push(
      { role: "user",      content: question,   sources: [], createdAt: new Date() },
      { role: "assistant", content: fullAnswer, sources,     createdAt: new Date() },
    );
    for (const id of [...new Set(searchResults.map(r => r.docId))]) {
      if (!session.linkedDocIds.some(d => d.toString() === id)) {
        session.linkedDocIds.push(new Types.ObjectId(id));
      }
    }
    await session.save();
  }

  async getSessions(userId: string, role: string): Promise<any[]> {
    const query = role === "admin" ? {} : { userId: new Types.ObjectId(userId) };
    return this.sessionModel.find(query)
      .select("title userId createdAt updatedAt linkedDocIds")
      .sort({ updatedAt: -1 }).lean();
  }

  async getSession(sessionId: string, userId: string, role: string): Promise<ChatSessionDocument> {
    const query = role === "admin" ? { _id: sessionId } : { _id: sessionId, userId: new Types.ObjectId(userId) };
    const session = await this.sessionModel.findOne(query);
    if (!session) throw new NotFoundException("Chat session not found");
    return session;
  }

  async deleteSession(sessionId: string, userId: string, role: string): Promise<void> {
    const query = role === "admin" ? { _id: sessionId } : { _id: sessionId, userId: new Types.ObjectId(userId) };
    const result = await this.sessionModel.deleteOne(query);
    if (!result.deletedCount) throw new NotFoundException("Session not found");
  }
}