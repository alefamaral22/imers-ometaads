// Thin I/O wrapper around the pure serializer: writes the artifacts to disk. Kept separate from
// serialize.ts so the core stays pure/testable; this is the only file here that touches fs.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ContentDoc } from '../content-doc.js';
import { serialize } from './serialize.js';

// Write messages/pt.json, content-spec.json and theme.css under outDir. Returns written paths.
export async function writeArtifacts(doc: ContentDoc, outDir: string): Promise<string[]> {
  const artifacts = serialize(doc);
  const written: string[] = [];
  for (const [rel, contents] of Object.entries(artifacts)) {
    const target = join(outDir, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
    written.push(target);
  }
  return written;
}
