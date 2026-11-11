import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp, gerarDocumentoOpenApi } from './configurar-app';

async function bootstrap() {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET não configurado. Copie o .env.example para .env.');
  }

  const app = await NestFactory.create(AppModule);
  configurarApp(app);

  const documento = gerarDocumentoOpenApi(app);
  SwaggerModule.setup('docs', app, documento, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true },
  });

  const porta = Number(process.env.PORT ?? 3000);
  await app.listen(porta);
  Logger.log(`API rodando em http://localhost:${porta} | Swagger: http://localhost:${porta}/docs`, 'Bootstrap');
}

bootstrap();
