import {NestFactory} from "@nestjs/core";
import {ValidationPipe} from "@nestjs/common";
import {SwaggerModule, DocumentBuilder} from "@nestjs/swagger";
import {AppModule} from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Health check TRUOC setGlobalPrefix
  app.use("/health", (_req, res) => res.status(200).json({status: "ok"}));

  app.setGlobalPrefix("api/v1");

  app.enableCors({
    origin: [
      "http://localhost:3000",
      "https://trtassistant.vercel.app", 
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port, "0.0.0.0");
  console.log(`Server running on port ${port}`);
}
bootstrap();
