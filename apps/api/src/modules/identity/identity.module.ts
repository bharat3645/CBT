import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";

/** M1: tenancy / identity. Audit lives in common/audit. */
@Module({ controllers: [IdentityController], providers: [IdentityService], exports: [IdentityService] })
export class IdentityModule {}
