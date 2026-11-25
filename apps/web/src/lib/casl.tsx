"use client";

import * as React from "react";
import { createContext, useContext } from "react";
import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import { createContextualCan } from "@casl/react";

/**
 * CASL provider.
 *
 * packages/abilities (shared with the API) does not exist yet. Until it does, `buildAbilityFor`
 * below is a local STUB with coarse role rules. EXTENSION POINT: once @cbt/abilities exports
 * `defineAbilityFor(user)`, replace the body of `buildAbilityFor` with it and delete the stub rules.
 */
export type AppAbility = MongoAbility<[string, string]>;
export type Role = "super_admin" | "institute_admin" | "teacher" | "student" | "parent";

export function buildAbilityFor(role: Role | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  switch (role) {
    case "super_admin":
    case "institute_admin":
      can("manage", "all");
      break;
    case "teacher":
      can(["read", "create", "update"], ["Paper", "Question", "Test", "Batch", "Attendance"]);
      can("read", ["Student", "Result"]);
      break;
    case "student":
      can("read", ["Test", "Result", "Syllabus"]);
      can("attempt", "Test");
      break;
    case "parent":
      can("read", ["Result", "Attendance", "Syllabus"]);
      break;
  }
  return build();
}

const AbilityContext = createContext<AppAbility>(buildAbilityFor(null));
export const Can = createContextualCan(AbilityContext.Consumer);
export const useAbility = () => useContext(AbilityContext);

export function AbilityProvider({ role, children }: { role: Role | null; children: React.ReactNode }) {
  const ability = React.useMemo(() => buildAbilityFor(role), [role]);
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}
