import { debug, log_spawn } from './config'
import { resolve_expr, is_true, to_text } from './expr_ops'
import { dom_add_class, dom_remove_class } from './dom'
import { new_cell, subscribe_dep, remove_fwd, run_updates } from './cells'
import { d_list_add } from './d_list'
import { run_action } from './actions'
import { ActionType, BoundEventState, BoundExprState, Cell, Scope, SpawnCtx } from './types'

type AttrOp = (sc:SpawnCtx, dom_node:HTMLElement, scope:Scope, cls:string[]) => void;

export const attr_ops:AttrOp[] = [
  attr_const_attr,       // 0 // A_CONST_TEXT (setAttribute)
  attr_const_class,      // 1 // A_CONST_CLASS (class name)
  attr_bound_attr,       // 2 // A_BOUND_ATTR (setAttribute)
  attr_bound_prop_text,  // 3 // A_BOUND_PROP_TEXT (DOM property)
  attr_bound_prop_bool,  // 4 // A_BOUND_PROP_BOOL (DOM property)
  attr_bound_class,      // 5 // A_BOUND_CLASS (class name)
  attr_bound_style_prop, // 6 // A_BOUND_STYLE_TEXT (DOM property)
  attr_on_event,         // 7 // A_ON_EVENT (addEventListener)
];

type ExprUpdateFunc = (cell:Cell, state:BoundExprState) => void;

function bind_to_expr(name:string, expr_dep:Cell, dom_node:HTMLElement, scope:Scope, update_func:ExprUpdateFunc): void {
  const state:BoundExprState = { name:name, dom_node:dom_node, expr_dep:expr_dep };
  const bind_dep = new_cell(expr_dep.val, update_func, state);
  subscribe_dep(expr_dep, bind_dep);
  d_list_add(scope.d_list, destroy_bound_expr, bind_dep);
  update_func(bind_dep, state); // update now.
}

function destroy_bound_expr(bind_dep:Cell): void {
  const state = bind_dep.state as BoundExprState;
  remove_fwd(state.expr_dep, bind_dep); // remove from 'fwd' list.
}

// -+-+-+-+-+-+-+-+-+ Literal Attribute / Class -+-+-+-+-+-+-+-+-+

function attr_const_attr(sc:SpawnCtx, dom_node:HTMLElement): void {
  // used for custom attributes such as aria-role.
  const attr = sc.syms[sc.tpl[sc.ofs++]!] as string;
  const text = sc.syms[sc.tpl[sc.ofs++]!] as string;
  if (log_spawn) console.log("[a] literal attribute: "+attr+" = "+text);
  dom_node['setAttribute'](attr, text);
}

function attr_const_class(sc:SpawnCtx, _dom_node:HTMLElement, _scope:Scope, cls:string[]): void {
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
  if (log_spawn) console.log("[a] literal class: "+name);
  cls['push'](name);
}

// -+-+-+-+-+-+-+-+-+ Bound Attribute -+-+-+-+-+-+-+-+-+

function attr_bound_attr(sc:SpawnCtx, dom_node:HTMLElement, scope:Scope): void {
  // bound attribute.
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
  const expr_dep = resolve_expr(sc, scope) as Cell;
  if (log_spawn) console.log("[a] bound attribute: "+name, expr_dep);
  if (expr_dep.wait<0) {
    // constant value.
    const val = to_text(expr_dep.val);
    if (val) dom_node['setAttribute'](name, val);
  } else {
    // varying value.
    bind_to_expr(name, expr_dep, dom_node, scope, update_bound_attr);
  }
}

function update_bound_attr(_cell:Cell, state:BoundExprState): void {
  // update a DOM Element attribute from an input dep's value.
  const val = to_text(state.expr_dep.val);
  if (val) {
    state.dom_node['setAttribute'](state.name, val);
  } else {
    state.dom_node['removeAttribute'](state.name);
  }
}

// -+-+-+-+-+-+-+-+-+ Bound Text Property -+-+-+-+-+-+-+-+-+

function attr_bound_prop_text(sc:SpawnCtx, dom_node:HTMLElement, scope:Scope): void {
  // bound property.
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
  const expr_dep = resolve_expr(sc, scope) as Cell;
  if (log_spawn) console.log("[a] bound property: "+name, expr_dep);
  if (expr_dep.wait<0) {
    // constant value.
    // avoid setting to empty-string e.g. src="" can load this page!
    const val = expr_dep.val;
    if (val != null) (dom_node as any)[name] = to_text(val);
  } else {
    // varying value.
    bind_to_expr(name, expr_dep, dom_node, scope, update_bound_prop_text);
  }
}

