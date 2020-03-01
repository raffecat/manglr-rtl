import { log_spawn } from './config'
import { resolve_expr } from './expr_ops'

// sc { tpl, ofs, syms, fragment, spawn_children }

// -+-+-+-+-+-+-+-+-+ Component Spawn -+-+-+-+-+-+-+-+-+

export function create_component(sc, parent, outer_scope) {
  // spawn a component instance:
  const tpl_id = sc.tpl[sc.ofs++]; //[0] = tpl index of component to create.
  const c_tpl = sc.tpl[sc.ofs++]; // [1] = tpl index of component tag's contents (0 if empty)
  const tpl_ofs = sc.tpl[tpl_id]; // look up tpl in template index table (could patch out)
  const cssm = sc.syms[sc.tpl[tpl_ofs]]; // tpl[0] symbol for CSS namespacing.
  let nins = sc.tpl[tpl_ofs+1]; // tpl[1] is number of bindings.
  let ndefs = sc.tpl[tpl_ofs+2]; // tpl[2] is number of local slots.
  if (log_spawn) console.log(`[s] create component: ${cssm}, tpl=${tpl_id}, contents=${c_tpl}, nins=${nins}, ndefs=${ndefs}`);
  // component binds: one expression per input.
  // each binding (evaluated in the outer scope) becomes a local in the new scope.
  const locals = [];
  let lp = 0;
  while (nins--) {
    // [2...] = expressions bound to component inputs.
    locals[lp++] = resolve_expr(sc, outer_scope);
  }
  // note: contents of component tag (c_tpl) must be spawned using the outer locals!
  // note: components pass through the 'd_list' of the enclosing 'when' or 'each'.
  // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
  const new_scope = { locals:locals, cssm:cssm,
    c_tpl:c_tpl, c_locals:outer_scope.locals, c_cssm:outer_scope.cssm, d_list:outer_scope.d_list };
  // component locals: bind expressions inside the component.
  // note: compiler MUST ensure locals are bound before they are used,
  // i.e. each resolve_expr can only access previous local slots!
  // push context: save tpl-ofs and set to component's template.
  const saved_ofs = sc.ofs ; sc.ofs = tpl_ofs+3; // tpl[3] is the first local binding.
  while (ndefs--) {
    locals[lp++] = resolve_expr(sc, new_scope);
  }
  // component body: spawn vnodes that make up the component body.
  sc.spawn_children(sc, parent, new_scope);
  // pop context: restore saved tpl-ofs.
  sc.ofs = saved_ofs;
}
