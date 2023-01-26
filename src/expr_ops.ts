import { debug, log_expr } from './config'
import { new_cell, null_dep, remove_fwd, in_transaction, queue_action, run_updates } from './cells'
import { Model, Collection } from './models'
import { run_action } from './actions'
import { ActionType, BindOneArgFunc, BindToArgsFunc, BoundKeyIndex, Cell, CellFunc, CellVal, CollectionType, FieldProxyState, fw, ModelType, Scope, SpawnCtx, TimerState } from './types';

export function is_true(val:any): boolean {
  return !!(val instanceof Array ? val['length'] : val);
}

export function to_text(val:any): string {
  return (val == null || val instanceof Object) ? '' : (''+val);
}

// DEPS

function bind_to_args(sc:SpawnCtx, scope:Scope, len:number, update_fn:BindToArgsFunc): Cell { // only binds to Cells
  const args: Cell[] = [];
  const cell = new_cell(null, update_fn, args);
  if (log_expr) console.log(`[e] ${update_fn.name}:`, args);
  let ins = 0;
  while (len--) {
    const src = resolve_expr(sc, scope) as Cell; // ALWAYS a Cell.
    args.push(src);
    if (src.wait >= 0) { src.fwd.push(cell); ++ins; } // depend on.
  }
  update_fn(cell, args);
  if (ins) scope.d_list.push(destroy_args, cell); else cell.wait = -1; // constant.
  return cell;
}

function bind_one_arg(sc:SpawnCtx, scope:Scope, update_fn:BindOneArgFunc, is_collection: boolean): Cell { // only binds to Cells
  let arg = resolve_expr(sc, scope) as Cell; // as CollectionType if is_collection==true
  if (is_collection) {
    // re-using bind_one_arg with Collections by injecting this extra step.
    if (debug && !(arg instanceof Collection)) throw 5;
    arg = (arg as unknown as CollectionType).items; // a Cell.
  }
  if (log_expr) console.log(`[e] ${update_fn.name}:`, arg);
  const cell = new_cell(null, update_fn, arg);
  if (arg.wait >= 0) {
    arg.fwd.push(cell); // depend on.
    scope.d_list.push(destroy_one_arg, cell);
  } else {
    cell.wait = -1; // constant.
  }
  update_fn(cell, arg);
  return cell;
}

function destroy_args(dep:Cell): void {
  for (let arg of dep.state as Cell[]) {
    remove_fwd(arg, dep);
  }
}

function destroy_one_arg(dep:Cell): void {
  remove_fwd(dep.state as Cell, dep);
}

// CONCAT

function update_concat(dep:Cell, args:Cell[]): void {
  // concatenate text fragments from each input dep.
  // has "no value" until every fragment "has value",
  // which makes it safe to bind to DOM src props, etc.
  let text = "";
  let has_value = true;
  for (let i=0; i<args['length']; i++) {
    const val = args[i]!.val;
    if (val == null) has_value = false; // has "no value".
    text += to_text(val);
  }
  dep.val = has_value ? text : null;
}

// TERNARY

function update_ternary(dep:Cell, args:Cell[]): void {
  // XXX stays subscribed to both sides at all times (receives and ignores spurious updates)
  // has "no value" until the condition "has value".
  const cond = args[0]!.val
  dep.val = (cond === null) ? null : is_true(cond) ? args[1]!.val : args[2]!.val;
}

// ELVIS

function update_elvis(dep:Cell, args:Cell[]): void {
  // XXX stays subscribed to both sides at all times (receives and ignores spurious updates)
  // has "no value" until the condition "has value".
  const cond = args[0]!.val
  dep.val = (cond === null) ? null : is_true(cond) ? args[0]!.val : args[1]!.val;
}

// EQUALS

function update_equals(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? (left === right) : null
}

// NOT_EQUAL

function update_not_equal(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? (left !== right) : null;
}

// GREATER_EQUAL

function update_ge(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? (left >= right) : null;
}

// LESS_EQUAL

function update_le(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? (left <= right) : null;
}

// GREATER

function update_gt(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? (left > right) : null;
}

// LESS

function update_lt(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? (left < right) : null;
}

// ADD

function update_add(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? ((left as number) + (right as number)) : null;
}

// SUBTRACT

function update_sub(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? ((left as number) - (right as number)) : null;
}

// MULTIPLY

function update_multiply(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? ((left as number) * (right as number)) : null;
}

// DIVIDE

function update_div(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? ((left as number) / (right as number)) : null;
}

// MODULO

function update_mod(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  dep.val = (left !== null && right !== null) ? ((left as number) % (right as number)) : null;
}

