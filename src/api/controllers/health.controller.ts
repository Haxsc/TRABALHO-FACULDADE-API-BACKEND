import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Publico } from '../seguranca/decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Verifica se a API e o banco estão respondendo' })
  async verificar() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', banco: 'ok', timestamp: new Date().toISOString() };
  }
}
