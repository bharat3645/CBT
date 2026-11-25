/** True only in the hosted demo build (NEXT_PUBLIC_DEMO=1). Inlined at build time, so real builds carry none of the mock. */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
