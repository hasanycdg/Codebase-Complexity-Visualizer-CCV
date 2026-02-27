import { describe, expect, it } from "vitest";
import {
  parseCssImports,
  parseHtmlImports,
  parseJsTsImports,
  parsePhpImports
} from "../src/core/importParser.js";

describe("parseJsTsImports", () => {
  it("parses static, dynamic and CommonJS imports", () => {
    const source = `
import React from 'react';
import './styles.css';
export { x } from "./utils";
const y = require('../legacy');
const z = import("./dynamic");
`;

    expect(parseJsTsImports(source).sort()).toEqual([
      "../legacy",
      "./dynamic",
      "./styles.css",
      "./utils",
      "react"
    ]);
  });

  it("ignores import-like text in comments and strings", () => {
    const source = `
// import nope from 'ignore-me';
const text = "require('fake')";
/* export * from 'hidden' */
import { a } from './real';
`;

    expect(parseJsTsImports(source)).toEqual(["./real"]);
  });
});

describe("parsePhpImports", () => {
  it("parses include and require statements with string literals", () => {
    const source = `
<?php
include 'header.php';
require_once(\"./lib/db.php\");
include_once '../shared/footer.php';
`;

    expect(parsePhpImports(source).sort()).toEqual([
      "../shared/footer.php",
      "./lib/db.php",
      "header.php"
    ]);
  });
});

describe("parseCssImports", () => {
  it("parses @import expressions", () => {
    const source = `
@import "reset.css";
@import url('./theme/base.css');
@import url(../tokens/colors.css);
`;

    expect(parseCssImports(source).sort()).toEqual([
      "../tokens/colors.css",
      "./theme/base.css",
      "reset.css"
    ]);
  });
});

describe("parseHtmlImports", () => {
  it("parses src and href dependencies", () => {
    const source = `
<html>
  <head>
    <link rel="stylesheet" href="./styles/main.css" />
    <script src="./scripts/app.js?v=1"></script>
  </head>
  <body>
    <img src="assets/logo.png" />
    <iframe src="https://example.com/embed"></iframe>
  </body>
</html>
`;

    expect(parseHtmlImports(source).sort()).toEqual([
      "./scripts/app.js?v=1",
      "./styles/main.css",
      "assets/logo.png",
      "https://example.com/embed"
    ]);
  });
});
