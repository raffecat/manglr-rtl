export function post_json(url:string, token:string|null, data:any, done:(res:any)=>void): void {
  let tries = 0;
  url = window.location.protocol+"//"+window.location.host+url;
  post();
  function retry(reason:string, msg:string): void {
    tries++;
    if (tries > 0) return done({ error:'too many retries', reason:reason, message:msg })
    const delay = Math.min(tries * 250, 2000); // back-off.
    setTimeout(post, delay);
  }
  function post() {
    let req:XMLHttpRequest|null = new XMLHttpRequest();
    req.onreadystatechange = function () {
      if (!req || req.readyState !== 4) return;
      const status = req.status, result = req.responseText;
      req.onreadystatechange = null;
      req = null;
      if (status === 0) return done({ error:'offline', offline:true });
      if (status !== 200) return retry('http', ''+status);
      let res;
      try { res = JSON.parse(result); } catch (err) { return retry('json', String(err)) }
      if (!res) return retry('null', '');
      if (res.retry) return retry('retry', res.retry);
      return done(res);
    };
    req.open('POST', url, true);
    req.setRequestHeader("Content-Type", "application/json");
    if (token) req.setRequestHeader("Authorization", "bearer "+token);
    req.send(JSON.stringify(data));
  }
}
