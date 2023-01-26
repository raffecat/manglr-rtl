import { debug } from './debug'; // rollup-plugin-consts
export { debug } from './debug';

// logging options in debug build.
export const log_expr = debug && true;
export const log_spawn = debug && true;
export const log_deps = debug && false;

export const hasOwn = Object['prototype']['hasOwnProperty'];
