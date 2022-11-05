import { debug, log_expr } from './config'
import { new_dep, const_dep, null_dep, remove_dep, in_transaction, queue_action, run_updates } from './deps'
import { Model, Collection } from './models'
import { run_action } from './actions'

export function is_true(val) {
  return !!(val instanceof Array ? val['length'] : val);
}

export function to_text(val) {
  return (val == null || val instanceof Object) ? '' : (''+val);
}

// DEPS

function bind_to_args(sc, scope, len, update_fn) {
  const args = [];
  const dep = new_dep(null, update_fn, args);
  if (log_expr) console.log(`[e] ${update_fn.name}:`, args);
  let ins = 0;
  while (len--) {
    const src = resolve_expr(sc, scope);
    args['push'](src);
    if (src.wait >= 0) { src.fwd.push(dep); ++ins; } // depend on.
  }
  update_fn(dep, args);
  if (ins) scope.d_list['push'](destroy_args, dep); else dep.wait = -1; // constant.
  return dep;
}

function bind_one_arg(sc, scope, update_fn, is_collection) {
  let arg = resolve_expr(sc, scope);
  if (is_collection) {
    // collection-type expressions always result in a Collection instance (not a Cell)
    if (debug && !(arg instanceof Collection)) throw 5;
    arg = arg.items;
  }
  if (log_expr) console.log(`[e] ${update_fn.name}:`, arg);
  const dep = new_dep(null, update_fn, arg);
  if (arg.wait >= 0) {
    arg.fwd.push(dep); // depend on.
    scope.d_list['push'](destroy_one_arg, dep);
  } else {
    dep.wait = -1; // constant.
  }
  update_fn(dep, arg);
  return dep;
}

function destroy_args(dep) {
  for (let arg of dep.arg) {
    remove_dep(arg, dep);
  }
}

function destroy_one_arg(dep) {
  remove_dep(dep.arg, dep);
}

// CONCAT

function expr_concat(sc, scope) {
  // create a dep that updates when arguments have updated.
  const len = sc.tpl[sc.ofs++];
  return bind_to_args(sc, scope, len, update_concat);
}

function update_concat(dep, args) {
  // concatenate text fragments from each input dep.
  // has "no value" until every fragment "has value",
  // which makes it safe to bind to DOM src props, etc.
  let text = "";
  let has_value = true;
  for (let i=0; i<args['length']; i++) {
    const val = args[i].val;
    if (val == null) has_value = false; // has "no value".
    text += to_text(val);
  }
  dep.val = has_value ? text : null;
}

// TERNARY

function expr_ternary(sc, scope) { return bind_to_args(sc, scope, 3, update_ternary) }
function update_ternary(dep, args) {
  // has "no value" until the condition "has value".
  const cond = args[0].val
  dep.val = (cond === null) ? null : is_true(cond) ? args[1].val : args[2].val;
}

// EQUALS

function expr_equals(sc, scope) { return bind_to_args(sc, scope, 2, update_equals) }
function update_equals(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left === right) : null
}

// NOT_EQUAL

function expr_not_equal(sc, scope) { return bind_to_args(sc, scope, 2, update_not_equal) }
function update_not_equal(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left !== right) : null;
}

// GREATER_EQUAL

function expr_ge(sc, scope) { return bind_to_args(sc, scope, 2, update_ge) }
function update_ge(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left >= right) : null;
}

// LESS_EQUAL

function expr_le(sc, scope) { return bind_to_args(sc, scope, 2, update_le) }
function update_le(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left <= right) : null;
}

// GREATER

function expr_gt(sc, scope) { return bind_to_args(sc, scope, 2, update_gt) }
function update_gt(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left > right) : null;
}

// LESS

function expr_lt(sc, scope) { return bind_to_args(sc, scope, 2, update_lt) }
function update_lt(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left < right) : null;
}

// ADD

function expr_add(sc, scope) { return bind_to_args(sc, scope, 2, update_add) }
function update_add(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left + right) : null;
}

// SUBTRACT

function expr_sub(sc, scope) { return bind_to_args(sc, scope, 2, update_sub) }
function update_sub(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left - right) : null;
}

// MULTIPLY

function expr_multiply(sc, scope) { return bind_to_args(sc, scope, 2, update_multiply) }
function update_multiply(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left * right) : null;
}

// DIVIDE

