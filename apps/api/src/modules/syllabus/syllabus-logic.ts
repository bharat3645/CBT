import { childLevel, type SyllabusLevel, type SyllabusNode, type SyllabusTreeNode } from '@cbt/contracts';

/** Build a sorted tree from a flat node list. Nodes whose parent is missing become roots. */
export function buildTree(nodes: SyllabusNode[]): SyllabusTreeNode[] {
  const byId = new Map<string, SyllabusTreeNode>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: SyllabusTreeNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const sort = (list: SyllabusTreeNode[]) => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    list.forEach((c) => sort(c.children));
  };
  sort(roots);
  return roots;
}

/** A node at `level` may only sit under a parent one level above; `exam` is always a root. */
export function isValidPlacement(level: SyllabusLevel, parentLevel: SyllabusLevel | null): boolean {
  if (level === 'exam') return parentLevel === null;
  return parentLevel !== null && childLevel(parentLevel) === level;
}

/** Collect topic ids at or below `rootId`. */
export function topicIdsUnder(nodes: SyllabusNode[], rootId: string): string[] {
  const kids = new Map<string, SyllabusNode[]>();
  for (const n of nodes) if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return [];
  const out: string[] = [];
  const walk = (n: SyllabusNode) => {
    if (n.level === 'topic') out.push(n.id);
    (kids.get(n.id) ?? []).forEach(walk);
  };
  walk(root);
  return out;
}

export interface TemplateCopyRow extends SyllabusNode {
  templateNodeId: string;
}

/**
 * Copy a template subtree for an institute: every node gets a fresh id and remembers its source.
 * Institute edits to the copy never touch the template.
 */
export function planTemplateCopy(templateNodes: SyllabusNode[], rootId: string, newId: () => string): TemplateCopyRow[] {
  const kids = new Map<string | null, SyllabusNode[]>();
  for (const n of templateNodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const root = templateNodes.find((n) => n.id === rootId);
  if (!root) return [];
  const out: TemplateCopyRow[] = [];
  const walk = (n: SyllabusNode, parentId: string | null) => {
    const id = newId();
    out.push({ ...n, id, parentId, templateNodeId: n.id });
    (kids.get(n.id) ?? []).forEach((c) => walk(c, id));
  };
  walk(root, null);
  return out;
}

/** Completion % across a set of topics for one batch. */
export function completionPercent(topicIds: string[], completed: Set<string>): number {
  if (!topicIds.length) return 0;
  return Math.round((topicIds.filter((t) => completed.has(t)).length / topicIds.length) * 100);
}
