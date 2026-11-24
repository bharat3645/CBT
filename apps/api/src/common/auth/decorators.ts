import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Action, SubjectName } from "@cbt/abilities";
import type { RequestCtx } from "../request-context";

export const IS_PUBLIC = "isPublic";
/** Skip authentication (registration, health). Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ABILITY_KEY = "ability";
/** Require ability.can(action, subject) before the handler runs. Instance-level checks happen in services. */
export const Can = (action: Action, subject: SubjectName) => SetMetadata(ABILITY_KEY, { action, subject });

export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): RequestCtx => ec.switchToHttp().getRequest().ctx);
