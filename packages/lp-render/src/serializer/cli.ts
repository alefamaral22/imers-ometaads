// CLI entrypoint for the serializer — runnable with `tsx` (SPEC-000 §8 Onda 8: "serializer roda
// com tsx"). Reads a ContentDoc JSON (file arg or stdin), validates it, and writes the artifacts.
//
//   tsx src/serializer/cli.ts --in content-doc.json --out ./generated
//   cat content-doc.json | tsx src/serializer/cli.ts --out ./generated
//
// The publish-landing-page-<cliente> skill (Onda 8, runner) will fetch the ContentDoc from
// Supabase and pipe it here before `next build`. This file is the ready boundary for that skill.
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parseContentDoc } from '../content-doc.js';
import { writeArtifacts } from './write.js';

interface Args {
  in?: string;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  let inPath: string | undefined;
  let outPath = './generated';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--in') inPath = argv[++i];
    else if (arg === '--out') outPath = argv[++i] ?? outPath;
  }
  return { ...(inPath !== undefined && { in: inPath }), out: outPath };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = args.in !== undefined ? await readFile(args.in, 'utf8') : await readStdin();
  // Untrusted input: parse JSON then validate by schema before doing anything with it.
  const doc = parseContentDoc(JSON.parse(raw));
  const written = await writeArtifacts(doc, args.out);
  for (const p of written) process.stdout.write(`${p}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
