import fs from "node:fs/promises";
import path from "node:path";

import {
  getProjectEnvFilePath,
  readDotEnvFile,
  writeDotEnvValue
} from "../../server/lib/utils/env_files.js";
import { parseSimpleYaml } from "../../server/lib/utils/yaml_lite.js";

const PARAM_TYPES = new Set(["number", "text"]);
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/u;
const RANGE_PATTERN = /^(-?\d+(?:\.\d+)?)\s*(?:\.\.|-)\s*(-?\d+(?:\.\d+)?)$/u;

function normalizeParamName(rawValue) {
  return String(rawValue || "").trim().toUpperCase();
}

function escapeRegExp(sourceText) {
  return String(sourceText || "").replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&");
}

function matchesTextRule(value, rule) {
  const normalizedRule = String(rule || "");
  if (!normalizedRule) {
    return false;
  }

  if (
    normalizedRule.length > 2 &&
    normalizedRule.startsWith("/") &&
    normalizedRule.endsWith("/")
  ) {
    return new RegExp(normalizedRule.slice(1, -1), "u").test(value);
  }

  if (normalizedRule.includes("*") || normalizedRule.includes("?")) {
    const regexText = escapeRegExp(normalizedRule)
      .replace(/\\\*/gu, ".*")
      .replace(/\\\?/gu, ".");

    return new RegExp(`^${regexText}$`, "u").test(value);
  }

  return value === normalizedRule;
}

function matchesNumberRule(value, rule, paramName) {
  const normalizedRule = String(rule || "").trim();
  if (!normalizedRule) {
    return false;
  }

  const rangeMatch = normalizedRule.match(RANGE_PATTERN);
  if (rangeMatch) {
    const firstValue = Number(rangeMatch[1]);
    const secondValue = Number(rangeMatch[2]);
    const minimum = Math.min(firstValue, secondValue);
    const maximum = Math.max(firstValue, secondValue);

    return value >= minimum && value <= maximum;
  }

  if (!NUMBER_PATTERN.test(normalizedRule)) {
    throw new Error(`Invalid numeric rule "${normalizedRule}" for ${paramName} in commands/params.yaml.`);
  }

  return value === Number(normalizedRule);
}

function formatAllowedValues(allowed) {
  return allowed.map((rule) => String(rule)).join(", ");
}

function normalizeAllowed(rawAllowed) {
  if (rawAllowed === undefined || rawAllowed === null) {
    return [];
  }

  if (Array.isArray(rawAllowed)) {
    return rawAllowed.map((value) => String(value));
  }

  return [String(rawAllowed)];
}

function normalizeParamSpec(paramName, rawSpec) {
  if (!rawSpec || typeof rawSpec !== "object" || Array.isArray(rawSpec)) {
    throw new Error(`commands/params.yaml entry ${paramName} must be an object.`);
  }

  const type = String(rawSpec.type || "").trim().toLowerCase();
  if (!PARAM_TYPES.has(type)) {
    throw new Error(`commands/params.yaml entry ${paramName} must use type "text" or "number".`);
  }

  const allowed = normalizeAllowed(rawSpec.allowed);
  if (!allowed.length) {
    throw new Error(`commands/params.yaml entry ${paramName} must define at least one allowed value or range.`);
  }

  return {
    allowed,
    description: String(rawSpec.description || ""),
    name: paramName,
    type
  };
}

async function loadParamSpecs(commandsDir) {
  const paramsFilePath = path.join(commandsDir, "params.yaml");
  const sourceText = await fs.readFile(paramsFilePath, "utf8");
  const parsedParams = parseSimpleYaml(sourceText);

  return Object.entries(parsedParams).map(([paramName, rawSpec]) =>
    normalizeParamSpec(paramName, rawSpec)
  );
}

async function findParamSpec(commandsDir, rawParamName) {
  const paramName = normalizeParamName(rawParamName);
  if (!paramName) {
    throw new Error("A parameter name is required.");
  }

  const paramSpecs = await loadParamSpecs(commandsDir);
  const spec = paramSpecs.find((entry) => entry.name === paramName);

  if (!spec) {
    throw new Error(`Unknown server config parameter: ${paramName}`);
  }

  return spec;
}

function getStoredValue(projectRoot, paramName) {
  const envValues = readDotEnvFile(getProjectEnvFilePath(projectRoot));

  if (!Object.prototype.hasOwnProperty.call(envValues, paramName)) {
    return "";
  }

  return envValues[paramName];
}

function validateConfigValue(spec, rawValue) {
  if (spec.type === "number") {
    const normalizedValue = String(rawValue || "").trim();
    if (!NUMBER_PATTERN.test(normalizedValue)) {
      throw new Error(`${spec.name} expects a numeric value.`);
    }

    const numericValue = Number(normalizedValue);
    const isAllowed = spec.allowed.some((rule) =>
      matchesNumberRule(numericValue, rule, spec.name)
    );

    if (!isAllowed) {
      throw new Error(`${spec.name} must match one of: ${formatAllowedValues(spec.allowed)}.`);
    }

    return normalizedValue;
  }

  const normalizedValue = String(rawValue ?? "");
  const isAllowed = spec.allowed.some((rule) => matchesTextRule(normalizedValue, rule));

  if (!isAllowed) {
    throw new Error(`${spec.name} must match one of: ${formatAllowedValues(spec.allowed)}.`);
  }

  return normalizedValue;
}

async function listServerConfigParams(projectRoot, commandsDir) {
  const paramSpecs = await loadParamSpecs(commandsDir);

  return paramSpecs.map((spec) => ({
    ...spec,
    value: getStoredValue(projectRoot, spec.name)
  }));
}

async function getServerConfigParam(projectRoot, commandsDir, rawParamName) {
  const spec = await findParamSpec(commandsDir, rawParamName);

  return {
    ...spec,
    value: getStoredValue(projectRoot, spec.name)
  };
}

async function setServerConfigParam(projectRoot, commandsDir, rawParamName, rawValue) {
  const spec = await findParamSpec(commandsDir, rawParamName);
  const value = validateConfigValue(spec, rawValue);

  writeDotEnvValue(getProjectEnvFilePath(projectRoot), spec.name, value);

  return {
    ...spec,
    value
  };
}

export {
  formatAllowedValues,
  getServerConfigParam,
  listServerConfigParams,
  normalizeParamName,
  setServerConfigParam
};
