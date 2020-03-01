// import { debug } from './config'

export function b93_decode(text) {
  var res = [], len = text.length, i = 0, acc = 0, ch;
  for (;i<len;i++) {
    ch = text.charCodeAt(i);
    if (ch >= 95) {
      acc = (acc << 5) + (ch - 95); // high 5 bits.
    } else {
      if (ch > 92) --ch;
      if (ch > 34) --ch;
      res.push((acc * 61) + (ch - 32)); // low 61 vals.
      acc = 0;
    }
  }
  // if (debug) console.log("b93", res);
  return res;
}
