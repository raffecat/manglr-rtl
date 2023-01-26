import typescript from '@rollup/plugin-typescript';
import buble from '@rollup/plugin-buble';
import uglify from 'rollup-plugin-uglify';
import alias from '@rollup/plugin-alias';
//import consts from 'rollup-plugin-consts';
import fs from 'fs'

const major = 0, minor = 1

const build = +fs.readFileSync('build-version', 'utf8') + 1
fs.writeFileSync('build-version', ''+build, 'utf8')

const banner = `/* <~> Manglr ${major}.${minor}.${build} | by Andrew Towers | MIT License | https://github.com/raffecat/manglr-rtl */`

const ts_conf = {
}

// https://buble.surge.sh/guide/
const buble_conf = {
  transforms: {
    dangerousForOf: true // for (let x of array) {}
  },
  namedFunctionExpressions: false // don't emit: { methodName: function methodName(){} }
}

const uglify_conf = {
  output: {
    preamble: banner
  },
  mangle: {
    properties: {
      // Caveat: any name used quoted e.g. obj['name'] becomes a reserved name,
      // and therefore won't be mangled even in its bare form: obj.name.
      // Caveat: cannot use any built-in field names in my own objects (because
      // they are reserved names, and behave as described above.)
      // An uglify cli option to print all reserved names (and why) would be handly.
      debug: false,
      builtins: true,
      keep_quoted: true,
      reserved: [
        // Array
        'length',
        'push',
        // Function
        'call',
        // Math
        'floor',
        'ceil',
        'round',
        // DOM
        'requestAnimationFrame',
        'addEventListener',
        'createElement',
        'createTextNode',
        'setAttribute',
        'appendChild',
        'insertBefore',
        'firstChild',
        'preventDefault',
        'body',
        'innerHTML',
        'location',
        'pathname',
        'search',
        'split',
      ]
    }
  }
};

export default [
  {
    input: 'src/mount.ts',
    output: {
      file: 'build/manglr.debug.js',
      format: 'iife',
      banner: banner
    },
    plugins: [
      typescript(ts_conf),
      buble(buble_conf)
    ]
  },
  {
    input: 'src/mount.ts',
    output: {
      file: 'build/manglr.min.js',
      format: 'iife',
      banner: banner
    },
    plugins: [
      alias({
        entries: [
          { find: './debug', replacement: '../debug-false' },
        ]
      }),
      typescript(ts_conf),
      buble(buble_conf),
      uglify(uglify_conf)
    ]
  }
];
