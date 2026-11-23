 export const EXPORT_HTML_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  document: `<!doctype html>
<html lang="{{language}}" dir="{{direction}}">
{{> head}}
<body>
{{> application}}
{{> requestStatus}}
{{> runtime}}
</body>
</html>`,
  head: `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="{{themeColor}}">
  <link rel="stylesheet" href="./lib/fontawesome/css/all.min.css">
  <link rel="stylesheet" href="./custom.css">
  <script src="{{helperUrl}}"></script>
  <title>{{title}}</title>
  <style>
{{{styles}}}
  </style>
</head>`,
  application: `{{{markup}}}`,
  requestStatus: `  <p class="request-status" id="request-status" role="status" aria-live="polite"></p>`,
  runtime: `  <script>
{{{script}}}
  </script>`,
  input: `{{{indent}}}<input class="{{{className}}}" type="{{inputType}}" name="{{{formName}}}" data-form-name="{{{formName}}}" aria-label="{{{accessibleName}}}" placeholder="{{{content}}}" style="{{{styles}}}"{{{elementAttributes}}}{{{bindingAttributes}}}{{{min}}}{{{max}}}{{{disabled}}}>`,
  filePicker: `{{{indent}}}<button type="button" class="{{{className}}}" data-file-picker data-file-picker-mode="{{mode}}" data-file-picker-appearance="{{appearance}}" data-file-picker-value="[]" name="{{{formName}}}" data-form-name="{{{formName}}}" aria-label="{{{accessibleName}}}" style="{{{styles}}}"{{{elementAttributes}}}{{{bindingAttributes}}}{{{disabled}}}><span data-localize-content>{{{content}}}</span></button>`,
  image: `{{{indent}}}<img class="{{{className}}}"{{{source}}} alt="{{{alt}}}" style="{{{styles}}};object-fit:{{fit}}"{{{elementAttributes}}}>`,
});
