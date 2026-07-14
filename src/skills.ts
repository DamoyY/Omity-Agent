import type { Settings, SkillInfo } from "./types";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import matter from "gray-matter";
import untildify from "untildify";
import { z } from "zod";
const skillMetaSchema = z.object({
  description: z.string().min(1),
  name: z.string().min(1),
});
type SkillMeta = z.infer<typeof skillMetaSchema>;
export function loadSkills(settings: Settings): SkillInfo[] {
  if (!settings.skills.enabled) {
    return [];
  }
  const skillsDir = resolveUserPath(settings.skills.directory);
  if (!existsSync(skillsDir)) {
    throw new Error(`Skills 目录不存在：${skillsDir}`);
  }
  const skills = readdirSync(skillsDir)
    .map((entry) => join(skillsDir, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .map(readSkill);
  const names = new Set<string>();
  for (const skill of skills) {
    if (names.has(skill.name)) {
      throw new Error(`Skill 名称重复：${skill.name}`);
    }
    names.add(skill.name);
  }
  for (const skillName of Object.keys(settings.skills.skillEnabled)) {
    if (!names.has(skillName)) {
      throw new Error(`未知 Skill 开关：${skillName}`);
    }
  }
  return skills.filter((skill) => settings.skills.skillEnabled[skill.name] ?? true);
}
export function buildSkillsMessage(settings: Settings) {
  const skills = loadSkills(settings);
  if (!settings.skills.enabled) {
    return null;
  }
  const lines = [
    settings.skills.usagePrompt.trim(),
    "",
    "## Skills 列表",
    ...skills.map((skill) => `- ${skill.name}: ${skill.description} (file: ${skill.source})`),
  ];
  if (skills.length === 0) {
    lines.push("- 当前没有启用的 Skill。");
  }
  return lines.join("\n");
}
function readSkill(skillDir: string): SkillInfo {
  const source = join(skillDir, "SKILL.md");
  if (!existsSync(source)) {
    throw new Error(`缺少 Skill 文件：${source}`);
  }
  const meta = parseSkillMeta(readFileSync(source, "utf8"), source);
  return { ...meta, source };
}
function parseSkillMeta(content: string, source: string): SkillMeta {
  if (!matter.test(content)) {
    throw new Error(`Skill 缺少 YAML front matter：${source}`);
  }
  return skillMetaSchema.parse(matter(content).data);
}
function resolveUserPath(path: string) {
  const expanded = untildify(path);
  return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
}
