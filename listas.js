/* Listas suspensas com pesquisa — TODA <select> do sistema de gestão abre no mesmo
 * padrão do campo "Classificação › Categoria › Subcategoria": uma caixa com a busca no
 * topo e a lista embaixo (setas, Enter e Esc funcionam; no celular abre por baixo).
 *
 * A <select> continua sendo a de verdade — valor, eventos (input/change), validação e
 * o texto que aparece no campo: este arquivo só troca a lista que abre ao clicar.
 * Assim vale para as telas que já existem, para as que aparecem depois (janelas,
 * planilhas) e para listas que mudam sozinhas (categoria depois da classificação).
 * Ficam de fora: lista de múltipla escolha e quem tiver o atributo data-nativo. */
(function () {
  'use strict';
  let pop = null, alvo = null, itens = [], vis = [], sel = 0, toque = null, abertoEm = 0;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const escH = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const vale = s => !!s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.disabled && !s.hasAttribute('data-nativo') && !s.closest('[data-nativo]');
  const celular = () => window.innerWidth < 560;

  function itensDe(s) {
    const out = [];
    Array.from(s.children).forEach(ch => {
      if (ch.tagName === 'OPTGROUP') {
        const ops = Array.from(ch.children).filter(o => o.tagName === 'OPTION' && !o.hidden);
        if (ops.length) { out.push({ grupo: ch.label }); ops.forEach(o => out.push({ o, g: ch.label })); }
      } else if (ch.tagName === 'OPTION' && !ch.hidden) out.push({ o: ch, g: '' });
    });
    return out;
  }
  function desenhar() {
    const ul = pop.querySelector('ul'), q = norm(pop.querySelector('input').value).split(/\s+/).filter(Boolean);
    const passa = it => !q.length || q.every(p => norm(it.o.text + ' ' + it.g).includes(p));
    // grupo (optgroup) só aparece se tiver alguma opção que passou na busca
    vis = itens.filter(it => it.o && passa(it));
    const html = [];
    let grupoAtual = null;
    vis.forEach((it, i) => {
      if (it.g && it.g !== grupoAtual) { grupoAtual = it.g; html.push(`<li class="gf-lista-grupo">${escH(it.g)}</li>`); }
      const vazio = it.o.value === '';
      html.push(`<li role="option" data-i="${i}" class="${i === sel ? 'on' : ''}${it.o.disabled ? ' off' : ''}${vazio ? ' vazio' : ''}${it.o.selected ? ' atual' : ''}" aria-selected="${it.o.selected}">${it.o.selected ? '<i class="fas fa-check"></i>' : ''}${escH(it.o.text)}</li>`);
    });
    ul.innerHTML = html.join('') || '<li class="gf-combo-nada">Nada encontrado.</li>';
    const on = ul.querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function posicionar() {
    if (!pop || !alvo) return;
    if (celular()) { pop.classList.add('baixo'); pop.style.cssText = ''; return; }
    pop.classList.remove('baixo');
    const r = alvo.getBoundingClientRect(), largura = Math.min(window.innerWidth - 16, Math.max(r.width, 260));
    const esq = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    const embaixo = window.innerHeight - r.bottom - 12, emcima = r.top - 12, acima = embaixo < 240 && emcima > embaixo;
    const alt = Math.max(160, Math.min(380, acima ? emcima : embaixo));
    pop.style.cssText = `left:${esq}px;width:${largura}px;${acima ? `bottom:${window.innerHeight - r.top + 4}px` : `top:${r.bottom + 4}px`}`;
    pop.querySelector('ul').style.maxHeight = (alt - 58) + 'px';
  }
  function abrir(s) {
    fechar(false); fecharD();
    alvo = s; itens = itensDe(s); abertoEm = Date.now();
    pop = document.createElement('div');
    pop.className = 'gf-lista-pop';
    pop.innerHTML = `<div class="gf-combo-busca"><i class="fas fa-magnifying-glass"></i><input type="text" placeholder="Pesquisar…" autocomplete="off" aria-label="Pesquisar na lista"></div><ul class="gf-combo-lista" role="listbox"></ul>`;
    document.body.appendChild(pop);
    const atual = itens.filter(it => it.o).findIndex(it => it.o.selected);
    sel = Math.max(0, atual);
    desenhar(); posicionar();
    alvo.classList.add('gf-lista-aberta');
    const inp = pop.querySelector('input');
    // no celular a busca só ganha o foco se a lista for grande (senão o teclado cobre tudo)
    if (!celular() || itens.length > 12) setTimeout(() => inp.focus(), 0);
    inp.addEventListener('input', () => { sel = 0; desenhar(); });
    inp.addEventListener('keydown', teclas);
    pop.addEventListener('mousedown', ev => { ev.preventDefault(); const li = ev.target.closest('li[data-i]'); if (li) escolher(vis[+li.dataset.i]); });
  }
  function fechar(devolverFoco) {
    if (!pop) return;
    const s = alvo; pop.remove(); pop = null; alvo = null;
    if (s) { s.classList.remove('gf-lista-aberta'); if (devolverFoco) s.focus({ preventScroll: true }); }
  }
  function escolher(it) {
    if (!it || !alvo || it.o.disabled) return;
    const s = alvo, antes = s.selectedIndex;
    s.selectedIndex = it.o.index;
    fechar(true);
    if (s.selectedIndex !== antes) { s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function teclas(ev) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(vis.length - 1, sel + 1); desenhar(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(0, sel - 1); desenhar(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); escolher(vis[sel]); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(true); }
    else if (ev.key === 'Tab') fechar(false);
  }

  // abrir com o mouse (a lista do navegador não chega a abrir)
  document.addEventListener('mousedown', ev => {
    if (pop && !pop.contains(ev.target) && ev.target !== alvo) fechar(false);
    const s = ev.target.closest && ev.target.closest('select');
    if (!vale(s) || ev.button !== 0) return;
    ev.preventDefault();
    if (pop && alvo === s) return fechar(true);
    s.focus({ preventScroll: true });
    abrir(s);
  }, true);
  // abrir com o toque (celular): só se o dedo não arrastou (rolagem da página)
  document.addEventListener('touchstart', ev => { const t = ev.touches[0]; toque = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  document.addEventListener('touchend', ev => {
    const s = ev.target.closest && ev.target.closest('select');
    if (pop && !pop.contains(ev.target) && ev.target !== alvo) fechar(false);
    if (!vale(s)) return;
    const t = ev.changedTouches[0];
    if (toque && t && Math.hypot(t.clientX - toque.x, t.clientY - toque.y) > 10) return;
    ev.preventDefault();
    abrir(s);
  }, { capture: true, passive: false });
  // abrir pelo teclado: Enter, espaço, F4 ou Alt+seta (as setas sozinhas continuam trocando a opção)
  document.addEventListener('keydown', ev => {
    const s = ev.target;
    if (!vale(s) || pop) return;
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'F4' || (ev.altKey && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp'))) { ev.preventDefault(); abrir(s); }
  }, true);
  /* ── CAMPOS DE DIGITAR COM SUGESTÕES (fornecedor, cliente, responsável…) ──────────
     Eram <input list="…"> com a caixa escura do navegador. Agora abrem a MESMA caixa das
     listas: o próprio campo é a pesquisa (o que se digita filtra), as opções vêm do
     <datalist> e um nome novo continua valendo (fornecedor/cliente novo é cadastrado
     sozinho onde o sistema já fazia isso). O atributo "list" sai (vira data-gf-lista)
     para o navegador não abrir a caixa dele por cima. */
  let popD = null, campo = null, visD = [], selD = -1;
  function prepararCampos(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll('input[list]') : []).forEach(el => {
      if (el.hasAttribute('data-nativo') || el.closest('[data-nativo]')) return;
      el.dataset.gfLista = el.getAttribute('list'); el.removeAttribute('list');
      el.setAttribute('autocomplete', 'off'); el.classList.add('gf-lista-campo');
    });
  }
  function opcoesDe(el) {
    const dl = document.getElementById(el.dataset.gfLista || ''); if (!dl) return [];
    const vistos = new Set();
    return Array.from(dl.querySelectorAll('option')).map(o => ({ v: o.value, extra: (o.label && o.label !== o.value ? o.label : (o.textContent || '').trim() !== o.value ? (o.textContent || '').trim() : '') }))
      .filter(x => x.v && !vistos.has(x.v) && vistos.add(x.v));
  }
  function desenharD() {
    const q = norm(campo.value).split(/\s+/).filter(Boolean), atual = norm(campo.value);
    visD = opcoesDe(campo).filter(x => !q.length || q.every(p => norm(x.v + ' ' + x.extra).includes(p))).slice(0, 120);
    if (selD >= visD.length) selD = visD.length - 1;
    const ul = popD.querySelector('ul');
    ul.innerHTML = visD.map((x, i) => `<li role="option" data-i="${i}" class="${i === selD ? 'on' : ''}${norm(x.v) === atual ? ' atual' : ''}">${norm(x.v) === atual ? '<i class="fas fa-check"></i>' : ''}<span>${escH(x.v)}${x.extra ? `<small>${escH(x.extra)}</small>` : ''}</span></li>`).join('')
      || `<li class="gf-combo-nada">${campo.value.trim() ? `“${escH(campo.value.trim())}” não está na lista — fica como digitado.` : 'Nenhum cadastro ainda.'}</li>`;
    const novo = campo.value.trim() && visD.length && !visD.some(x => norm(x.v) === atual);
    popD.querySelector('.gf-lista-novo').hidden = !novo;
    if (novo) popD.querySelector('.gf-lista-novo').innerHTML = `<i class="fas fa-plus"></i> “${escH(campo.value.trim())}” é novo — fica como digitado`;
    const on = ul.querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function posicionarD() {
    if (!popD || !campo) return;
    const r = campo.getBoundingClientRect(), largura = Math.min(window.innerWidth - 16, Math.max(r.width, 260));
    const esq = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    const embaixo = window.innerHeight - r.bottom - 12, emcima = r.top - 12, acima = embaixo < 220 && emcima > embaixo;
    const alt = Math.max(150, Math.min(360, acima ? emcima : embaixo));
    popD.style.cssText = `left:${esq}px;width:${largura}px;${acima ? `bottom:${window.innerHeight - r.top + 4}px` : `top:${r.bottom + 4}px`}`;
    popD.querySelector('ul').style.maxHeight = (alt - 16) + 'px';
  }
  function abrirD(el) {
    if (popD && campo === el) return;
    fechar(false); fecharD();
    if (!opcoesDe(el).length) return;
    campo = el; selD = -1;
    popD = document.createElement('div');
    popD.className = 'gf-lista-pop gf-lista-sug';
    popD.innerHTML = '<ul class="gf-combo-lista" role="listbox"></ul><div class="gf-lista-novo" hidden></div>';
    document.body.appendChild(popD);
    desenharD(); posicionarD(); abertoEm = Date.now();
    campo.classList.add('gf-lista-aberta');
    popD.addEventListener('mousedown', ev => { ev.preventDefault(); const li = ev.target.closest('li[data-i]'); if (li) escolherD(visD[+li.dataset.i]); });
  }
  function fecharD() { if (!popD) return; popD.remove(); popD = null; if (campo) campo.classList.remove('gf-lista-aberta'); campo = null; }
  function escolherD(x) {
    if (!x || !campo) return;
    const el = campo; el.value = x.v; fecharD();
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.addEventListener('mousedown', ev => {
    const el = ev.target.closest && ev.target.closest('.gf-lista-campo');
    if (popD && !popD.contains(ev.target) && ev.target !== campo) fecharD();
    if (el && ev.button === 0) setTimeout(() => { if (document.activeElement === el) abrirD(el); }, 0);   // clicou no campo: abre
  }, true);
  document.addEventListener('focusout', ev => { if (popD && ev.target === campo) setTimeout(() => { if (popD && document.activeElement !== campo) fecharD(); }, 120); }, true);
  document.addEventListener('input', ev => { if (ev.target === campo && popD) { selD = -1; desenharD(); } else if (ev.target.classList && ev.target.classList.contains('gf-lista-campo') && !popD && ev.isTrusted) abrirD(ev.target); }, true);
  document.addEventListener('keydown', ev => {
    if (!popD && ev.key === 'ArrowDown' && ev.target.classList && ev.target.classList.contains('gf-lista-campo')) { ev.preventDefault(); abrirD(ev.target); return; }
    if (!popD || ev.target !== campo) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); selD = Math.min(visD.length - 1, selD + 1); desenharD(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); selD = Math.max(0, selD - 1); desenharD(); }
    else if (ev.key === 'Enter' && selD >= 0 && visD[selD]) { ev.preventDefault(); ev.stopPropagation(); escolherD(visD[selD]); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fecharD(); }
    else if (ev.key === 'Tab') fecharD();
  }, true);
  // campos que aparecem depois (janelas, telas novas, planilhas)
  prepararCampos(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('input[list]')) prepararCampos(n.parentNode || document); else prepararCampos(n); } })))
    .observe(document.documentElement, { childList: true, subtree: true });

  // a página rolou ou mudou de tamanho: a caixa fecha (não fica solta no lugar errado)
  document.addEventListener('scroll', ev => { if (popD && !popD.contains(ev.target) && Date.now() - abertoEm > 300) fecharD(); }, true);
  window.addEventListener('resize', () => { if (popD && !celular()) fecharD(); });
  // (no celular a caixa fica presa embaixo e o teclado rola a página: lá ela não fecha)
  document.addEventListener('scroll', ev => { if (pop && !celular() && !pop.contains(ev.target) && Date.now() - abertoEm > 300) fechar(false); }, true);
  window.addEventListener('resize', () => { if (pop && !celular()) fechar(false); });
})();
