import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

// Core must provide RESULTS_DB in the importing module (see results/actor.ts).
@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
