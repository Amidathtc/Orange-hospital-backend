import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  @SkipThrottle()
  @Get()
  getRoot() {
    return {
      status: 'ok',
      service: 'Orange Health Ajo API',
    };
  }

  @SkipThrottle()
  @Get('health')
  async getHealth() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e: any) {
      dbStatus = 'disconnected';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}

