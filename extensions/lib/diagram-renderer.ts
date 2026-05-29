/**
 * BookQuest Diagram Renderer
 *
 * Renders hierarchy-style Unicode box-drawing diagrams for the skill tree.
 * Previously supported flow/comparison types as an LLM tool; now trimmed
 * to only hierarchy (the sole internal caller: renderSkillTree).
 *
 * Export remains renderDiagram(params) for backward compatibility with
 * the existing import in bookquest.ts.
 */

// ── Box-drawing characters ──
const H = "─";
const V = "│";
const TL = "┌";
const TR = "┐";
const BL = "└";
const BR = "┘";
const LM = "├";
const RM = "┤";

// ── Types ──

export interface HierarchyChild {
  label: string;
  sub_items?: string[];
}

export interface HierarchyParams {
  type: "hierarchy";
  title: string;
  subtitle?: string;
  root: string;
  children: HierarchyChild[];
}

export type DiagramParams = HierarchyParams;

export interface BlockResult {
  content: { type: string; text: string }[];
}

// ── Helpers ──

export function pad(s: string, w: number): string {
  const str = String(s ?? "");
  if (str.length <= w) return str + " ".repeat(Math.max(0, w - str.length));
  return str;
}

// ── Hierarchy renderer ──

function renderHierarchy(params: HierarchyParams): BlockResult {
  const root = params.root || "";
  const children: { label: string; sub_items?: string[] }[] = params.children || [];

  const lines: string[] = [];
  lines.push(params.title);
  if (params.subtitle) lines.push("(" + params.subtitle + ")");
  lines.push("");

  const rootW = Math.max(root.length + 2, 6);
  lines.push("            " + TL + H.repeat(rootW) + TR);
  lines.push("            " + V + " " + pad(root, rootW - 2) + " " + V);

  if (children.length > 0) {
    const indent = Math.max(2, Math.floor(rootW / 2));
    lines.push(" ".repeat(indent) + BL + H.repeat(rootW) + BR);
    lines.push("");
    lines.push(" ".repeat(indent + Math.floor(rootW / 2) - 1) + V);

    for (const child of children) {
      const cW = Math.max(child.label.length + 2, (child.sub_items ? Math.max(...child.sub_items.map(s => s.length)) + 2 : 4));
      const bar = TL + H.repeat(cW) + TR;
      const mid = V + " " + pad(child.label, cW - 2) + " " + V;
      const bot = BL + H.repeat(cW) + BR;
      lines.push(" ".repeat(indent) + bar);
      lines.push(" ".repeat(indent) + mid);
      lines.push(" ".repeat(indent) + bot);

      if (child.sub_items && child.sub_items.length > 0) {
        const siW = Math.max(...child.sub_items.map(s => s.length)) + 2;
        for (const si of child.sub_items) {
          lines.push("    " + LM + H.repeat(siW) + RM);
          lines.push("    " + V + " " + pad(si, siW - 2) + " " + V);
          lines.push("    " + BL + H.repeat(siW) + BR);
        }
        lines.push("");
      }
    }
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Main dispatch ──

export function renderDiagram(params: DiagramParams): BlockResult {
  if (!params || typeof params !== "object") {
    return { content: [{ type: "text", text: "[diagram error: invalid parameters]" }] };
  }
  if (params.type === "hierarchy") {
    return renderHierarchy(params);
  }
  return { content: [{ type: "text", text: `[unknown diagram type: ${(params as any).type}]` }] };
}
