/* RELATÓRIOS E ALERTAS AUTOMÁTICOS (todos grátis) — chamados pela tarefa de 15 em 15 minutos (telegram.js › tick):
   - semanal(D, hj): o relatório dos sócios da semana passada (segunda a domingo) — texto para o Telegram, partes para
     o e-mail e o PDF (jsPDF no servidor);
   - caixa(D, hj): o fluxo de caixa dos próximos 15 dias a partir do saldo informado no Fluxo de caixa projetado
     (Planejamento 'caixa'/'atual') — avisa se o saldo vai ficar negativo;
   - cobrancas(D, hj, dias): as notas emitidas há "dias" ou mais sem recebimento, com o texto de cobrança pronto;
   - chuva(D, hj): a previsão do INMET para amanhã na cidade de cada obra em andamento — avisa quando é de chuva;
   - fechamento(D, hj): no dia 1º, o que falta fechar do mês que passou. */
const R = require('./_resumo');
const esc = R.escH;
const sA = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const dentro = (d, a, b) => !!d && d >= a && d <= b;
const soma = (L, k = 'valor') => L.reduce((s, x) => s + (+x[k] || 0), 0);
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
const agrupa = (L, k, v = 'valor') => { const m = {}; L.forEach(x => { const c = x[k] || '—'; m[c] = (m[c] || 0) + (+x[v] || 0); }); return m; };

// pagamentos (custos reais pagos + despesas pagas) e recebimentos, com data
function pagos(D) {
  return D.custos.filter(c => String(R.campo(c, 'tipo_de_custo', 'tipo_custo')).toLowerCase() === 'real' && R.iso(R.campo(c, 'data_pgto')))
    .map(c => ({ d: R.iso(R.campo(c, 'data_pgto')), forn: R.campo(c, 'fornecedor') || R.campo(c, 'descricao') || 'Conta', valor: R.num(R.campo(c, 'p_total', 'valor_total', 'valor')), obra: c.titulo_obra || '—' }))
    .concat(D.despesas.filter(d => /pago/i.test(String(d.status_pagamento || ''))).map(d => ({ d: R.iso(R.campo(d, 'data_pagamento', 'data_despesa')), forn: R.campo(d, 'fornecedor_beneficiario') || 'Despesa', valor: R.num(d.valor), obra: 'Empresa' })))
    .filter(x => x.d && x.valor);
}
function notasEmitidas(D) {
  return D.faturamentos.filter(f => R.iso(R.campo(f, 'emissao_nf')) && String(R.campo(f, 'n_nf')).trim() && !/previst/i.test(String(f.tipo_faturamento || '')))
    .map(f => ({ e: R.iso(R.campo(f, 'emissao_nf')), r: R.iso(f.data_recebimento), n: String(R.campo(f, 'n_nf')).trim(), bruto: R.num(f.faturamento_bruto), liq: R.num(f.faturamento_liquido) || R.num(f.faturamento_bruto), obra: f.titulo_obra || '', med: f.medicao_numero || '', uid: f.fat_uid || '' }));
}
// prazo médio (dias) entre a nota e o recebimento, por obra, no último ano (como o Fluxo projetado do sistema)
function prazos(D, hj) {
  const g = {}, um = R.somaDias(hj, -365);
  notasEmitidas(D).forEach(x => { if (!x.r || x.r > hj || x.r < um || x.r < x.e) return; (g[x.obra] = g[x.obra] || []).push(R.diasEntre(x.e, x.r)); });
  const m = {}; Object.entries(g).forEach(([o, a]) => { if (a.length >= 2) m[o] = Math.max(5, Math.min(120, Math.round(a.reduce((s, x) => s + x, 0) / a.length))); });
  return o => m[o] || 30;
}
const contratanteDe = (D, obra) => { const c = D.contratos.find(x => x.titulo_obra === obra); return (c && c.contratante) || ''; };

