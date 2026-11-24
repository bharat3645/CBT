/** drizzle >=0.44 wraps driver errors (DrizzleQueryError.cause); older versions throw the pg error directly. */
export function pgCode(e: any): string | undefined {
  return e?.code ?? e?.cause?.code;
}
export const isUniqueViolation = (e: unknown) => pgCode(e) === "23505";
export function pgConstraint(e: any): string | undefined {
  return e?.constraint ?? e?.cause?.constraint ?? e?.constraint_name ?? e?.cause?.constraint_name;
}
