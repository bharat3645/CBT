/** Global syllabus templates (institute_id NULL) that any institute can copy into its own tree. Idempotent by exam name. */
import { and, eq, isNull } from "drizzle-orm";
import { syllabusNodes, type Db } from "@cbt/db";

type Tree = { name: string; children?: Tree[] };
const LEVELS = ["exam", "subject", "unit", "chapter", "topic"] as const;

const T = (name: string, children?: Tree[]): Tree => ({ name, children });
const topics = (...names: string[]) => names.map((n) => T(n));

export const TEMPLATES: Tree[] = [
  T("JEE Main (sample)", [
    T("Physics", [
      T("Mechanics", [
        T("Kinematics", topics("Motion in a straight line", "Projectile motion", "Relative motion")),
        T("Laws of Motion", topics("Newton's laws", "Friction", "Circular motion")),
        T("Work, Energy and Power", topics("Work-energy theorem", "Conservation of energy")),
      ]),
      T("Electrodynamics", [
        T("Electrostatics", topics("Coulomb's law", "Gauss's law", "Capacitors")),
        T("Current Electricity", topics("Ohm's law", "Kirchhoff's laws")),
      ]),
    ]),
    T("Chemistry", [
      T("Physical Chemistry", [
        T("Mole Concept", topics("Stoichiometry", "Concentration terms")),
        T("Thermodynamics", topics("First law", "Entropy and Gibbs energy")),
      ]),
      T("Organic Chemistry", [T("General Organic Chemistry", topics("Inductive and resonance effects", "Reaction intermediates"))]),
    ]),
    T("Mathematics", [
      T("Calculus", [
        T("Limits and Continuity", topics("Limits", "Continuity")),
        T("Integration", topics("Definite integrals", "Area under curves")),
      ]),
      T("Algebra", [T("Quadratic Equations", topics("Roots", "Nature of roots"))]),
    ]),
  ]),
  T("NEET (sample)", [
    T("Physics", [T("Mechanics", [T("Laws of Motion", topics("Newton's laws", "Friction")), T("Gravitation", topics("Kepler's laws", "Escape velocity"))])]),
    T("Chemistry", [T("Physical Chemistry", [T("Solutions", topics("Colligative properties", "Raoult's law"))])]),
    T("Biology", [
      T("Botany", [T("Plant Physiology", topics("Photosynthesis", "Respiration in plants"))]),
      T("Zoology", [T("Human Physiology", topics("Digestion", "Circulation"))]),
    ]),
  ]),
];

export async function seedSyllabusTemplates(db: Db): Promise<number> {
  let created = 0;
  for (const exam of TEMPLATES) {
    const [existing] = await db.select({ id: syllabusNodes.id }).from(syllabusNodes)
      .where(and(isNull(syllabusNodes.instituteId), eq(syllabusNodes.level, "exam"), eq(syllabusNodes.name, exam.name))).limit(1);
    if (existing) continue;
    const insert = async (node: Tree, depth: number, parentId: string | null, position: number) => {
      const [row] = await db.insert(syllabusNodes)
        .values({ instituteId: null, parentId, level: LEVELS[depth]!, name: node.name, position })
        .returning({ id: syllabusNodes.id });
      created++;
      let i = 0;
      for (const c of node.children ?? []) await insert(c, depth + 1, row!.id, i++);
    };
    await insert(exam, 0, null, 0);
  }
  return created;
}
