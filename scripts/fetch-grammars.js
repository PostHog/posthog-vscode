#!/usr/bin/env node

/**
 * Builds tree-sitter WASM grammar files for all supported languages.
 * Requires: tree-sitter-cli and emscripten (or docker).
 *
 * Usage: node scripts/fetch-grammars.js
 *
 * If tree-sitter CLI cannot build WASM (no emscripten), you can manually
 * place pre-built .wasm files in the grammars/ directory.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GRAMMARS_DIR = path.join(__dirname, '..', 'grammars');

const GRAMMARS = [
    'tree-sitter-javascript',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-go',
    'tree-sitter-ruby',
];

function hasCli() {
    try {
        execSync('npx tree-sitter --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function buildGrammar(grammarPkg, outputName, subDir) {
    const dest = path.join(GRAMMARS_DIR, outputName);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) {
        const size = (fs.statSync(dest).size / 1024).toFixed(0);
        console.log(`  ✓ ${outputName} (${size}KB, cached)`);
        return true;
    }

    const tempDir = path.join(__dirname, '..', '.grammar-build');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const grammarDir = path.join(tempDir, 'node_modules', grammarPkg);
    if (!fs.existsSync(grammarDir)) {
        process.stdout.write(`  ↓ Installing ${grammarPkg}...`);
        try {
            execSync(`npm install ${grammarPkg} --prefix "${tempDir}" --ignore-scripts`, {
                stdio: 'pipe',
                cwd: tempDir,
            });
            console.log(' OK');
        } catch (err) {
            console.log(` FAILED`);
            return false;
        }
    }

    const buildDir = subDir ? path.join(grammarDir, subDir) : grammarDir;
    process.stdout.write(`  ⚙ Building ${outputName}...`);
    try {
        execSync(`npx tree-sitter build --wasm -o "${dest}"`, {
            stdio: 'pipe',
            cwd: buildDir,
            timeout: 120000,
        });
        const size = (fs.statSync(dest).size / 1024).toFixed(0);
        console.log(` ${size}KB`);
        return true;
    } catch (err) {
        console.log(` FAILED`);
        return false;
    }
}

function main() {
    if (!fs.existsSync(GRAMMARS_DIR)) {
        fs.mkdirSync(GRAMMARS_DIR, { recursive: true });
    }

    console.log('Building tree-sitter grammar WASM files...\n');

    if (!hasCli()) {
        console.log('⚠ tree-sitter CLI not found. Install it:');
        console.log('  npm install -g tree-sitter-cli\n');
        console.log('Then re-run: node scripts/fetch-grammars.js');
        process.exit(1);
    }

    let built = 0;

    // JavaScript
    if (buildGrammar('tree-sitter-javascript', 'tree-sitter-javascript.wasm')) built++;

    // TypeScript (has typescript/ and tsx/ sub-directories)
    if (buildGrammar('tree-sitter-typescript', 'tree-sitter-typescript.wasm', 'typescript')) built++;
    if (buildGrammar('tree-sitter-typescript', 'tree-sitter-tsx.wasm', 'tsx')) built++;

    // Python
    if (buildGrammar('tree-sitter-python', 'tree-sitter-python.wasm')) built++;

    // Go
    if (buildGrammar('tree-sitter-go', 'tree-sitter-go.wasm')) built++;

    // Ruby
    if (buildGrammar('tree-sitter-ruby', 'tree-sitter-ruby.wasm')) built++;

    // Cleanup temp dir
    const tempDir = path.join(__dirname, '..', '.grammar-build');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* */ }

    console.log(`\n${built} grammar(s) ready in grammars/`);

    if (built === 0) {
        console.log('\n⚠ No grammars were built. You may need emscripten installed.');
        console.log('  See: https://emscripten.org/docs/getting_started/downloads.html');
        console.log('  Or use Docker: tree-sitter build --wasm --docker');
    }
}

main();
