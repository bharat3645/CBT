import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/auth/decorators";

@Controller("api/v1/health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}
