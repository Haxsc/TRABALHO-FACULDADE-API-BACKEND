import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { configurarApp, gerarDocumentoOpenApi } from '../src/configurar-app';

async function exportar() {
  const app = configurarApp(await NestFactory.create(AppModule, { logger: false }));
  const documento = gerarDocumentoOpenApi(app);
  const destino = join(__dirname, '..', 'docs', 'openapi.json');
  writeFileSync(destino, JSON.stringify(documento, null, 2));
  await app.close();
  console.log(`OpenAPI exportado em ${destino}`);
}

exportar();
