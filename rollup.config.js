/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 import svelte from "rollup-plugin-svelte";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';
import css from 'rollup-plugin-css-only';

const production = !process.env.ROLLUP_WATCH;

function serve() {
	let server;

	function toExit() {
		if (server) server.kill(0);
	}

	return {
		writeBundle() {
			if (server) return;
			server = require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: true
			});

			process.on('SIGTERM', toExit);
			process.on('exit', toExit);
		}
	};
}

export default [
    {
    input: "src/background.js",
    output: {
      file: "dist/background.js"
    },
    plugins: [
      resolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
  {
    input: "src/content-script.js",
    output: {
      file: "dist/content-script.js"
    },
    plugins: [
      resolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
  {
    input: "src/app/main.js",
    output: {
      sourcemap: true,
      format: "iife",
      name: "app",
      file: "public/build/bundle.js",
    },
    plugins: [
      // replace({
      //   __STORE_IMPLEMENTATION__: JSON.stringify(STORE_MOCK),
      //   __API_ENDPOINT__: production ? "web-extension" : "web",
      // }),
      // copy({
      //   targets: [
      //     { src: 'node_modules/@mozilla-protocol/core/protocol/fonts/*', dest: 'public/fonts/'},
      //     { src: 'node_modules/@mozilla-protocol/core/protocol/css/protocol.css', dest: 'public/build/'},
      //     { src: 'node_modules/@mozilla-protocol/core/protocol/css/protocol-extra.css', dest: 'public/build/'}
      //   ]
      // }),
      svelte({
        compilerOptions: {
          // enable run-time checks when not in production
          dev: !production
        }
      }),
      // we'll extract any component CSS out into
      // a separate file - better for performance
      css({ output: 'bundle.css' }),
  
      // If you have external dependencies installed from
      // npm, you'll most likely need these plugins. In
      // some cases you'll need additional configuration -
      // consult the documentation for details:
      // https://github.com/rollup/plugins/tree/master/packages/commonjs
      resolve({
        browser: true,
        dedupe: ["svelte"],
      }),
      commonjs(),
  
      // In dev mode, call `npm run start` once
      // the bundle has been generated
      !production && serve(),
  
      // Watch the `public` directory and refresh the
      // browser on changes when not in production
      !production && livereload("public"),
  
      // If we're building for production (npm run build
      // instead of npm run dev), minify
      production && terser(),
    ],
    watch: {
      clearScreen: false,
    },
  }
]
  // {
  //   input: "src/background.js",
  //   output: {
  //     file: "dist/background.js"
  //   },
  //   plugins: [
  //     resolve({
  //       browser: true,
  //     }),
  //     commonjs(),
  //   ],
  // },
  // {
  //   input: "src/content-script.js",
  //   output: {
  //     file: "dist/content-script.js"
  //   },
  //   plugins: [
  //     resolve({
  //       browser: true,
  //     }),
  //     commonjs(),
  //   ],
  // },

// export default {
//     input: "src/app/main.js",
//     output: {
//       sourcemap: true,
//       format: "iife",
//       name: "app",
//       file: "public/build/bundle.js",
//     },
//     plugins: [
//       // replace({
//       //   __STORE_IMPLEMENTATION__: JSON.stringify(STORE_MOCK),
//       //   __API_ENDPOINT__: production ? "web-extension" : "web",
//       // }),
//       // copy({
//       //   targets: [
//       //     { src: 'node_modules/@mozilla-protocol/core/protocol/fonts/*', dest: 'public/fonts/'},
//       //     { src: 'node_modules/@mozilla-protocol/core/protocol/css/protocol.css', dest: 'public/build/'},
//       //     { src: 'node_modules/@mozilla-protocol/core/protocol/css/protocol-extra.css', dest: 'public/build/'}
//       //   ]
//       // }),
//       svelte({
//         compilerOptions: {
//           // enable run-time checks when not in production
//           dev: !production
//         }
//       }),
//       // we'll extract any component CSS out into
//       // a separate file - better for performance
//       css({ output: 'public/build/bundle.css' }),
  
//       // If you have external dependencies installed from
//       // npm, you'll most likely need these plugins. In
//       // some cases you'll need additional configuration -
//       // consult the documentation for details:
//       // https://github.com/rollup/plugins/tree/master/packages/commonjs
//       resolve({
//         browser: true,
//         dedupe: ["svelte"],
//       }),
//       commonjs(),
  
//       // In dev mode, call `npm run start` once
//       // the bundle has been generated
//       !production && serve(),
  
//       // Watch the `public` directory and refresh the
//       // browser on changes when not in production
//       !production && livereload("public"),
  
//       // If we're building for production (npm run build
//       // instead of npm run dev), minify
//       production && terser(),
//     ],
//     watch: {
//       clearScreen: false,
//     },
//   }
