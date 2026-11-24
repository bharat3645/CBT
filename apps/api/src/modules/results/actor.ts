import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

/** Core's auth guard sets req.actor = { id, instituteId, role }. A missing role is treated as student (least privilege). */
export interface Actor { id: string; instituteId: string; role?: string }

export const STAFF_ROLES = ['teacher', 'institute_admin', 'super_admin'];
export const isStaff = (a: Actor) => !!a.role && STAFF_ROLES.includes(a.role);

export function actorOf(req: any): Actor {
  if (!req.actor) throw new BadRequestException('No actor');
  return req.actor;
}
export function requireStaff(a: Actor) {
  if (!isStaff(a)) throw new ForbiddenException('Staff only');
}

/** Injection tokens (core aliases its Drizzle provider to RESULTS_DB, like EXAMS_DB). */
export const RESULTS_DB = 'RESULTS_DB';
export const RESULTS_CLOCK = 'RESULTS_CLOCK';

/**
 * A parent may read the RELEASED results of their verified linked children (SRS: parent sees linked child only).
 * Results and attempts are keyed by the child's user id, so resolve guardian_student_links -> students.user_id.
 * Revoked or pending links grant nothing.
 */
export async function linkedChildUserIds(db: any, parentUserId: string, instituteId: string): Promise<string[]> {
  const res = await db.execute(sql`
    select s.user_id::text as user_id
    from guardian_student_links l
    join guardians g on g.id = l.guardian_id
    join students s on s.id = l.student_id
    where g.user_id = ${parentUserId} and l.status = 'verified' and l.institute_id = ${instituteId}`);
  return (Array.isArray(res) ? res : res.rows ?? []).map((r: any) => r.user_id as string);
}