function update_bound_prop_text(_cell:Cell, state:BoundExprState): void {
  // update a DOM Element property from an input dep's value.
  const dom = state.dom_node, name = state.name;
  const val = state.expr_dep.val;
  // avoid page re-flows if the value hasn't actually changed.
  // avoid setting to empty-string e.g. src="" can load this page!
  const new_val = val != null ? to_text(val) : null;
  if ((dom as any)[name] !== new_val) {
    (dom as any)[name] = new_val;
  }
}

// -+-+-+-+-+-+-+-+-+ Bound Bool Property -+-+-+-+-+-+-+-+-+

function attr_bound_prop_bool(sc:SpawnCtx, dom_node:HTMLElement, scope:Scope): void {
  // bound property.
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
  const expr_dep = resolve_expr(sc, scope) as Cell;
  if (log_spawn) console.log("[a] bound property: "+name, expr_dep);
  if (expr_dep.wait<0) {
    // constant value.
    (dom_node as any)[name] = is_true(expr_dep.val);
  } else {
    // varying value.
    bind_to_expr(name, expr_dep, dom_node, scope, update_bound_prop_bool);
  }
}

function update_bound_prop_bool(_cell:Cell, state:BoundExprState): void {
  // update a DOM Element property from an input dep's value.
  const dom = state.dom_node, name = state.name;
  const val = is_true(state.expr_dep.val);
  // avoid page re-flows if the value hasn't actually changed.
  if ((dom as any)[name] !== val) {
    (dom as any)[name] = val;
  }
}

// -+-+-+-+-+-+-+-+-+ Bound Class -+-+-+-+-+-+-+-+-+

function attr_bound_class(sc:SpawnCtx, dom_node:HTMLElement, scope:Scope, cls:string[]): void {
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
  const expr_dep = resolve_expr(sc, scope) as Cell;
  if (log_spawn) console.log("[a] bound property: "+name, expr_dep);
  if (expr_dep.wait<0) {
    // constant value.
    if (is_true(expr_dep.val)) {
      cls['push'](name);
    }
  } else {
    // varying value.
    bind_to_expr(name, expr_dep, dom_node, scope, update_bound_class);
  }
}

function update_bound_class(_cell:Cell, state:BoundExprState): void {
  // single class bound to a boolean expression.
  // FIXME: this update runs if any upstream dep was dirty, even if
  // the resulting value has not changed! (want to avoid spurious DOM access)
  const val = is_true(state.expr_dep.val);
  (val ? dom_add_class : dom_remove_class)(state.dom_node, state.name);
}

// -+-+-+-+-+-+-+-+-+ Bound Style -+-+-+-+-+-+-+-+-+

function attr_bound_style_prop(sc:SpawnCtx, dom_node:HTMLElement, scope:Scope): void {
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
  const expr_dep = resolve_expr(sc, scope) as Cell;
  if (log_spawn) console.log("[a] bound style: "+name, expr_dep);
  if (expr_dep.wait<0) {
    // constant value.
    (dom_node.style as any)[name] = to_text(expr_dep.val);
  } else {
    // varying value.
    bind_to_expr(name, expr_dep, dom_node, scope, update_bound_style_text);
  }
}

function update_bound_style_text(_cell:Cell, state:BoundExprState): void {
  // update a DOM Element style from an input dep's value.
  (state.dom_node.style as any)[state.name] = to_text(state.expr_dep.val);
}

// -+-+-+-+-+-+-+-+-+ On Event -+-+-+-+-+-+-+-+-+

function attr_on_event(sc:SpawnCtx, dom_node:HTMLElement, scope:Scope): void {
  const name = sc.syms[sc.tpl[sc.ofs++]!] as string; // [1] name of the event to bind.
  const slot = sc.tpl[sc.ofs++]!;                    // [2] local action slot.
  const bound_arg = resolve_expr(sc, scope);         // [3] bound argument to the action.
  const ref_act = scope.locals[slot]!.val as ActionType; // XXX actions are currently non-optional (apps use an empty action!)
  // make a copy of the action, but with args actually bound.
  const action:ActionType = { sc:sc, scope:ref_act.scope, tpl:ref_act.tpl, arg:bound_arg };
  if (debug) action.d_is = 'action';
  if (log_spawn) console.log(`[a] on event: '${name}' n=${slot}:`, action);
  const handler = bind_event_to_action(name, action);
  dom_node.addEventListener(name, handler, false);
  d_list_add(scope.d_list, unbind_event_handler, { dom_node, name, handler });
}

function bind_event_to_action(name:string, action:ActionType): ((e:Event)=>void) {
  // XXX prefer not to use a closure for this - delegate to document.body
  // and register in a global map - unregister in d_list.
  function action_event_handler(event:Event): void {
    if (debug) console.log(`[] event '${name}': `, event);
    run_action(action, event);
    run_updates() // dom event - must run updates.
  }
  return action_event_handler;
}

function unbind_event_handler(b:BoundEventState): void {
  b.dom_node.removeEventListener(b.name, b.handler, false);
}
