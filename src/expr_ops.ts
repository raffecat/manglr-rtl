import { debug, log_expr } from './config'
import { new_cell, null_dep, remove_fwd, in_transaction, queue_action, run_updates, update_expr } from './cells'
import { Model, Collection } from './models'
import { run_action } from './actions'
import { ActionType, Cell, CellVal, CollectionType, FieldProxyState, op, ModelType, Scope, SpawnCtx, TimerState, to_text, ExprFunc } from './types';

// DEPS

function bind_to_args(sc: SpawnCtx, scope: Scope, len: number, update_op: op): Cell {
    const args: Cell[] = [];
    const cell = new_cell(null, update_op, args);
    /// if (log_expr) console.log(`[e] ${update_op}:`, args);
    let ins = 0;
    while (len--) {
        const src = resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // [n] bound expr
        args.push(src);
        if (src.wait >= 0) { src.fwd.push(cell); ++ins; } // depend on.
    }
    if (ins) scope.d_list.push(destroy_args, cell); else cell.wait = -1; // constant.
    cell.val = update_expr(cell);
    return cell;
}

function bind_one_arg(sc: SpawnCtx, scope: Scope, update_op: op, is_collection: boolean): Cell {
    let arg = resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // [n] bound expr
    if (is_collection) {
        // re-using bind_one_arg with Collections by injecting this extra step.
        if (debug && !(arg.val instanceof Collection)) throw 5;
        arg = (arg.val as CollectionType).items;
    }
    /// if (log_expr) console.log(`[e] ${update_op}:`, arg);
    const cell = new_cell(null, update_op, arg);
    if (arg.wait >= 0) {
        arg.fwd.push(cell); // depend on.
        scope.d_list.push(destroy_one_arg, cell);
    } else {
        cell.wait = -1; // constant.
    }
    cell.val = update_expr(cell);
    return cell;
}

function destroy_args(dep: Cell): void {
    for (let arg of dep.state as Cell[]) {
        remove_fwd(arg, dep);
    }
}

