/* AVISOS DO DIA POR E-MAIL — sistema de gestão Vixsul.
   Todo dia às 7h (horário da Bahia; tarefa agendada da Vercel em vercel.json → "crons") lê o banco com a chave de
   serviço e manda um e-mail com o que pede atenção: contas a pagar vencidas, de hoje e dos próximos dias; certidões e
   documentos vencendo; ASO/treinamentos/CNH do pessoal; diário de obra de ontem sem preencher; notas de compra
   recebidas ainda não lançadas; licitações acompanhadas perto do prazo. O envio é pelo FormSubmit (o mesmo do código
   de recuperação de senha), sem chave. Para quem vai e o que entra fica no próprio sistema: Configurações › Avisos por
   e-mail (Planejamento, tipo 'cfg_avisos'); nenhum e-mail fica no código.
   - GET (a tarefa agendada): manda no máximo UMA vez por dia (guarda o dia do último envio) — pedir de novo não repete.
   - POST {acao:'previa'} (Administrador logado): devolve o texto de hoje, sem mandar.
   - POST {acao:'testar'} (Administrador logado): manda agora para os e-mails configurados. */
const { ORIGENS, cors, exigirLogin } = require('./_auth');
const URL_SB = process.env.SUPABASE_URL || 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
const SITE = 'https://gestao.vixsulempreendimentos.com.br';
const cabecalhos = () => { const h = { apikey: CHAVE }; if (!/^sb_/.test(CHAVE)) h.Authorization = 'Bearer ' + CHAVE; return h; };

