import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { Phase2Controller } from "./phase2.controller";
import { Phase2Service } from "./phase2.service";

@Module({ imports: [NotificationsModule], controllers: [Phase2Controller], providers: [Phase2Service] })
export class Phase2Module {}
