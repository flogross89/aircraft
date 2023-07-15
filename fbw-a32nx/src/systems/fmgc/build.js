// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

'use strict';

const esbuild = require('esbuild');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..', '..');
const outFile = 'out/flybywire-aircraft-a320-neo/html_ui/JS/fbw-a32nx/fmgc/fmgc.js';

const isProductionBuild = process.env.A32NX_PRODUCTION_BUILD === '1';

esbuild.build({
    absWorkingDir: __dirname,

    define: { DEBUG: 'false' },

    entryPoints: ['src/index.ts'],
    bundle: true,
    treeShaking: false,
    minify: isProductionBuild,

    outfile: path.join(rootDir, outFile),

    format: 'iife',
    globalName: 'Fmgc',

    sourcemap: isProductionBuild ? 'linked' : undefined,

    // Target approximate CoherentGT WebKit version
    target: 'safari11',
});