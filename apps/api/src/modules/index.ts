import type { Type } from "@nestjs/common";
import { IdentityModule } from "./identity/identity.module";
import { PeopleModule } from "./people/people.module";
import { ExamsModule } from "./exams/exams.module";
import { QuestionsModule } from "./questions/questions.module";
import { SyllabusModule } from "./syllabus/syllabus.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { ResultsModule } from "./results/results.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { DashboardModule } from "./dashboard/dashboard.module";
// Other agents: import your module above and append it to FEATURE_MODULES below (one line each).
// Your module can inject: DB / DB_SYSTEM (common/db/db.module), Notifier, StorageService, PdfService, QueueService,
// AuditService, AUTH, and use @Can()/@Public()/@Ctx() from common/auth/decorators.

export const FEATURE_MODULES: Type<unknown>[] = [
  IdentityModule, // M1
  PeopleModule, // M2
  ExamsModule,
  QuestionsModule,
  SyllabusModule,
  IngestionModule,
  ResultsModule,
  NotificationsModule,
  AnalyticsModule,
  DashboardModule,
];