function expr_div(sc, scope) { return bind_to_args(sc, scope, 2, update_div) }
function update_div(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left / right) : null;
}

// MODULO

function expr_mod(sc, scope) { return bind_to_args(sc, scope, 2, update_mod) }
function update_mod(dep, args) {
  const left = args[0].val, right = args[1].val
  dep.val = (left !== null && right !== null) ? (left % right) : null;
}

// OR

function expr_or(sc, scope) { return bind_to_args(sc, scope, 2, update_or) }
function update_or(dep, args) {
  const left = args[0].val, right = args[1].val
  if (left === true || right === true) { dep.val = true; return } // short-circuit.
  dep.val = (left !== null || right !== null) ? (left || right) : null;
}

// AND

function expr_and(sc, scope) { return bind_to_args(sc, scope, 2, update_and) }
function update_and(dep, args) {
  const left = args[0].val, right = args[1].val
  if (left === false || right === false) { dep.val = false; return } // short-circuit.
  dep.val = (left !== null && right !== null) ? (left && right) : null;
}

// NOT

function expr_not(sc, scope) { return bind_one_arg(sc, scope, update_not) }
function update_not(dep, arg) {
  dep.val = (arg.val === null) ? null : !is_true(arg.val);
}

// EMPTY - COLLECTIONS

function expr_is_empty(sc, scope) {
  return bind_one_arg(sc, scope, update_is_empty, true); // is_collection.
}

function update_is_empty(dep, arg) {
  // can only be applied to a Collection (never "no value")
  dep.val = ! arg.val.length;
}

function expr_not_empty(sc, scope) {
  return bind_one_arg(sc, scope, update_not_empty, true); // is_collection.
}

function update_not_empty(dep, arg) {
  // can only be applied to a Collection (never "no value")
  dep.val = !! arg.val.length;
}

function expr_count(sc, scope) {
  return bind_one_arg(sc, scope, update_count, true); // is_collection.
}

function update_count(dep, arg) {
  // can only be applied to a Collection (never "no value")
  dep.val = arg.val.length;
}

// CONSTANTS

function expr_null() {
  // expression op=0 is "no binding" (const null value)
  return null_dep;
}

function expr_const(sc) {
  // syms contains javascript strings, numbers, booleans (maybe also lists, objects)
  const val = sc.syms[sc.tpl[sc.ofs++]];
  if (log_expr) console.log("[e] const value: "+val);
  return const_dep(val);
}

// LOCALS

function expr_local(sc, scope) {
  const n = sc.tpl[sc.ofs++];
  const dep = scope.locals[n];
  if (log_expr) console.log(`[e] local ${n}:`, dep);
  return dep;
}

// MODEL FIELDS

function expr_field(sc, scope) {
  const name = sc.syms[sc.tpl[sc.ofs++]];
  const left = resolve_expr(sc, scope);
  if (log_expr) console.log(`[e] field '${name}' from:`, left);
  // model-type expressions always result in a Model instance (not a Cell)
  if (left instanceof Model) {
    const dep = left.fields[name];
    if (debug && !dep) throw 5; // MUST exist.
    return dep;
  }
  if (debug) throw 5; // MUST exist.
  return null_dep;
}

// MODEL

// local slots hold one of: Model, Collection, Action, Cell [dep]

// local model slots always hold actual Model instances (not Cells)
// likewise, nested model fields always hold actual Model instances.
// component props of model-type bind the outer Model instance into the inner component's slot.

// each [non-model] field of a Model is a distinct, live Cell [root-dep]
// component props bind outer Cell instances into the inner component's slots.
// DOM attribute bindings subscribe to those Cell instances directly.

export function spawn_model_tpl(sc, scope) {
  const mod = new Model();
  // XXX cannot look up the action in local slots here, because
  // XXX models are spawned before actions are! (make actions into tpls anyway...)
  // TODO FIXME: all model templates have loadAct - nested models and collections don't need it!!
  mod.loadAct = sc.tpl[sc.ofs++];
  mod.scope = scope; // to spawn collection models; to look up load-action.
  // XXX for now, compiler emits inline init values for every field.
  let num = sc.tpl[sc.ofs++];
  while (num--) {
    const name = sc.syms[sc.tpl[sc.ofs++]];
    // XXX: timing issue here - can copy from init-dep before it "has value" (a non-null value)
    const init = resolve_expr(sc, scope); // XXX wasteful new const deps all the time.
    if (init instanceof Model || init instanceof Collection) {
      mod.fields[name] = init; // not wrapped in a field-value dep.
    } else {
      mod.fields[name] = new_dep(init.val); // ALWAYS a root-dep.
    }
    if (debug) { // extra info for Inspector.
      mod.fields[name].d_field = name;
      mod.fields[name].d_model = mod;
    }
  }
  return mod;
}

