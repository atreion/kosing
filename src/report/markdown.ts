/**
 * The markdown subset advice.md uses: headings, paragraphs, bullet and
 * numbered lists (nested by indent), pipe tables, bold, italic, inline code
 * and links. Anything else renders as paragraph text, escaped.
 */

import { escapeHtml } from "./format.ts";

export function renderInline(text: string): string {
  const codeSpans: string[] = [];
  const withoutCode = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\uE000${codeSpans.length - 1}\uE000`;
  });
  return escapeHtml(withoutCode)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\uE000(\d+)\uE000/g, (_, i: string) => codeSpans[Number(i)] ?? "");
}

type ListItem = { readonly indent: number; readonly ordered: boolean; readonly text: string };

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const TABLE_DIVIDER = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function tableCells(line: string): readonly string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines: readonly string[]): string {
  const [head = "", , ...body] = lines;
  const th = tableCells(head)
    .map((c) => `<th>${renderInline(c)}</th>`)
    .join("");
  const rows = body
    .map(
      (row) =>
        `<tr>${tableCells(row)
          .map((c) => `<td>${renderInline(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Items indented past the first item's marker nest under the item before them. */
function renderList(items: readonly ListItem[]): string {
  const [first] = items;
  if (first === undefined) return "";
  const groups: { item: ListItem; children: ListItem[] }[] = [];
  for (const item of items) {
    const parent = groups[groups.length - 1];
    if (item.indent > first.indent && parent !== undefined) parent.children.push(item);
    else groups.push({ item, children: [] });
  }
  const tag = first.ordered ? "ol" : "ul";
  const lis = groups.map((g) => `<li>${renderInline(g.item.text)}${renderList(g.children)}</li>`);
  return `<${tag}>${lis.join("")}</${tag}>`;
}

function parseListItem(line: string): ListItem | null {
  const m = LIST_ITEM.exec(line);
  if (m === null) return null;
  const [, indent = "", marker = "", text = ""] = m;
  return { indent: indent.length, ordered: /\d/.test(marker), text };
}

/** A list item's wrapped continuation lines are indented past its marker. */
function isContinuation(line: string): boolean {
  return /^\s+\S/.test(line) && parseListItem(line) === null;
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

/** Consumes lines while `take` accepts them; `take` returns false to stop. */
function consume(lines: readonly string[], start: number, take: (line: string) => boolean): number {
  let i = start;
  while (i < lines.length && take(lines[i] ?? "")) i += 1;
  return i;
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (line.trim() === "") {
      i += 1;
    } else if (heading !== null) {
      const level = (heading[1] ?? "#").length;
      blocks.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      i += 1;
    } else if (isTableRow(line) && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      const end = consume(lines, i, isTableRow);
      blocks.push(renderTable(lines.slice(i, end)));
      i = end;
    } else if (parseListItem(line) !== null) {
      const items: ListItem[] = [];
      i = consume(lines, i, (l) => {
        const item = parseListItem(l);
        const last = items[items.length - 1];
        if (item !== null) items.push(item);
        else if (isContinuation(l) && last !== undefined)
          items[items.length - 1] = { ...last, text: `${last.text} ${l.trim()}` };
        else return false;
        return true;
      });
      blocks.push(renderList(items));
    } else {
      const end = consume(
        lines,
        i + 1,
        (l) => l.trim() !== "" && !isHeading(l) && parseListItem(l) === null && !isTableRow(l),
      );
      blocks.push(
        `<p>${renderInline(
          lines
            .slice(i, end)
            .map((l) => l.trim())
            .join(" "),
        )}</p>`,
      );
      i = end;
    }
  }
  return blocks.join("\n");
}
