# fix-cloudinary-download.ps1
# Chay trong thu muc ai-iam-assistant-backend
# .\fix-cloudinary-download.ps1

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-File($relativePath, $content) {
    $full = Join-Path (Get-Location) $relativePath
    $dir  = Split-Path $full
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($full, $content, $utf8NoBom)
    Write-Host "  [OK] $relativePath" -ForegroundColor Green
}

Write-Host "Fix Cloudinary download..." -ForegroundColor Cyan

Write-File "src\common\services\cloudinary.service.ts" @'
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config(this.config.get<string>("CLOUDINARY_URL")!);
    this.logger.log("Cloudinary configured");
  }

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder:        "ai-iam-assistant/documents",
          resource_type: "raw",
          public_id:     `doc_${Date.now()}`,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({ url: result!.secure_url, publicId: result!.public_id });
        },
      );
      uploadStream.end(buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
      this.logger.log(`Deleted from Cloudinary: ${publicId}`);
    } catch (err) {
      this.logger.error(`Failed to delete: ${err.message}`);
    }
  }

  // Download file tu Cloudinary, tu dong follow redirect
  async downloadToBuffer(url: string): Promise<Buffer> {
    return this.fetchWithRedirect(url, 5);
  }

  private fetchWithRedirect(url: string, maxRedirects: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (maxRedirects <= 0) {
        return reject(new Error("Too many redirects"));
      }

      const isHttps = url.startsWith("https");
      const lib = isHttps ? require("https") : require("http");

      lib.get(url, (res: any) => {
        // Follow redirect 301/302/307/308
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const redirectUrl = res.headers["location"];
          if (!redirectUrl) return reject(new Error("Redirect with no location header"));
          this.logger.log(`Following redirect -> ${redirectUrl}`);
          return this.fetchWithRedirect(redirectUrl, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} when downloading file`));
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          this.logger.log(`Downloaded ${buf.length} bytes`);
          if (buf.length === 0) {
            return reject(new Error("Downloaded empty buffer"));
          }
          resolve(buf);
        });
        res.on("error", reject);
      }).on("error", reject);
    });
  }
}
'@

Write-Host ""
Write-Host "=== Fix xong! ===" -ForegroundColor Yellow
Write-Host "Server tu reload, upload lai file de test." -ForegroundColor Cyan