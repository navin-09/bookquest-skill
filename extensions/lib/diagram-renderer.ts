/**
 * BookQuest Diagram Renderer
 *
 * Generates properly-aligned Unicode box-drawing diagrams for inline display
 * in the LLM's response. Supports three types: flow, comparison, hierarchy.
 *
 * All helper functions are exported at module level so they can be tested
 * independently of the dispatch logic.
 */

// ── Box-drawing characters ──
const H = "─";
const V = "│";
const TL = "┌";
const TR = "┐";
const BL = "└";
const BR = "┘";
const TM = "┬";
const BM = "┴";
const LM = "├";
const RM = "┤";
const CROSS = "┼";

// ── Types ──

export interface FlowStep {
  label: string;
  description?: string;
}

export interface ComparisonRow {
  aspect: string;
  left: string;
  right: string;
}

export interface FlowParams {
  type: "flow";
  title: string;
  subtitle?: string;
  steps: FlowStep[];
}

export interface ComparisonParams {
  type: "comparison";
  title: string;
  subtitle?: string;
  left_label: string;
  right_label: string;
  rows: ComparisonRow[];
}

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

export type DiagramParams = FlowParams | ComparisonParams | HierarchyParams;

export interface BlockResult {
  content: { type: string; text: string }[];
}

// ── Pure helpers (module-level, independently testable) ──

export function pad(s: string, w: number): string {
  const str = String(s ?? "");
  if (str.length <= w) return str + " ".repeat(Math.max(0, w - str.length));
  return str;
}

export function capWidths(widths: number[], maxAvailable: number): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= maxAvailable) return widths;
  const ratio = maxAvailable / total;
  return widths.map((w) => Math.max(10, Math.floor(w * ratio)));
}

export function boxRow(cells: string[], widths: number[]): string {
  return V + " " + cells.map((c, i) => pad(c, widths[i])).join(" " + V + " ") + " " + V;
}

export function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= maxWidth) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export function boxRowMulti(cells: string[], widths: number[]): string[] {
  const wrapped = cells.map((c, i) => wrapText(c, widths[i]));
  const maxLines = Math.max(...wrapped.map((w) => w.length));
  const lines: string[] = [];
  for (let line = 0; line < maxLines; line++) {
    const rowCells = wrapped.map((w) => (line < w.length ? w[line] : ""));
    lines.push(boxRow(rowCells, widths));
  }
  return lines;
}

// ── Renderers per diagram type ──

const ARROW_R = " ──► ";

function renderComparison(params: ComparisonParams): BlockResult {
  const rows = params.rows || [];
  const leftLabel = params.left_label || "";
  const rightLabel = params.right_label || "";
  if (rows.length === 0) {
    return { content: [{ type: "text", text: `[comparison: ${params.title} — no rows]` }] };
  }

  const MAX_WIDTH = (process.stdout.columns || 80) - 2;

  let aspectW = Math.max(
    "Aspect".length,
    ...rows.map((r) => r.aspect.length),
    params.title.length > 40 ? 40 : params.title.length
  );
  let leftW = Math.max(leftLabel.length, ...rows.map((r) => r.left.length));
  let rightW = Math.max(rightLabel.length, ...rows.map((r) => r.right.length));
  const capped = capWidths([aspectW, leftW, rightW], MAX_WIDTH - 10);
  aspectW = capped[0]; leftW = capped[1]; rightW = capped[2];
  const hdrW = [aspectW, leftW, rightW];
  const lines: string[] = [];
  const titleBarWidth = aspectW + leftW + rightW + 8;
  lines.push(TL + H.repeat(titleBarWidth) + TR);
  lines.push(V + " " + pad(params.title, titleBarWidth - 2) + " " + V);
  if (params.subtitle) {
    lines.push(V + " " + pad("(" + params.subtitle + ")", titleBarWidth - 2) + " " + V);
  }
  lines.push(LM + H.repeat(aspectW + 2) + TM + H.repeat(leftW + 2) + TM + H.repeat(rightW + 2) + RM);
  lines.push(boxRow(["Aspect", leftLabel, rightLabel], hdrW));
  lines.push(LM + H.repeat(aspectW + 2) + CROSS + H.repeat(leftW + 2) + CROSS + H.repeat(rightW + 2) + RM);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const multiLines = boxRowMulti([r.aspect, r.left, r.right], hdrW);
    for (const ml of multiLines) {
      lines.push(ml);
    }
    if (i < rows.length - 1) {
      lines.push(LM + H.repeat(aspectW + 2) + CROSS + H.repeat(leftW + 2) + CROSS + H.repeat(rightW + 2) + RM);
    }
  }
  lines.push(BL + H.repeat(aspectW + 2) + BM + H.repeat(leftW + 2) + BM + H.repeat(rightW + 2) + BR);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

