/* PERGUNTAS SEM IA (grátis) — o robô do Telegram entende as perguntas mais comuns pelos números do sistema, sem
   serviço pago: acha o ASSUNTO (contas a pagar, gastos/pagamentos, aportes, notas e recebimentos, medições, agenda,
   tarefas, certidões, diesel da máquina, números de uma obra), o PERÍODO ("hoje", "esta semana", "outubro",
   "mês passado", "2026", "últimos 30 dias"…), a OBRA, o FORNECEDOR e o SÓCIO citados, e responde com o total e a lista.
   Exemplos: "quanto gastei na obra de Itarantim em outubro?", "contas que vencem esta semana", "aportes do Vilson em
   2026", "notas a receber", "quanto paguei para a MJ Ferragens", "medições da obra Potiraguá", "diesel do mês". */
const R = require('./_resumo');
const esc = R.escH;
const sA = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const MESES_N = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const VAZIAS = new Set(['obra', 'obras', 'reforma', 'construcao', 'do', 'da', 'de', 'dos', 'das', 'e', 'em', 'no', 'na', 'ltda', 'me', 'sa', 'eireli', 'epp', 'servicos', 'comercio', 'para', 'com', 'municipio', 'prefeitura', 'teste']);
const fimMes = (a, m) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
const mesIso = (a, m) => ({ ini: `${a}-${String(m).padStart(2, '0')}-01`, fim: fimMes(a, m), rot: `${R.MESES[m - 1]} de ${a}` });
const diaSemana = d => new Date(d + 'T12:00:00Z').getUTCDay();