// OR

function update_or(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  if (left === true || right === true) { dep.val = true; return } // short-circuit.
  dep.val = (left !== null || right !== null) ? (left || right) : null;
}

// AND

function update_and(dep:Cell, args:Cell[]): void {
  const left = args[0]!.val, right = args[1]!.val
  if (left === false || right === false) { dep.val = false; return } // short-circuit.
  dep.val = (left !== null && right !== null) ? (left && right) : null;
}

// NOT

function update_not(dep:Cell, arg:Cell): void {
  dep.val = (arg.val === null) ? null : !is_true(arg.val);
}

// EMPTY - COLLECTIONS

function update_is_empty(dep:Cell, arg:Cell): void {
  // can only be applied to a Collection (never "no value")
  dep.val = ! (arg.val as ModelType[]).length;
}

function update_not_empty(dep:Cell, arg:Cell): void {
  // can only be applied to a Collection (never "no value")
  dep.val = !! (arg.val as ModelType[]).length;
}

function update_count(dep:Cell, arg:Cell): void {
  // can only be applied to a Collection (never "no value")
  dep.val = (arg.val as ModelType[]).length;
}

// KEY INDEX - COLLECTIONS

// discovered a pattern here:
// a [dynamic] model-field cell has two kinds of subscription:
// 1. subscription to the upsteam model-cell
//    when this changes, we need to un-sub and re-sub the field.
// 2. subscription to the upstream model's field, unless it's const.
//    when this changes, we copy the value (scalar)

// a [dynamic] model-sub-model cell has two kinds of subscription:
// 1. subscription to the upsteam model-cell
//    when this changes, we need to un-sub and re-sub the field.
// 2. subscription to the upstream model's sub-model, unless it's const.
//    when this changes, we copy the value (field-set?)


function expr_key_index(sc:SpawnCtx, scope:Scope): Cell {
  const state:BoundKeyIndex = { keys:[], vals:[] };
  const cell = new_cell(null, update_key_index, state);
  if (log_expr) console.log(`[e] update_key_index:`, state);
  const coll = resolve_expr(sc, scope).val as CollectionType; // ALWAYS a Collection.
  let len = sc.tpl[sc.ofs++]!;
  let ins = 0;
  while (len--) {
    state.keys.push(sc.syms[sc.tpl[sc.ofs++]!] as string);
    const src = resolve_expr(sc, scope) as Cell; // ALWAYS a Cell (Scalar)
    state.vals.push(src);
    if (src.wait >= 0) { src.fwd.push(cell); ++ins; } // depend on.
  }
  update_key_index(cell, state);
  if (ins) scope.d_list.push(destroy_key_index, cell); else cell.wait = -1; // constant.
  return cell;
}

function update_key_index(dep:Cell, state:BoundKeyIndex): void {
  // find the matching Model within the Collection.
  // BUT this actually has cursor behaviour - the resulting Model needs to TRACK the matching model.
  // can only be applied to a Collection (never "no value")
  throw 17; // not implemented.
}

function destroy_key_index(cell:Cell): void {
}

// MODEL FIELDS

function dynamic_field_op(from:Cell, name:string): Cell {
  if (log_expr) console.log(`[e] dynamic field '${name}' from:`, from);
  const new_model = from.val as ModelType|null; // new upstream Model|null
  const new_field = new_model !== null ? new_model.fields[name]! as Cell : null;
  if (debug && new_field === undefined) throw 5; // MUST exist.
  const new_val = new_field !== null ? new_field.val : null;
  const state:FieldProxyState = { field:new_field, name }
  return new_cell(new_val, null, state)
}

// MODEL

// local slots hold one of: Model, Collection, Action, Cell [dep]

// local model slots always hold actual Model instances (not Cells)
// likewise, nested model fields always hold actual Model instances.
// component props of model-type bind the outer Model instance into the inner component's slot.

// each [non-model] field of a Model is a distinct, live Cell [root-dep]
// component props bind outer Cell instances into the inner component's slots.
// DOM attribute bindings subscribe to those Cell instances directly.

