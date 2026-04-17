export interface ParsedSkill {
  title: string;
  preamble: string;
  sections: Record<string, string>;
}

export function parseSkill(md: string): ParsedSkill {
  const lines = md.split("\n");
  let title = "";
  let i = 0;
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    i = 1;
  }
  const preambleLines: string[] = [];
  while (i < lines.length && !lines[i].startsWith("## ")) {
    preambleLines.push(lines[i]);
    i++;
  }
  const preamble = preambleLines.join("\n").trim();

  const sections: Record<string, string> = {};
  let currentName: string | null = null;
  let currentBody: string[] = [];
  const flush = () => {
    if (currentName !== null) sections[currentName] = currentBody.join("\n").trim();
  };
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("## ")) {
      flush();
      currentName = l.slice(3).trim();
      currentBody = [];
    } else {
      currentBody.push(l);
    }
  }
  flush();
  return { title, preamble, sections };
}

export function composeInstructions(parsed: ParsedSkill): string {
  const order = ["On connect", "After every turn", "When to post", "Completion"];
  const parts: string[] = [];
  if (parsed.title) parts.push(parsed.title);
  if (parsed.preamble) parts.push(parsed.preamble);
  for (const name of order) {
    if (parsed.sections[name]) parts.push(`${name}: ${parsed.sections[name]}`);
  }
  return parts.join("\n\n");
}
