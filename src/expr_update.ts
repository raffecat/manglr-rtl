import { remove_fwd } from "./cells";
import { debug, log_deps } from "./config";
import { Cell, FieldProxyState, fw, ModelType } from "./types";

export function decr_and_update(from: Cell, is_dirty: boolean): void {
    if (from.wait < 1) throw 1; // assert: no decrement without increment first.
    const new_wait = --from.wait;
    if (new_wait > 0) {
        // this cell isn't ready to update yet.
        // however, the other remaining upstream(s) may pass is_dirty=false:
        if (is_dirty) from.dirty = true; // make sure this cell updates when wait drops to zero.
        if (log_deps) console.log("... cell #" + from.n + " is now waiting for " + new_wait);
        return;
    }
    // the cell is ready to update now.
    const fwd = from.fwd, len = fwd.length;
    if (from.dirty || is_dirty) {
        from.dirty = false; // reset.
        if (log_deps) console.log("... cell #" + from.n + " is now ready (applying update)");
        let i = 0;
        while (i < len) {
            const to = fwd[i++] as Cell;
            const op = fwd[i++] as fw;
            switch (op) {
                case fw.copy_val: { // just copy value (e.g. field-proxy)
                    const new_val = from.val;
                    const old_val = to.val;
                    const dirty = (new_val !== old_val);
                    if (dirty) to.val = from.val;
                    decr_and_update(to, dirty);
                    break;
                }
                case fw.model_swap: {
                    // ideally need 3 bits of state: the last Model, the last Field, the field name.
                    // but 2 is enough: the last Field, the field name.
                    const state = to.state as FieldProxyState;
                    const new_model = from.val as ModelType | null; // new upstream Model|null
                    const new_field = new_model !== null ? new_model.fields[state.name]! as Cell : null;
                    if (debug && new_field === undefined) throw 5; // MUST exist.
                    const old_field = state.field;
                    let old_val = to.val;
                    if (new_field !== old_field) {
                        // upstream model has actually changed:
                        state.field = new_field;
                        // must unsubscribe from the old field-cell.
                        if (old_field !== null) {
                            remove_fwd(old_field, to);
                        }
                        // subscribe to the new field-cell and copy the value.
                        if (new_field !== null) {
                            new_field.fwd.push(to, fw.copy_val);
                            to.val = new_field.val;
                        } else {
                            to.val = null;
                        }
                    }
                    const dirty = (to.val !== old_val);
                    decr_and_update(to, dirty);
                    break;
                }
                default:
                    throw 2;
            }
        }
    } else {
        if (log_deps) console.log("... cell #" + from.n + " is now ready (skipping update)");
        for (let i = 0; i < len; i += 2) {
            decr_and_update(fwd[i] as Cell, false);
        }
    }
}
