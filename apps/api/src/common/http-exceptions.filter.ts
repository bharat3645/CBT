import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ZodError } from "zod";

/** SRS 16 error model: 400 validation, 401, 403, 404, 409, 422, 429, 5xx. Zod errors become 400. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("Http");
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof ZodError) {
      return res.status(400).json({ statusCode: 400, message: "Validation failed", issues: e.issues });
    }
    if (e instanceof HttpException) {
      const body = e.getResponse();
      return res.status(e.getStatus()).json(typeof body === "string" ? { statusCode: e.getStatus(), message: body } : body);
    }
    this.log.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: "Internal server error" });
  }
}
