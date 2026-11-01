import assert from "node:assert/strict";
import { test } from "node:test";
import { renderInline, renderMarkdown } from "./markdown.ts";

test("inline marks render and the text around them is escaped", () => {
  assert.equal(
    renderInline("**Verdict: `a<b`** and *x* & [S1](https://e.com)"),
    '<strong>Verdict: <code>a&lt;b</code></strong> and <em>x</em> &amp; <a href="https://e.com">S1</a>',
  );
});

test("a wrapped bullet joins its continuation line and nests indented items", () => {
  const html = renderMarkdown("- one\n  wrapped\n  - inner\n- two");
  assert.equal(html, "<ul><li>one wrapped<ul><li>inner</li></ul></li><li>two</li></ul>");
});

test("numbered lists become ol", () => {
  assert.equal(renderMarkdown("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
});

test("a pipe table with a divider becomes a table", () => {
  const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | **2** |");
  assert.equal(
    html,
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>",
  );
});

test("headings end paragraphs and a stray pipe line is paragraph text", () => {
  assert.equal(
    renderMarkdown("## Title\nfirst\nsecond\n\n| not a table"),
    "<h2>Title</h2>\n<p>first second</p>\n<p>| not a table</p>",
  );
});
