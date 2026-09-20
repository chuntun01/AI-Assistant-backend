import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: this.config.get<string>("GMAIL_USER"),
        pass: this.config.get<string>("GMAIL_APP_PASSWORD"),
      },
    });
  }

  async sendResetPasswordEmail(email: string, resetUrl: string, name: string): Promise<void> {
    const mailOptions = {
      from: `"AI IAM Assistant" <${this.config.get("GMAIL_USER")}>`,
      to: email,
      subject: "Dat lai mat khau - AI IAM Assistant",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Dat lai mat khau</h2>
          <p>Xin chao <strong>${name}</strong>,</p>
          <p>Ban da yeu cau dat lai mat khau. Click vao nut duoi day de tiep tuc:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
              style="background: #2563eb; color: white; padding: 12px 24px;
                     border-radius: 8px; text-decoration: none; font-weight: bold;">
              Dat lai mat khau
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Link nay het han sau <strong>15 phut</strong>.<br/>
            Neu ban khong yeu cau, hay bo qua email nay.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"/>
          <p style="color: #999; font-size: 12px;">AI IAM Assistant</p>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    this.logger.log(`Reset password email sent to: ${email}`);
  }
}