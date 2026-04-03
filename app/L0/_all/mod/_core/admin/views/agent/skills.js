const ADMIN_SKILLS_ROOT_PATH = "L0/_all/mod/_core/admin/skills/";
const SKILL_FILE_NAME = "SKILL.md";

function isMissingFileError(error) {
  const message = String(error?.message || "");
  return /\bstatus 404\b/u.test(message) || /File not found\./u.test(message) || /Path not found\./u.test(message);
}

function normalizeSkillSegment(segment) {
  const value = String(segment || "").trim();

  if (!value || value === "." || value === ".." || !/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error(`Invalid skill name segment: ${segment}`);
  }

  return value;
}

function normalizeSkillName(name) {
  const rawName = String(name || "").trim().replace(/^\/+|\/+$/gu, "");

  if (!rawName) {
    throw new Error("Skill name must not be empty.");
  }

  return rawName
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeSkillSegment(segment))
    .join("/");
}

function buildSkillFilePath(name) {
  return `${ADMIN_SKILLS_ROOT_PATH}${normalizeSkillName(name)}/${SKILL_FILE_NAME}`;
}

function getTopLevelSkillName(path) {
  const normalizedPath = String(path || "").trim();

  if (!normalizedPath.startsWith(ADMIN_SKILLS_ROOT_PATH) || !normalizedPath.endsWith(`/${SKILL_FILE_NAME}`)) {
    return "";
  }

  const relativePath = normalizedPath.slice(ADMIN_SKILLS_ROOT_PATH.length, -`/${SKILL_FILE_NAME}`.length);
  return relativePath && !relativePath.includes("/") ? relativePath : "";
}

function createListedSkillEntry(file, parsedDocument) {
  const skillName = getTopLevelSkillName(file?.path);

  if (!skillName) {
    return null;
  }

  const frontmatter = parsedDocument?.frontmatter && typeof parsedDocument.frontmatter === "object" ? parsedDocument.frontmatter : {};

  return {
    description: String(frontmatter.description || "").trim(),
    filePath: String(file?.path || ""),
    name: String(frontmatter.name || skillName).trim() || skillName,
    path: skillName
  };
}

function buildSkillListLines(skills) {
  return skills.map((skill) => {
    const description = skill.description ? ` | ${skill.description}` : "";
    return `- ${skill.path} | ${skill.name}${description}`;
  });
}

async function listTopLevelSkillFiles() {
  try {
    const result = await globalThis.space.api.fileList(ADMIN_SKILLS_ROOT_PATH, true);
    const paths = Array.isArray(result?.paths) ? result.paths : [];

    return paths
      .filter((path) => Boolean(getTopLevelSkillName(path)))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw new Error(`Unable to list admin skills: ${error.message}`);
  }
}

export async function loadAdminSkillCatalog() {
  const skillPaths = await listTopLevelSkillFiles();

  if (!skillPaths.length) {
    return [];
  }

  let result;

  try {
    result = await globalThis.space.api.fileRead({
      files: skillPaths
    });
  } catch (error) {
    throw new Error(`Unable to read admin skills: ${error.message}`);
  }

  const files = Array.isArray(result?.files) ? result.files : [];

  return files
    .map((file) => {
      const parsedDocument = globalThis.space.utils.markdown.parseDocument(String(file?.content || ""));
      return createListedSkillEntry(file, parsedDocument);
    })
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function buildAdminSkillsPromptSection() {
  const skills = await loadAdminSkillCatalog();

  if (!skills.length) {
    return "";
  }

  return [
    "## Admin Skills",
    "Skills are loaded on demand.",
    "Load a skill with a JavaScript execution block that returns `await space.admin.loadSkill(\"<path>\")`.",
    "Do not rely on a skill's hidden content until you load it.",
    "Some skills are routing skills and may tell you to load a deeper skill path next.",
    "Available skills path|name|description:",
    ...buildSkillListLines(skills)
  ].join("\n");
}

export async function loadAdminSkill(name) {
  const skillPath = buildSkillFilePath(name);
  let result;

  try {
    result = await globalThis.space.api.fileRead(skillPath);
  } catch (error) {
    throw new Error(`Unable to load admin skill "${name}": ${error.message}`);
  }

  return {
    __spaceAdminSkill: true,
    content: String(result?.content || ""),
    path: String(result?.path || skillPath),
    skillName: normalizeSkillName(name)
  };
}

export function installAdminSkillRuntime() {
  globalThis.space.admin = {
    ...(globalThis.space.admin && typeof globalThis.space.admin === "object" ? globalThis.space.admin : {}),
    loadSkill: loadAdminSkill
  };
}
