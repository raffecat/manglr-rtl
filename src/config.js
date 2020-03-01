import is_debug from 'consts:debug'; // rollup-plugin-consts

export const debug = is_debug;

// logging options in debug build.
export const log_expr = debug && true;
export const log_spawn = debug && true;
export const log_deps = debug && true;

export const hasOwn = Object['prototype']['hasOwnProperty'];