function expr_l_model(sc, scope) {
  // inline model template follows for local models.
  return spawn_model_tpl(sc, scope);
}

function expr_l_collection(sc, scope) {
  const col = new Collection(scope);
  const tpl_id = sc.tpl[sc.ofs++];
  col.model_tpl = sc.tpl[tpl_id]; // look up tpl in template index table (could patch out)
  return col;
}

// ACTIONS

// an Action slot holds a closure that captures the local scope (slots)

function expr_action(sc, scope) {
  const refresh = sc.tpl[sc.ofs++]; // [1] auto refresh (ms)
  const tpl_id = sc.tpl[sc.ofs++];  // [2] action tpl index.
  const act_tpl = sc.tpl[tpl_id];   // look up tpl in template index table (could patch out)
  // action { sc, scope, tpl, arg }
  const act = { sc:sc, scope:scope, tpl:act_tpl, arg:null };
  if (debug) act.d_is = 'action';
  if (refresh > 0) make_timer(act, refresh);
  return act;
}

// TIMERS

function make_timer(act, refresh) {
  const timer = { act:act, timer:0, dead:false };
  if (debug) timer.d_is = 'timer';
  const timer_fun = bind_auto_refresh(timer);
  act.scope.d_list['push'](stop_auto_refresh, timer);
  timer.timer = setInterval(timer_fun, refresh);
  queue_action(run_action, act)
}

function bind_auto_refresh(timer) {
  return function() {
    if (timer.dead) return;
    queue_action(run_action, timer.act)
    run_updates() // timer event - must run updates.
  }
}

function stop_auto_refresh(timer) {
  timer.dead = true
  if (timer.timer) {
    clearInterval(timer.timer); timer.timer = 0
  }
}

// EVENT TARGET

function expr_event_target() { // (sc, scope)
  // XXX: not a dep, not a constant !!!
  // XXX: needs to be evaluated "pull mode" instead.
  const dep = new_dep("", update_event_target); // ALWAYS a root-dep.
  dep.wait = -2; // MARK as a "function dep" (HACK - SPECIAL CASE)
  return dep;
}

function update_event_target(event) {
  return event.target.value;
}

// EXPR

const expr_ops = [
  expr_null,          // 0 - get null dep.
  expr_const,         // 1 - get syms constant as a [new] dep.
  expr_local,         // 2 - get local slot (dep, model, collection)
  expr_field,         // 3 - get field of a model.
  expr_concat,        // 4 - concatenate text.
  expr_equals,        // 5 - left == right.
  expr_not,           // 6 - ! arg.
  expr_l_model,       // 7 - create local model.
  expr_l_collection,  // 8 - create local collection.
  expr_ternary,       // 9 - cond ? left : right.
  expr_action,        // 10 - create local action (like a closure over locals)
  expr_event_target,  // 11 - event.target generator (*** not a dep, not a constant !!!)
  expr_not_equal,     // 12 - left ~= right.
  expr_multiply,      // 13 - left * right.
  expr_is_empty,      // 14 - collection is empty.
  expr_not_empty,     // 15 - collection is not empty.
  expr_ge,            // 16 - left >= right.
  expr_le,            // 17 - left <= right.
  expr_gt,            // 18 - left > right.
  expr_lt,            // 19 - left < right.
  expr_count,         // 20 - count collection size.
  expr_sub,           // 21 - left - right.
  expr_add,           // 22 - left + right.
  expr_div,           // 23 - left / right.
  expr_mod,           // 24 - left % right.
  expr_or,            // 25 - left OR right.
  expr_and,           // 26 - left AND right.
];

export function resolve_expr(sc, scope) {
  if (in_transaction) throw 2; // assert: cannot fwd.push inside a transaction.
  const op = sc.tpl[sc.ofs++];
  if (debug && !expr_ops[op]) {
    console.log("[bad] expr_op")
  }
  return expr_ops[op](sc, scope);
}
