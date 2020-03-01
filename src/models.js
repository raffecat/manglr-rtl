import { hasOwn } from './config'
import { new_dep, set_dep } from './deps'

// -+-+-+-+-+-+-+-+-+ Models -+-+-+-+-+-+-+-+-+

// A model is a set of named fields of known types (statically determined)
// Create a Dep for each field. Bindings subscribe to those deps.
// When loading data, load per-field into those deps (coerce to known type)

let g_model = 1;

export function Model() {
  // FIXME: need field metadata here - names, types (for loading), init-exprs!
  // FIXME: also need to pre-create nested Models and Collections.
  this._id = 'm'+(g_model++);
  this._key = '';
  this.fields = {};
}

export function Collection(scope) {
  // FIXME: need field metadata here - names, types (for loading), init-exprs!
  // FIXME: also need to pre-create nested Models and Collections.
  this._id = 'c'+(g_model++);
  this.scope = scope; // for spawning new models.
  this.items = new_dep([]);
}

export function model_fields_to_json(model) {
  const fields = model.fields
  const req = {}
  for (let key in fields) {
    if (hasOwn.call(fields, key)) {
      const field = fields[key];
      if (field instanceof Model) {
        req[key] = model_fields_to_json(field);
      } else if (field instanceof Collection) {
        const list = [];
        const items = field.items;
        for (let i=0; i<items.length; i++) {
          list[i] = model_fields_to_json(items[i]);
        }
        req[key] = list;
      } else {
        req[key] = field.val; // dep.
      }
    }
  }
  return req
}

export function json_to_model_fields(model, values, sc) {
  const fields = model.fields
  for (let f_name in fields) {
    if (hasOwn.call(fields, f_name)) {
      const field = fields[f_name]
      const val = values[f_name]
      if (field instanceof Model) {
        json_to_model_fields(field, val, sc)
      } else if (field instanceof Collection) {
        // index existing models in the collection by key (_id)
        const old_models = field.items.val; // dep.
        const known_keys = {}; // known keys in THIS collection (local keys)
        for (let i=0; i<old_models.length; i++) {
          const model = old_models[i];
          known_keys[model._key] = model;
        }
        // update existing models; create models for new keys.
        const src_elems = val instanceof Array ? val : [];
        const new_items = []
        for (let i=0; i<src_elems.length; i++) {
          const elem = src_elems[i]
          const key = '$'+String(elem.id||i) // TODO FIXME assuming key on "id" (allow config)
          let model = known_keys[key]
          if (!model) {
            const saved_ofs = sc.ofs ; sc.ofs = field.model_tpl; // seek to Model template!
            sc.ofs++; // skip E_MODEL (TODO: remove it from model-tpl?)
            model = sc.spawn_model_tpl(sc, field.scope) // create Model instance with defaults.
            sc.ofs = saved_ofs; // restore saved offset.
            model._key = key; // save for known_keys later - [bug] DO NOT REPLACE _id !!
            known_keys[key] = model // protect against duplicate keys.
          }
          json_to_model_fields(model, elem, sc)
          new_items[i] = model // use the order in the received data.
        }
        set_dep(field.items, new_items)
      } else {
        // XXX MUST cast value to model field type!
        set_dep(field, val != null ? val : null)
      }
    }
  }
}
