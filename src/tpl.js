
export let sym_list; // Array: symbol strings.
export let tpl; // Array: encoded templates.
export let fragment; // DocumentFragment (non-null when inside a spawn-context)
export let spawn_tpl_into; // spawn_tpl function.

let p = 0; // read position in tpl being spawned.

export function ld(sym_data, tpl_data, doc_fragment, spawn_fn) {
  sym_list = sym_data;
  tpl = tpl_data;
  fragment = doc_fragment;
  spawn_tpl_into = spawn_fn;
}

export function rd() {
  return tpl[p++];
}

export function seek(ofs) {
  const old = p; p = ofs; return old;
}