function destroy_one_arg(dep: Cell): void {
    remove_fwd(dep.state as Cell, dep);
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


// function expr_key_index(sc:SpawnCtx, scope:Scope): Cell {
//   const state:BoundKeyIndex = { keys:[], vals:[] };
//   const cell = new_cell(null, op.update_key_index, state);
//   if (log_expr) console.log(`[e] update_key_index:`, state);
//   const coll = resolve_expr(sc, scope).val as CollectionType; // ALWAYS a Collection.
//   let len = sc.tpl[sc.ofs++]!;
//   let ins = 0;
//   while (len--) {
//     state.keys.push(sc.syms[sc.tpl[sc.ofs++]!] as string);
//     const src = resolve_expr(sc, scope) as Cell; // ALWAYS a Cell (Scalar)
//     state.vals.push(src);
//     if (src.wait >= 0) { src.fwd.push(cell); ++ins; } // depend on.
//   }
//   update_key_index(cell, state);
//   if (ins) scope.d_list.push(destroy_key_index, cell); else cell.wait = -1; // constant.
//   return cell;
// }

// function update_key_index(dep:Cell, state:BoundKeyIndex): void {
//   // find the matching Model within the Collection.
//   // BUT this actually has cursor behaviour - the resulting Model needs to TRACK the matching model.
//   // can only be applied to a Collection (never "no value")
//   throw 17; // not implemented.
// }

// function destroy_key_index(cell:Cell): void {
// }

// MODEL FIELDS

function dynamic_field_op(from: Cell, name: string): Cell {
    if (log_expr) console.log(`[e] dynamic field '${name}' from:`, from);
    const new_model = from.val as ModelType | null; // new upstream Model|null
    const new_field = new_model !== null ? new_model.fields[name]! as Cell : null;
    if (debug && new_field === undefined) throw 5; // MUST exist.
    const new_val = new_field !== null ? new_field.val : null;
    const state: FieldProxyState = { left: from, model: new_model, field: new_field, name }
    return new_cell(new_val, op.field_proxy, state)
}

// MODEL

// local slots hold one of: Model, Collection, Action, Cell [dep]

// local model slots always hold actual Model instances (not Cells)
// likewise, nested model fields always hold actual Model instances.
// component props of model-type bind the outer Model instance into the inner component's slot.

// each [non-model] field of a Model is a distinct, live Cell [root-dep]
// component props bind outer Cell instances into the inner component's slots.
// DOM attribute bindings subscribe to those Cell instances directly.

export function spawn_model_tpl(sc: SpawnCtx, scope: Scope): ModelType {
    const mod = new (Model as any)() as ModelType;
    // XXX cannot look up the action in local slots here, because
    // XXX models are spawned before actions are! (make actions into tpls anyway...)
    // FIXME: all model templates have loadAct - nested models and collections don't need it!!
    mod.loadAct = sc.tpl[sc.ofs++]!;
    mod.scope = scope; // to spawn collection models; to look up load-action.
    // XXX for now, compiler emits inline init values for every field.
    let num = sc.tpl[sc.ofs++]!;
    while (num--) {
        const name = sc.syms[sc.tpl[sc.ofs++]!] as string;
        // the compiler uses init expressions to:
        // - create nested models and collections.
        // - evaluate scalar constants used to init fields.
        // - evaluate init-expressions (e.g. copy-from bound args)
        //   XXX timing issue: can copy from init before it "has value" (a non-null value)
        const init = resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // XXX wasteful new const deps all the time.
        if (init.val instanceof Model || init.val instanceof Collection) {
            mod.fields[name] = init; // these are created new (never from args)
        } else {
            mod.fields[name] = new_cell((init as Cell).val, op.is_field, null); // ALWAYS a root-dep.
        }
        if (debug) { // extra info for Inspector.
            mod.fields[name]!.d_field = name;
            mod.fields[name]!.d_model = mod;
        }
    }
    return mod;
}

// TIMERS

function make_timer(act: ActionType, refresh: number): void {
    const timer: TimerState = { act: act, timer: 0, dead: false };
    if (debug) timer.d_is = 'timer';
    const timer_fun = bind_auto_refresh(timer);
    act.scope.d_list.push(stop_auto_refresh, timer);
    timer.timer = setInterval(timer_fun, refresh);
    queue_action(run_action, act)
}

function bind_auto_refresh(timer: TimerState): (() => void) {
    return function () {
        if (timer.dead) return;
        queue_action(run_action, timer.act)
        run_updates() // timer event - must run updates.
    }
}

function stop_auto_refresh(timer: TimerState): void {
    timer.dead = true
    if (timer.timer) {
        clearInterval(timer.timer); timer.timer = 0
    }
}


// EXPR

function E_NONE(_sc: SpawnCtx, _scope: Scope): Cell { // 0 E_NONE ()
    return null_dep;
}

function E_CONST(sc: SpawnCtx, _scope: Scope): Cell { // 1 E_CONST (value)
    // syms contains javascript strings, numbers, booleans.
    // XXX could pre-init a constants array to avoid creating const cells here.
    const val = sc.syms[sc.tpl[sc.ofs++]!]!;
    const cell = new_cell(val, op.is_const, null);
    cell.wait = -1; // is const.
    return cell;
}

function E_LOCAL(sc: SpawnCtx, scope: Scope): Cell { // 2 E_LOCAL (slot)
    const cell = scope.locals[sc.tpl[sc.ofs++]!]!;
    if (debug && cell === undefined) throw 7; // MUST exist.
    return cell;
}

function E_FIELD(sc: SpawnCtx, scope: Scope): Cell { // 3 E_FIELD (name from)
    const name = sc.syms[sc.tpl[sc.ofs++]!] as string;        // [1] name string
    const cell = resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // [2] model expr
    if (cell.wait < 0) { // is const?
        const model = cell.val as ModelType;
        const field = model !== null ? model.fields[name]! : null_dep;
        if (debug && field === undefined) throw 5; // MUST exist.
        return field;
    } else {
        return dynamic_field_op(cell, name);
    }
}

function E_CONCAT(sc: SpawnCtx, scope: Scope): Cell { // 4 E_CONCAT (len ...)
    const len = sc.tpl[sc.ofs++]!;
    return bind_to_args(sc, scope, len, op.concat);
}

function E_EQUALS(sc: SpawnCtx, scope: Scope): Cell { // 5 E_EQUALS (l r)
    return bind_to_args(sc, scope, 2, op.equals);
}

function E_NOT(sc: SpawnCtx, scope: Scope): Cell { // 6 E_NOT (expr)
    return bind_one_arg(sc, scope, op.not, false);
}

function E_MODEL(sc: SpawnCtx, scope: Scope): Cell { // 7 E_MODEL (onload len ...)
    // inline model template follows for local models.
    const model = spawn_model_tpl(sc, scope);
    const cell = new_cell(model, op.is_model, null);
    cell.wait = -1; // is const.
    return cell;
}

function E_COLLECTION(sc: SpawnCtx, scope: Scope): Cell { // 8 E_COLLECTION (tpl)
    const col = new (Collection as any)(scope) as CollectionType;
    col.model_tpl = sc.tpl[sc.tpl[sc.ofs++]!]!; // [1] collection model, in template index table (could patch out)
    const cell = new_cell(col, op.is_collection, null);
    cell.wait = -1; // is const.
    return cell;
}

function E_TERNARY(sc: SpawnCtx, scope: Scope): Cell { // 9 E_TERNARY (cond l r)
    return bind_to_args(sc, scope, 3, op.ternary);
}

function E_ACTION(sc: SpawnCtx, scope: Scope): Cell { // 10 E_ACTION (refresh tpl)
    // an Action slot holds a closure that captures the local scope (slots)
    const refresh = sc.tpl[sc.ofs++]!; // [1] auto refresh (ms)
    const act_tpl = sc.tpl[sc.tpl[sc.ofs++]!]!; // [2] action body, in template index table (could patch out)
    const act: ActionType = { sc: sc, scope: scope, tpl: act_tpl, arg: null };
    if (debug) act.d_is = 'action';
    if (refresh > 0) make_timer(act, refresh);
    const cell = new_cell(act, op.is_action, null);
    cell.wait = -1; // is const.
    return cell;
}

function E_EVENT_TARGET(sc: SpawnCtx, scope: Scope): Cell { // 11 E_EVENT_TARGET ()
    // FIXME: needs to be a Cell that gets updated with `event.target.value`
    // before any action is run inside an InputEvent handler. We know the names
    // of all such DOM events, so the attr_on_event can be instructed to do the update.
    // So, now we need a well-known Cell for it to update.
    return sc.event_target_cell;
}

function E_NOT_EQUALS(sc: SpawnCtx, scope: Scope): Cell { // 12 E_NOT_EQUALS (l r)
    return bind_to_args(sc, scope, 2, op.not_equal);
}

function E_MULTIPLY(sc: SpawnCtx, scope: Scope): Cell { // 13 E_MULTIPLY (l r)
    return bind_to_args(sc, scope, 2, op.multiply);
}

function E_IS_EMPTY(sc: SpawnCtx, scope: Scope): Cell { // 14 E_IS_EMPTY (coll)
    return bind_one_arg(sc, scope, op.is_empty, true); // is_collection.
}

function E_NOT_EMPTY(sc: SpawnCtx, scope: Scope): Cell { // 15 E_NOT_EMPTY (coll)
    return bind_one_arg(sc, scope, op.not_empty, true); // is_collection.
}

function E_GE(sc: SpawnCtx, scope: Scope): Cell { // 16 E_GE (l r)
    return bind_to_args(sc, scope, 2, op.ge);
}

function E_LE(sc: SpawnCtx, scope: Scope): Cell { // 17 E_LE (l r)
    return bind_to_args(sc, scope, 2, op.le);
}

function E_GT(sc: SpawnCtx, scope: Scope): Cell { // 18 E_GT (l r)
    return bind_to_args(sc, scope, 2, op.gt);
}

function E_LT(sc: SpawnCtx, scope: Scope): Cell { // 19 E_LT (l r)
    return bind_to_args(sc, scope, 2, op.lt);
}

function E_COUNT(sc: SpawnCtx, scope: Scope): Cell { // 20 E_COUNT (coll)
    return bind_one_arg(sc, scope, op.count, true); // is_collection.
}

function E_SUBTRACT(sc: SpawnCtx, scope: Scope): Cell { // 21 E_SUBTRACT (l r)
    return bind_to_args(sc, scope, 2, op.sub);
}

function E_ADD(sc: SpawnCtx, scope: Scope): Cell { // 22 E_ADD (l r)
    return bind_to_args(sc, scope, 2, op.add);
}

function E_DIVIDE(sc: SpawnCtx, scope: Scope): Cell { // 23 E_DIVIDE (l r)
    return bind_to_args(sc, scope, 2, op.div);
}

function E_MODULO(sc: SpawnCtx, scope: Scope): Cell { // 24 E_MODULO (l r)
    return bind_to_args(sc, scope, 2, op.mod);
}

function E_OR(sc: SpawnCtx, scope: Scope): Cell { // 25 E_OR (l r)
    return bind_to_args(sc, scope, 2, op.or);
}

function E_AND(sc: SpawnCtx, scope: Scope): Cell { // 26 E_AND (l r)
    return bind_to_args(sc, scope, 2, op.and);
}

function E_ELVIS(sc: SpawnCtx, scope: Scope): Cell { // 27 E_ELVIS (l r)
    return bind_to_args(sc, scope, 2, op.elvis);
}

function E_KEY_INDEX(sc: SpawnCtx, scope: Scope): Cell { // 28 E_KEY_INDEX (coll len ...)
    throw 2;
}

function E_EVENT_KEY(sc: SpawnCtx, scope: Scope): Cell { // 29 E_EVENT_KEY ()
    // FIXME: needs to be a Cell that gets updated with `event.keyCode`
    // before any action is run inside a KeyboardEvent handler. We know the names
    // of all such DOM events, so the attr_on_event can be instructed to do the update.
    // So, now we need a well-known Cell for it to update.
    return sc.event_key_cell;
}

export const resolve_expr: ExprFunc[] = [
    E_NONE, // 0 E_NONE ()
    E_CONST, // 1 E_CONST (value)
    E_LOCAL, // 2 E_LOCAL (slot)
    E_FIELD, // 3 E_FIELD (name from)
    E_CONCAT, // 4 E_CONCAT (len ...)
    E_EQUALS, // 5 E_EQUALS (l r)
    E_NOT, // 6 E_NOT (expr)
    E_MODEL, // 7 E_MODEL (onload len ...)
    E_COLLECTION, // 8 E_COLLECTION (tpl)
    E_TERNARY, // 9 E_TERNARY (cond l r)
    E_ACTION, // 10 E_ACTION (refresh tpl)
    E_EVENT_TARGET, // 11 E_EVENT_TARGET ()
    E_NOT_EQUALS, // 12 E_NOT_EQUALS (l r)
    E_MULTIPLY, // 13 E_MULTIPLY (l r)
    E_IS_EMPTY, // 14 E_IS_EMPTY (coll)
    E_NOT_EMPTY, // 15 E_NOT_EMPTY (coll)
    E_GE, // 16 E_GE (l r)
    E_LE, // 17 E_LE (l r)
    E_GT, // 18 E_GT (l r)
    E_LT, // 19 E_LT (l r)
    E_COUNT, // 20 E_COUNT (coll)
    E_SUBTRACT, // 21 E_SUBTRACT (l r)
    E_ADD, // 22 E_ADD (l r)
    E_DIVIDE, // 23 E_DIVIDE (l r)
    E_MODULO, // 24 E_MODULO (l r)
    E_OR, // 25 E_OR (l r)
    E_AND, // 26 E_AND (l r)
    E_ELVIS, // 27 E_ELVIS (l r)
    E_KEY_INDEX, // 28 E_KEY_INDEX (coll len ...)
    E_EVENT_KEY, // 29 E_EVENT_KEY ()
];

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
    EVENT_KEY, // 29 E_EVENT_KEY ()
};
