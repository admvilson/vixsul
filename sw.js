/* Sistema de gestão Vixsul — funcionar sem internet (celular no canteiro).
   Guarda no aparelho as telas e os componentes do sistema (página, scripts, ícones, bibliotecas das CDNs) para ele abrir
   mesmo sem sinal. Os DADOS nunca passam por aqui: o banco, os serviços (Vercel) e os sites do governo vão sempre pela
   internet — quem guarda a última carga dos dados e a fila do diário é o gas-shim.js. A página abre primeiro pela
   internet (pega a versão nova) e só usa a guardada quando não há conexão. Trocar VERSAO limpa o que estava guardado. */
const VERSAO = 'vx-2026-11-24a';   // 24/11: notificações no app (push), como no WhatsApp
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'img/logo-vixsul.png', 'img/vixsul-app-192.png', 'img/vixsul-app-512.png', 'img/vixsul-app-maskable-192.png', 'img/vixsul-app-maskable-512.png', 'img/vixsul-app-180.png', 'img/vixsul-favicon-32.png', 'img/vixsul-favicon-64.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSAO).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => null)))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const SEMPRE_REDE = /(^|\.)supabase\.co$|(^|\.)vercel\.app$|(^|\.)gov\.br$|(^|\.)formsubmit\.co$|accounts\.google\.com$|(^|\.)googleapis\.com$|(^|\.)google\.com$|open-meteo\.com$/;
const CDN = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.gstatic\.com|fonts\.googleapis\.com)$/;
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  let u; try { u = new URL(r.url); } catch (x) { return; }
  if (!/^https?:$/.test(u.protocol)) return;
  if (SEMPRE_REDE.test(u.hostname) && !/^fonts\.googleapis\.com$/.test(u.hostname)) return;
  // a versão publicada (a página confere para se atualizar sozinha): sempre do servidor, nunca da cópia guardada
  if (u.origin === self.location.origin && /\/versao\.json$/.test(u.pathname)) return;
  // a página: primeiro a internet (versão nova, conferida com o servidor — "no-cache" — e não a do cache do navegador,
  // que podia entregar a anterior por até 10 minutos depois de publicar); sem conexão, a guardada
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r, { cache: 'no-cache' }).then(resp => { if (resp && resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put('index.html', cp)); } return resp; })
      .catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
    return;
  }
  // o manifesto e os ícones: primeiro a internet (o Chrome confere por eles se o app mudou — com a cópia guardada, o
  // ícone novo nunca chegava ao atalho); sem conexão, o guardado
  if (u.origin === self.location.origin && (/\/manifest\.webmanifest$/.test(u.pathname) || /\/img\//.test(u.pathname))) {
    e.respondWith(fetch(r).then(resp => { if (resp && resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put(r, cp)); } return resp; })
      .catch(() => caches.match(r).then(m => m || Response.error())));
    return;
  }
  const mesmo = u.origin === self.location.origin, cdn = CDN.test(u.hostname);
  if (!mesmo && !cdn) return;
  // scripts, estilos, imagens e bibliotecas: usa o guardado e atualiza por trás
  e.respondWith(caches.open(VERSAO).then(async c => {
    const hit = await c.match(r);
    const rede = fetch(r).then(resp => { if (resp && (resp.ok || resp.type === 'opaque')) c.put(r, resp.clone()); return resp; }).catch(() => hit);
    return hit || rede;
  }));
});

/* NOTIFICAÇÕES (como no WhatsApp): o servidor da Vixsul manda pelo serviço de notificação do próprio aparelho; aqui ela
   aparece mesmo com o app fechado. Tocar abre o sistema na mensagem (o sino "Avisos"); se ele já estiver aberto, só traz
   para a frente e abre a mensagem. A carga só tem o título, o começo do texto e o número da mensagem — o resto o sistema
   lê do servidor, com o login. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: 'Vixsul', texto: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'Vixsul — Sistema de gestão';
  const op = { body: d.texto || '', icon: 'img/vixsul-app-192.png', badge: 'img/vixsul-badge-96.png', tag: 'vx-' + (d.id || Date.now()), renotify: false,
    timestamp: d.quando || Date.now(), data: { url: d.url || './', id: d.id || '' }, vibrate: [120, 60, 120] };
  e.waitUntil(Promise.all([
    self.registration.showNotification(titulo, op),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ vxPush: d }))).catch(() => null)
  ]));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const dd = e.notification.data || {}, alvo = new URL(dd.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.indexOf(self.registration.scope) === 0);
    if (c) { c.postMessage({ vxAbrir: dd }); return c.focus().catch(() => null); }
    return self.clients.openWindow(alvo);
  }));
});