export function spawn_model_tpl(sc:SpawnCtx, scope:Scope): ModelType {
  const mod = new (Model as any)() as ModelType;
  // XXX cannot look up the action in local slots here, because
  // XXX models are spawned before actions are! (make actions into tpls anyway...)
  // TODO FIXME: all model templates have loadAct - nested models and collections don't need it!!
  mod.loadAct = sc.tpl[sc.ofs++]!;
  mod.scope = scope; // to spawn collection models; to look up load-action.
  // XXX for now, compiler emits inline init values for every field.
  let num = sc.tpl[sc.ofs++]!;
  while (num--) {
    const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
    // XXX: timing issue here - can copy from init-dep before it "has value" (a non-null value)
    const init = resolve_expr(sc, scope); // XXX wasteful new const deps all the time.
    if (init instanceof Model || init instanceof Collection) {
      mod.fields[name] = init; // not wrapped in a field-value dep.
    } else {
      mod.fields[name] = new_cell((init as Cell).val, null, null); // ALWAYS a root-dep.
    }
    if (debug) { // extra info for Inspector.
      mod.fields[name]!.d_field = name;
      mod.fields[name]!.d_model = mod;
    }
  }
  return mod;
}

// TIMERS

function make_timer(act:ActionType, refresh:number): void {
  const timer:TimerState = { act:act, timer:0, dead:false };
  if (debug) timer.d_is = 'timer';
  const timer_fun = bind_auto_refresh(timer);
  act.scope.d_list.push(stop_auto_refresh, timer);
  timer.timer = setInterval(timer_fun, refresh);
  queue_action(run_action, act)
}

function bind_auto_refresh(timer:TimerState): (()=>void) {
  return function() {
    if (timer.dead) return;
    queue_action(run_action, timer.act)
    run_updates() // timer event - must run updates.
  }
}

function stop_auto_refresh(timer:TimerState): void {
  timer.dead = true
  if (timer.timer) {
    clearInterval(timer.timer); timer.timer = 0
  }
}

// EVENT TARGET

function update_event_target(event:Event): string { // EventTargetHack
  return (event.target as HTMLInputElement).value;
}

// EXPR

const enum E {
  NONE = 0, // 0 E_NONE ()
  CONST, // 1 E_CONST (value)
  LOCAL, // 2 E_LOCAL (slot)
  FIELD, // 3 E_FIELD (name from)
  CONCAT, // 4 E_CONCAT (len ...)
  EQUALS, // 5 E_EQUALS (l r)
  NOT, // 6 E_NOT (expr)
  MODEL, // 7 E_MODEL (onload len ...)
  COLLECTION, // 8 E_COLLECTION (tpl)
  TERNARY, // 9 E_TERNARY (cond l r)
  ACTION, // 10 E_ACTION (refresh tpl)
  EVENT_TARGET, // 11 E_EVENT_TARGET ()
  NOT_EQUALS, // 12 E_NOT_EQUALS (l r)
  MULTIPLY, // 13 E_MULTIPLY (l r)
  IS_EMPTY, // 14 E_IS_EMPTY (coll)
  NOT_EMPTY, // 15 E_NOT_EMPTY (coll)
  GE, // 16 E_GE (l r)
  LE, // 17 E_LE (l r)
  GT, // 18 E_GT (l r)
  LT, // 19 E_LT (l r)
  COUNT, // 20 E_COUNT (coll)
  SUBTRACT, // 21 E_SUBTRACT (l r)
  ADD, // 22 E_ADD (l r)
  DIVIDE, // 23 E_DIVIDE (l r)
  MODULO, // 24 E_MODULO (l r)
  OR, // 25 E_OR (l r)
  AND, // 26 E_AND (l r)
  ELVIS, // 27 E_ELVIS (l r)
  KEY_INDEX, // 28 E_KEY_INDEX (coll len ...)
};

