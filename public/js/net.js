// サーバとの通信。HTTP + Server-Sent Events だけを使う。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// サーバが立ち上がるまで待ち続ける（PCを先に起動しても良いように）
export async function fetchHello(seatParam) {
  const q = seatParam ? `?seat=${encodeURIComponent(seatParam)}` : '';
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`/api/hello${q}`, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {
      // retry
    }
    await sleep(Math.min(5000, 500 * 2 ** i));
  }
}

// EventSource は切断されても自動で再接続する
export function connectEvents(onMessage) {
  const es = new EventSource('/events');
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (err) {
      console.error(err);
    }
  };
  return es;
}

export function postJSON(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
