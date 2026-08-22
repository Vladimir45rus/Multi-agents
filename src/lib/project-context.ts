import "server-only";

const MAX_CONTEXT_FILES = 80;
const MAX_FILE_BYTES = 120_000;
const MAX_TOTAL_BYTES = 700_000;

export type ProjectContextInput = {
  activeFilePath?: string;
  activeFileContent?: string;
};

export async function buildProjectContext(input: ProjectContextInput = {}) {
  try {
    const { readWorkspaceFile, listWorkspaceTree } = await import("@/lib/workspace-files");
    const tree = await listWorkspaceTree();
    const files = tree.files.slice(0, MAX_CONTEXT_FILES);
    const sections: string[] = [
      "PROJECT TREE:\n" + files.map((file) => `${file.path} (${file.language}, ${file.size} bytes)`).join("\n"),
    ];

    let totalBytes = sections[0].length;
    const activePath = input.activeFilePath?.trim();
    if (activePath) {
      const content = input.activeFileContent ?? (await readWorkspaceFile(activePath)).content;
      const bounded = content.slice(0, MAX_FILE_BYTES);
      const section = `OPEN FILE: ${activePath}\n\`\`\`\n${bounded}\n\`\`\``;
      if (totalBytes + section.length <= MAX_TOTAL_BYTES) sections.push(section);
    }

    return `IDE PROJECT CONTEXT\n${sections.join("\n\n")}`;
  } catch {
    const activePath = input.activeFilePath?.trim();
    const activeContent = input.activeFileContent?.slice(0, MAX_FILE_BYTES);
    const explicitFile = activePath && activeContent !== undefined
      ? `\n\nOPEN FILE: ${activePath}\n\`\`\`\n${activeContent}\n\`\`\``
      : "";
    return `IDE PROJECT CONTEXT\nNo connected workspace tree is available. Use only the context included in the request.${explicitFile}`;
  }
}