export function resolve_expr(sc:SpawnCtx, scope:Scope): Cell {
  if (in_transaction) throw 2; // assert: cannot fwd.push inside a transaction.
  switch (sc.tpl[sc.ofs++]! as E) {
    case E.NONE: return null_dep;
    case E.CONST: {
      // syms contains javascript strings, numbers, booleans.
      // XXX could pre-init a constants array to avoid creating const cells here.
      const val = sc.syms[sc.tpl[sc.ofs++]!] as CellVal;
      const cell = new_cell(val, null, null);
      cell.wait = -1; // is const.
      return cell;
    }
    case E.LOCAL: { // 2 E_LOCAL (slot)
      const n = sc.tpl[sc.ofs++]!;
      const bound = scope.locals[n]!;
      if (debug && bound === undefined) throw 7; // MUST exist.
      return bound;
    }
    case E.FIELD: { // 3 E_FIELD (name from)
      const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
      const left = resolve_expr(sc, scope);
      if (left.wait < 0) { // is const?
        const model = left.val as ModelType|null;
        const field = model !== null ? model.fields[name]! : null_dep;
        if (debug && field === undefined) throw 5; // MUST exist.
        return field;
      } else {
        return dynamic_field_op(left, name);
      }
    }
    case E.CONCAT: { // 4 E_CONCAT (len ...)
      const len = sc.tpl[sc.ofs++]!;
      return bind_to_args(sc, scope, len, update_concat);
    }
    case E.EQUALS: { // 5 E_EQUALS (l r)
      return bind_to_args(sc, scope, 2, update_equals);
    }
    case E.NOT: { // 6 E_NOT (expr)
      return bind_one_arg(sc, scope, update_not, false);
    }
    case E.MODEL: { // 7 E_MODEL (onload len ...)
      // inline model template follows for local models.
      return spawn_model_tpl(sc, scope);
    }
    case E.COLLECTION: { // 8 E_COLLECTION (tpl)
      const col = new (Collection as any)(scope) as CollectionType;
      const tpl_id = sc.tpl[sc.ofs++]!;
      col.model_tpl = sc.tpl[tpl_id]!; // look up tpl in template index table (could patch out)
      return col;
    }
    case E.TERNARY: { // 9 E_TERNARY (cond l r)
      return bind_to_args(sc, scope, 3, update_ternary);
    }
    case E.ACTION: { // 10 E_ACTION (refresh tpl)
      // an Action slot holds a closure that captures the local scope (slots)
      const refresh = sc.tpl[sc.ofs++]!; // [1] auto refresh (ms)
      const tpl_id = sc.tpl[sc.ofs++]!;  // [2] action tpl index.
      const act_tpl = sc.tpl[tpl_id]!;   // look up tpl in template index table (could patch out)
      const act:ActionType = { sc:sc, scope:scope, tpl:act_tpl, arg:null };
      if (debug) act.d_is = 'action';
      if (refresh > 0) make_timer(act, refresh);
      return act;
    }
    case E.EVENT_TARGET: { // 11 E_EVENT_TARGET ()
      // XXX: not a dep, not a constant !!!
      // XXX: needs to be evaluated "pull mode" instead.
      const dep = new_cell("", update_event_target as unknown as CellFunc, null); // ALWAYS a root-dep.
      dep.wait = -2; // MARK as a "function dep" (HACK - SPECIAL CASE) EventTargetHack
      return dep;
    }
    case E.NOT_EQUALS: { // 12 E_NOT_EQUALS (l r)
      return bind_to_args(sc, scope, 2, update_not_equal);
    }
    case E.MULTIPLY: { // 13 E_MULTIPLY (l r)
      return bind_to_args(sc, scope, 2, update_multiply);
    }
    case E.IS_EMPTY: { // 14 E_IS_EMPTY (coll)
      return bind_one_arg(sc, scope, update_is_empty, true); // is_collection.
    }
    case E.NOT_EMPTY: { // 15 E_NOT_EMPTY (coll)
      return bind_one_arg(sc, scope, update_not_empty, true); // is_collection.
    }
    case E.GE: { // 16 E_GE (l r)
      return bind_to_args(sc, scope, 2, update_ge);
    }
    case E.LE: { // 17 E_LE (l r)
      return bind_to_args(sc, scope, 2, update_le);
    }
    case E.GT: { // 18 E_GT (l r)
      return bind_to_args(sc, scope, 2, update_gt);
    }
    case E.LT: { // 19 E_LT (l r)
      return bind_to_args(sc, scope, 2, update_lt);
    }
    case E.COUNT: { // 20 E_COUNT (coll)
      return bind_one_arg(sc, scope, update_count, true); // is_collection.
    }
    case E.SUBTRACT: { // 21 E_SUBTRACT (l r)
      return bind_to_args(sc, scope, 2, update_sub);
    }
    case E.ADD: { // 22 E_ADD (l r)
      return bind_to_args(sc, scope, 2, update_add);
    }
    case E.DIVIDE: { // 23 E_DIVIDE (l r)
      return bind_to_args(sc, scope, 2, update_div);
    }
    case E.MODULO: { // 24 E_MODULO (l r)
      return bind_to_args(sc, scope, 2, update_mod);
    }
    case E.OR: { // 25 E_OR (l r)
      return bind_to_args(sc, scope, 2, update_or);
    }
    case E.AND: { // 26 E_AND (l r)
      return bind_to_args(sc, scope, 2, update_and);
    }
    case E.ELVIS: { // 27 E_ELVIS (l r)
      return bind_to_args(sc, scope, 2, update_elvis);
    }
    case E.KEY_INDEX: { // 28 E_KEY_INDEX (coll len ...)
      return expr_key_index(sc, scope);
    }
  }
}
