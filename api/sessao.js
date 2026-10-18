/* Sessão do sistema — tudo o que envolve SENHA roda aqui, no servidor, e nunca no navegador.
   - entrar: confere CPF (ou e-mail do usuário externo) e senha na tabela usuarios (com a chave de serviço, que o
     navegador não tem), bloqueia depois de 5 erros em 15 minutos e devolve o "passe" (JWT de 12 h) que o banco exige.
   - renovar: troca um passe ainda válido por um novo (quem está usando não cai no meio do trabalho).
   - usuarios_listar / usuarios_salvar / usuarios_excluir: só para o Administrador; a senha nunca sai daqui.
   - email_cpf / externo_existe / codigo_enviar / codigo_conferir / senha_redefinir / senha_alterar: recuperação e
     troca de senha. O código de 6 dígitos é gerado e conferido AQUI (antes era no navegador, e dava para burlar).
   Precisa, na Vercel (Settings → Environment Variables): SUPABASE_SERVICE_KEY e SUPABASE_JWT_SECRET.
   Sem elas responde { semConfig: true } e o sistema segue no modo antigo até a configuração. */
const crypto = require('crypto');
const { cors, assinar, verificar, tokenDe } = require('./_auth');

const URL_SB = process.env.SUPABASE_URL || 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
const SEGREDO = process.env.SUPABASE_JWT_SECRET || '';
const SUPER_ADMIN_CPF = '05582376577';
const HORAS = 12, MAX_ERROS = 5, JANELA_MIN = 15, SENHA_MIN = 8, ITER = 100000;
const SITE = 'https://gestao.vixsulempreendimentos.com.br';

