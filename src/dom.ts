// import { debug } from './config'

// -+-+-+-+-+-+-+-+-+ DOM Manipulation -+-+-+-+-+-+-+-+-+

export function dom_add_class(elem:HTMLElement, cls:string): void {
  const clist = elem.classList;
  if (clist) {
    // classList is fast and avoids spurious reflows.
    clist['add'](cls);
  } else {
    // check if the class is already present.
    const classes = elem['className'];
    const list = classes['split'](' ');
    for (let i=0; i<list['length']; i++) {
      if (list[i] === cls) return;
    }
    // cls was not found: add the class.
    elem['className'] = classes + ' ' + cls;
  }
}

export function dom_remove_class(elem:HTMLElement, cls:string): void {
  const clist = elem.classList;
  if (clist) {
    // classList is fast and avoids spurious reflows.
    clist['remove'](cls);
  } else {
    const list = elem['className']['split'](' ');
    let dirty = false;
    for (let i=0; i<list['length']; i++) {
      if (list[i] === cls) {
        list['splice'](i--, 1);
        dirty = true;
      }
    }
    // avoid setting className unless we actually changed it.
    if (dirty) elem['className'] = list['join'](' ');
  }
}