/* ── relatório semanal dos sócios ── */
function semanal(D, hj) {
  const seg = R.somaDias(hj, -(((new Date(hj + 'T12:00:00Z').getUTCDay()) + 6) % 7)), ini = R.somaDias(seg, -7), fim = R.somaDias(seg, -1);
  const proxIni = seg, proxFim = R.somaDias(seg, 6), rot = `${R.br(ini)} a ${R.brAno(fim)}`;
  const P = pagos(D).filter(x => dentro(x.d, ini, fim)), N = notasEmitidas(D);
  const rec = N.filter(x => dentro(x.r, ini, fim)), emi = N.filter(x => dentro(x.e, ini, fim)), aRec = N.filter(x => !x.r);
  const med = D.medicoes.filter(m => dentro(R.iso(m.data_medicao), ini, fim) || dentro(R.iso(m.data_aprovacao), ini, fim));
  const ap = D.aportes.map(a => ({ d: R.iso(R.campo(a, 'data_aporte', 'data')), q: R.campo(a, 'quem_aportou', 'socio') || 'Sócio', v: R.valorAporte(a) })).filter(a => dentro(a.d, ini, fim));
  const abertas = R.contasAbertas(D, hj), venc = abertas.filter(x => x.v < hj), prox = abertas.filter(x => dentro(x.v, proxIni, proxFim)).sort((a, b) => a.v.localeCompare(b.v));
  const atr = D.acoes.filter(t => R.tarefaAberta(t) && R.iso(t.quando) && R.iso(t.quando) < hj).length;
  const caixaRow = D.planejamento.filter(p => p.tipo === 'caixa' && p.mes === 'atual').sort((a, b) => (b._id || 0) - (a._id || 0))[0];
  const totP = soma(P), totR = soma(rec, 'liq'), apE = ap.filter(a => a.v > 0), apD = ap.filter(a => a.v < 0);
  const linhas = (L, f, n = 10) => L.slice(0, n).map(f).join('\n') + (L.length > n ? `\n• … e mais ${L.length - n}` : '');
  const partes = [
    ['Caixa da semana', `Recebido: ${R.reais(totR)} (${rec.length} nota${rec.length !== 1 ? 's' : ''})\nPago: ${R.reais(totP)} (${P.length} lançamento${P.length !== 1 ? 's' : ''})\nResultado da semana: ${R.reais(totR - totP)}${caixaRow ? `\nSaldo informado no sistema: ${R.reais(R.num(caixaRow.saldo))} em ${R.brAno(R.iso(caixaRow.data))}` : ''}`],
    ['Quem mais recebeu (pagamentos da semana)', P.length ? linhas(top(agrupa(P, 'forn'), 8), ([n, v]) => `• ${n} — ${R.reais(v)}`) : 'Nenhum pagamento na semana.'],
    ['Gasto da semana por obra', P.length ? linhas(top(agrupa(P, 'obra'), 10), ([n, v]) => `• ${n} — ${R.reais(v)}`) : '—'],
    ['Notas emitidas e medições', `Notas emitidas: ${emi.length} · ${R.reais(soma(emi, 'bruto'))} bruto${emi.length ? '\n' + linhas(emi, x => `• NF ${x.n} — ${x.obra} — ${R.reais(x.bruto)}`) : ''}\nMedições na semana: ${med.length}${med.length ? '\n' + linhas(med, m => `• ${m.titulo_obra} — nº ${m.numero || '—'} — ${m.status || '—'} — ${R.reais(R.num(m.valor_total))}`) : ''}`],
    ['Aportes da semana', apE.length || apD.length ? (apE.length ? linhas(top(agrupa(apE, 'q', 'v'), 8), ([n, v]) => `• ${n} — ${R.reais(v)}`) : 'Nenhum aporte.') + (apD.length ? `\nDevolvido aos sócios: ${R.reais(-soma(apD, 'v'))}` : '') : 'Nenhum aporte na semana.'],
    ['Esta semana: contas a pagar', prox.length ? `${prox.length} conta(s) · ${R.reais(soma(prox))}\n` + linhas(prox, x => `• ${R.br(x.v)} — ${x.forn} — ${R.reais(x.valor)}${x.onde ? ' (' + x.onde + ')' : ''}`, 12) : 'Nenhuma conta para esta semana.'],
    ['Em aberto', `Contas vencidas: ${venc.length} · ${R.reais(soma(venc))}\nNotas a receber: ${aRec.length} · ${R.reais(soma(aRec, 'liq'))} (líquido)\nTarefas atrasadas: ${atr}`],
    ['Números das obras (acumulado)', linhas(R.porObra(D), x => `• ${x.obra} — contrato ${R.reais(x.contrato)} · medido ${R.reais(x.medido)} · recebido ${R.reais(x.recebido)} · gasto ${R.reais(x.gasto)}`, 12)]
  ];
  const titulo = `Relatório semanal dos sócios — ${rot}`;
  const tg = `📊 <b>Relatório semanal — ${esc(rot)}</b>\nRecebido ${R.reais(totR)} · Pago ${R.reais(totP)} · Resultado <b>${R.reais(totR - totP)}</b>\nNotas emitidas: ${emi.length} (${R.reais(soma(emi, 'bruto'))}) · Aportes: ${R.reais(soma(apE, 'v'))}\nEsta semana: ${prox.length} conta(s) a pagar · ${R.reais(soma(prox))}\nEm aberto: vencidas ${R.reais(soma(venc))} · a receber ${R.reais(soma(aRec, 'liq'))}\n<i>O relatório completo está no PDF.</i>`;
  return { titulo, rot, partes, tg, arquivo: `Relatorio semanal Vixsul ${ini} a ${fim}.pdf` };
}

