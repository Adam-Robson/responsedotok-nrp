#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * Execute a shell command asynchronously in root.
 *
 * @param cmd The command to execute.
 * @returns The standard output of the command.
 */

export function run(cmd) {
  console.info(`\n$ ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Recurse through a directory and execute a function
 * in each file.
 *
 * @param dir The directory to recurse through.
 * @param fn The function to execute in each file.
 * @returns void
 */

export function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    e.isDirectory() ? walk(full, fn) : fn(full);
  }
}

/**
 * Copy files from source to destination; 
 * preserve source directory structure.
 *
 * @param src The source directory.
 * @param dest The destination directory to copy the files to.
 * @returns void
 */
export function copy(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  walk(src, (file) => {
    const rel = path.relative(src, file);
    const destFile = path.join(dest, rel);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(file, destFile);
  });
}

/**
 * Prepend a shebang to a file that does not have one.
 *
 * @param f The file to prepend the shebang to.
 * @param shebang The shebang to prepend.
 * @returns void
 */
export function shebang(f) {
  const content = fs.readFileSync(f, 'utf-8');
  if (!content.startsWith('#')) {
    fs.writeFileSync(f, `#!/usr/bin/env node\n${content}`, 'utf-8');
  }
  fs.chmodSync(f, 0o755);
}

/**
 * Update common JavaScript files to ES modules by
 * replacing require syntax with imports, and .js extensions
 * with .mjs.
 *
 * @param f The file to update.
 * @returns void
 */
export function esmify(dir) {
  // first pass
  const renames = new Map();
  walk(dir, (file) => {
    if (file.endsWith('.js')) {
      const esmFile = file.replace(/\.js$/, '.mjs');
      renames.set(file, esmFile);
    }
  });
  renames.forEach((esmFile, file) => {
    fs.renameSync(file, esmFile);
  });

  // second pass
  walk(dir, (file) => {
    if (!file.endsWith('.mjs') && !file.endsWith('.d.ts')) return;
    let src = fs.readFileSync(file, 'utf-8');
    src = src.replace(
      /(from\s+["'])(\.{1,2}\/[^"']+?)\.js(["'])/g,
      '$1$2.mjs$3',
    );
    src = src.replace(
      /(export\s+.*?from\s+["'])(\.{1,2}\/[^"']+?)\.js(["'])/g,
      '$1$2.mjs$3',
    );
    src = src.replace(
      /\/\/# sourceMappingURL=(.+?)\.js\.map/,
      '//# sourceMappingURL=$1.mjs.map',
    );
    fs.writeFileSync(file, src);
  });
}

/**
 * Clean the given directory, build the package in common JS & ES module
 * formats, and copy the files to dist.
 * @param dir The directory to clean & build the package in.
 * @returns void
 */
export function build(dir) {
  try {
    console.info(`\n▶▶▶ ▶▶▶  Cleaning ${dir} for build output...\n`);
    fs.rmSync(dir, { recursive: true, force: true });

    console.info('\n▶▶▶ ▶▶▶  Building ES modules (tsc -> dist/esm/)...\n');
    run('npx tsc --project tsconfig.json --outDir dist/esm');
    esmify(path.join(dir, 'esm'));

    // Flatten ESM directory to root of build
    console.info(
      '\n▶▶▶ ▶▶▶  Copying surface ESM files (dist/esm/) to build root (dist/)...\n',
    );
    copy(path.join(dir, 'esm'), dir);
    fs.rmSync(path.join(dir, 'esm'), { recursive: true, force: true });

    console.info('\n▶▶▶ ▶▶▶  Building CJS modules (tsc -> dist/cjs/)...\n');
    run('npx tsc --project tsconfig.cjs.json --outDir dist/cjs');

    // Mark CJS files so Node resolves them correctly
    console.info('\n▶▶▶ ▶▶▶  Marking CJS files for appropriate resolution by Node...\n');
    fs.writeFileSync(
      path.join(dir, 'cjs', 'package.json'),
      `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
    );

    const candidates = [
      path.join(dir, 'src', 'index.mjs'),
      path.join(dir, 'cjs', 'src', 'index.js'),
    ];

    for (const f of candidates) {
      if (fs.existsSync(f)) {
        console.info(`\n▶▶▶ ▶▶▶ Prepending shebang → ${path.relative(ROOT, f)}\n`);
        shebang(f);
      }
    }

    console.info('\n▶▶▶ ▶▶▶  Build complete!\n');
    const report = [
      'dist/src/index.mjs',
      'dist/src/index.d.ts',
      'dist/src/cli/index.mjs',
      'dist/cjs/src/index.js',
      'dist/cjs/src/cli/index.js',
    ];
    for (const f of report) {
      const full = path.join(dir, f);
      if (fs.existsSync(full)) {
        const kb = (fs.statSync(full).size / 1024).toFixed(1);
        console.info(`\n  ${f.padEnd(32)} ${kb} kB\n`);
      }
    }
    console.info('\n▶▶▶ ▶▶▶  Exiting...\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n▶▶▶ ▶▶▶ Build failed with error:\n`);
    console.error(`\n${err}\n`);
    process.exit(1);
  }
}

build(path.join(ROOT, 'dist'));
