import { Controller, ForbiddenException, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { analyticsQuery } from '@cbt/contracts/results';
import { RESULTS_DB, actorOf, isStaff, linkedChildUserIds, requireStaff } from '../results/actor';
import { batchAnalytics, studentAnalytics } from './analytics.queries';

@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(@Inject(RESULTS_DB) private readonly db: any) {}

  /** Teacher / institute analytics: averages, median, distribution, difficulty, reteach list, declining students. */
  @Get('batch')
  async batch(@Req() req: any, @Query() query: unknown) {
    const a = actorOf(req);
    requireStaff(a);
    return batchAnalytics(this.db, a.instituteId, analyticsQuery.parse(query));
  }

  /** CSV export of the batch test summary; staff only. */
  @Get('batch.csv')
  async batchCsv(@Req() req: any, @Query() query: unknown, @Res() res: any) {
    const a = actorOf(req);
    requireStaff(a);
    const d = await batchAnalytics(this.db, a.instituteId, analyticsQuery.parse(query));
    // titles may contain commas or quotes: quote the text field (RFC 4180)
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ['test_id,title,participants,avg_pct,median_pct', ...d.tests.map((t) => `${t.testId},${q(t.title ?? '')},${t.participants},${t.avgPct},${t.medianPct}`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="batch-analytics.csv"');
    res.send(csv);
  }

  /** A student sees only their own analytics; staff may view any student in the institute; a parent, a linked child. */
  @Get('students/:studentId')
  async student(@Req() req: any, @Param('studentId') studentId: string) {
    const a = actorOf(req);
    if (!isStaff(a) && a.id !== studentId) {
      // a parent may read a verified linked child's analytics (the id is the child's user id)
      const kids = a.role === 'parent' ? await linkedChildUserIds(this.db, a.id, a.instituteId) : [];
      if (!kids.includes(studentId)) throw new ForbiddenException();
    }
    return studentAnalytics(this.db, a.instituteId, studentId);
  }

  @Get('me')
  async me(@Req() req: any) {
    const a = actorOf(req);
    return studentAnalytics(this.db, a.instituteId, a.id);
  }
}
