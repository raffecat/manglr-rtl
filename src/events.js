// -+-+-+-+-+-+-+-+-+ DOM Events -+-+-+-+-+-+-+-+-+

function stop(event) {
  if (event.preventDefault) event.preventDefault(); else event.returnValue = false; // IE returnValue.
  if (event.stopPropagation) event.stopPropagation(); else event.cancelBubble = true; // IE cancelBubble.
}

function tap_handler(event) {
  let dom_target = event.target || event.srcElement; // IE 6-8 srcElement.
  for (; dom_target; dom_target = dom_target.parentNode) {
    const dom_id = dom_target.id;
    if (dom_id) {
      const list = tap_handlers['t'+dom_id];
      if (list) {
        for (let i=0; i<list.length; i++) {
          if (list[i](event) === false) {
            return stop(event);
          }
        }
      }
    }
  }
}

function add_handler(nid, func) {
  const list = tap_handlers[nid];
  if (list) list.push(func); else tap_handlers[nid] = [func];
}

// dom_node.addEventListener('touchstart', tap_handler); // TODO: properly.
document.addEventListener('click', tap_handler, true);
