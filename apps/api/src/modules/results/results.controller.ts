import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { keyCorrectionsInput, resultSettingsInput } from '@cbt/contracts/results';
import { actorOf } from './actor';
import { ResultsService } from './results.service';

@Controller('api/v1')
export class ResultsController {
  constructor(private readonly svc: ResultsService) {}

  @Get('results/mine') mine(@Req() req: any, @Query('childId') childId?: string) { return this.svc.listMine(actorOf(req), childId); }

  @Get('results/:attemptId') one(@Req() req: any, @Param('attemptId', ParseUUIDPipe) id: string) {
    return this.svc.getResult(actorOf(req), id);
  }

  @Get('results/:attemptId/report.pdf')
  async pdf(@Req() req: any, @Param('attemptId', ParseUUIDPipe) id: string, @Res() res: any) {
    const buf = await this.svc.reportPdf(actorOf(req), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="result-report.pdf"');
    res.send(buf);
  }

  @Get('tests/:testId/leaderboard')
  board(@Req() req: any, @Param('testId', ParseUUIDPipe) testId: string, @Query('scope') scope: 'test' | 'batch' = 'test', @Query('scopeId') scopeId?: string) {
    return this.svc.leaderboard(actorOf(req), testId, scope === 'batch' ? 'batch' : 'test', scopeId);
  }

  @Put('tests/:testId/result-settings')
  settings(@Req() req: any, @Param('testId', ParseUUIDPipe) testId: string, @Body() body: unknown) {
    return this.svc.setSettings(actorOf(req), testId, resultSettingsInput.parse(body));
  }

  @Post('tests/:testId/results/release')
  release(@Req() req: any, @Param('testId', ParseUUIDPipe) testId: string) {
    return this.svc.release(actorOf(req), testId);
  }

  @Post('tests/:testId/answer-key/corrections')
  correct(@Req() req: any, @Param('testId', ParseUUIDPipe) testId: string, @Body() body: unknown) {
    return this.svc.correctKey(actorOf(req), testId, keyCorrectionsInput.parse(body));
  }
}
