
export type Tpl = number[]
export type Syms = (string|number|boolean)[]

export type OpFunc = (sc:SpawnCtx, scope:Scope) => Cell;

export type DListArg = Cell|BoundEventState|TimerState;
export type DListFunc =
    | ((arg:Cell, in_destroy:boolean) => void) // destroy_bound_expr, destroy_each, destroy_when, destroy_args, destroy_one_arg
    | ((arg:BoundEventState, in_destroy:boolean) => void) // unbind_event_handler
    | ((arg:TimerState, in_destroy:boolean) => void) // stop_auto_refresh
export type DList = (DListFunc|DListArg)[]

export type EventTargetHack = (e:Event) => string;
export type BindToArgsFunc = (cell:Cell, args:Cell[]) => void;
export type BindOneArgFunc = (cell:Cell, arg:Cell) => void;
export type CellVal = null|string|number|boolean|ModelType|CollectionType|ActionType|ModelType[];
export type CellState = null|Cell|Cell[]|EachState|WhenState|BoundTextState|BoundExprState|BoundKeyIndex|FieldProxyState;
export type CellFunc =
    | BindToArgsFunc
    | BindOneArgFunc
    | ((cell:Cell, state:EachState) => void) // update_each_dep
    | ((cell:Cell, state:WhenState) => void) // update_when_dep
    | ((cell:Cell, state:BoundTextState) => void) // update_bound_text
    | ((cell:Cell, state:BoundExprState) => void) // update_bound_attr, update_bound_prop_text, update_bound_prop_bool, update_bound_class, update_bound_style_text
    | ((cell:Cell, state:BoundKeyIndex) => void) // update_key_index

export const enum op {
    is_const = 0,
    is_model,
    is_collection,
    is_item_array,
    is_action,
    is_field,
    last_non_update_op,
    // update ops:
    field_proxy, // get named field from dynamic model
    concat,
    equals,
    not,
    ternary,
    not_equal,
    multiply,
    is_empty,
    not_empty,
    ge,
    le,
    gt,
    lt,
    count,
    sub,
    add,
    mul,
    div,
    mod,
    or,
    and,
    elvis,
    //update_key_index,
    // DOM bindings.
    bound_text,
    bound_attr,
    bound_prop_text,
    bound_prop_bool,
    bound_class,
    bound_style_text,
    bound_each,
    bound_when,
    event_target,
}

export type FwdList = Cell[];
export type Cell = {
    dirty:boolean, val:CellVal, wait:number, fwd:FwdList, dead:boolean
    op:op, state:CellState|null, // applied in decr_and_update
    n?:number, d_field?:string, d_model?:ModelType // if (debug)
}

export type ActFuncArg = EachState|WhenState|TimerState|ActionType;
export type ActFunc =
    | ((state:EachState) => void)
    | ((state:WhenState) => void)
    | ((state:TimerState) => void)
    | ((action:ActionType, event?:Event) => void)
export type QueuedAct = { fn:ActFunc, arg:ActFuncArg }

export type ModelFields = { [key:string]:Cell }
export type ModelType = {
    _id:string, _key:string, fields:ModelFields, loadAct:number, scope:Scope|null,
    d_field?:string, d_model?:ModelType // if (debug)
}
export type CollectionType = {
    _id:string, scope:Scope, items:Cell // items.val is ModelType[]
    model_tpl:number // used to spawn new Models
    d_field?:string, d_model?:ModelType // if (debug)
}
export type ActionType = {
    sc:SpawnCtx, scope:Scope, tpl:number, arg:Cell|null,
    d_is?:string, d_field?:string, d_model?:ModelType // if (debug)
}

export type FieldProxyState = { left:Cell, model:ModelType|null, field:Cell|null, name:string };
export type BoundTextState = { dom_node:Text, expr_dep:Cell }
export type BoundExprState = { name:string, dom_node:HTMLElement, expr_dep:Cell };
export type BoundKeyIndex = { keys: string[], vals:Cell[] };
export type BoundEventState = { dom_node:HTMLElement, name:string, handler:(e:Event)=>void }
export type EachKeys = Record<string,VNode|undefined>
export type EachState = { vnode:VNode, scope:Scope, coll:CollectionType, body_tpl:number, bind_as:number, have_keys:EachKeys, update_each:(state:EachState)=>void };
export type WhenState = { vnode:VNode, scope:Scope, cond_cell:Cell, body_tpl:number, in_doc:boolean, update_when:(state:WhenState)=>void }
export type TimerState = { act:ActionType, timer:number, dead:boolean, d_is?:string }

export type Scope = {
    locals: Cell[]
    cssm: string
    c_tpl: number
    c_locals: Cell[]
    c_cssm: string
    d_list: DList // delete-list: funs to call when the Scope is destroyed
}

export type SpawnFunc = (sc:SpawnCtx, parent:VNode, scope:Scope) => void;
export type ExprFunc = (sc: SpawnCtx, scope: Scope) => Cell;

export type SpawnCtx = {
    tpl: Tpl
    ofs: number
    syms: Syms
    fragment: DocumentFragment|HTMLElement
    spawn_children: SpawnFunc
    resolve_expr: ExprFunc[]
    spawn_model_tpl: (sc:SpawnCtx, scope:Scope) => ModelType,
    event_target_cell: Cell,
    event_key_cell: Cell,
}

export type VNode = {
    up: VNode|null         // parent VNode
    next_s: VNode|null     // previous sibling VNode
    prev_s: VNode|null     // next sibling VNode
    dom: Text|HTMLElement|null // EITHER: a DOM Node...
    first: VNode|null      // OR: linked list of child VNodes
    last: VNode|null
    d_list: DList|null     // delete-list: non-null if used
    d_is?:string, d_in?:string, d_state?:any // if (debug)
}

export function is_true(val:any): boolean {
  return (val instanceof Array ? val['length'] > 0 : !!val);
}

export function to_text(val:any): string {
  return (val == null || val instanceof Object) ? '' : (''+val);
}
