/* NOTIFICAÇÕES NO APP (celular e computador) — Web Push, grátis: quem entrega é o próprio navegador/sistema do aparelho
   (Google no Android e no Chrome, Apple no iPhone com o app na Tela de Início, Microsoft no Edge), como no WhatsApp.
   - As chaves VAPID saem do SUPABASE_JWT_SECRET (a mesma chave do passe do sistema): nada novo para configurar na Vercel
     e nada secreto no código (o repositório é público). A chave pública vai para o navegador; a privada nunca sai daqui.
   - INSCRIÇÕES (cada aparelho que ligou as notificações): tabela "arquivos", tipo 'push_inscricao', ligada ao usuário
     (uidn = id da tabela de usuários) e assinada pelo servidor (HMAC) — linha forjada ou alterada por outra pessoa não vale.
   - MENSAGENS (a caixa de entrada do app, o "Avisos" do sino): tabela "arquivos", tipo 'mensagem_app', uma por pessoa,
     também assinadas. O PDF (relatório semanal) vai uma vez só, em partes ('anexo_parte'), e as mensagens apontam para ele.
   - As linhas ficam fora de qualquer obra (titulo_obra = OBRA): no banco, só o Administrador as enxerga; cada pessoa lê
     as SUAS pelo servidor (api/push.js confere o passe). Mensagem com mais de 60 dias sai sozinha (limpar). */
const crypto = require('crypto');
let webpush = null;
try { webpush = require('web-push'); } catch (e) { webpush = null; }

