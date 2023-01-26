import { debug, hasOwn } from './config'
import { new_cell, modify_cell } from './cells'
import { Cell, CollectionType, ModelType, Scope, SpawnCtx } from './types';

// -+-+-+-+-+-+-+-+-+ Models -+-+-+-+-+-+-+-+-+

// A model is a set of named fields of known types (statically determined)
// Create a Cell for each field. Bindings subscribe to those deps.
// When loading data, load per-field into those cells (coerce to known type)

let g_model = 1;

export function Model(this:ModelType): any {
  this._id = 'm'+(g_model++);
  this._key = '';
  this.fields = {};
  this.loadAct = 0;
  this.scope = null;
}

export function Collection(this:CollectionType, scope:Scope): any {
  this._id = 'c'+(g_model++);
  this.scope = scope; // for spawning new models.
  this.items = new_cell([], null, null);
  this.model_tpl = 0;
}

export function model_fields_to_json(model:ModelType): any {
  if (debug && !(model instanceof Model)) { throw 5; }
  const fields = model.fields;
  const req: any = {}
  for (const key of Object.keys(fields)) { // FIXME: names + types will come from sc-tpl
    const field = fields[key]!;
    if (field.val instanceof Model) {
      req[key] = model_fields_to_json(field.val as ModelType);
    } else if (field.val instanceof Collection) {
      const list = [];
      const items = (field.val as CollectionType).items.val as ModelType[];
      for (let i=0; i<items.length; i++) {
        list[i] = model_fields_to_json(items[i]!);
      }
      req[key] = list;
    } else {
      req[key] = field.val;
    }
  }
  return req
}

export function json_to_model_fields(model:ModelType, data:any, sc:SpawnCtx): void {
  if (debug && !(model instanceof Model)) { throw 5; }
  const values = (typeof data === 'object' && data !== null) ? data : {};
  const fields = model.fields; 
  for (const f_name of Object.keys(fields)) { // FIXME: names + types will come from sc-tpl
    const field = fields[f_name]!;
    const val = hasOwn.call(values, f_name) ? values[f_name] : null;
    if (field.val instanceof Model) {
      json_to_model_fields(field.val as ModelType, val, sc);
    } else if (field.val instanceof Collection) {
      // index existing models in the collection by key (_id)
      const coll = field.val as CollectionType;
      const old_models = coll.items.val as ModelType[];
      const known_keys: Record<string,ModelType|undefined> = {}; // known keys in THIS collection (local keys)
      for (let i=0; i<old_models.length; i++) {
        const model = old_models[i]!;
        known_keys[model._key] = model;
      }
      // update existing models; create models for new keys.
      const src_elems = val instanceof Array ? val : [];
      const new_items: ModelType[] = [];
      for (let i=0; i<src_elems.length; i++) {
        const elem = src_elems[i]!;
        const id_val = hasOwn.call(elem, 'id') ? elem.id : null; // TODO assuming key on "id" (allow config)
        const key = (typeof id_val === 'string' ? '$'+id_val : typeof id_val === 'number' ? '$'+id_val : '$'+i);
        let model = known_keys[key];
        if (!model) {
          const saved_ofs = sc.ofs ; sc.ofs = coll.model_tpl; // seek to Model template!
          // gone from asm: // sc.ofs++; // skip E_MODEL (TODO: remove it from model-tpl?)
          model = sc.spawn_model_tpl(sc, coll.scope); // create Model instance with defaults.
          sc.ofs = saved_ofs; // restore saved offset.
          model._key = key; // save for known_keys later - [bugfix] DO NOT REPLACE _id !!
          known_keys[key] = model;
        }
        json_to_model_fields(model, elem, sc);
        new_items[i] = model; // use the order in the received data.
      }
      modify_cell(coll.items, new_items)
    } else {

      // FIXME: MUST cast value to model field type!
      // BUG here: (post) if the field is missing from the response,
      // we end up setting fields to 'undefined' (e.g. flag becomes 'undefined')
      const t = typeof field.val; // HACK: old value tells us the type!
      let new_val = null;
      if (t === 'boolean') new_val = (val !== false && val !== null);
      else if (t === 'string') new_val = (typeof val !== 'object' ? val.toString() : '');
      else if (t === 'number') new_val = + val;

      modify_cell(field, new_val);
    }
  }
}
