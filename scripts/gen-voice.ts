import { readFileSync, writeFileSync } from "node:fs";
const text = readFileSync("voice-skill.txt", "utf8");
writeFileSync("src/lib/voiceSkill.generated.ts", `// Generated from voice-skill.txt by scripts/gen-voice.ts. Do not edit.\nexport const VOICE_SKILL = ${JSON.stringify(text)};\n`);
console.log("voice skill bytes:", text.length);
