/* Sistema de gestão Vixsul — funcionar sem internet (celular no canteiro).
   Guarda no aparelho as telas e os componentes do sistema (página, scripts, ícones, bibliotecas das CDNs) para ele abrir
   mesmo sem sinal. Os DADOS nunca passam por aqui: o banco, os serviços (Vercel) e os sites do governo vão sempre pela
   internet — quem guarda a última carga dos dados e a fila do diário é o gas-shim.js. A página abre primeiro pela
   internet (pega a versão nova) e só usa a guardada quando não há conexão. Trocar VERSAO limpa o que estava guardado. */
const VERSAO = 'vx-2026-11-16a';   // 16/11: ícone novo (só o símbolo da Vixsul)
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'img/logo-vixsul.png', 'img/icone-192.png', 'img/icone-512.png', 'img/icone-maskable-192.png', 'img/icone-maskable-512.png', 'img/apple-touch-icon.png', 'img/favicon-32.png', 'img/favicon-64.png'];
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
  // a página: primeiro a internet (versão nova); sem conexão, a guardada
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(resp => { if (resp && resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put('index.html', cp)); } return resp; })
      .catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
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