// ── banco (PostgREST com a chave de serviço) ──
async function sb(caminho, opt = {}) {
  const h = { apikey: CHAVE, 'Content-Type': 'application/json', Prefer: opt.prefer || 'return=representation' };
  if (!/^sb_/.test(CHAVE)) h.Authorization = 'Bearer ' + CHAVE;
  const r = await fetch(URL_SB + '/rest/v1/' + caminho, { method: opt.method || 'GET', headers: h, body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
  if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('Erro do banco ' + r.status));
  return j;
}
const enc = encodeURIComponent;

// ── senhas: PBKDF2-SHA256, o mesmo formato que o sistema já usa ("pbkdf2$iter$sal$hash") ──
function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.pbkdf2Sync(senha, sal, ITER, 32, 'sha256');
  return 'pbkdf2$' + ITER + '$' + sal.toString('base64') + '$' + h.toString('base64');
}
function confereSenha(senha, guardada) {
  const s = String(guardada || '');
  if (!s.startsWith('pbkdf2$')) {   // senha antiga em texto puro: compara e migra para hash no primeiro login
    const a = Buffer.from(String(senha)), b = Buffer.from(s.trim());
    return { ok: a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b), legado: true };
  }
  const p = s.split('$'); if (p.length !== 4) return { ok: false };
  const calc = crypto.pbkdf2Sync(senha, Buffer.from(p[2], 'base64'), +p[1] || ITER, 32, 'sha256');
  const g = Buffer.from(p[3], 'base64');
  return { ok: g.length === calc.length && crypto.timingSafeEqual(g, calc), legado: false };
}
const senhaFraca = s => {
  s = String(s || '');
  if (s.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (!/[A-Za-zÀ-ú]/.test(s) || !/\d/.test(s)) return 'A senha precisa ter letras e números.';
  if (/^(.)\1+$/.test(s) || /^(12345678|87654321|senha123|vixsul)/i.test(s)) return 'Essa senha é fácil demais de adivinhar. Escolha outra.';
  return '';
};

// ── usuários ──
const soDig = v => String(v || '').replace(/\D/g, '');
const lista = v => { if (v == null || v === '') return null; if (Array.isArray(v)) return v; try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch (e) { return null; } };
const ehAdmPerfil = p => String(p || '').trim().toLowerCase().startsWith('admin');
const todosUsuarios = () => sb('usuarios?select=*&order=id.asc');
async function achar(modo, id) {
  const us = await todosUsuarios();
  if (modo === 'externo') return us.find(u => String(u.email || '').trim().toLowerCase() === id && String(u.tipo_usuario || 'interno').toLowerCase() === 'externo') || null;
  return us.find(u => soDig(u.cpf) === id && (id === SUPER_ADMIN_CPF || String(u.tipo_usuario || 'interno').toLowerCase() !== 'externo')) || null;
}
const publico = u => ({ id: u.id, nome: u.nome, cpf: u.cpf, perfil: u.perfil, status: u.status, email: u.email || '', acessos: lista(u.acessos),
  tipoUsuario: String(u.tipo_usuario || 'interno').toLowerCase() === 'externo' ? 'externo' : 'interno', obrasPermitidas: lista(u.obras_permitidas) || [], mfa: !!u.mfa_segredo });

// ── verificação em duas etapas (TOTP: Google Authenticator, Microsoft Authenticator…) ──
// O segredo fica na tabela usuarios (que só o servidor lê). Códigos de 30 s, aceita o anterior e o próximo
// (relógio do celular um pouco adiantado/atrasado) e nunca o mesmo código duas vezes. 8 códigos reserva de uso único
// para quando o celular não estiver à mão (guardados só como hash).
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let o = ''; for (let i = 0; i < bits.length; i += 5) o += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; }
function b32dec(s) { s = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = ''; for (const ch of s) bits += B32.indexOf(ch).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(seg, passo) { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(passo)); const h = crypto.createHmac('sha1', b32dec(seg)).update(c).digest(), o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0'); }
const passoAgora = () => Math.floor(Date.now() / 30000);
// devolve o passo de tempo do código (ou 0 se não confere)
function confereTotp(seg, cod, ultimo) { if (!seg || !/^\d{6}$/.test(cod)) return 0; const p0 = passoAgora();
  for (const p of [p0, p0 - 1, p0 + 1]) { if (p <= (+ultimo || 0)) continue; const a = Buffer.from(totp(seg, p)), b = Buffer.from(cod); if (crypto.timingSafeEqual(a, b)) return p; } return 0; }
const hashReserva = c => crypto.createHash('sha256').update('vx-reserva:' + String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
// confere o código do login (do aplicativo ou reserva) e grava o uso
async function confereSegundoFator(u, cod) {
  cod = String(cod || '').replace(/\s/g, '');
  const p = confereTotp(u.mfa_segredo, cod, u.mfa_ultimo);
  if (p) { await sb('usuarios?id=eq.' + u.id, { method: 'PATCH', prefer: 'return=minimal', body: { mfa_ultimo: p } }); return 'app'; }
  const res = lista(u.mfa_reserva) || [], h = hashReserva(cod), i = res.indexOf(h);
  if (cod.length >= 8 && i >= 0) { res.splice(i, 1); await sb('usuarios?id=eq.' + u.id, { method: 'PATCH', prefer: 'return=minimal', body: { mfa_reserva: JSON.stringify(res) } }); return 'reserva'; }
  return '';
}
const faltaPasso3 = e => /mfa_|column|coluna/i.test(String(e && e.message || '')) ? 'Falta rodar o passo 3 da segurança no Supabase (seguranca/passo-3-duas-etapas.sql).' : 'Não foi possível concluir agora.';

// nomes das obras que um usuário restrito pode ver (o banco filtra por eles)
async function nomesObras(ids) {
  if (!ids || !ids.length) return [];
  const os = await sb('obras?select=id,row_data&id=in.(' + ids.map(x => +x).filter(Boolean).join(',') + ')');
  return [...new Set((os || []).flatMap(o => [o.row_data && o.row_data.titulo_obra, o.row_data && o.row_data.nome_obra, o.row_data && o.row_data.titulo]).filter(Boolean))];
}

// ── passe (JWT) ──
const uuidDe = s => { const h = crypto.createHash('sha1').update('vixsul:' + s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
async function emitir(u, modo) {
  const sup = modo === 'interno' && soDig(u.cpf) === SUPER_ADMIN_CPF;
  const adm = sup || ehAdmPerfil(u.perfil);
  const externo = !sup && modo === 'externo';
  const uid = externo ? String(u.email || '').trim().toLowerCase() : soDig(u.cpf);
  const cpfFmt = uid.length === 11 ? `${uid.slice(0, 3)}.${uid.slice(3, 6)}.${uid.slice(6, 9)}-${uid.slice(9)}` : '';
  const obrasIds = adm ? [] : (lista(u.obras_permitidas) || []);
  const agora = Math.floor(Date.now() / 1000), exp = agora + HORAS * 3600;
  const perfil = sup ? 'admin' : externo ? 'Usuário Externo' : (u.perfil || 'Usuário');
  const p = { iss: URL_SB + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub: uuidDe(uid), iat: agora, exp, vx: 1,
    app_uid: uid, ids: [...new Set([uid, cpfFmt, String(u.email || '').trim().toLowerCase(), String(u.nome || '').trim()].filter(Boolean))],
    nome: u.nome || uid, adm, tipo: externo ? 'externo' : 'interno', uidn: u.id, obras: await nomesObras(obrasIds) };
  const sessao = { nome: u.nome || uid, perfil, acessos: sup ? null : externo ? ['obras', 'relatorios'] : lista(u.acessos), tipoUsuario: externo ? 'externo' : 'interno',
    obrasPermitidas: obrasIds, uid, email: String(u.email || '').trim().toLowerCase(), cpf: externo ? '' : cpfFmt };
  return { token: assinar(p, SEGREDO), exp: exp * 1000, sessao };
}
function passe(req) { const p = verificar(tokenDe(req), SEGREDO); return p && p.vx === 1 ? p : null; }

// ── registro de eventos (tentativas, códigos) — tabela seguranca_eventos, só o servidor acessa ──
const ipDe = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
async function registrar(tipo, chave, ok, ip, detalhe) {
  try { await sb('seguranca_eventos', { method: 'POST', prefer: 'return=minimal', body: { tipo, chave, ok: !!ok, ip: ip || '', detalhe: detalhe || '' } }); } catch (e) { /* tabela ainda não criada: segue */ }
}
async function eventos(tipo, chave, minutos) {
  try { const desde = new Date(Date.now() - minutos * 60000).toISOString();
    return await sb(`seguranca_eventos?select=id,ok,detalhe,quando&tipo=eq.${enc(tipo)}&chave=eq.${enc(chave)}&quando=gte.${enc(desde)}&order=quando.desc&limit=50`) || [];
  } catch (e) { return []; }
}
async function bloqueado(tipo, chave) { const ev = await eventos(tipo, chave, JANELA_MIN); return ev.filter(e => !e.ok).length >= MAX_ERROS; }

// ── e-mail do código (FormSubmit, pelo servidor: o navegador não vê o código) ──
async function enviarEmail(email, nome, codigo) {
  const r = await fetch('https://formsubmit.co/ajax/' + enc(email), { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: SITE + '/' },
    body: JSON.stringify({ _subject: 'Código de recuperação de senha — Vixsul Empreendimentos', _template: 'box', _captcha: 'false', Nome: nome || 'Usuário', Codigo: codigo,
      Mensagem: 'Use o código ' + codigo + ' para redefinir sua senha no sistema Vixsul. O código vale por 10 minutos. Se não foi você que pediu, ignore este e-mail.' }) });
  let b = null; try { b = await r.json(); } catch (e) { b = null; }
  if (!r.ok || (b && String(b.success).toLowerCase() === 'false')) throw new Error((b && b.message) || 'Não foi possível enviar o e-mail agora.');
}
const hmac = s => crypto.createHmac('sha256', SEGREDO).update(String(s)).digest('hex');
const mascara = e => { const [a, d] = String(e || '').split('@'); if (!d) return ''; return a.slice(0, 2) + '•'.repeat(Math.max(2, a.length - 2)) + '@' + d; };
const idDe = b => b.modo === 'externo' ? String(b.id || b.email || '').trim().toLowerCase() : soDig(b.id || b.cpf);

// ── ações ──
const A = {};
A.status = async () => ({ ok: true, configurado: true });
// conferência da configuração: devolve só certo/errado (nenhum dado) — a chave de serviço lê o banco? a tabela do
// passo 1 existe? o banco aceita um passe assinado com o JWT Secret? o banco já está trancado (passo 2)?
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmbmxkY3F3cHdva3FmamlreGV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzA2MjMsImV4cCI6MjA5ODQ0NjYyM30.HWMRAuhjEdBqS-3q-oIsRIhNaT5D6dcguT2YzSWnPvM';
A.diagnostico = async () => {
  const r = { ok: true, configurado: true };
  try { await sb('usuarios?select=id&limit=1'); r.chave = true; } catch (e) { r.chave = false; }
  try { await sb('seguranca_eventos?select=id&limit=1'); r.passo1 = true; } catch (e) { r.passo1 = false; }
  try {
    const agora = Math.floor(Date.now() / 1000);
    const tk = assinar({ iss: URL_SB + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub: uuidDe('diagnostico'), iat: agora, exp: agora + 60, vx: 1,
      app_uid: '', ids: [], nome: 'diagnostico', adm: false, tipo: 'interno', obras: [] }, SEGREDO);
    const resp = await fetch(URL_SB + '/rest/v1/obras?select=id&limit=1', { headers: { apikey: ANON, Authorization: 'Bearer ' + tk } });
    r.passe = resp.ok; if (!resp.ok) r.passeStatus = resp.status;
  } catch (e) { r.passe = false; }
  try { const resp = await fetch(URL_SB + '/rest/v1/obras?select=id&limit=1', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } }); const j = await resp.json().catch(() => null);
    r.trancado = !(resp.ok && Array.isArray(j) && j.length > 0); } catch (e) { r.trancado = null; }
  return r;
};

A.entrar = async (b, req) => {
  const modo = b.modo === 'externo' ? 'externo' : 'interno', id = idDe({ ...b, modo }), senha = String(b.senha || '').trim();
  if (!id || !senha) return { ok: false, msg: modo === 'externo' ? 'E-mail e senha são obrigatórios.' : 'CPF e senha são obrigatórios.' };
  const chave = modo + ':' + id, ip = ipDe(req);
  if (await bloqueado('login', chave)) return { ok: false, msg: `Muitas tentativas erradas. Por segurança, o acesso deste usuário fica bloqueado por ${JANELA_MIN} minutos.` };
  const u = await achar(modo, id);
  const sup = modo === 'interno' && id === SUPER_ADMIN_CPF;
  const v = u ? confereSenha(senha, u.senha) : { ok: false };
  if (!u || !v.ok) { await registrar('login', chave, false, ip); return { ok: false, msg: modo === 'externo' ? 'E-mail ou senha incorretos.' : 'CPF ou senha incorretos.' }; }
  if (!sup && String(u.status || 'ativo').toLowerCase() !== 'ativo') return { ok: false, msg: 'Usuário inativo. Entre em contato com o administrador.' };
  // verificação em duas etapas: com a senha certa, pede o código do aplicativo (sem ele, não há passe)
  if (u.mfa_segredo) {
    const cod = String(b.codigo2 || '').trim();
    if (!cod) return { ok: false, precisaCodigo: true, msg: 'Digite o código de 6 dígitos do aplicativo autenticador.' };
    const tipo2 = await confereSegundoFator(u, cod);
    if (!tipo2) { await registrar('login', chave, false, ip, 'código 2 etapas'); return { ok: false, precisaCodigo: true, msg: 'Código do aplicativo incorreto (ou já usado). Confira e digite o código atual.' }; }
    if (tipo2 === 'reserva') await registrar('reserva_usada', chave, true, ip);
  }
  if (v.legado) { try { await sb('usuarios?id=eq.' + u.id, { method: 'PATCH', prefer: 'return=minimal', body: { senha: hashSenha(senha) } }); } catch (e) { } }
  await registrar('login', chave, true, ip);
  return { ok: true, senhaFraca: !!senhaFraca(senha), ...(await emitir(u, modo)) };
};

A.renovar = async (b, req) => {
  const p = passe(req); if (!p) return { ok: false, sair: true, msg: 'A sessão terminou. Entre de novo.' };
  const us = await todosUsuarios(), u = us.find(x => +x.id === +p.uidn);
  if (!u || (String(u.status || 'ativo').toLowerCase() !== 'ativo' && soDig(u.cpf) !== SUPER_ADMIN_CPF)) return { ok: false, sair: true, msg: 'Usuário inativo.' };
  return { ok: true, ...(await emitir(u, p.tipo === 'externo' ? 'externo' : 'interno')) };
};

// ── usuários (só Administrador) ──
const soAdm = req => { const p = passe(req); return p && p.adm ? p : null; };
A.usuarios_listar = async (b, req) => {
  if (!soAdm(req)) return { ok: false, msg: 'Só o Administrador gerencia usuários.' };
  return { ok: true, usuarios: (await todosUsuarios()).map(publico) };
};
A.usuarios_salvar = async (b, req) => {
  if (!soAdm(req)) return { ok: false, msg: 'Só o Administrador gerencia usuários.' };
  const d = b.dados || {}, id = b.id ? Number(b.id) : null;
  let tipo = d.tipoUsuario === 'externo' ? 'externo' : 'interno', cpf = soDig(d.cpf), perfil = d.perfil || 'Usuário';
  const email = String(d.email || '').trim(), emailN = email.toLowerCase(), obras = Array.isArray(d.obrasPermitidas) ? d.obrasPermitidas : [];
  if (!String(d.nome || '').trim()) return { ok: false, msg: 'Nome é obrigatório.' };
  if (tipo === 'interno' && !cpf) return { ok: false, msg: 'CPF é obrigatório para Usuário Interno.' };
  if (!email) return { ok: false, msg: 'E-mail é obrigatório.' };
  if (tipo === 'externo' && !obras.length) return { ok: false, msg: 'Selecione ao menos uma obra que o Usuário Externo pode acessar.' };
  if (cpf === SUPER_ADMIN_CPF) { tipo = 'interno'; perfil = 'admin'; }
  const us = await todosUsuarios();
  if (tipo === 'interno' && us.some(r => +r.id !== id && soDig(r.cpf) === cpf)) return { ok: false, msg: 'Já existe um usuário cadastrado com este CPF.' };
  if (us.some(r => +r.id !== id && String(r.email || '').trim().toLowerCase() === emailN)) return { ok: false, msg: 'Já existe um usuário cadastrado com este e-mail.' };
  const reg = { nome: String(d.nome).trim(), cpf: tipo === 'interno' ? cpf : null, perfil, status: d.status || 'ativo', email,
    acessos: tipo === 'externo' ? JSON.stringify(['obras', 'relatorios']) : (Array.isArray(d.acessos) ? JSON.stringify(d.acessos) : null), tipo_usuario: tipo,
    obras_permitidas: (tipo === 'externo' || (obras.length && !ehAdmPerfil(perfil))) ? JSON.stringify(obras) : null };
  if (d.senha) { const f = senhaFraca(String(d.senha).trim()); if (f) return { ok: false, msg: f }; reg.senha = hashSenha(String(d.senha).trim()); }
  if (id) await sb('usuarios?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: reg });
  else { if (!d.senha) return { ok: false, msg: 'Senha é obrigatória para um novo usuário.' }; await sb('usuarios', { method: 'POST', prefer: 'return=minimal', body: reg }); }
  return { ok: true, usuarios: (await todosUsuarios()).map(publico) };
};
A.usuarios_excluir = async (b, req) => {
  const p = soAdm(req); if (!p) return { ok: false, msg: 'Só o Administrador gerencia usuários.' };
  const id = Number(b.id); if (!id) return { ok: false, msg: 'Usuário inválido.' };
  const u = (await todosUsuarios()).find(x => +x.id === id);
  if (u && soDig(u.cpf) === SUPER_ADMIN_CPF) return { ok: false, msg: 'O administrador principal não pode ser excluído.' };
  if (+p.uidn === id) return { ok: false, msg: 'Você não pode excluir o seu próprio usuário.' };
  await sb('usuarios?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
  return { ok: true, usuarios: (await todosUsuarios()).map(publico) };
};

// ── verificação em duas etapas: ativar, confirmar, desligar ──
async function eu(req) { const p = passe(req); if (!p) return null; const u = (await todosUsuarios()).find(x => +x.id === +p.uidn); return u ? { p, u } : null; }
A.mfa_estado = async (b, req) => { const e = await eu(req); if (!e) return { ok: false, sair: true, msg: 'Entre de novo.' };
  return { ok: true, ativo: !!e.u.mfa_segredo, reservas: (lista(e.u.mfa_reserva) || []).length, colunas: 'mfa_segredo' in e.u }; };
A.mfa_iniciar = async (b, req) => {
  const e = await eu(req); if (!e) return { ok: false, sair: true, msg: 'Entre de novo.' };
  if (e.u.mfa_segredo) return { ok: false, msg: 'A verificação em duas etapas já está ligada.' };
  const seg = b32enc(crypto.randomBytes(20)), conta = String(e.u.nome || e.p.app_uid).replace(/[:]/g, ' ');
  try { await sb('usuarios?id=eq.' + e.u.id, { method: 'PATCH', prefer: 'return=minimal', body: { mfa_pendente: seg } }); } catch (x) { return { ok: false, msg: faltaPasso3(x) }; }
  return { ok: true, segredo: seg.replace(/(.{4})/g, '$1 ').trim(), url: `otpauth://totp/${encodeURIComponent('Vixsul:' + conta)}?secret=${seg}&issuer=Vixsul&digits=6&period=30` };
};
A.mfa_confirmar = async (b, req) => {
  const e = await eu(req); if (!e) return { ok: false, sair: true, msg: 'Entre de novo.' };
  const p = confereTotp(e.u.mfa_pendente, String(b.codigo || '').replace(/\D/g, ''), 0);
  if (!p) return { ok: false, msg: 'Código incorreto. Confira se o celular está com a hora certa e digite o código atual.' };
  const reservas = Array.from({ length: 8 }, () => { const r = crypto.randomBytes(5).toString('hex').toUpperCase(); return r.slice(0, 5) + '-' + r.slice(5); });
  try { await sb('usuarios?id=eq.' + e.u.id, { method: 'PATCH', prefer: 'return=minimal', body: { mfa_segredo: e.u.mfa_pendente, mfa_pendente: null, mfa_ultimo: p, mfa_reserva: JSON.stringify(reservas.map(hashReserva)) } }); }
  catch (x) { return { ok: false, msg: faltaPasso3(x) }; }
  await registrar('mfa_ligado', 'u:' + e.u.id, true, ipDe(req));
  return { ok: true, reservas };
};
A.mfa_desligar = async (b, req) => {
  const e = await eu(req); if (!e) return { ok: false, sair: true, msg: 'Entre de novo.' };
  if (!e.u.mfa_segredo) return { ok: true };
  if (!(await confereSegundoFator(e.u, b.codigo))) return { ok: false, msg: 'Para desligar, digite o código atual do aplicativo (ou um código reserva).' };
  await sb('usuarios?id=eq.' + e.u.id, { method: 'PATCH', prefer: 'return=minimal', body: { mfa_segredo: null, mfa_pendente: null, mfa_reserva: null, mfa_ultimo: null } });
  await registrar('mfa_desligado', 'u:' + e.u.id, true, ipDe(req));
  return { ok: true };
};
// o Administrador desliga a verificação de OUTRO usuário (ex.: perdeu o celular e os códigos reserva)
A.usuarios_mfa_desligar = async (b, req) => {
  const p = soAdm(req); if (!p) return { ok: false, msg: 'Só o Administrador faz isso.' };
  const id = Number(b.id); if (!id || id === +p.uidn) return { ok: false, msg: 'Para a sua própria conta, use "Desligar" com o código do aplicativo.' };
  try { await sb('usuarios?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: { mfa_segredo: null, mfa_pendente: null, mfa_reserva: null, mfa_ultimo: null } }); } catch (x) { return { ok: false, msg: faltaPasso3(x) }; }
  await registrar('mfa_desligado', 'u:' + id, true, ipDe(req), 'pelo Administrador ' + p.app_uid);
  return { ok: true, usuarios: (await todosUsuarios()).map(publico) };
};

// ── senha: recuperação com código e troca ──
A.email_cpf = async b => {
  const u = await achar('interno', soDig(b.cpf));
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  if (!String(u.email || '').trim()) return { ok: true, existe: true, temEmail: false, nome: '' };
  return { ok: true, existe: true, temEmail: true, email: mascara(u.email), nome: String(u.nome || '').split(' ')[0] };
};
A.externo_existe = async b => {
  const u = await achar('externo', String(b.email || '').trim().toLowerCase());
  return u ? { ok: true, existe: true, nome: String(u.nome || '').split(' ')[0] } : { ok: true, existe: false, msg: 'E-mail não possui cadastro de Usuário Externo.' };
};
A.codigo_enviar = async (b, req) => {
  const modo = b.modo === 'externo' ? 'externo' : 'interno', id = idDe(b), chave = modo + ':' + id, ip = ipDe(req);
  const u = id ? await achar(modo, id) : null;
  if (!u || !String(u.email || '').trim()) return { ok: false, msg: 'Não há e-mail cadastrado para este usuário.' };
  if ((await eventos('codigo', chave, JANELA_MIN)).length >= 3) return { ok: false, msg: `Já foram enviados 3 códigos. Espere ${JANELA_MIN} minutos para pedir outro.` };
  const codigo = String(crypto.randomInt(100000, 1000000));
  await enviarEmail(String(u.email).trim(), String(u.nome || '').split(' ')[0], codigo);
  await registrar('codigo', chave, true, ip, hmac(chave + ':' + codigo));
  return { ok: true, email: mascara(u.email), validade: 600 };
};
A.codigo_conferir = async (b, req) => {
  const modo = b.modo === 'externo' ? 'externo' : 'interno', id = idDe(b), chave = modo + ':' + id, cod = soDig(b.codigo), ip = ipDe(req);
  if (await bloqueado('codigo_erro', chave)) return { ok: false, msg: `Muitos códigos errados. Espere ${JANELA_MIN} minutos e peça um novo código.` };
  const ult = (await eventos('codigo', chave, 10))[0];
  if (!ult) return { ok: false, msg: 'O código expirou. Clique em "Enviar novo código".' };
  if ((await eventos('codigo_usado', chave, 10)).some(e => e.quando >= ult.quando)) return { ok: false, msg: 'Este código já foi usado. Peça um novo.' };
  const a = Buffer.from(hmac(chave + ':' + cod)), g = Buffer.from(String(ult.detalhe || ''));
  if (cod.length !== 6 || a.length !== g.length || !crypto.timingSafeEqual(a, g)) { await registrar('codigo_erro', chave, false, ip); return { ok: false, msg: 'Código incorreto. Confira os 6 dígitos enviados ao seu e-mail.' }; }
  await registrar('codigo_usado', chave, true, ip);
  const agora = Math.floor(Date.now() / 1000);
  return { ok: true, ticket: assinar({ vxr: 1, modo, id, iat: agora, exp: agora + 600 }, SEGREDO) };
};
A.senha_redefinir = async (b, req) => {
  const t = verificar(b.ticket, SEGREDO);
  if (!t || t.vxr !== 1) return { ok: false, msg: 'A autorização para trocar a senha venceu. Peça um novo código.' };
  const f = senhaFraca(String(b.nova || '').trim()); if (f) return { ok: false, msg: f };
  const u = await achar(t.modo, t.id); if (!u) return { ok: false, msg: 'Usuário não encontrado.' };
  await sb('usuarios?id=eq.' + u.id, { method: 'PATCH', prefer: 'return=minimal', body: { senha: hashSenha(String(b.nova).trim()) } });
  await registrar('senha_trocada', t.modo + ':' + t.id, true, ipDe(req), 'código');
  return { ok: true, msg: 'Senha redefinida com sucesso.' };
};
A.senha_alterar = async (b, req) => {
  const modo = b.modo === 'externo' ? 'externo' : 'interno', id = idDe(b), chave = modo + ':' + id, ip = ipDe(req);
  if (await bloqueado('login', chave)) return { ok: false, msg: `Muitas tentativas erradas. Espere ${JANELA_MIN} minutos.` };
  const u = id ? await achar(modo, id) : null;
  if (!u || !confereSenha(String(b.atual || '').trim(), u.senha).ok) { await registrar('login', chave, false, ip, 'troca de senha'); return { ok: false, msg: 'A senha anterior informada está incorreta.' }; }
  const f = senhaFraca(String(b.nova || '').trim()); if (f) return { ok: false, msg: f };
  await sb('usuarios?id=eq.' + u.id, { method: 'PATCH', prefer: 'return=minimal', body: { senha: hashSenha(String(b.nova).trim()) } });
  await registrar('senha_trocada', chave, true, ip, 'troca');
  return { ok: true, msg: 'Senha alterada com sucesso.' };
};

module.exports = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use POST.' });
  if (!CHAVE || !SEGREDO) return responder(200, { ok: false, semConfig: true, msg: 'Segurança ainda não configurada na Vercel.' });
  const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
  const f = A[b.acao]; if (!f) return responder(400, { ok: false, msg: 'Ação desconhecida.' });
  try { return responder(200, await f(b, req)); }
  catch (e) { console.error(b.acao, e); return responder(200, { ok: false, msg: 'Não foi possível concluir agora. Tente de novo em instantes.' }); }
};
