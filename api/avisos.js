/* AVISOS DO DIA POR E-MAIL — sistema de gestão Vixsul.
   Todo dia às 7h (horário da Bahia) o servidor lê o banco com a chave de serviço e manda um e-mail com o que pede
   atenção. O que entra é montado em _resumo.js (o mesmo resumo do Telegram): agenda de hoje e amanhã, tarefas
   atrasadas e dos próximos dias, contas a pagar vencidas/de hoje/dos próximos dias, notas emitidas ainda não recebidas,
   aportes do mês, contratos com a vigência terminando, certidões, pessoal (ASO/NR/CNH), diário de obra de ontem sem
   preencher, notas fiscais recebidas desde ontem, licitações acompanhadas perto do prazo e os lembretes de hoje.
   Quem dispara: a tarefa agendada da Vercel (vercel.json → "crons") e, de reserva, a tarefa "Lembretes do Telegram" do
   GitHub (a cada 15 minutos chama /api/telegram?tick=1, que chama diario() daqui depois das 7h).
   O envio sai pelo próprio Gmail do dono (_email.js: GMAIL_USER e GMAIL_APP_PASSWORD na Vercel). Para quem vai e o que
   entra fica no sistema (Configurações › Avisos por e-mail = Planejamento, tipo 'cfg_avisos'); nenhum e-mail no código.
   - GET (tarefa agendada): no máximo UMA vez por dia (marca o dia antes de mandar, para dois disparos não repetirem).
   - POST {acao:'estado'|'previa'|'testar'|'salvar'} (Administrador logado). */
const { ORIGENS, cors, exigirLogin } = require('./_auth');
const R = require('./_resumo');
const E = require('./_email');
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';

async function enviar(cfg, forcar) {
  const { hj, sec } = await R.montar(cfg), para = E.emailsDe(cfg.emails);
  if (!para.length) return { ok: false, msg: 'Nenhum e-mail configurado em Configurações › Avisos por e-mail.' };
  if (!sec.length && cfg.sempre !== 'sim' && !forcar) return { ok: true, enviado: false, msg: 'Nada pendente hoje — e-mail não enviado.', hj };
  if (!E.emailPronto()) return { ok: false, config: true, msg: 'Falta configurar o envio de e-mail na Vercel (GMAIL_USER e GMAIL_APP_PASSWORD).' };
  const titulo = `Avisos do dia — ${R.brAno(hj)}`;
  try {
    await E.mandarEmail({ para, assunto: `Avisos do dia — Vixsul Empreendimentos (${R.br(hj)})`, html: E.htmlPartes(titulo, sec, 'Para mudar o que entra ou para quem vai: Configurações › Avisos por e-mail.'), texto: E.textoPartes(titulo, sec) });
    return { ok: true, enviado: true, entregues: para.length, para: para.length, secoes: sec.length, hj };
  } catch (e) { return { ok: false, enviado: false, msg: e.message, hj }; }
}
const textoDoEnvio = r => r.enviado ? `Enviado para ${r.entregues} e-mail(s)` : (r.msg || '');

async function cfgAvisos() { const L = (await R.lerTipos(['cfg_avisos'])).sort((a, b) => (b._id || 0) - (a._id || 0)); return L[0] || null; }

// o envio do dia (tarefa agendada da Vercel ou a reserva do GitHub): uma vez por dia
async function diario() {
  const cfg = await cfgAvisos();
  if (!cfg || cfg.ativo === 'nao') return { ok: true, enviado: false, msg: 'Avisos por e-mail desligados.' };
  if (!E.emailPronto()) return { ok: true, enviado: false, msg: 'Envio de e-mail ainda não configurado.' };
  const hj = R.hojeBahia();
  if (cfg.ultimo_envio === hj) return { ok: true, enviado: false, msg: 'Já enviado hoje.' };
  await R.gravarPlan({ ...cfg, ultimo_envio: hj, ultima_msg: 'mandando…' });   // marca antes: outro disparo não repete
  let r;
  try { r = await enviar(cfg, false); } catch (e) { r = { ok: false, msg: (e && e.message) || String(e) }; }
  await R.gravarPlan({ ...cfg, ultimo_envio: hj, ultima_msg: textoDoEnvio(r) });
  return r;
}

const handler = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (!CHAVE) return responder(500, { ok: false, msg: 'Falta a chave de serviço do banco na Vercel.' });
  try {
    if (req.method === 'GET') return responder(200, await diario());
    if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use GET ou POST.' });
    const l = exigirLogin(req);
    if (!l.ok) return responder(401, { ok: false, sair: true, msg: 'A sessão terminou. Entre no sistema de novo.' });
    if (!ORIGENS.some(r => r.test(req.headers.origin || ''))) return responder(403, { ok: false, msg: 'Origem não permitida.' });
    if (l.p && !l.p.adm) return responder(403, { ok: false, msg: 'Só o Administrador mexe nos avisos por e-mail.' });
    const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
    const atual = await cfgAvisos(), c = { ...(atual || {}), ...(b.cfg || {}) };
    if (b.acao === 'estado') return responder(200, { ok: true, pronto: E.emailPronto(), remetente: E.remetente() });
    if (b.acao === 'salvar') {
      // grava só o que a tela mexe, em cima da linha mais nova (não volta o "último envio" de uma cópia antiga)
      const x = b.cfg || {}, mud = { tipo: 'cfg_avisos' };
      if (x.emails != null) mud.emails = E.emailsDe(x.emails).join(', ');
      if (x.itens && typeof x.itens === 'object') mud.itens = Object.fromEntries(Object.entries(x.itens).filter(([k]) => /^[a-z_]{2,20}$/.test(k)).map(([k, v]) => [k, v !== false]));
      if (x.ativo != null) mud.ativo = x.ativo === 'nao' ? 'nao' : 'sim';
      if (x.sempre != null) mud.sempre = x.sempre === 'sim' ? 'sim' : 'nao';
      const novo = await R.gravarPlan({ ...(atual || {}), ...mud });
      return responder(200, { ok: true, rowid: novo._id, cfg: novo });
    }
    if (b.acao === 'previa') { const { hj, sec } = await R.montar(c); return responder(200, { ok: true, hj, secoes: sec.map(([t, txt]) => ({ titulo: t, texto: txt })), para: E.emailsDe(c.emails), pronto: E.emailPronto() }); }
    if (b.acao === 'testar') { const r = await enviar(c, true); return responder(200, { ...r, ok: r.ok || !!r.config, resumo: textoDoEnvio(r) }); }
    return responder(400, { ok: false, msg: 'Ação desconhecida.' });
  } catch (e) {
    return responder(500, { ok: false, msg: (e && e.message) || String(e) });
  }
};
handler.diario = diario;
module.exports = handler;