// o período citado na pergunta (datas inclusive) — futuro=true quando o assunto olha para frente (contas a vencer)
function periodoDe(t, hj, futuro) {
  const ano = +hj.slice(0, 4), mes = +hj.slice(5, 7); let m;
  if (/\bhoje\b/.test(t)) return { ini: hj, fim: hj, rot: 'hoje' };
  if (/\bontem\b/.test(t)) { const d = R.somaDias(hj, -1); return { ini: d, fim: d, rot: 'ontem' }; }
  if (/\bdepois de amanha\b/.test(t)) { const d = R.somaDias(hj, 2); return { ini: d, fim: d, rot: 'depois de amanhã' }; }
  if (/\bamanha\b/.test(t)) { const d = R.somaDias(hj, 1); return { ini: d, fim: d, rot: 'amanhã' }; }
  const seg = R.somaDias(hj, -((diaSemana(hj) + 6) % 7));
  if (/\b(proxima semana|semana que vem)\b/.test(t)) return { ini: R.somaDias(seg, 7), fim: R.somaDias(seg, 13), rot: 'a próxima semana' };
  if (/\bsemana passada\b/.test(t)) return { ini: R.somaDias(seg, -7), fim: R.somaDias(seg, -1), rot: 'a semana passada' };
  if (/\bsemana\b/.test(t)) return { ini: seg, fim: R.somaDias(seg, 6), rot: 'esta semana' };
  if ((m = t.match(/\b(?:ultimos|proximos) (\d{1,3}) dias\b/))) { const n = Math.min(400, +m[1]); return /proximos/.test(m[0]) ? { ini: hj, fim: R.somaDias(hj, n), rot: `os próximos ${n} dias` } : { ini: R.somaDias(hj, -n), fim: hj, rot: `os últimos ${n} dias` }; }
  if (/\b(mes passado|ultimo mes)\b/.test(t)) return mes === 1 ? mesIso(ano - 1, 12) : mesIso(ano, mes - 1);
  if (/\b(proximo mes|mes que vem)\b/.test(t)) return mes === 12 ? mesIso(ano + 1, 1) : mesIso(ano, mes + 1);
  if ((m = t.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b(?: (?:de )?(20\d{2}))?/))) {
    const mi = MESES_N.indexOf(m[1]) + 1; let a = m[2] ? +m[2] : ano;
    if (!m[2] && !futuro && mi > mes) a = ano - 1;      // "outubro" sem ano = o último outubro (para gastos já feitos)
    if (!m[2] && futuro && mi < mes) a = ano + 1;       // "fevereiro" sem ano = o próximo (para contas a vencer)
    return mesIso(a, mi);
  }
  if (/\b(este|esse|neste|nesse|deste|desse) mes\b|\bmes atual\b|\bdo mes\b|\bno mes\b/.test(t)) return mesIso(ano, mes);
  if ((m = t.match(/\b(20\d{2})\b/))) return { ini: `${m[1]}-01-01`, fim: `${m[1]}-12-31`, rot: m[1] };
  if (/\b(este|esse|neste|nesse|deste|desse) ano\b|\bano atual\b|\bno ano\b|\bdo ano\b/.test(t)) return { ini: `${ano}-01-01`, fim: `${ano}-12-31`, rot: String(ano) };
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/))) { const d = `${m[3] || ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return { ini: d, fim: d, rot: R.brAno(d) }; }
  return null;
}
// a obra citada: a que tem mais palavras "fortes" do nome na pergunta (empate = nenhuma)
function obraDe(t, D) {
  const nomes = [...new Set([].concat(D.obras.map(o => o.titulo_obra || o.nome_obra), D.contratos.map(c => c.titulo_obra), D.custos.map(c => c.titulo_obra)).filter(Boolean).map(String))];
  let melhor = null, nota = 0, empate = false;
  for (const n of nomes) {
    const s = sA(n); if (s && t.includes(s)) return n;
    const fortes = s.split(' ').filter(w => w.length >= 4 && !VAZIAS.has(w) && !/^\d+$/.test(w));
    const pts = fortes.filter(w => new RegExp(`\\b${w}\\b`).test(t)).length;
    if (pts > nota) { melhor = n; nota = pts; empate = false; } else if (pts && pts === nota && n !== melhor) empate = true;
  }
  return nota && !empate ? melhor : null;
}
// fornecedor citado (nome inteiro, ou as duas primeiras palavras fortes)
function fornecedorDe(t, D) {
  const nomes = [...new Set([].concat(D.custos.map(c => R.campo(c, 'fornecedor')), D.despesas.map(d => R.campo(d, 'fornecedor_beneficiario', 'fornecedor'))).filter(Boolean).map(String))];
  let ach = null, tam = 0;
  for (const n of nomes) {
    const s = sA(n); if (!s) continue;
    const fortes = s.split(' ').filter(w => w.length >= 3 && !VAZIAS.has(w));
    const chave = fortes.slice(0, 2).join(' ');
    const ok = (s.length >= 4 && t.includes(s)) || (chave.length >= 6 && t.includes(chave)) || (fortes[0] && fortes[0].length >= 6 && new RegExp(`\\b${fortes[0]}\\b`).test(t));
    if (ok && s.length > tam) { ach = n; tam = s.length; }
  }
  return ach;
}
function socioDe(t, D) {
  const nomes = [...new Set(D.aportes.map(a => R.campo(a, 'quem_aportou', 'socio')).filter(Boolean).map(String))];
  return nomes.find(n => sA(n).split(' ').some(w => w.length >= 4 && new RegExp(`\\b${w}\\b`).test(t))) || null;
}
const dentro = (d, p) => !!d && (!p || (d >= p.ini && d <= p.fim));
// "em novembro de 2026", "nesta semana", "nos últimos 30 dias", "hoje"…
const emRot = r => /^(hoje|ontem|amanhã|depois de amanhã)$/.test(r) ? r : r === 'esta semana' ? 'nesta semana' : /^a (próxima semana|semana passada)$/.test(r) ? 'n' + r : /^os /.test(r) ? 'n' + r : 'em ' + r;
const linhaLista = (L, max) => L.slice(0, max).join('\n') + (L.length > max ? `\n• … e mais ${L.length - max}` : '');
const filtroTxt = (o, f, s) => [o ? 'obra ' + esc(o) : '', f ? 'fornecedor ' + esc(f) : '', s ? 'sócio ' + esc(s) : ''].filter(Boolean).join(' · ');

function contas(t, D, hj, obra, forn) {
  const p = periodoDe(t, hj, true);
  let ab = R.contasAbertas(D, hj).filter(x => (!obra || x.onde === obra) && (!forn || sA(x.forn) === sA(forn)));
  const venc = /\bvencid|atrasad/.test(t);
  let L, rot;
  if (venc) { L = ab.filter(x => x.v < hj); rot = 'vencidas (em atraso)'; }
  else if (p) { L = ab.filter(x => dentro(x.v, p)); rot = 'que vencem ' + emRot(p.rot); }
  else { L = ab.filter(x => x.v <= R.somaDias(hj, 7)); rot = 'vencidas e dos próximos 7 dias'; }
  L.sort((a, b) => a.v.localeCompare(b.v));
  const tot = L.reduce((s, x) => s + x.valor, 0), f = filtroTxt(obra, forn);
  if (!L.length) return `Nenhuma conta a pagar ${rot}${f ? ' (' + f + ')' : ''}. 🎉`;
  return `<b>Contas a pagar ${rot}</b>${f ? '\n' + f : ''}\n<b>${R.reais(tot)}</b> em ${L.length} conta(s)\n` + linhaLista(L.map(x => `• ${R.br(x.v)}${x.v < hj ? ' ⚠️' : ''} — ${esc(x.forn)} — ${R.reais(x.valor)}${x.onde && !obra ? ' <i>(' + esc(x.onde) + ')</i>' : ''}`), 20);
}
function gastos(t, D, hj, obra, forn) {
  const p = periodoDe(t, hj, false) || mesIso(+hj.slice(0, 4), +hj.slice(5, 7));
  const reais = D.custos.filter(c => String(R.campo(c, 'tipo_de_custo', 'tipo_custo')).toLowerCase() === 'real' && (!obra || c.titulo_obra === obra) && (!forn || sA(R.campo(c, 'fornecedor')) === sA(forn)))
    .map(c => ({ pg: R.iso(R.campo(c, 'data_pgto')), v: R.iso(R.campo(c, 'vencimento')), forn: R.campo(c, 'fornecedor') || R.campo(c, 'descricao') || 'Conta', cat: R.campo(c, 'tipo', 'especificacao', 'categoria'), valor: R.num(R.campo(c, 'p_total', 'valor_total', 'valor')), onde: c.titulo_obra || '' }))
    .concat(obra ? [] : D.despesas.filter(d => !forn || sA(R.campo(d, 'fornecedor_beneficiario')) === sA(forn)).map(d => ({ pg: /pago/i.test(String(d.status_pagamento || '')) ? R.iso(R.campo(d, 'data_pagamento', 'data_despesa')) : '', v: R.iso(R.campo(d, 'data_despesa')), forn: R.campo(d, 'fornecedor_beneficiario') || 'Despesa', cat: d.categoria || '', valor: R.num(d.valor), onde: 'Empresa' })));
  const pagos = reais.filter(x => dentro(x.pg, p)), abertos = reais.filter(x => !x.pg && dentro(x.v, p));
  const tot = pagos.reduce((s, x) => s + x.valor, 0), totA = abertos.reduce((s, x) => s + x.valor, 0), f = filtroTxt(obra, forn);
  const por = (L, k) => { const m = {}; L.forEach(x => { const c = x[k] || '—'; m[c] = (m[c] || 0) + x.valor; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  let out = `<b>Pago ${esc(emRot(p.rot))}</b>${f ? '\n' + f : ''}\n<b>${R.reais(tot)}</b> em ${pagos.length} lançamento(s)`;
  if (pagos.length && !forn) out += '\n\nQuem mais recebeu:\n' + linhaLista(por(pagos, 'forn').map(([n, v]) => `• ${esc(n)} — ${R.reais(v)}`), 8);
  if (pagos.length && !obra && !forn) { const po = por(pagos, 'onde'); if (po.length > 1) out += '\n\nPor obra:\n' + linhaLista(po.map(([n, v]) => `• ${esc(n)} — ${R.reais(v)}`), 8); }
  if (forn && pagos.length) out += '\n\n' + linhaLista(pagos.sort((a, b) => a.pg.localeCompare(b.pg)).map(x => `• ${R.br(x.pg)} — ${R.reais(x.valor)}${x.onde ? ' <i>(' + esc(x.onde) + ')</i>' : ''}`), 15);
  if (abertos.length) out += `\n\nAinda em aberto com vencimento ${esc(emRot(p.rot))}: ${R.reais(totA)} (${abertos.length})`;
  return out;
}
function aportes(t, D, hj, obra, socio) {
  const p = periodoDe(t, hj, false) || { ini: hj.slice(0, 4) + '-01-01', fim: hj.slice(0, 4) + '-12-31', rot: hj.slice(0, 4) };
  const L = D.aportes.map(a => ({ d: R.iso(R.campo(a, 'data_aporte', 'data')), q: R.campo(a, 'quem_aportou', 'socio') || 'Sócio', o: a.titulo_obra || '', v: R.valorAporte(a) }))
    .filter(a => dentro(a.d, p) && (!obra || a.o === obra) && (!socio || a.q === socio));
  const ent = L.filter(a => a.v > 0), dev = L.filter(a => a.v < 0), tot = ent.reduce((s, a) => s + a.v, 0), totD = -dev.reduce((s, a) => s + a.v, 0);
  const m = {}; ent.forEach(a => { m[a.q] = (m[a.q] || 0) + a.v; });
  const f = filtroTxt(obra, '', socio);
  return `<b>Aportes ${esc(emRot(p.rot))}</b>${f ? '\n' + f : ''}\n<b>${R.reais(tot)}</b> em ${ent.length} lançamento(s)` + (Object.keys(m).length > 1 || !socio ? '\n' + linhaLista(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([q, v]) => `• ${esc(q)} — ${R.reais(v)}`), 10) : '') + (totD ? `\nDevolvido aos sócios: ${R.reais(totD)}` : '');
}
function notas(t, D, hj, obra) {
  const p = periodoDe(t, hj, false);
  const F = D.faturamentos.filter(f => R.iso(R.campo(f, 'emissao_nf')) && !/previst/i.test(String(f.tipo_faturamento || '')) && (!obra || f.titulo_obra === obra))
    .map(f => ({ e: R.iso(R.campo(f, 'emissao_nf')), r: R.iso(f.data_recebimento), n: R.campo(f, 'n_nf'), b: R.num(f.faturamento_bruto), l: R.num(f.faturamento_liquido) || R.num(f.faturamento_bruto), o: f.titulo_obra || '' }));
  const f = filtroTxt(obra);
  if (/\b(a receber|receber|nao recebid|pendente|em aberto|falta receber)\b/.test(t) && !/\brecebi\b|\brecebid[oa]s? em\b/.test(t)) {
    const L = F.filter(x => !x.r).sort((a, b) => a.e.localeCompare(b.e)), tot = L.reduce((s, x) => s + x.l, 0);
    return L.length ? `<b>Notas emitidas ainda não recebidas</b>${f ? '\n' + f : ''}\n<b>${R.reais(tot)}</b> (líquido) em ${L.length} nota(s)\n` + linhaLista(L.map(x => `• NF ${esc(x.n || '—')} de ${R.br(x.e)} (${R.diasEntre(x.e, hj)} dias) — ${R.reais(x.l)}${x.o && !obra ? ' <i>(' + esc(x.o) + ')</i>' : ''}`), 15) : `Nenhuma nota emitida esperando pagamento${f ? ' (' + f + ')' : ''}. 🎉`;
  }
  const per = p || mesIso(+hj.slice(0, 4), +hj.slice(5, 7));
  if (/\brecebi|recebemos|recebid|entrou|entrada/.test(t)) {
    const L = F.filter(x => dentro(x.r, per)), tot = L.reduce((s, x) => s + x.l, 0);
    return `<b>Recebido ${esc(emRot(per.rot))}</b>${f ? '\n' + f : ''}\n<b>${R.reais(tot)}</b> em ${L.length} nota(s)` + (L.length ? '\n' + linhaLista(L.map(x => `• ${R.br(x.r)} — NF ${esc(x.n || '—')} — ${R.reais(x.l)}${x.o && !obra ? ' <i>(' + esc(x.o) + ')</i>' : ''}`), 15) : '');
  }
  const L = F.filter(x => dentro(x.e, per)), tb = L.reduce((s, x) => s + x.b, 0), tl = L.reduce((s, x) => s + x.l, 0);
  return `<b>Notas emitidas ${esc(emRot(per.rot))}</b>${f ? '\n' + f : ''}\n<b>${R.reais(tb)}</b> bruto · ${R.reais(tl)} líquido · ${L.length} nota(s)` + (L.length ? '\n' + linhaLista(L.map(x => `• ${R.br(x.e)} — NF ${esc(x.n || '—')} — ${R.reais(x.b)}${x.r ? ' ✅' : ''}${x.o && !obra ? ' <i>(' + esc(x.o) + ')</i>' : ''}`), 15) : '');
}
function medicoes(t, D, hj, obra) {
  const p = periodoDe(t, hj, false);
  const L = D.medicoes.filter(m => (!obra || m.titulo_obra === obra) && dentro(R.iso(m.data_medicao), p)).sort((a, b) => R.iso(a.data_medicao).localeCompare(R.iso(b.data_medicao)));
  if (!L.length) return `Nenhuma medição${obra ? ' da obra ' + esc(obra) : ''}${p ? ' ' + esc(emRot(p.rot)) : ''}.`;
  const tot = L.reduce((s, m) => s + R.num(m.valor_total), 0);
  return `<b>Medições${obra ? ' — ' + esc(obra) : ''}${p ? ' ' + esc(emRot(p.rot)) : ''}</b>\n<b>${R.reais(tot)}</b> em ${L.length} medição(ões)\n` + linhaLista(L.map(m => `• Nº ${esc(m.numero || '—')} · ${R.br(R.iso(m.data_medicao))} · ${esc(m.status || '—')} — ${R.reais(R.num(m.valor_total))}${!obra ? ' <i>(' + esc(m.titulo_obra || '') + ')</i>' : ''}`), 15);
}
function diesel(t, D, hj, obra) {
  const p = periodoDe(t, hj, false) || mesIso(+hj.slice(0, 4), +hj.slice(5, 7));
  const L = D.planejamento.filter(x => x.tipo === 'abastecimento' && dentro(R.iso(x.data), p) && (!obra || x.titulo_obra === obra));
  const lt = L.reduce((s, x) => s + R.num(x.litros), 0), v = L.reduce((s, x) => s + R.num(x.valor), 0);
  return L.length ? `<b>Diesel ${esc(emRot(p.rot))}</b>${obra ? '\nobra ' + esc(obra) : ''}\n${lt.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} litros · <b>${R.reais(v)}</b> em ${L.length} abastecimento(s)` : `Nenhum abastecimento em ${esc(p.rot)}${obra ? ' na obra ' + esc(obra) : ''}.`;
}
function obraNumeros(D, obra) {
  const x = R.porObra(D).find(o => o.obra === obra);
  if (!x) return `Não achei números lançados para a obra ${esc(obra)}.`;
  return `<b>${esc(obra)}</b>\n` + [x.contrato ? `Contrato: ${R.reais(x.contrato)}` : '', x.medido ? `Medido (aprovado): ${R.reais(x.medido)}` : '', `Notas emitidas: ${R.reais(x.faturado)}`, `Recebido: ${R.reais(x.recebido)}`, `A receber: ${R.reais(Math.max(0, x.faturado - x.recebido))} (bruto)`, `Gasto (contas): ${R.reais(x.gasto)} · já pago ${R.reais(x.pago)}`, x.aportes ? `Aportes: ${R.reais(x.aportes)}` : ''].filter(Boolean).join('\n');
}
function documentos(D, hj) {
  const L = D.documentos.map(d => ({ v: R.iso(R.campo(d, 'data_validade')), t: [d.tipo, d.descricao].filter(Boolean).join(' — ') || 'Documento', o: d.titulo_obra || 'Empresa' })).filter(x => x.v && x.v <= R.somaDias(hj, 30)).sort((a, b) => a.v.localeCompare(b.v));
  return L.length ? '<b>Certidões e documentos vencidos ou vencendo (30 dias)</b>\n' + linhaLista(L.map(x => `• ${x.v < hj ? '⚠️ venceu' : 'vence'} ${R.br(x.v)} — ${esc(x.t)} <i>(${esc(x.o)})</i>`), 20) : 'Nenhuma certidão ou documento vencendo nos próximos 30 dias. ✅';
}
const EXEMPLOS = `Exemplos do que eu entendo:
• <i>quanto gastei na obra de Itarantim em outubro?</i>
• <i>contas que vencem esta semana</i> · <i>contas vencidas</i>
• <i>quanto paguei para a MJ Ferragens em 2026?</i>
• <i>aportes do mês</i> · <i>aportes do Vilson em 2026</i>
• <i>notas a receber</i> · <i>recebido em outubro</i> · <i>notas emitidas este mês</i>
• <i>medições da obra Potiraguá</i> · <i>números da obra Itarantim</i>
• <i>agenda da semana</i> · <i>tarefas atrasadas</i> · <i>certidões vencendo</i> · <i>diesel do mês</i>`;

/* responde a pergunta; devolve {html} ou null quando não entendeu */
function responder(texto, D, extra) {
  const t = sA(texto), hj = R.hojeBahia(), obra = obraDe(t, D), forn = fornecedorDe(t, D), socio = socioDe(t, D);
  const tem = re => re.test(t);
  if (tem(/\b(aport|socio|socios|devolucao de aporte|devolvi)/)) return aportes(t, D, hj, obra, socio);
  if (tem(/\b(diesel|abastec|combustivel|retro|retroescavadeira|maquina)/)) return diesel(t, D, hj, obra);
  if (tem(/\b(medicao|medicoes|medido|medida)/)) return medicoes(t, D, hj, obra);
  if (tem(/\b(nota|notas|nf|nfs|fatur|receb|a receber|emiti|emitida)/) && !tem(/\b(nota de compra|notas de compra)\b/)) return notas(t, D, hj, obra);
  if (tem(/\b(reuniao|reunioes|agenda|compromisso|compromissos|tarefa|tarefas|pendencia|pendencias)\b/) && extra && extra.agenda) return extra.agenda();
  if (tem(/\b(certid\w*|documento\w*|alvara\w*|licenc\w*|art)\b/)) return documentos(D, hj);
  if (tem(/\b(paguei|pago|pagos|pagas|pagamos|gastei|gasto|gastos|gastamos|custo|custos|despesa|despesas|comprei|compras)\b/) && !tem(/\b(a pagar|vence|vencem|vencer|vencid|boleto)/)) return gastos(t, D, hj, obra, forn);
  if (tem(/\b(conta|contas|boleto|boletos|vence|vencem|vencer|vencid\w*|atrasad\w*|a pagar|pagar)\b/)) return contas(t, D, hj, obra, forn);
  if (forn) return gastos(t, D, hj, obra, forn);
  if (obra) return obraNumeros(D, obra);
  return null;
}
module.exports = { responder, periodoDe, obraDe, fornecedorDe, EXEMPLOS };