const URL_SB = process.env.SUPABASE_URL || 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
const SEGREDO = process.env.SUPABASE_JWT_SECRET || '';
const SITE = 'https://gestao.vixsulempreendimentos.com.br';
const OBRA = '(avisos do app)';
const PARTE = 600000, DIAS_GUARDA = 60;
const cab = () => { const h = { apikey: CHAVE }; if (!/^sb_/.test(CHAVE)) h.Authorization = 'Bearer ' + CHAVE; return h; };
const b64u = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const hmac = s => crypto.createHmac('sha256', SEGREDO).update('vixsul-push|' + s).digest('hex');
const iguais = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
const corta = (s, n) => { s = String(s == null ? '' : s).replace(/\s+\n/g, '\n').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const semTags = s => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ── chaves VAPID (P-256) tiradas do segredo do passe — sempre as mesmas, sem guardar nada ──
let _ch = null;
function chaves() {
  if (_ch) return _ch;
  if (!SEGREDO || !webpush) return null;
  const n = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  for (let i = 0; i < 8; i++) {
    const d = crypto.createHmac('sha256', SEGREDO).update('vixsul-push-vapid-v1' + (i ? ':' + i : '')).digest();
    const v = BigInt('0x' + d.toString('hex'));
    if (v === 0n || v >= n) continue;
    const ec = crypto.createECDH('prime256v1'); ec.setPrivateKey(d);
    _ch = { publica: b64u(ec.getPublicKey(null, 'uncompressed')), privada: b64u(d) };
    webpush.setVapidDetails(SITE, _ch.publica, _ch.privada);
    return _ch;
  }
  return null;
}
const pronto = () => !!(CHAVE && chaves());

// ── banco: tabela "arquivos" com a chave de serviço ──
async function ler(filtro, limite) {
  const r = await fetch(`${URL_SB}/rest/v1/arquivos?select=id,row_data&${filtro}&order=id.desc&limit=${limite || 2000}`, { headers: cab() });
  if (!r.ok) throw new Error('banco: erro ' + r.status);
  return (await r.json()).map(x => ({ ...(x.row_data || {}), _id: x.id })).filter(x => !x._lixeira_em);
}
async function gravar(o) {
  const { _id, ...dados } = o;
  const h = { ...cab(), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const r = _id ? await fetch(`${URL_SB}/rest/v1/arquivos?id=eq.${encodeURIComponent(_id)}`, { method: 'PATCH', headers: h, body: JSON.stringify({ row_data: dados }) })
    : await fetch(`${URL_SB}/rest/v1/arquivos`, { method: 'POST', headers: h, body: JSON.stringify({ row_data: dados }) });
  if (!r.ok) throw new Error('Não consegui gravar no banco (' + r.status + ').');
  const j = await r.json().catch(() => null), lin = Array.isArray(j) ? j[0] : j;
  return lin ? { ...(lin.row_data || dados), _id: lin.id } : { ...dados, _id };
}
async function apagar(id) { const r = await fetch(`${URL_SB}/rest/v1/arquivos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: cab() }); return r.ok; }
const tipo = t => `row_data->>tipo=eq.${t}&row_data->>titulo_obra=eq.${encodeURIComponent(OBRA)}`;

// ── inscrições (aparelhos) ──
const assinIns = o => hmac(`ins|${o.uidn}|${o.app_uid}|${o.adm || ''}|${o.endpoint}|${o.p256dh}|${o.auth}`);
async function inscricoes() { return (await ler(tipo('push_inscricao'))).filter(o => iguais(o.assinatura, assinIns(o))); }
const B64U = /^[A-Za-z0-9_-]{16,200}$/;
async function inscrever(p, sub, aparelho) {
  if (!pronto()) return { ok: false, msg: 'As notificações ainda não estão prontas no servidor.' };
  const ep = String((sub && sub.endpoint) || ''), k = (sub && sub.keys) || {};
  if (!/^https:\/\/[^\s]{10,900}$/.test(ep) || !B64U.test(String(k.p256dh || '')) || !B64U.test(String(k.auth || ''))) return { ok: false, msg: 'Inscrição do aparelho inválida.' };
  if (!p || p.uidn == null) return { ok: false, msg: 'Entre no sistema de novo (sessão sem usuário).' };
  const todas = await ler(tipo('push_inscricao')), mesmas = todas.filter(o => o.endpoint === ep);
  const o = { tipo: 'push_inscricao', titulo_obra: OBRA, uidn: String(p.uidn), app_uid: String(p.app_uid || ''), adm: p.adm ? 'sim' : '', nome: corta(p.nome || '', 80), endpoint: ep, p256dh: String(k.p256dh), auth: String(k.auth),
    aparelho: corta(aparelho || '', 80), criado_em: (mesmas[0] && mesmas[0].criado_em) || new Date().toISOString(), atualizado_em: new Date().toISOString() };
  o.assinatura = assinIns(o);
  // o mesmo aparelho fica numa linha só (se outra pessoa entrou nele, ele passa a ser dela)
  const r = await gravar(mesmas[0] ? { ...o, _id: mesmas[0]._id } : o);
  for (const x of mesmas.slice(1)) await apagar(x._id);
  return { ok: true, id: r._id };
}
async function sair(p, endpoint) {
  const ep = String(endpoint || ''); if (!ep) return { ok: true, saiu: 0 };
  const L = (await ler(tipo('push_inscricao'))).filter(o => o.endpoint === ep && (p.adm || String(o.uidn) === String(p.uidn)));
  for (const o of L) await apagar(o._id);
  return { ok: true, saiu: L.length };
}

// ── mensagens ──
const assinMsg = o => hmac(`msg|${o.para}|${o.titulo}|${o.texto}|${o.criado_em}|${(o.anexo && o.anexo.uid) || ''}`);
async function guardarAnexo(a) {
  const buf = Buffer.isBuffer(a.buf) ? a.buf : Buffer.from(a.buf || '');
  if (!buf.length) return null;
  const b64 = buf.toString('base64'), partes = Math.max(1, Math.ceil(b64.length / PARTE)), uid = 'ap' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  for (let i = 0; i < partes; i++) await gravar({ titulo_obra: OBRA, tipo: 'anexo_parte', anexo_uid: uid, ordem: i, conteudo: b64.slice(i * PARTE, (i + 1) * PARTE) });
  return { uid, nome: corta(a.nome || 'arquivo.pdf', 120), mime: a.mime || 'application/pdf', tamanho: buf.length, partes };
}
/* manda para: { ids: [id do usuário…] } · { uids: [app_uid…] } (quem criou um lembrete) · { adms: true } (os Administradores)
   · { todos: true } (todo aparelho ligado)
   msg = { titulo, texto (completo, vai para a caixa do app), curto (o que aparece na notificação), aviso, anexo:{nome,mime,buf} } */
async function mandar(alvo, msg) {
  if (!pronto()) return { ok: false, pessoas: 0, aparelhos: 0, entregues: 0, msg: 'notificações não configuradas' };
  alvo = alvo || {};
  const ins = await inscricoes();
  const ids = new Set((alvo.ids || []).map(String)), uids = new Set((alvo.uids || []).map(String));
  if (uids.size) ins.forEach(o => { if (uids.has(String(o.app_uid))) ids.add(String(o.uidn)); });
  if (alvo.todos) ins.forEach(o => ids.add(String(o.uidn)));
  if (alvo.adms) ins.forEach(o => { if (o.adm === 'sim') ids.add(String(o.uidn)); });   // lembrete "para todos": os Administradores
  if (!ids.size) return { ok: true, pessoas: 0, aparelhos: 0, entregues: 0 };
  const titulo = corta(semTags(msg.titulo || 'Vixsul'), 120), texto = corta(semTags(msg.texto || ''), 12000);
  const curto = corta(semTags(msg.curto || msg.texto || '').replace(/\n{2,}/g, '\n'), 230);
  const anexo = msg.anexo && msg.anexo.buf ? await guardarAnexo(msg.anexo) : null;
  const agora = new Date().toISOString(), saida = { ok: true, pessoas: ids.size, aparelhos: 0, entregues: 0, falhas: [] };
  for (const para of ids) {
    const m = { tipo: 'mensagem_app', titulo_obra: OBRA, para, titulo, texto, aviso: String(msg.aviso || ''), criado_em: agora, lida_em: '', anexo };
    m.assinatura = assinMsg(m);
    const g = await gravar(m);
    for (const s of ins.filter(o => String(o.uidn) === para)) {
      saida.aparelhos++;
      const carga = JSON.stringify({ titulo, texto: curto, id: g._id, aviso: m.aviso, url: SITE + '/?msg=' + g._id, quando: Date.now() });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 2 * 86400, urgency: msg.urgente ? 'high' : 'normal' });
        saida.entregues++;
      } catch (e) {
        const st = e && e.statusCode;
        if (st === 404 || st === 410) await apagar(s._id).catch(() => {});   // aparelho desinstalou ou desligou: sai da lista
        else saida.falhas.push((s.nome || s.uidn) + ': ' + ((e && (e.body || e.message)) || st || 'erro'));
      }
    }
  }
  return saida;
}
const publicaMsg = m => ({ id: m._id, titulo: m.titulo, texto: m.texto, aviso: m.aviso || '', criado_em: m.criado_em, lida: !!m.lida_em, anexo: m.anexo ? { nome: m.anexo.nome, mime: m.anexo.mime, tamanho: m.anexo.tamanho } : null });
async function minhas(p, filtroExtra) {
  if (!p || p.uidn == null) return [];
  return (await ler(`${tipo('mensagem_app')}&row_data->>para=eq.${encodeURIComponent(String(p.uidn))}${filtroExtra || ''}`, 150)).filter(m => iguais(m.assinatura, assinMsg(m)));
}
async function mensagens(p) { const L = await minhas(p); return { ok: true, itens: L.map(publicaMsg), naoLidas: L.filter(m => !m.lida_em).length }; }
async function lidas(p, ids) {
  const quero = new Set((Array.isArray(ids) ? ids : []).map(String)), todas = ids === 'todas';
  const L = (await minhas(p)).filter(m => !m.lida_em && (todas || quero.has(String(m._id))));
  const agora = new Date().toISOString();
  for (const m of L) await gravar({ ...m, lida_em: agora });
  return { ok: true, marcadas: L.length };
}
async function lerPartes(a) {
  const ps = (await ler(`row_data->>anexo_uid=eq.${encodeURIComponent(a.uid)}&row_data->>tipo=eq.anexo_parte`, 200)).sort((x, y) => (+x.ordem || 0) - (+y.ordem || 0));
  const tem = new Map(ps.map(x => [+x.ordem || 0, x.conteudo || '']));
  const out = [];
  for (let i = 0; i < (+a.partes || 1); i++) {
    if (tem.has(i)) { out.push(Buffer.from(tem.get(i), 'base64')); continue; }
    // a manutenção do sistema pode ter levado a parte para o Storage (passo 5 da segurança)
    const r = await fetch(`${URL_SB}/storage/v1/object/anexos/p/${String(a.uid).replace(/[^A-Za-z0-9_-]/g, '_')}/${String(i).padStart(4, '0')}`, { headers: cab() });
    if (!r.ok) throw new Error('O arquivo desta mensagem não foi encontrado.');
    out.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(out);
}
async function anexo(p, id) {
  const m = (await minhas(p, `&id=eq.${encodeURIComponent(id)}`))[0];
  if (!m || !m.anexo) return { ok: false, msg: 'Arquivo não encontrado nesta mensagem.' };
  const buf = await lerPartes(m.anexo);
  return { ok: true, nome: m.anexo.nome, mime: m.anexo.mime, b64: buf.toString('base64') };
}

// ── quem pode receber (Administrador): os usuários ativos e quantos aparelhos cada um ligou ──
async function pessoas() {
  const r = await fetch(`${URL_SB}/rest/v1/usuarios?select=id,nome,email,status,tipo_usuario,perfil&order=nome.asc&limit=500`, { headers: cab() });
  if (!r.ok) throw new Error('usuários: erro ' + r.status);
  const us = (await r.json()).filter(u => !/inativ|bloque|desativ/i.test(String(u.status || '')));
  const ins = pronto() ? await inscricoes() : [], n = {};
  ins.forEach(o => { n[o.uidn] = (n[o.uidn] || 0) + 1; });
  return { ok: true, pronto: pronto(), pessoas: us.map(u => ({ id: String(u.id), nome: u.nome || ('usuário ' + u.id), email: String(u.email || '').trim().toLowerCase(), externo: String(u.tipo_usuario || '').toLowerCase() === 'externo', aparelhos: n[String(u.id)] || 0 })) };
}
async function estado(p) {
  const ins = pronto() ? await inscricoes() : [];
  return { ok: true, pronto: pronto(), publica: pronto() ? chaves().publica : '', meus: ins.filter(o => String(o.uidn) === String(p && p.uidn)).map(o => ({ endpoint: o.endpoint, aparelho: o.aparelho || '', desde: o.criado_em || '' })) };
}
// mensagens com mais de 60 dias saem (e o arquivo delas, quando nenhuma outra aponta para ele) — uma vez por dia, no tick
async function limpar() {
  if (!CHAVE) return 0;
  const lim = new Date(Date.now() - DIAS_GUARDA * 864e5).toISOString();
  const velhas = await ler(`${tipo('mensagem_app')}&row_data->>criado_em=lt.${encodeURIComponent(lim)}`, 500);
  const anexos = new Set(velhas.filter(m => m.anexo && m.anexo.uid).map(m => m.anexo.uid));
  for (const m of velhas) await apagar(m._id);
  for (const uid of anexos) {
    const ainda = await ler(`${tipo('mensagem_app')}&row_data->anexo->>uid=eq.${encodeURIComponent(uid)}`, 1);
    if (!ainda.length) await fetch(`${URL_SB}/rest/v1/arquivos?row_data->>anexo_uid=eq.${encodeURIComponent(uid)}&row_data->>tipo=eq.anexo_parte`, { method: 'DELETE', headers: cab() }).catch(() => {});
  }
  return velhas.length;
}

module.exports = { pronto, chaves, inscrever, sair, mandar, mensagens, lidas, anexo, pessoas, estado, limpar, semTags, OBRA };