async function ler(tabela) {
  const L = [];
  for (let i = 0; ; i += 1000) {
    const r = await fetch(`${URL_SB}/rest/v1/${tabela}?select=id,row_data&order=id.asc`, { headers: { ...cabecalhos(), Range: `${i}-${i + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) { const t = await r.text(); if (/does not exist|Could not find|PGRST20[05]/i.test(t)) return []; throw new Error(`${tabela}: erro ${r.status}`); }
    const d = await r.json(); L.push(...d); if (d.length < 1000) break;
  }
  return L.map(x => ({ ...(x.row_data || {}), _id: x.id })).filter(x => !x._lixeira_em);
}
async function gravarCfg(cfg) {
  const { _id, ...dados } = cfg;
  const r = await fetch(`${URL_SB}/rest/v1/planejamento?id=eq.${encodeURIComponent(_id)}`, { method: 'PATCH', headers: { ...cabecalhos(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ row_data: dados }) });
  if (!r.ok) throw new Error('Não consegui guardar o dia do envio (' + r.status + ').');
}

// datas: aceita 2026-11-14, 2026-11-14T..., 14/11/2026
const iso = v => { const s = String(v || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const br = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const somaDias = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const num = v => { if (typeof v === 'number') return v; let s = String(v || '').replace(/[R$\s]/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; };
const reais = v => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hojeBahia = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);   // Bahia: UTC−3 o ano todo
const lista = (L, max) => L.slice(0, max).map(x => '• ' + x).join('\n') + (L.length > max ? `\n• … e mais ${L.length - max}` : '');

async function montar(cfg) {
  const hj = hojeBahia(), ate3 = somaDias(hj, 3), ontem = somaDias(hj, -1), quer = k => !cfg.itens || cfg.itens[k] !== false;
  const [custos, despesas, documentos, plan, diarios, obras] = await Promise.all(['custos', 'despesas', 'documentos', 'planejamento', 'diario_obra', 'obras'].map(ler));
  const sec = [];
  if (quer('contas')) {
    const abertas = custos.filter(c => String(c.tipo_de_custo || '').toLowerCase() === 'real' && !(iso(c.data_pgto) && iso(c.data_pgto) <= hj))
      .map(c => ({ v: iso(c.vencimento), forn: c.fornecedor || c.descricao || 'Conta', valor: num(c.p_total), onde: c.titulo_obra || '' }))
      .concat(despesas.filter(d => String(d.status_pagamento || '').toLowerCase() !== 'pago').map(d => ({ v: iso(d.data_despesa), forn: d.fornecedor_beneficiario || d.descricao || 'Despesa', valor: num(d.valor), onde: 'Empresa' })))
      .filter(x => x.v && x.valor > 0);
    const venc = abertas.filter(x => x.v < hj).sort((a, b) => a.v.localeCompare(b.v)), hoje = abertas.filter(x => x.v === hj), breve = abertas.filter(x => x.v > hj && x.v <= ate3).sort((a, b) => a.v.localeCompare(b.v));
    const fx = x => `${br(x.v)} — ${x.forn} — ${reais(x.valor)}${x.onde ? ' (' + x.onde + ')' : ''}`, tot = L => reais(L.reduce((s, x) => s + x.valor, 0));
    if (venc.length) sec.push(['Contas VENCIDAS', `${venc.length} conta(s) · ${tot(venc)}\n` + lista(venc.map(fx), 8)]);
    if (hoje.length) sec.push(['Contas que vencem HOJE', `${hoje.length} conta(s) · ${tot(hoje)}\n` + lista(hoje.map(fx), 8)]);
    if (breve.length) sec.push(['Contas dos próximos 3 dias', `${breve.length} conta(s) · ${tot(breve)}\n` + lista(breve.map(fx), 8)]);
  }
  if (quer('documentos')) {
    const L = documentos.map(d => ({ v: iso(d.data_validade), t: [d.tipo, d.descricao].filter(Boolean).join(' — ') || 'Documento', o: d.titulo_obra || 'Empresa' })).filter(x => x.v && x.v <= somaDias(hj, 15)).sort((a, b) => a.v.localeCompare(b.v));
    if (L.length) sec.push(['Certidões e documentos', lista(L.map(x => `${x.t} (${x.o}) — ${x.v < hj ? 'VENCEU em ' + br(x.v) : 'vence em ' + br(x.v)}`), 10)]);
  }
  if (quer('pessoal')) {
    const ativos = new Map(plan.filter(p => p.tipo === 'funcionario' && (p.situacao || 'Ativo') === 'Ativo').map(f => [String(f._id), f]));
    const ult = new Map();
    plan.filter(p => p.tipo === 'pessoal_doc' && ativos.has(String(p.func_id))).forEach(d => { const k = d.func_id + '|' + (/^ASO/.test(d.doc || '') ? 'ASO' : d.doc); const a = ult.get(k); if (!a || iso(d.validade) > iso(a.validade)) ult.set(k, d); });
    const L = [...ult.values()].filter(d => iso(d.validade) && iso(d.validade) <= somaDias(hj, 30)).sort((a, b) => iso(a.validade).localeCompare(iso(b.validade)));
    if (L.length) sec.push(['Segurança do trabalho (ASO, NR, CNH)', lista(L.map(d => `${(ativos.get(String(d.func_id)) || {}).nome || d.func_nome || 'Funcionário'} — ${d.doc} — ${iso(d.validade) < hj ? 'VENCEU em ' + br(iso(d.validade)) : 'vence em ' + br(iso(d.validade))}`), 10)]);
  }
  if (quer('diario')) {
    const auto = obras.filter(o => o.diario_auto === 'sim').map(o => o.titulo_obra || o.nome_obra).filter(Boolean);
    const sem = auto.filter(ob => !diarios.some(r => r.titulo_obra === ob && iso(r.data) === ontem && !(r.auto === 'sim' && !r.preenchido_em)));
    if (sem.length) sec.push(['Diário de obra de ontem (' + br(ontem) + ') sem preencher', lista(sem, 10)]);
  }
  if (quer('notas')) {
    const L = plan.filter(p => p.tipo === 'nota_recebida' && (p.situacao || 'nova') === 'nova');
    if (L.length) sec.push(['Notas de compra recebidas (ainda não lançadas)', `${L.length} nota(s) — lance em Contas a pagar › Notas recebidas\n` + lista(L.map(n => `${br(iso(n.data_emissao))} — ${n.emitente_nome || 'Fornecedor'} — ${reais(num(n.valor))}`), 8)]);
  }
  if (quer('licitacoes')) {
    const L = plan.filter(p => p.tipo === 'licitacao' && ['Analisar', 'Vamos participar'].includes(p.situacao) && iso(p.encerramento) && iso(p.encerramento) >= hj && iso(p.encerramento) <= somaDias(hj, 5));
    if (L.length) sec.push(['Licitações acompanhadas perto do prazo', lista(L.map(l => `${br(iso(l.encerramento))} (em ${diasEntre(hj, iso(l.encerramento))} dia(s)) — ${String(l.objeto || '').slice(0, 140)} — ${l.orgao || ''}`), 8)]);
  }
  return { hj, sec };
}

async function enviarPara(email, assunto, campos) {
  const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(email), { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: SITE + '/' },
    body: JSON.stringify({ _subject: assunto, _template: 'box', _captcha: 'false', ...campos }) });
  let b = null; try { b = await r.json(); } catch (e) { b = null; }
  if (!r.ok || (b && String(b.success).toLowerCase() === 'false')) throw new Error((b && b.message) || ('HTTP ' + r.status));
  return b;
}
const emailsDe = cfg => [...new Set(String(cfg.emails || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))].slice(0, 10);

async function enviar(cfg, forcar) {
  const { hj, sec } = await montar(cfg), para = emailsDe(cfg);
  if (!para.length) return { ok: false, msg: 'Nenhum e-mail configurado em Configurações › Avisos por e-mail.' };
  if (!sec.length && cfg.sempre !== 'sim' && !forcar) return { ok: true, enviado: false, msg: 'Nada pendente hoje — e-mail não enviado.', hj };
  const campos = { 'Avisos de': br(hj) + '/' + hj.slice(0, 4) };
  if (sec.length) sec.forEach(([t, txt]) => { campos[t] = txt; }); else campos.Resumo = 'Tudo em dia hoje: nenhuma conta vencendo, nenhum documento vencendo e nada pendente.';
  campos['Abrir o sistema'] = SITE;
  const falhas = [];
  for (const e of para) { try { await enviarPara(e, `Avisos do dia — Vixsul Empreendimentos (${br(hj)})`, campos); } catch (x) { falhas.push(e + ': ' + x.message); } }
  return { ok: !falhas.length || falhas.length < para.length, enviado: true, para: para.length, falhas, secoes: sec.length, hj };
}

module.exports = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (!CHAVE) return responder(500, { ok: false, msg: 'Falta a chave de serviço do banco na Vercel.' });
  try {
    const cfgs = (await ler('planejamento')).filter(p => p.tipo === 'cfg_avisos'), cfg = cfgs.sort((a, b) => (b._id || 0) - (a._id || 0))[0];
    if (req.method === 'GET') {
      // tarefa agendada: no máximo um envio por dia
      if (!cfg || cfg.ativo === 'nao') return responder(200, { ok: true, enviado: false, msg: 'Avisos por e-mail desligados.' });
      const hj = hojeBahia();
      if (cfg.ultimo_envio === hj) return responder(200, { ok: true, enviado: false, msg: 'Já enviado hoje.' });
      const r = await enviar(cfg, false);
      await gravarCfg({ ...cfg, ultimo_envio: hj, ultima_msg: r.enviado ? `Enviado para ${r.para} e-mail(s)${r.falhas && r.falhas.length ? ' · falhou: ' + r.falhas.join('; ') : ''}` : (r.msg || '') });
      return responder(200, r);
    }
    if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use GET ou POST.' });
    const l = exigirLogin(req);
    if (!l.ok) return responder(401, { ok: false, sair: true, msg: 'A sessão terminou. Entre no sistema de novo.' });
    if (!ORIGENS.some(r => r.test(req.headers.origin || ''))) return responder(403, { ok: false, msg: 'Origem não permitida.' });
    if (l.p && !l.p.adm) return responder(403, { ok: false, msg: 'Só o Administrador mexe nos avisos por e-mail.' });
    const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
    const c = { ...(cfg || {}), ...(b.cfg || {}) };
    if (b.acao === 'previa') { const { hj, sec } = await montar(c); return responder(200, { ok: true, hj, secoes: sec.map(([t, txt]) => ({ titulo: t, texto: txt })), para: emailsDe(c) }); }
    if (b.acao === 'testar') return responder(200, await enviar(c, true));
    return responder(400, { ok: false, msg: 'Ação desconhecida.' });
  } catch (e) {
    return responder(500, { ok: false, msg: (e && e.message) || String(e) });
  }
};
