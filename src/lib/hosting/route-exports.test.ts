import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

test("candour route entry points export only their supported Next.js values", () => {
  for (const name of ["attachment", "close", "disclosure", "note", "regulator-notified"]) {
    const filename = `src/app/api/candour/[id]/${name}/route.ts`;
    const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
    const exports: string[] = [];
    for (const node of source.statements) {
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        assert.fail(`${filename}: do not re-export test helpers from route entry points`);
      }
      if (!ts.canHaveModifiers(node) ||
          !ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) continue;
      if (ts.isFunctionDeclaration(node)) {
        exports.push(node.name?.text ?? "<anonymous>");
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) exports.push(declaration.name.getText(source));
      } else {
        assert.fail(`${filename}: unexpected exported value`);
      }
    }
    assert.deepEqual(exports.sort(), ["POST", "dynamic"], filename);
  }
});
