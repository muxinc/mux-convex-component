import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function parse(file) {
  return ts.createSourceFile(file, readFileSync(join(root, file), "utf8"), ts.ScriptTarget.Latest);
}

// Public functions (`query`/`mutation`/`action`) exported by each published module.
function publicFunctions() {
  const modules = pkg.files.filter(
    (file) => file.endsWith(".ts") && !file.startsWith("_generated/") &&
      file !== "schema.ts" && file !== "convex.config.ts",
  );
  const functions = new Map();
  for (const file of modules) {
    const source = parse(file);
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const call = declaration.initializer;
        if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) continue;
        if (!["query", "mutation", "action"].includes(call.expression.text)) continue;
        const [definition] = call.arguments;
        const properties = ts.isObjectLiteralExpression(definition)
          ? definition.properties.map((property) => property.name?.getText(source))
          : [];
        functions.set(`${file.replace(/\.ts$/, "")}:${declaration.name.getText(source)}`, properties);
      }
    }
  }
  return functions;
}

// Function paths listed in the generated `ComponentApi` type.
function componentApiFunctions() {
  const source = parse("_generated/component.ts");
  const alias = source.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === "ComponentApi",
  );
  assert.ok(alias, "_generated/component.ts must declare ComponentApi");
  const paths = [];
  const walk = (node, prefix) => {
    for (const member of node.members) {
      const name = member.name.getText(source);
      if (ts.isTypeLiteralNode(member.type)) walk(member.type, prefix ? `${prefix}/${name}` : name);
      else paths.push(`${prefix}:${name}`);
    }
  };
  walk(alias.type, "");
  return paths.sort();
}

test("every published file and export target exists", () => {
  for (const file of pkg.files) assert.ok(existsSync(join(root, file)), `missing ${file}`);
  for (const target of Object.values(pkg.exports)) {
    assert.ok(existsSync(join(root, target)), `missing export target ${target}`);
  }
});

test("ComponentApi is published where apps on convex 1.35+ import it", () => {
  assert.ok(pkg.files.includes("_generated/component.ts"));
  assert.equal(pkg.exports["./_generated/component.js"], "./_generated/component.ts");
});

test("ComponentApi matches the component's public functions (run `npm run codegen`)", () => {
  assert.deepEqual(componentApiFunctions(), [...publicFunctions().keys()].sort());
});

test("every public function declares args and returns validators", () => {
  for (const [name, properties] of publicFunctions()) {
    assert.ok(properties.includes("args"), `${name} is missing args`);
    assert.ok(properties.includes("returns"), `${name} is missing returns`);
  }
});