function renderFlow(params: FlowParams): BlockResult {
  const steps = params.steps || [];
  if (steps.length < 2) {
    return { content: [{ type: "text", text: `[flow: ${params.title} — need at least 2 steps]` }] };
  }

  const MAX_WIDTH = (process.stdout.columns || 80) - 2;

  const maxLabel = Math.max(...steps.map((s) => s.label.length));
  const maxDesc = Math.max(...steps.map((s) => (s.description || "").length));
  const idealBoxW = Math.max(maxLabel, maxDesc) + 2;
  const arrowLen = ARROW_R.length;
  const maxBoxW = Math.floor((MAX_WIDTH - (steps.length - 1) * arrowLen) / steps.length) - 2;
  const MIN_BOXW = 12;
  const maxStepsFit = (idealBoxW > maxBoxW || maxBoxW < MIN_BOXW)
    ? Math.min(steps.length, Math.max(2, Math.floor((MAX_WIDTH - arrowLen) / (MIN_BOXW + 2 + arrowLen))))
    : steps.length;
  const cappedSteps = steps.slice(0, maxStepsFit);
  const boxW = Math.max(MIN_BOXW, Math.min(idealBoxW, maxBoxW >= MIN_BOXW ? maxBoxW : Math.floor((MAX_WIDTH - (cappedSteps.length - 1) * arrowLen) / cappedSteps.length) - 2));
  const arrowStr = ARROW_R;

  const lines: string[] = [];
  lines.push(params.title);
  if (params.subtitle) lines.push("(" + params.subtitle + ")");
  lines.push("");

  const renderSteps = cappedSteps || steps;
  let topRow = "";
  let midRow = "";
  let botRow = "";
  for (let i = 0; i < renderSteps.length; i++) {
    const s = renderSteps[i];
    topRow += TL + H.repeat(boxW) + TR;
    midRow += V + " " + pad(s.label, boxW - 2) + " " + V;
    botRow += BL + H.repeat(boxW) + BR;
    if (i < renderSteps.length - 1) {
      topRow += arrowStr;
      midRow += " " + "─".repeat(arrowStr.length - 3) + "► ";
      botRow += arrowStr;
    }
  }
  lines.push(topRow);
  lines.push(midRow);

  if (renderSteps.some((s: any) => s.description)) {
    const descLines = renderSteps.map((s: any) => wrapText(s.description || "", boxW - 2));
    const maxDescLines = Math.max(...descLines.map((dl: string[]) => dl.length));
    for (let line = 0; line < maxDescLines; line++) {
      let descRow = "";
      for (let i = 0; i < renderSteps.length; i++) {
        const text = line < descLines[i].length ? descLines[i][line] : "";
        descRow += V + " " + pad(text, boxW - 2) + " " + V;
        if (i < renderSteps.length - 1) {
          descRow += " " + pad("", arrowStr.length - 2) + " ";
        }
      }
      lines.push(descRow);
    }
    let descBotRow = "";
    for (let i = 0; i < renderSteps.length; i++) {
      descBotRow += BL + H.repeat(boxW) + BR;
      if (i < renderSteps.length - 1) {
        descBotRow += arrowStr;
      }
    }
    lines.push(descBotRow);
  } else {
    lines.push(botRow);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

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

  switch (params.type) {
    case "comparison":
      return renderComparison(params);
    case "flow":
      return renderFlow(params);
    case "hierarchy":
      return renderHierarchy(params);
    default:
      return { content: [{ type: "text", text: `[unknown diagram type: ${(params as any).type}]` }] };
  }
}