/* ── PDF (jsPDF no servidor; fontes padrão, só caracteres latinos) ── */
let JS = null;
const jspdf = () => { if (!JS) { const m = require('jspdf'); JS = m.jsPDF || (m.default && m.default.jsPDF) || m.default || m; } return JS; };
function pdfDePartes(titulo, sub, partes) {
  const doc = new (jspdf())({ unit: 'mm', format: 'a4' }), X = 12, W = 186, L1 = s => String(s == null ? '' : s).replace(/[—–]/g, '-').replace(/•/g, '-').replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
  let y = 12;
  const nova = () => { doc.addPage(); y = 14; };
  doc.setFillColor(10, 10, 82); doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(L1(titulo), X, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(L1(sub), X, 19); y = 34;
  for (const [t, txt] of partes) {
    const linhas = String(txt || '').split('\n').filter(Boolean);
    if (y > 262) nova();
    doc.setFillColor(238, 244, 255); doc.rect(X, y - 4.5, W, 7, 'F'); doc.setTextColor(16, 24, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(L1(t), X + 2, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(52, 64, 84);
    for (const l of linhas) {
      const ls = doc.splitTextToSize(L1(l), W - 6);
      for (const s of ls) { if (y > 284) nova(); doc.text(s, X + 3, y); y += 4.6; }
    }
    y += 4;
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(L1(`Vixsul Empreendimentos · gerado pelo sistema de gestão em ${R.brAno(R.hojeBahia())} · página ${i} de ${n}`), 105, 292, { align: 'center' }); }
  return Buffer.from(doc.output('arraybuffer'));
}

/* ── alerta de caixa: os próximos 15 dias a partir do saldo informado ── */
function caixa(D, hj, nDias = 15) {
  const row = D.planejamento.filter(p => p.tipo === 'caixa' && p.mes === 'atual').sort((a, b) => (b._id || 0) - (a._id || 0))[0];
  if (!row || row.saldo == null || row.saldo === '') return null;
  const s0 = R.num(row.saldo), fimP = R.somaDias(hj, nDias), prz = prazos(D, hj), dia = {};
  const add = (d, v, item) => { const k = d < hj ? hj : d; (dia[k] = dia[k] || { v: 0, itens: [] }).v += v; if (item) dia[k].itens.push(item); };
  R.contasAbertas(D, hj).filter(x => x.v <= fimP).forEach(x => add(x.v, -x.valor, x));              // vencidas entram hoje
  notasEmitidas(D).filter(x => !x.r).forEach(x => { const d = R.somaDias(x.e, prz(x.obra)); if (d >= hj && d <= fimP) add(d, x.liq); });   // atrasadas ficam fora (como no sistema)
  let s = s0, min = s0, dMin = hj, neg = null;
  for (let i = 0; i <= nDias; i++) { const d = R.somaDias(hj, i); s += (dia[d] || { v: 0 }).v; if (s < min) { min = s; dMin = d; } if (s < 0 && !neg) neg = d; }
  const saidas = Object.entries(dia).filter(([d]) => !neg || d <= neg).flatMap(([, x]) => x.itens).sort((a, b) => b.valor - a.valor).slice(0, 3);
  return { saldo: s0, dataSaldo: R.iso(row.data), min, dMin, neg, fim: s, saidas };
}

/* ── cobrança: notas emitidas há "dias" ou mais sem recebimento ── */
function cobrancas(D, hj, dias) {
  return notasEmitidas(D).filter(x => !x.r && R.diasEntre(x.e, hj) >= dias).sort((a, b) => a.e.localeCompare(b.e)).map(x => {
    const ct = contratanteDe(D, x.obra), d = R.diasEntre(x.e, hj);
    const texto = `Prezados${ct ? ' (' + ct + ')' : ''}, bom dia.\n\nConsta em aberto a Nota Fiscal nº ${x.n}, emitida em ${R.brAno(x.e)}, no valor de ${R.reais(x.bruto)}${x.liq && Math.abs(x.liq - x.bruto) > 0.01 ? ' (líquido ' + R.reais(x.liq) + ')' : ''}${x.med ? ', referente à medição nº ' + x.med : ''}${x.obra ? ' da obra ' + x.obra : ''}.\n\nPoderiam, por gentileza, informar a previsão de pagamento?\n\nAtenciosamente,\nVixsul Empreendimentos`;
    return { chave: x.uid || (x.obra + '|' + x.n), x, dias: d, contratante: ct, texto };
  });
}

/* ── chuva amanhã: INMET (grátis) pela cidade da obra; o código do IBGE vem da lista do IBGE ── */
let IBGE = null;
async function codIbge(cidade) {
  const s = sA(cidade).replace(/\s*[,\-\/]\s*([a-z]{2})$/, ', $1'), k = /, [a-z]{2}$/.test(s) ? s : s + ', ba', uf = k.slice(-2);
  if (!IBGE) IBGE = {};
  if (!IBGE[uf]) {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toUpperCase()}/municipios`);
    if (!r.ok) return '';
    const m = {}; (await r.json()).forEach(x => { m[sA(x.nome) + ', ' + uf] = String(x.id); }); IBGE[uf] = m;
  }
  return IBGE[uf][k] || '';
}
const chuvoso = t => { t = sA(t); return /(chuv|garoa|chuvisco|pancada|temporal|tempestade|trovoada)/.test(t) && !/sem chuva/.test(t); };
const forte = t => /temporal|tempestade|trovoada|chuvas? fortes?|forte/.test(sA(t));
async function chuva(D, hj) {
  const amanha = R.somaDias(hj, 1), dAm = `${amanha.slice(8, 10)}/${amanha.slice(5, 7)}/${amanha.slice(0, 4)}`;
  const ativas = D.obras.filter(o => /andamento|execu/i.test(String(R.campo(o, 'status_obra', 'status_proposta', 'status'))) || o.diario_auto === 'sim');
  const porCidade = {};
  ativas.forEach(o => { const nome = o.titulo_obra || o.nome_obra; const c = R.campo(o, 'cidade_obra', 'cidade') || (D.contratos.find(x => x.titulo_obra === nome) || {}).cidade_obra; if (nome && c) (porCidade[c] = porCidade[c] || []).push(nome); });
  const out = [];
  for (const [cid, obras] of Object.entries(porCidade)) {
    try {
      const cod = await codIbge(cid); if (!cod) continue;
      const r = await fetch('https://apiprevmet3.inmet.gov.br/previsao/' + cod); if (!r.ok) continue;
      const j = await r.json(), v = ((j && j[cod]) || {})[dAm]; if (!v) continue;
      const m = (v.manha && v.manha.resumo) || v.resumo || '', t = (v.tarde && v.tarde.resumo) || v.resumo || '', n = (v.noite && v.noite.resumo) || '';
      if (chuvoso(m) || chuvoso(t)) out.push({ cidade: cid, obras, manha: m, tarde: t, noite: n, forte: forte(m) || forte(t), amanha });
    } catch (e) { /* uma cidade sem previsão não atrapalha as outras */ }
  }
  return out;
}

/* ── fechamento do mês (no dia 1º, sobre o mês que passou) ── */
function fechamento(D, hj) {
  const a = +hj.slice(0, 4), m = +hj.slice(5, 7), am = m === 1 ? a - 1 : a, mm = m === 1 ? 12 : m - 1;
  const ini = `${am}-${String(mm).padStart(2, '0')}-01`, fim = new Date(Date.UTC(am, mm, 0)).toISOString().slice(0, 10), rot = `${R.MESES[mm - 1]} de ${am}`;
  const abertas = R.contasAbertas(D, hj).filter(x => dentro(x.v, ini, fim)), N = notasEmitidas(D);
  const emi = N.filter(x => dentro(x.e, ini, fim)), semRec = emi.filter(x => !x.r);
  const lig = new Set(D.faturamentos.map(f => String(f.medicao_rowid || '')).filter(Boolean));
  const medSemNota = D.medicoes.filter(x => /aprovad/i.test(String(x.status || '')) && !lig.has(String(x._id)));
  const recebidas = D.planejamento.filter(p => p.tipo === 'nota_recebida' && p.situacao !== 'cancelada' && dentro(R.iso(p.data_emissao), ini, fim));
  const P = pagos(D).filter(x => dentro(x.d, ini, fim)), rec = N.filter(x => dentro(x.r, ini, fim));
  const ap = D.aportes.map(x => ({ d: R.iso(R.campo(x, 'data_aporte', 'data')), v: R.valorAporte(x) })).filter(x => dentro(x.d, ini, fim) && x.v > 0);
  // diário: dias de segunda a sábado do mês sem registro, nas obras com diário automático
  const auto = D.obras.filter(o => o.diario_auto === 'sim').map(o => o.titulo_obra || o.nome_obra).filter(Boolean), faltaDiario = [];
  auto.forEach(ob => { let n = 0; for (let d = ini; d <= fim; d = R.somaDias(d, 1)) { if (new Date(d + 'T12:00:00Z').getUTCDay() === 0) continue; if (!D.diario_obra.some(r => r.titulo_obra === ob && R.iso(r.data) === d && !(r.auto === 'sim' && !r.preenchido_em))) n++; } if (n) faltaDiario.push(`• ${ob} — ${n} dia(s) sem diário preenchido`); });
  const L = (arr, f, n = 10) => arr.slice(0, n).map(f).join('\n') + (arr.length > n ? `\n• … e mais ${arr.length - n}` : '');
  const partes = [
    ['Contas do mês ainda em aberto', abertas.length ? `${abertas.length} conta(s) · ${R.reais(soma(abertas))} — pague ou dê baixa\n` + L(abertas.sort((x, y) => x.v.localeCompare(y.v)), x => `• ${R.br(x.v)} — ${x.forn} — ${R.reais(x.valor)}`) : '✓ Nenhuma.'],
    ['Notas emitidas no mês sem recebimento', semRec.length ? `${semRec.length} nota(s) · ${R.reais(soma(semRec, 'liq'))} (líquido)\n` + L(semRec, x => `• NF ${x.n} — ${x.obra} — ${R.reais(x.bruto)}`) : '✓ Todas recebidas.'],
    ['Medições aprovadas ainda sem nota', medSemNota.length ? `${medSemNota.length} medição(ões) · ${R.reais(soma(medSemNota.map(x => ({ valor: R.num(x.valor_total) }))))} — emita a nota\n` + L(medSemNota, x => `• ${x.titulo_obra} — nº ${x.numero || '—'} — ${R.reais(R.num(x.valor_total))}`) : '✓ Nenhuma.'],
    ['Diário de obra', faltaDiario.length ? faltaDiario.join('\n') : '✓ Em dia nas obras com diário automático.'],
    ['Para a contabilidade', `Notas recebidas no mês: ${recebidas.length} · ${R.reais(soma(recebidas.map(x => ({ valor: R.num(x.valor) }))))}\nNotas emitidas no mês: ${emi.length} · ${R.reais(soma(emi, 'bruto'))} bruto\nPDF e XML: Documentos e certidões › Notas fiscais (escolha ${rot} e clique em "Baixar todas").`],
    ['Resumo do mês', `Pago: ${R.reais(soma(P))} · Recebido: ${R.reais(soma(rec, 'liq'))} · Aportes: ${R.reais(soma(ap, 'v'))}\nConfira também a conciliação do extrato do mês (Financeiro › Conciliação bancária).`]
  ];
  const pend = abertas.length + semRec.length + medSemNota.length + faltaDiario.length;
  const tg = `🗓️ <b>Fechamento de ${esc(rot)}</b>\n` + (pend ? `${pend} ponto(s) para fechar:\n` : 'Tudo fechado — só conferir a conciliação.\n') +
    [abertas.length ? `• ${abertas.length} conta(s) do mês em aberto (${R.reais(soma(abertas))})` : '', semRec.length ? `• ${semRec.length} nota(s) emitida(s) sem recebimento (${R.reais(soma(semRec, 'liq'))})` : '', medSemNota.length ? `• ${medSemNota.length} medição(ões) aprovada(s) sem nota` : '', faltaDiario.length ? `• diário: ${faltaDiario.length} obra(s) com dias sem preencher` : ''].filter(Boolean).map(esc).join('\n') +
    `\n\nPara a contabilidade: ${recebidas.length} nota(s) recebida(s) e ${emi.length} emitida(s) — Documentos e certidões › Notas fiscais.`;
  return { titulo: `Fechamento de ${rot}`, rot, mes: `${am}-${String(mm).padStart(2, '0')}`, partes, tg };
}

module.exports = { semanal, pdfDePartes, caixa, cobrancas, chuva, fechamento };
