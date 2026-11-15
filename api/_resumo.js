/* O RESUMO DO DIA do sistema Vixsul — usado pelo e-mail das 7h (avisos.js) e pelo Telegram (telegram.js).
   Lê o banco com a chave de serviço (nunca vai ao navegador) e monta as partes: agenda (reuniões), tarefas, contas a
   pagar, recebimentos, aportes do mês, contratos terminando, certidões, pessoal (ASO/NR/CNH), diário sem preencher,
   notas de compra recebidas, licitações acompanhadas e lembretes. Também monta o retrato dos números para o assistente
   do Telegram responder perguntas. Os nomes dos campos são procurados em mais de uma forma (como o sistema faz). */
const URL_SB = process.env.SUPABASE_URL || 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
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
// só as linhas do Planejamento de alguns tipos (configuração do Telegram, conversas ligadas, lembretes) — leitura leve
async function lerTipos(tipos) {
  const r = await fetch(`${URL_SB}/rest/v1/planejamento?select=id,row_data&row_data->>tipo=in.(${tipos.map(encodeURIComponent).join(',')})&order=id.asc&limit=2000`, { headers: cabecalhos() });
  if (!r.ok) throw new Error('planejamento: erro ' + r.status);
  return (await r.json()).map(x => ({ ...(x.row_data || {}), _id: x.id })).filter(x => !x._lixeira_em);
}
// grava uma linha do Planejamento (nova: sem _id; existente: com _id)
async function gravarPlan(o) {
  const { _id, ...dados } = o;
  const h = { ...cabecalhos(), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const r = _id ? await fetch(`${URL_SB}/rest/v1/planejamento?id=eq.${encodeURIComponent(_id)}`, { method: 'PATCH', headers: h, body: JSON.stringify({ row_data: dados }) })
    : await fetch(`${URL_SB}/rest/v1/planejamento`, { method: 'POST', headers: h, body: JSON.stringify({ row_data: dados }) });
  if (!r.ok) throw new Error('Não consegui gravar no banco (' + r.status + ').');
  const j = await r.json().catch(() => null); const lin = Array.isArray(j) ? j[0] : j;
  return lin ? { ...(lin.row_data || dados), _id: lin.id } : { ...dados, _id };
}

// ── datas, números e campos ──
const iso = v => { const s = String(v || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const br = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const brAno = d => d ? br(d) + '/' + d.slice(0, 4) : '';
const somaDias = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const num = v => { if (typeof v === 'number') return v; let s = String(v || '').replace(/[R$\s]/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; };
const reais = v => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const agoraBahia = () => new Date(Date.now() - 3 * 3600e3);   // Bahia: UTC−3 o ano todo
const hojeBahia = () => agoraBahia().toISOString().slice(0, 10);
const horaBahia = () => agoraBahia().toISOString().slice(11, 16);
const cmp = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const campo = (o, ...nomes) => { for (const n of nomes) { if (o[n] != null && o[n] !== '') return o[n]; } const ks = Object.keys(o); for (const n of nomes) { const k = ks.find(x => cmp(x) === cmp(n)); if (k && o[k] != null && o[k] !== '') return o[k]; } return ''; };
const lista = (L, max) => L.slice(0, max).map(x => '• ' + x).join('\n') + (L.length > max ? `\n• … e mais ${L.length - max}` : '');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const TABELAS = ['custos', 'despesas', 'documentos', 'planejamento', 'diario_obra', 'obras', 'reunioes', 'acoes', 'faturamentos', 'aportes', 'contratos', 'medicoes'];
async function carregar() { const t = await Promise.all(TABELAS.map(ler)); const D = {}; TABELAS.forEach((k, i) => { D[k] = t[i]; }); return D; }

// contas ainda não pagas (custos das obras + despesas da empresa)
function contasAbertas(D, hj) {
  return D.custos.filter(c => String(campo(c, 'tipo_de_custo', 'tipo_custo')).toLowerCase() === 'real' && !(iso(campo(c, 'data_pgto', 'data_pagamento')) && iso(campo(c, 'data_pgto', 'data_pagamento')) <= hj))
    .map(c => ({ v: iso(campo(c, 'vencimento', 'data_vencimento')), forn: campo(c, 'fornecedor') || campo(c, 'descricao') || 'Conta', valor: num(campo(c, 'p_total', 'valor_total', 'valor')), onde: campo(c, 'titulo_obra') || '' }))
    .concat(D.despesas.filter(d => String(campo(d, 'status_pagamento')).toLowerCase() !== 'pago').map(d => ({ v: iso(campo(d, 'data_despesa', 'vencimento')), forn: campo(d, 'fornecedor_beneficiario', 'fornecedor') || campo(d, 'descricao') || 'Despesa', valor: num(campo(d, 'valor', 'valor_total')), onde: 'Empresa' })))
    .filter(x => x.v && x.valor > 0);
}
const tarefaAberta = t => !/conclu|cancel|nao feita|não feita/i.test(String(t.status || 'Aberta'));
const reuniaoValida = r => !/cancel|realizad|conclu/i.test(String(r.status || ''));
// aporte com sinal: devolução sai negativa (pelo tipo do movimento ou pelo valor já negativo)
const valorAporte = a => { const v = num(campo(a, 'valor_aportado', 'valor')); return /devolu/i.test(String(campo(a, 'movimento'))) ? -Math.abs(v) : v; };
// os números de cada obra: contrato, medido (aprovado/faturado), notas emitidas, recebido, gasto (contas reais) e aportes
function porObra(D) {
  const S = {}, add = (o, k, v) => { o = String(o || '').trim(); if (!o || !v) return; (S[o] = S[o] || { obra: o, contrato: 0, medido: 0, faturado: 0, recebido: 0, gasto: 0, pago: 0, aportes: 0 })[k] += v; };
  D.contratos.forEach(c => add(c.titulo_obra, 'contrato', num(c.valor_contrato)));
  D.medicoes.filter(m => /aprov|fatur/i.test(String(m.status || ''))).forEach(m => add(m.titulo_obra, 'medido', num(m.valor_total)));
  D.faturamentos.filter(f => iso(campo(f, 'emissao_nf', 'data_emissao')) && !/previst/i.test(String(campo(f, 'tipo_faturamento')))).forEach(f => {
    add(f.titulo_obra, 'faturado', num(campo(f, 'faturamento_bruto', 'valor_bruto')));
    if (iso(campo(f, 'data_recebimento'))) add(f.titulo_obra, 'recebido', num(campo(f, 'faturamento_liquido', 'valor_liquido', 'faturamento_bruto')));
  });
  D.custos.filter(c => String(campo(c, 'tipo_de_custo', 'tipo_custo')).toLowerCase() === 'real').forEach(c => { const v = num(campo(c, 'p_total', 'valor_total', 'valor')); add(c.titulo_obra, 'gasto', v); if (iso(campo(c, 'data_pgto'))) add(c.titulo_obra, 'pago', v); });
  D.aportes.forEach(a => add(a.titulo_obra, 'aportes', valorAporte(a)));
  return Object.values(S).sort((a, b) => b.gasto - a.gasto || a.obra.localeCompare(b.obra));
}

async function montar(cfg, Dpronto) {
  cfg = cfg || {};
  const hj = hojeBahia(), ate3 = somaDias(hj, 3), ontem = somaDias(hj, -1), amanha = somaDias(hj, 1), quer = k => !cfg.itens || cfg.itens[k] !== false;
  const D = Dpronto || await carregar(), plan = D.planejamento, sec = [];
  if (quer('agenda')) {
    const L = D.reunioes.filter(r => reuniaoValida(r) && [hj, amanha].includes(iso(r.data))).sort((a, b) => (iso(a.data) + (a.hora || '')).localeCompare(iso(b.data) + (b.hora || '')));
    if (L.length) sec.push(['Agenda de hoje e amanhã', lista(L.map(r => `${iso(r.data) === hj ? 'Hoje' : 'Amanhã'}${r.hora ? ' ' + r.hora : ''} — ${r.titulo || r.tipo || 'Reunião'}${r.titulo_obra ? ' (' + r.titulo_obra + ')' : ''}${r.local ? ' · ' + r.local : ''}${r.link ? ' · ' + r.link : ''}`), 10)]);
  }
  if (quer('tarefas')) {
    const ab = D.acoes.filter(t => tarefaAberta(t) && iso(t.quando)), atr = ab.filter(t => iso(t.quando) < hj).sort((a, b) => iso(a.quando).localeCompare(iso(b.quando))), prox = ab.filter(t => iso(t.quando) >= hj && iso(t.quando) <= ate3).sort((a, b) => iso(a.quando).localeCompare(iso(b.quando)));
    const fx = t => `${br(iso(t.quando))} — ${t.o_que || 'Tarefa'}${t.quem ? ' · ' + t.quem : ''}${t.titulo_obra ? ' (' + t.titulo_obra + ')' : ''}${/alta|urgente/i.test(t.prioridade || '') ? ' · prioridade ' + t.prioridade : ''}`;
    if (atr.length) sec.push(['Tarefas ATRASADAS', `${atr.length} tarefa(s)\n` + lista(atr.map(fx), 8)]);
    if (prox.length) sec.push(['Tarefas de hoje e dos próximos 3 dias', lista(prox.map(fx), 8)]);
  }
  if (quer('contas')) {
    const abertas = contasAbertas(D, hj);
    const venc = abertas.filter(x => x.v < hj).sort((a, b) => a.v.localeCompare(b.v)), hoje = abertas.filter(x => x.v === hj), breve = abertas.filter(x => x.v > hj && x.v <= ate3).sort((a, b) => a.v.localeCompare(b.v));
    const fx = x => `${br(x.v)} — ${x.forn} — ${reais(x.valor)}${x.onde ? ' (' + x.onde + ')' : ''}`, tot = L => reais(L.reduce((s, x) => s + x.valor, 0));
    if (venc.length) sec.push(['Contas VENCIDAS', `${venc.length} conta(s) · ${tot(venc)}\n` + lista(venc.map(fx), 8)]);
    if (hoje.length) sec.push(['Contas que vencem HOJE', `${hoje.length} conta(s) · ${tot(hoje)}\n` + lista(hoje.map(fx), 8)]);
    if (breve.length) sec.push(['Contas dos próximos 3 dias', `${breve.length} conta(s) · ${tot(breve)}\n` + lista(breve.map(fx), 8)]);
  }
  if (quer('recebimentos')) {
    const L = D.faturamentos.filter(f => iso(campo(f, 'emissao_nf', 'data_emissao')) && !iso(campo(f, 'data_recebimento')) && !/previst/i.test(String(campo(f, 'tipo_faturamento'))))
      .map(f => ({ e: iso(campo(f, 'emissao_nf', 'data_emissao')), n: campo(f, 'n_nf', 'numero_nf'), v: num(campo(f, 'faturamento_liquido', 'valor_liquido', 'faturamento_bruto')), o: f.titulo_obra || '' })).sort((a, b) => a.e.localeCompare(b.e));
    if (L.length) sec.push(['Notas emitidas ainda não recebidas', `${L.length} nota(s) · ${reais(L.reduce((s, x) => s + x.v, 0))}\n` + lista(L.map(x => `NF ${x.n || '—'} de ${br(x.e)} (${diasEntre(x.e, hj)} dias) — ${reais(x.v)}${x.o ? ' (' + x.o + ')' : ''}`), 8)]);
  }
  if (quer('aportes')) {
    const mes = hj.slice(0, 7), soc = {};
    D.aportes.filter(a => !/devolu/i.test(String(campo(a, 'movimento'))) && num(campo(a, 'valor_aportado', 'valor')) > 0 && (iso(campo(a, 'data_aporte', 'data')) || '').slice(0, 7) === mes).forEach(a => { const q = campo(a, 'quem_aportou', 'socio', 'quem') || 'Sócio'; soc[q] = (soc[q] || 0) + num(campo(a, 'valor_aportado', 'valor')); });
    const L = Object.entries(soc).sort((a, b) => b[1] - a[1]);
    if (L.length) sec.push([`Aportes em ${MESES[+mes.slice(5) - 1]}`, `${reais(L.reduce((s, x) => s + x[1], 0))} no mês\n` + lista(L.map(([q, v]) => `${q} — ${reais(v)}`), 8)]);
  }
  if (quer('contratos')) {
    const L = D.contratos.map(c => ({ f: iso(campo(c, 'vigencia_fim')), o: c.titulo_obra || c.objeto || 'Contrato' })).filter(x => x.f && x.f >= hj && x.f <= somaDias(hj, 30)).sort((a, b) => a.f.localeCompare(b.f));
    if (L.length) sec.push(['Contratos com a vigência terminando (30 dias)', lista(L.map(x => `${x.o} — termina em ${brAno(x.f)} (${diasEntre(hj, x.f)} dias): veja o aditivo de prazo`), 8)]);
  }
  if (quer('documentos')) {
    const L = D.documentos.map(d => ({ v: iso(campo(d, 'data_validade', 'validade')), t: [d.tipo, d.descricao].filter(Boolean).join(' — ') || 'Documento', o: d.titulo_obra || 'Empresa' })).filter(x => x.v && x.v <= somaDias(hj, 15)).sort((a, b) => a.v.localeCompare(b.v));
    if (L.length) sec.push(['Certidões e documentos', lista(L.map(x => `${x.t} (${x.o}) — ${x.v < hj ? 'VENCEU em ' + br(x.v) : 'vence em ' + br(x.v)}`), 10)]);
  }
  if (quer('pessoal')) {
    const ativos = new Map(plan.filter(p => p.tipo === 'funcionario' && (p.situacao || 'Ativo') === 'Ativo').map(f => [String(f._id), f])), ult = new Map();
    plan.filter(p => p.tipo === 'pessoal_doc' && ativos.has(String(p.func_id))).forEach(d => { const k = d.func_id + '|' + (/^ASO/.test(d.doc || '') ? 'ASO' : d.doc); const a = ult.get(k); if (!a || iso(d.validade) > iso(a.validade)) ult.set(k, d); });
    const L = [...ult.values()].filter(d => iso(d.validade) && iso(d.validade) <= somaDias(hj, 30)).sort((a, b) => iso(a.validade).localeCompare(iso(b.validade)));
    if (L.length) sec.push(['Segurança do trabalho (ASO, NR, CNH)', lista(L.map(d => `${(ativos.get(String(d.func_id)) || {}).nome || d.func_nome || 'Funcionário'} — ${d.doc} — ${iso(d.validade) < hj ? 'VENCEU em ' + br(iso(d.validade)) : 'vence em ' + br(iso(d.validade))}`), 10)]);
  }
  if (quer('diario')) {
    const auto = D.obras.filter(o => o.diario_auto === 'sim').map(o => o.titulo_obra || o.nome_obra).filter(Boolean);
    const sem = auto.filter(ob => !D.diario_obra.some(r => r.titulo_obra === ob && iso(r.data) === ontem && !(r.auto === 'sim' && !r.preenchido_em)));
    if (sem.length) sec.push([`Diário de obra de ontem (${br(ontem)}) sem preencher`, lista(sem, 10)]);
  }
  if (quer('notas')) {
    // notas emitidas contra a Vixsul que o sistema encontrou desde ontem (ficam em Documentos e certidões › Notas fiscais)
    const L = plan.filter(p => p.tipo === 'nota_recebida' && p.situacao !== 'cancelada' && String(p.recebida_em || '').slice(0, 10) >= ontem);
    if (L.length) sec.push(['Notas fiscais recebidas desde ontem', `${L.length} nota(s) · ${reais(L.reduce((s, n) => s + num(n.valor), 0))} — PDF e XML em Documentos e certidões › Notas fiscais\n` + lista(L.map(n => `${br(iso(n.data_emissao))} — ${n.emitente_nome || 'Fornecedor'} — ${reais(num(n.valor))}`), 8)]);
  }
  if (quer('licitacoes')) {
    const L = plan.filter(p => p.tipo === 'licitacao' && ['Analisar', 'Vamos participar'].includes(p.situacao) && iso(p.encerramento) && iso(p.encerramento) >= hj && iso(p.encerramento) <= somaDias(hj, 5));
    if (L.length) sec.push(['Licitações acompanhadas perto do prazo', lista(L.map(l => `${br(iso(l.encerramento))} (em ${diasEntre(hj, iso(l.encerramento))} dia(s)) — ${String(l.objeto || '').slice(0, 140)} — ${l.orgao || ''}`), 8)]);
  }
  if (quer('lembretes')) {
    const L = plan.filter(p => p.tipo === 'lembrete' && p.ativo !== 'nao' && proximaVez(p, hj + 'T00:00') && proximaVez(p, hj + 'T00:00').slice(0, 10) === hj);
    if (L.length) sec.push(['Lembretes de hoje', lista(L.map(l => `${proximaVez(l, hj + 'T00:00').slice(11, 16)} — ${l.texto}`), 10)]);
  }
  return { hj, sec, D };
}

/* LEMBRETES: {texto, quando 'AAAA-MM-DDTHH:MM' (horário da Bahia), repetir 'nao'|'diario'|'semanal'|'mensal', ativo,
   ultimo_envio}. proximaVez(l, depois): a primeira vez em que o lembrete toca DEPOIS de 'depois' (ou null). */
function proximaVez(l, depois) {
  const q = String(l.quando || '').slice(0, 16); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(q)) return null;
  const rep = l.repetir || 'nao';
  if (rep === 'nao') return q > depois ? q : null;
  let d = new Date(q + ':00Z'), guarda = 0;
  const passo = () => { if (rep === 'diario') d.setUTCDate(d.getUTCDate() + 1); else if (rep === 'semanal') d.setUTCDate(d.getUTCDate() + 7); else d.setUTCMonth(d.getUTCMonth() + 1); };
  while (d.toISOString().slice(0, 16) <= depois && guarda++ < 5000) passo();
  return d.toISOString().slice(0, 16);
}

// texto do resumo para o Telegram (HTML simples)
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function resumoTelegram(r) {
  const cab = `<b>Resumo do dia — ${brAno(r.hj)}</b>`;
  if (!r.sec.length) return cab + '\nTudo em dia: nenhuma conta, tarefa ou documento pedindo atenção.';
  return cab + '\n\n' + r.sec.map(([t, x]) => `<b>${escH(t)}</b>\n${escH(x)}`).join('\n\n');
}

/* RETRATO DOS NÚMEROS para o assistente do Telegram (linhas curtas, sem dado pessoal além do que o sistema já mostra
   aos sócios): obras, contas abertas, contas pagas nos últimos 90 dias, gasto por obra e mês, aportes, notas, medições,
   agenda, tarefas, lembretes, documentos e funcionários. */
function retrato(D) {
  // cada parte tem um teto de linhas (as mais recentes ficam) para o retrato não passar do tamanho que a IA aceita
  const hj = hojeBahia(), lin = [], cut = somaDias(hj, -90), L = (t, rows, max = 400) => { const r = rows.length > max ? rows.slice(-max) : rows; lin.push(`\n## ${t} (${rows.length}${rows.length > max ? `, mostrando as ${max} mais recentes` : ''})`); r.forEach(x => lin.push(x)); };
  L('Obras: nome | situação | cidade', D.obras.map(o => [o.titulo_obra || o.nome_obra, campo(o, 'status_obra', 'status_proposta', 'status'), campo(o, 'cidade_obra', 'cidade')].join(' | ')), 200);
  L('NÚMEROS POR OBRA (já somados — use estes para totais por obra): obra | contrato | medido (aprovado) | notas emitidas (bruto) | recebido (líquido) | gasto (contas reais) | gasto já pago | aportes (menos devoluções)',
    porObra(D).map(x => [x.obra, x.contrato, x.medido, x.faturado, x.recebido, x.gasto, x.pago, x.aportes].map((v, i) => i ? v.toFixed(2) : v).join(' | ')), 200);
  const apM = {};
  D.aportes.forEach(a => { const m = iso(campo(a, 'data_aporte', 'data')).slice(0, 7); if (!m) return; const k = `${m} | ${campo(a, 'quem_aportou', 'socio') || 'Sócio'}`; apM[k] = (apM[k] || 0) + valorAporte(a); });
  L('APORTES POR MÊS E SÓCIO (já somados, devoluções descontadas): mês | sócio | total', Object.entries(apM).sort().map(([k, v]) => k + ' | ' + v.toFixed(2)), 300);
  L('Contratos: obra | contratante | valor | vigência até', D.contratos.map(c => [c.titulo_obra, c.contratante || '', num(c.valor_contrato).toFixed(2), iso(c.vigencia_fim)].join(' | ')));
  L('Contas a pagar em aberto: vencimento | fornecedor | valor | obra/Empresa', contasAbertas(D, hj).sort((a, b) => a.v.localeCompare(b.v)).map(x => [x.v, x.forn, x.valor.toFixed(2), x.onde].join(' | ')));
  const pagas = D.custos.filter(c => iso(campo(c, 'data_pgto')) >= cut).map(c => [iso(campo(c, 'data_pgto')), campo(c, 'fornecedor'), num(campo(c, 'p_total', 'valor_total')).toFixed(2), c.titulo_obra || '', campo(c, 'tipo', 'especificacao'), String(campo(c, 'descricao')).slice(0, 60)].join(' | '))
    .concat(D.despesas.filter(d => /pago/i.test(String(d.status_pagamento || '')) && iso(campo(d, 'data_pagamento', 'data_despesa')) >= cut).map(d => [iso(campo(d, 'data_pagamento', 'data_despesa')), campo(d, 'fornecedor_beneficiario'), num(d.valor).toFixed(2), 'Empresa', d.categoria || '', String(d.descricao || '').slice(0, 60)].join(' | ')));
  L('Contas pagas nos últimos 90 dias: data do pagamento | fornecedor | valor | obra/Empresa | categoria | descrição', pagas.sort(), 300);
  const porMes = {};
  D.custos.filter(c => String(campo(c, 'tipo_de_custo')).toLowerCase() === 'real').forEach(c => { const m = (iso(campo(c, 'data_pgto')) || iso(campo(c, 'vencimento'))).slice(0, 7); if (!m) return; const k = (c.titulo_obra || '?') + ' | ' + m; porMes[k] = (porMes[k] || 0) + num(campo(c, 'p_total', 'valor_total')); });
  D.despesas.forEach(d => { const m = (iso(campo(d, 'data_pagamento')) || iso(campo(d, 'data_despesa'))).slice(0, 7); if (!m) return; const k = 'Empresa | ' + m; porMes[k] = (porMes[k] || 0) + num(d.valor); });
  L('Gasto (contas reais) por obra e mês: obra | mês | total', Object.entries(porMes).sort((a, b) => a[0].split(' | ')[1].localeCompare(b[0].split(' | ')[1]) || a[0].localeCompare(b[0])).map(([k, v]) => k + ' | ' + v.toFixed(2)));
  L('Aportes e devoluções lançados: data | sócio | obra | movimento | valor', D.aportes.map(a => [iso(campo(a, 'data_aporte', 'data')), campo(a, 'quem_aportou', 'socio'), a.titulo_obra || '', campo(a, 'movimento') || 'Aporte', valorAporte(a).toFixed(2)].join(' | ')).sort(), 200);
  L('Notas fiscais emitidas: emissão | nº | obra | bruto | líquido | recebida em', D.faturamentos.filter(f => iso(campo(f, 'emissao_nf')) && !/previst/i.test(String(f.tipo_faturamento || ''))).map(f => [iso(campo(f, 'emissao_nf')), campo(f, 'n_nf'), f.titulo_obra || '', num(f.faturamento_bruto).toFixed(2), num(f.faturamento_liquido).toFixed(2), iso(f.data_recebimento) || 'não recebida'].join(' | ')).sort(), 200);
  L('Medições: data | obra | nº | situação | valor', D.medicoes.map(m => [iso(m.data_medicao), m.titulo_obra, m.numero, m.status || '', num(m.valor_total).toFixed(2)].join(' | ')).sort(), 150);
  L('Reuniões (próximos 30 dias): data | hora | título | obra | local/link', D.reunioes.filter(r => reuniaoValida(r) && iso(r.data) >= hj && iso(r.data) <= somaDias(hj, 30)).map(r => [iso(r.data), r.hora || '', r.titulo || r.tipo || '', r.titulo_obra || '', r.link || r.local || ''].join(' | ')).sort());
  L('Tarefas abertas: prazo | o que | quem | obra | prioridade | situação', D.acoes.filter(tarefaAberta).map(t => [iso(t.quando), t.o_que || '', t.quem || '', t.titulo_obra || '', t.prioridade || '', t.status || 'Aberta'].join(' | ')).sort());
  L('Lembretes ativos: id | quando (horário da Bahia) | repete | texto', D.planejamento.filter(p => p.tipo === 'lembrete' && p.ativo !== 'nao' && !(p.repetir === 'nao' && p.enviado === 'sim')).map(l => [l._id, l.quando, l.repetir || 'nao', l.texto].join(' | ')));
  L('Documentos e certidões: validade | tipo | obra', D.documentos.map(d => [iso(campo(d, 'data_validade')), [d.tipo, d.descricao].filter(Boolean).join(' — '), d.titulo_obra || 'Empresa'].join(' | ')).sort());
  L('Abastecimentos da máquina: data | obra | litros | valor', D.planejamento.filter(p => p.tipo === 'abastecimento').map(a => [iso(a.data), a.titulo_obra || '', a.litros, num(a.valor).toFixed(2)].join(' | ')).sort());
  return `Retrato do sistema de gestão da Vixsul Empreendimentos tirado em ${brAno(hj)}. Valores em reais com ponto decimal; datas no formato AAAA-MM-DD.` + lin.join('\n');
}

module.exports = { ler, lerTipos, gravarPlan, carregar, montar, contasAbertas, porObra, valorAporte, tarefaAberta, reuniaoValida, proximaVez, resumoTelegram, retrato, iso, br, brAno, somaDias, diasEntre, num, reais, campo, lista, hojeBahia, horaBahia, agoraBahia, escH, MESES, URL_SB, cabecalhos };
