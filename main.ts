// Suncrest Bay — entry program for make.fun gta6-01.
//
// Runs on Node 22 with only the standard library. It gathers the game and
// its screenshots into the output directory and writes dossier.json, the
// summary the judge reads, using the kit's vendored dossier library.
//
// Local run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The grader sets /output instead and runs this twice; both runs must
// produce identical bytes, so nothing here depends on time or randomness.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(src: string, dst: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    const to = join(dst, entry);
    if (statSync(from).isDirectory()) copyTree(from, to);
    else cpSync(from, to);
  }
}

// Fresh output directory, then the game, then the screenshots.
mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

// The dossier caps mirror the gate scorer's own limits (see RULES.txt):
// at most 4 screenshots of 256 KiB, at most 993 game files totalling
// 48 MiB, no game path over 1000 bytes, dossier text capped at 160 KiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
