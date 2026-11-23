import assert from "node:assert/strict";
import test from "node:test";
import { TemplateEngine } from "../src/template-engine.ts";
import { EXPORT_HTML_TEMPLATES } from "../src/html-templates.ts";

test("escapes scalar values and preserves literal braces in inserted data", () => {
  const output = TemplateEngine.render(
    '<title>{{title}}</title><main>{{token}}</main>',
    {
      title: `<Builder & "Tools">`,
      token: "{{twk.full_name}}",
    },
  );

  assert.equal(
    output,
    "<title>&lt;Builder &amp; &quot;Tools&quot;&gt;</title><main>{{twk.full_name}}</main>",
  );
});

test("renders nested partials and requires explicit trusted HTML", () => {
  const output = TemplateEngine.render(
    "{{> document}}",
    {
      title: "Builder",
      content: TemplateEngine.raw("<main>Ready</main>"),
    },
    {
      document: "<title>{{title}}</title>{{> body}}",
      body: "{{{content}}}",
    },
  );

  assert.equal(output, "<title>Builder</title><main>Ready</main>");
});

test("rejects missing values, unsafe raw values, unknown partials, and cycles", () => {
  assert.throws(
    () => TemplateEngine.render("{{missing}}", {}),
    /Missing template value "missing"/,
  );
  assert.throws(
    () => TemplateEngine.render("{{{content}}}", { content: "<b>unsafe</b>" }),
    /must be marked with TemplateEngine\.raw/,
  );
  assert.throws(
    () => TemplateEngine.render("{{ value }}", { value: { nested: true } }),
    /must be a scalar/,
  );
  assert.throws(
    () => TemplateEngine.render("{{ invalid", {}),
    /invalid expression/i,
  );
  assert.throws(
    () => TemplateEngine.render("{{> unknown}}", {}, {}),
    /Unknown template partial "unknown"/,
  );
  assert.throws(
    () =>
      TemplateEngine.render("{{> first}}", {}, {
        first: "{{> second}}",
        second: "{{> first}}",
      }),
    /Circular template partial: first -> second -> first/,
  );
});

test("assembles the standalone export from reusable document partials", () => {
  const output = TemplateEngine.render(
    EXPORT_HTML_TEMPLATES.document,
    {
      language: "en",
      direction: "ltr",
      themeColor: "#176b59",
      helperUrl: "twkhelper.js",
      title: "Demo & Builder",
      styles: TemplateEngine.raw("  .app { color: red; }"),
      markup: TemplateEngine.raw('<main>{{twk.full_name}}</main>'),
      script: TemplateEngine.raw("initializeApp();"),
    },
    EXPORT_HTML_TEMPLATES,
  );

  assert.match(output, /^<!doctype html>/);
  assert.match(output, /<html lang="en" dir="ltr">/);
  assert.match(output, /<title>Demo &amp; Builder<\/title>/);
  assert.match(output, /<main>{{twk\.full_name}}<\/main>/);
  assert.match(output, /<script>\s*initializeApp\(\);\s*<\/script>/);
});

test("renders reusable generated element components with escaped values", () => {
  const output = TemplateEngine.render(
    "{{> input}}",
    {
      indent: TemplateEngine.raw("  "),
      className: TemplateEngine.raw("content content-input"),
      inputType: "text",
      formName: TemplateEngine.raw("profile"),
      accessibleName: TemplateEngine.raw("&lt;Profile&gt;"),
      content: TemplateEngine.raw("&lt;Profile&gt;"),
      styles: TemplateEngine.raw("color: red"),
      elementAttributes: TemplateEngine.raw(' id="profile"'),
      bindingAttributes: TemplateEngine.raw(""),
      min: TemplateEngine.raw(""),
      max: TemplateEngine.raw(""),
      disabled: TemplateEngine.raw(""),
    },
    EXPORT_HTML_TEMPLATES,
  );

  assert.equal(
    output,
    '  <input class="content content-input" type="text" name="profile" data-form-name="profile" aria-label="&lt;Profile&gt;" placeholder="&lt;Profile&gt;" style="color: red" id="profile">',
  );
});
