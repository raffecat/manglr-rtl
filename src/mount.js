import { b93_decode } from './b93'
import { spawn_children } from './spawn-children'
import { init_sc, spawn_tpl_into } from './spawn-tpl'
import { new_vnode } from './vnode'
import { run_updates } from './deps'

window['manglr'] = function(tpl_str, syms) {
  const tpl = b93_decode(tpl_str); // unpack tpl data to an array of integers.
  init_sc(tpl, syms, spawn_children);
  // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
  const scope = { locals:[], cssm:"", c_tpl:0, c_locals:[], c_cssm:"", d_list:[] };
  const vnode = new_vnode(null, null);
  vnode.dom = document.body;
  spawn_tpl_into(1, scope, vnode);
  run_updates();
};
