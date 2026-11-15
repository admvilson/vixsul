/* TESTE DO ROBÔ DO TELEGRAM — roda no Node (máquina do GitHub: workflow "Teste do robô"), com dados de mentira:
   o banco (Supabase), o Telegram, a Groq e a BrasilAPI são simulados aqui dentro. Nada sai para a internet.
   Uso: node ferramentas/teste-robo.js   (precisa de "npm install" e do pacote "qrcode" só para o teste) */
'use strict';
const crypto = require('crypto');
const TOKEN = '123456:teste-do-robo';
Object.assign(process.env, { TELEGRAM_BOT_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: 'chave-de-teste', SUPABASE_URL: 'https://sb.teste', GROQ_API_KEY: 'gsk_teste', SUPABASE_JWT_SECRET: 'segredo-de-teste' });
const SB = 'https://sb.teste';

// ── banco de mentira (PostgREST: select com apelidos, filtros eq/in/like/ilike/lt, order, limit, offset, Range) ──
const DB = {}; let seq = 1;
['custos', 'despesas', 'planejamento', 'obras', 'orcamentos', 'fornecedores', 'faturamentos', 'arquivos', 'acoes', 'reunioes', 'documentos', 'diario_obra', 'aportes', 'contratos', 'medicoes'].forEach(t => { DB[t] = []; });
const add = (t, row) => { const id = seq++; DB[t].push({ id, row_data: JSON.parse(JSON.stringify(row)) }); return id; };
const STORAGE = {};
const resp = (st, corpo, tipo) => new Response(corpo == null ? null : corpo, { status: st, headers: { 'Content-Type': tipo || 'application/json' } });
const json = (st, o) => resp(st, JSON.stringify(o));
function rest(url, metodo, op) {
  const u = new URL(url), t = decodeURIComponent(u.pathname.split('/rest/v1/')[1]), P = u.searchParams;
  if (!DB[t]) return json(404, { message: 'relation does not exist' });
  const filtros = [...P].filter(([k]) => !['select', 'order', 'limit', 'offset'].includes(k));
  const valDe = (r, k) => { if (k === 'id') return String(r.id); const m = k.match(/^row_data->>(.+)$/); if (!m) throw new Error('campo de filtro desconhecido: ' + k); const x = r.row_data[m[1]]; return x == null ? null : typeof x === 'object' ? JSON.stringify(x) : String(x); };
  const passa = r => filtros.every(([k, v]) => {
    const x = valDe(r, k), i = v.indexOf('.'), o = v.slice(0, i), val = v.slice(i + 1);
    if (o === 'eq') return x != null && x === val;
    if (o === 'in') return x != null && val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(x);
    if (o === 'like' || o === 'ilike') return x != null && new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', o === 'ilike' ? 'i' : '').test(x);
    if (o === 'lt') return x != null && x < val;
    throw new Error('filtro não suportado: ' + k + '=' + v);
  });
  const h = op.headers || {}, corpo = op.body ? JSON.parse(op.body) : null;
  if (metodo === 'POST') { const id = add(t, corpo.row_data); const lin = DB[t].find(r => r.id === id); return /representation/.test(h.Prefer || '') ? json(201, [lin]) : resp(201, null); }
  const L = DB[t].filter(passa);
  if (metodo === 'PATCH') { L.forEach(r => { r.row_data = JSON.parse(JSON.stringify(corpo.row_data)); }); return resp(204, null); }
  if (metodo === 'DELETE') { DB[t] = DB[t].filter(r => !L.includes(r)); return resp(204, null); }
  let R = L.slice(); const ord = P.get('order') || ''; if (/id\.desc/.test(ord)) R.sort((a, b) => b.id - a.id); else R.sort((a, b) => a.id - b.id);
  let ini = +(P.get('offset') || 0), lim = P.get('limit') ? +P.get('limit') : Infinity;
  if (h.Range) { const m = String(h.Range).match(/(\d+)-(\d+)/); if (m) { ini = +m[1]; lim = +m[2] - +m[1] + 1; } }
  R = R.slice(ini, ini + lim);
  const sel = (P.get('select') || '*').split(',');
  return json(200, R.map(r => { if (sel[0] === '*') return r; const o = {}; sel.forEach(s => { const [ap, cam] = s.includes(':') ? s.split(':') : [s, s]; if (cam === 'id') o[ap] = r.id; else if (cam === 'row_data') o[ap] = r.row_data; else { const m = cam.match(/^row_data->>(.+)$/); const x = m ? r.row_data[m[1]] : undefined; o[ap] = x == null ? null : typeof x === 'object' ? JSON.stringify(x) : String(x); } }); return o; }));
}
// ── Telegram de mentira: guarda tudo o que o robô mandou ──
const CALLS = [], ARQS = {}; let msgId = 1000;
async function telegram(url, op) {
  const m = url.split('/').pop(); let b = {};
  if (op.body instanceof FormData) { for (const [k, v] of op.body.entries()) b[k] = typeof v === 'string' ? v : { nome: v.name, tipo: v.type, tam: v.size, texto: Buffer.from(await v.arrayBuffer()).toString('utf8').slice(0, 300) }; }
  else if (op.body) b = JSON.parse(op.body);
  let r = true;
  if (m === 'sendMessage' || m === 'sendDocument') r = { message_id: ++msgId, chat: { id: b.chat_id } };
  if (m === 'editMessageText') r = { message_id: b.message_id };
  if (m === 'getFile') { const a = ARQS[b.file_id]; if (!a) return json(400, { ok: false, description: 'arquivo não existe' }); r = { file_id: b.file_id, file_path: a.caminho, file_size: a.buf.length }; }
  CALLS.push({ m, b, r });
  return json(200, { ok: true, result: r });
}
// ── Groq de mentira: as respostas que cada teste quer ──
const GROQ = { transcricao: '', intencao: {}, visao: {} }, GROQ_CHAMADAS = [];
async function groq(url, op) {
  if (url.endsWith('/audio/transcriptions')) { GROQ_CHAMADAS.push('audio'); return json(200, { text: GROQ.transcricao }); }
  const b = JSON.parse(op.body), foto = Array.isArray(b.messages[b.messages.length - 1].content);
  GROQ_CHAMADAS.push(foto ? 'foto:' + b.model : 'texto:' + b.model);
  return json(200, { choices: [{ message: { content: JSON.stringify(foto ? GROQ.visao : GROQ.intencao) } }] });
}
global.fetch = async (url, op = {}) => {
  url = String(url); const metodo = String(op.method || 'GET').toUpperCase();
  if (url.startsWith(SB + '/rest/v1/')) return rest(url, metodo, op);
  if (url.startsWith(SB + '/storage/v1/object/list/')) { const pre = JSON.parse(op.body).prefix + '/'; return json(200, Object.keys(STORAGE).filter(k => k.startsWith(pre)).map(k => ({ id: 'x' + k, name: k.slice(pre.length) }))); }
  if (url.startsWith(SB + '/storage/v1/object/')) { const k = url.split('/storage/v1/object/anexos/')[1]; return STORAGE[k] ? resp(200, STORAGE[k], 'application/octet-stream') : json(404, {}); }
  if (url.startsWith(`https://api.telegram.org/file/bot${TOKEN}/`)) { const c = url.split(`/file/bot${TOKEN}/`)[1], a = Object.values(ARQS).find(x => x.caminho === c); return a ? resp(200, a.buf, 'application/octet-stream') : json(404, {}); }
  if (url.startsWith('https://api.telegram.org/bot')) return telegram(url, op);
  if (url.startsWith('https://api.groq.com/')) return groq(url, op);
  if (url.startsWith('https://brasilapi.com.br/')) return json(200, { razao_social: 'MADEIREIRA SAO JOSE LTDA' });
  return json(404, { erro: 'sem internet no teste: ' + url });
};

// ── conferência ──
let falhas = 0, passos = 0;
const ok = (c, msg) => { passos++; if (c) console.log('  ok  ' + msg); else { falhas++; console.log('  FALHOU  ' + msg); } };
const R = require('../api/_resumo');
const hj = R.hojeBahia(), em = n => R.somaDias(hj, n);
const B = require('../api/_bot'), T = B.teste;
const ultimoTexto = () => { for (let i = CALLS.length - 1; i >= 0; i--) if (CALLS[i].m === 'sendMessage' || CALLS[i].m === 'editMessageText') return CALLS[i].b.text || ''; return ''; };
const textos = n => CALLS.slice(-n).filter(c => c.m === 'sendMessage' || c.m === 'editMessageText').map(c => c.b.text || '').join('\n---\n');
function ultimoCartao() { for (let i = CALLS.length - 1; i >= 0; i--) { const c = CALLS[i]; if ((c.m === 'sendMessage' || c.m === 'editMessageText') && c.b.reply_markup && (c.b.reply_markup.inline_keyboard || []).length) return c; } return null; }

(async () => {
  // ─────────── 1) as leituras (sem banco) ───────────
  console.log('\n1) leitura de frases, números, datas e códigos');
  ok(T.numBR('1.234,56') === 1234.56 && T.numBR('1.500') === 1500 && T.numBR('12.5') === 12.5 && T.numBR('350') === 350 && T.numBR('1,50') === 1.5 && T.numBR('1,234.56') === 1234.56, 'números em português (1.234,56 · 1.500 · 12.5 · 1,50)');
  ok(T.valorDe('lança 350 de cimento dia 20').valor === 350, 'valor solto (não pega o "dia 20")');
  ok(T.valorDe('paguei R$ 1.250,90 da nota 123').valor === 1250.9, 'valor com R$ (não pega o nº da nota)');
  ok(T.valorDe('trezentos e cinquenta reais de areia').valor === 350, 'valor por extenso (áudio)');
  ok(T.valorDe('10 sacos de cimento por 420 reais').valor === 420, 'quantidade não vira valor');
  ok(T.valorDe('dois mil e quinhentos reais').valor === 2500 && T.valorDe('1,5 mil reais').valor === 1500, '"dois mil e quinhentos" e "1,5 mil"');
  ok(T.dataDe(' amanhã ', hj, 'futuro').dia === em(1) && T.dataDe(' ontem ', hj, 'passado').dia === em(-1), 'amanhã / ontem');
  const d20 = T.dataDe(' vence 20/12 ', hj, 'futuro').dia; ok(d20 && d20.endsWith('-12-20'), '20/12 → ' + d20);
  ok(T.horaDe(' às 14h30 ').hora === '14:30' && T.horaDe(' 9h ').hora === '09:00', 'horas (14h30, 9h)');
  ok(T.formaDe(' no pix ').forma === 'PIX' && T.formaDe(' no débito ').forma === 'Cartão de Débito' && T.formaDe(' boleto ').forma === 'Boleto', 'formas de pagamento');
  const OB = [{ nome: 'SES ITARANTIM', fase: 'execucao', cidade: 'Itarantim' }, { nome: 'ESCOLA ITAPETINGA', fase: 'execucao', cidade: 'Itapetinga' }];
  let f = T.lerFrase('lança 350 de cimento na obra de itarantim fornecedor casa do construtor vence dia 28 boleto', OB, hj);
  ok(f.valor === 350 && f.obra === 'SES ITARANTIM' && f.forn === 'CASA DO CONSTRUTOR' && f.desc === 'Cimento' && f.forma === 'Boleto' && /-28$/.test(f.venc || ''), 'frase completa: ' + JSON.stringify(f));
  f = T.lerFrase('paguei 120 de gasolina no pix, empresa', OB, hj);
  ok(f.valor === 120 && f.pago === hj && f.onde === 'empresa' && f.forma === 'PIX' && f.desc === 'Gasolina', 'empresa paga: ' + JSON.stringify(f));
  f = T.lerFrase('lança 1.000,00 de aluguel de container ratear entre itarantim e itapetinga, vence dia 28', OB, hj);
  ok(f.onde === 'rateio' && (f.obras || []).length === 2 && f.valor === 1000 && f.desc === 'Aluguel de container', 'rateio: ' + JSON.stringify(f));
  ok(T.chutarCat('Aluguel de container', false) === 'Equipamentos e locações' && T.chutarCat('Diária de pedreiro', false) === 'Mão de obra' && T.chutarCat('Cimento', false) === 'Materiais', 'categoria das obras');
  ok(T.chutarCat('Papel sulfite', true) === 'Material de Escritório' && T.chutarCat('Conta de luz', true) === 'Água, Luz e Internet' && T.chutarCat('Internet', true) === 'Água, Luz e Internet', 'categoria da empresa');
  ok(T.intencao('lança 350 de cimento') === 'conta' && T.intencao('paguei 120 de gasolina') === 'conta' && T.intencao('busca a nota 1234') === 'nota' && T.intencao('criar tarefa ligar pro fiscal') === 'tarefa' && T.intencao('marcar reunião amanhã') === 'reuniao' && T.intencao('quanto gastei em outubro?') === '', 'o que a pessoa quer (intenção)');
  // boleto: linha digitável montada com os dígitos de controle certos
  const mod10 = s => { let soma = 0, p = 2; for (let i = s.length - 1; i >= 0; i--) { let n = +s[i] * p; if (n > 9) n -= 9; soma += n; p = p === 2 ? 1 : 2; } return (10 - soma % 10) % 10; };
  const mod11b = s => { let soma = 0, p = 2; for (let i = s.length - 1; i >= 0; i--) { soma += +s[i] * p; p = p === 9 ? 2 : p + 1; } const d = 11 - soma % 11; return d === 0 || d === 10 || d === 11 ? 1 : d; };
  const linhaBoleto = (valor, venc) => {
    const fator = String(R.diasEntre('2025-02-22', venc) + 1000).padStart(4, '0'), v = String(Math.round(valor * 100)).padStart(10, '0'), livre = '1234567890123456789012345';
    const sem = '3419' + fator + v + livre, barra = sem.slice(0, 4) + mod11b(sem) + sem.slice(4);
    const c1 = barra.slice(0, 4) + livre.slice(0, 5), c2 = livre.slice(5, 15), c3 = livre.slice(15, 25);
    return `${c1.slice(0, 5)}.${c1.slice(5)}${mod10(c1)} ${c2.slice(0, 5)}.${c2.slice(5)}${mod10(c2)} ${c3.slice(0, 5)}.${c3.slice(5)}${mod10(c3)} ${barra[4]} ${fator}${v}`;
  };
  const lin = linhaBoleto(1234.56, em(15)), bol = T.acharBoleto('Pague até o vencimento\n' + lin + '\n');
  ok(bol && bol.valor === 1234.56 && bol.venc === em(15), 'linha digitável do boleto: ' + JSON.stringify(bol));
  ok(!T.boletoDe(lin.replace(/\D/g, '').replace(/^(\d{10})\d/, '$1' + '7')), 'linha com dígito errado não vale');
  // PIX copia e cola (com o CRC certo)
  const tl = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const pixSem = tl('00', '01') + tl('26', tl('00', 'br.gov.bcb.pix') + tl('01', 'joao@exemplo.com')) + tl('52', '0000') + tl('53', '986') + tl('54', '120.50') + tl('58', 'BR') + tl('59', 'JOAO DA SILVA') + tl('60', 'ITARANTIM') + tl('62', tl('05', '***')) + '6304';
  const PIX = pixSem + T.crc16(pixSem), px = T.lerPix(PIX);
  ok(px && px.valor === 120.5 && px.forn === 'JOAO DA SILVA' && px.crcOk, 'PIX copia e cola: ' + JSON.stringify(px));
  // chave da NF-e
  const chaveSem = '29' + '2611' + '11222333000181' + '55' + '001' + '000005678' + '1' + '12345678';
  const dvNfe = (() => { let soma = 0, p = 2; for (let i = chaveSem.length - 1; i >= 0; i--) { soma += +chaveSem[i] * p; p = p === 9 ? 2 : p + 1; } const r = soma % 11; return r < 2 ? 0 : 11 - r; })(), CHAVE = chaveSem + dvNfe;
  ok(T.chaveOk(CHAVE) && T.acharChave('Chave de acesso\n' + CHAVE.replace(/(\d{4})/g, '$1 ')) === CHAVE, 'chave de acesso da NF-e');
  ok(T.cnpjOk('11222333000181') && T.cnpjOk('12345678000195') && !T.cnpjOk('12345678000196'), 'CNPJ conferido pelos dígitos');
  ok(T.lerCodigo(CHAVE).nota === CHAVE && T.lerCodigo(lin).d.valor === 1234.56 && T.lerCodigo(PIX).d.valor === 120.5, 'código colado (chave, boleto, PIX)');
  const XML = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CHAVE}" versao="4.00"><ide><cUF>29</cUF><mod>55</mod><nNF>5678</nNF><dhEmi>2026-11-12T10:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ><xNome>CASA DO CONSTRUTOR LTDA</xNome></emit><dest><CNPJ>64518375000120</CNPJ><xNome>VIXSUL</xNome></dest><det nItem="1"><prod><xProd>CIMENTO CP II 50KG</xProd></prod></det><det nItem="2"><prod><xProd>AREIA MEDIA</xProd></prod></det><total><ICMSTot><vNF>3000.00</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>${em(25)}</dVenc><vDup>1000.00</vDup></dup><dup><nDup>002</nDup><dVenc>${em(55)}</dVenc><vDup>1000.00</vDup></dup><dup><nDup>003</nDup><dVenc>${em(85)}</dVenc><vDup>1000.00</vDup></dup></cobr></infNFe></NFe></nfeProc>`;
  const nx = T.lerXml(XML);
  ok(nx.tipo === 'nfe' && nx.forn === 'CASA DO CONSTRUTOR LTDA' && nx.valor === 3000 && nx.parcelas.length === 3 && nx.numero === '5678' && nx.chave === CHAVE, 'XML da NF-e com 3 parcelas');
  // PDF de boleto (texto) e foto com QR do PIX: as bibliotecas de verdade
  const { jsPDF } = require('jspdf'); const doc = new jsPDF(); doc.setFontSize(10);
  doc.text('Beneficiario: MADEIREIRA SAO JOSE LTDA  CNPJ 12.345.678/0001-95', 10, 20); doc.text('Vencimento: ' + R.brAno(em(15)), 10, 30); doc.text(lin, 10, 40);
  const PDF = Buffer.from(doc.output('arraybuffer')), txtPdf = await T.textoPdf(PDF), lp = T.lerTextoDoc(txtPdf);
  ok(lp.valor === 1234.56 && lp.venc === em(15) && lp.forn === 'MADEIREIRA SAO JOSE LTDA' && lp.cnpj === '12345678000195', 'PDF do boleto (pdf-parse): ' + JSON.stringify(lp));
  const QR = require('qrcode'), png = await QR.toBuffer(PIX, { type: 'png', margin: 4, scale: 6 });
  const { PNG } = require('pngjs'), pp = PNG.sync.read(png), JPG = Buffer.from(require('jpeg-js').encode({ data: pp.data, width: pp.width, height: pp.height }, 90).data);
  ok(T.qrDaImagem(png) === PIX, 'QR code do PIX numa imagem PNG (jsqr + pngjs)');
  ok(T.qrDaImagem(JPG) === PIX, 'QR code do PIX numa foto JPEG (jsqr + jpeg-js)');

  // ─────────── 2) o robô inteiro, pelo webhook (como o Telegram chama) ───────────
  console.log('\n2) conversa com o robô (webhook)');
  const CHAT = 777, UIDU = 'u1', hmac = t => crypto.createHmac('sha256', TOKEN).update(t).digest('hex');
  add('planejamento', { tipo: 'cfg_telegram', bot: 'vixsul_gestao_bot', bot_versao: '3', ultimo_resumo: hj, ultima_tarde: hj, ultimo_8h: hj, ultima_chuva: hj, ultimo_relatorio: hj, ultimo_fechamento: hj.slice(0, 7), aportes_vistos: {} });
  add('planejamento', { tipo: 'telegram_chat', chat_id: String(CHAT), nome: 'Vilson', usuario: 'Vilson', usuario_uid: UIDU, ativo: 'sim', assinatura: hmac(`chat|${CHAT}|${UIDU}`).slice(0, 32) });
  add('obras', { titulo_obra: 'SES ITARANTIM', status_proposta: 'Ganha - Em andamento', cidade_obra: 'Itarantim' });
  add('obras', { titulo_obra: 'ESCOLA ITAPETINGA', status_proposta: 'Ganha - Em andamento', cidade_obra: 'Itapetinga' });
  add('obras', { titulo_obra: 'PRAÇA POTIRAGUÁ', status_proposta: 'Ganha - Finalizada' });
  add('obras', { titulo_obra: 'PROPOSTA QUALQUER', status_proposta: 'Em análise' });
  add('orcamentos', { titulo: 'SES ITARANTIM', total_obra: '600000.00', data_lancamento: '01/01/2026 10:00' });
  add('orcamentos', { titulo: 'ESCOLA ITAPETINGA', total_obra: '400000.00', data_lancamento: '02/01/2026 10:00' });
  add('fornecedores', { nome: 'CASA DO CONSTRUTOR LTDA', cnpj: '11.222.333/0001-81' });
  const idAreia = add('custos', { titulo_obra: 'SES ITARANTIM', tipo_de_custo: 'Real', tipo: 'Materiais', fornecedor: 'AREIAL BOA VISTA', descricao: 'Areia', p_total: '480.00', vencimento: em(2), data_pgto: '' });
  const idLuz = add('despesas', { tipo_despesa: 'Real', data_despesa: em(1), fornecedor_beneficiario: 'COELBA', descricao: 'Energia elétrica', valor: '250.00', status_pagamento: 'Pendente', categoria: 'Água, Luz e Internet' });
  add('planejamento', { tipo: 'nota_recebida', origem: 'nfe', chave: '29' + '0'.repeat(42), numero: '1234', emitente_nome: 'CASA DO CONSTRUTOR LTDA', emitente_cnpj: '11222333000181', valor: '1500.00', data_emissao: em(-5), completa: 'sim', xml: '<nfeProc>nota 1234</nfeProc>', situacao: 'nova' });
  add('faturamentos', { titulo_obra: 'SES ITARANTIM', n_nf: '19', emissao_nf: em(-40), faturamento_bruto: '100000.00', faturamento_liquido: '95000.00', fat_uid: 'fu1', tipo_faturamento: 'Real' });
  add('arquivos', { tipo: 'anexo', aba: 'nf', fat_uid: 'fu1', doc: 'nf_pdf', uid: 'axPDF', nome: 'NFS-e 19.pdf', mime: 'application/pdf', titulo_obra: 'SES ITARANTIM' });
  STORAGE['p/axPDF/0000'] = Buffer.from('%PDF-1.4 nota 19');
  add('arquivos', { tipo: 'anexo', aba: 'nf', fat_uid: 'fu1', doc: 'nf_xml', uid: 'axXML', nome: 'NFS-e 19.xml', mime: 'application/xml', titulo_obra: 'SES ITARANTIM' });
  add('arquivos', { tipo: 'anexo_parte', anexo_uid: 'axXML', ordem: 0, conteudo: Buffer.from('<NFSe>nota 19</NFSe>').toString('base64') });

  const telegramJs = require('../api/telegram.js'), SEG = hmac('webhook').slice(0, 48);
  let uid = 1, mid = 1;
  const erroNo = () => CALLS.find(c => c.m === 'sendMessage' && /Deu um erro aqui/.test(c.b.text || ''));
  async function webhook(up) {
    const res = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
    await telegramJs({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SEG }, body: up, query: {} }, res);
    const e = erroNo(); if (e) { console.log('     erro do robô: ' + e.b.text); e.b.text = '(erro já mostrado)'; falhas++; }
    return res;
  }
  const escrever = t => webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, from: { first_name: 'Vilson' }, text: t } });
  async function tocar(parte) {
    const c = ultimoCartao(); if (!c) throw new Error('nenhum cartão com botões');
    const bts = c.b.reply_markup.inline_keyboard.flat(), b = bts.find(x => x.text.includes(parte));
    if (!b) throw new Error(`botão "${parte}" não encontrado. Há: ${bts.map(x => x.text).join(' | ')}`);
    const id = c.m === 'sendMessage' ? c.r.message_id : c.b.message_id;
    return webhook({ update_id: ++uid, callback_query: { id: 'cq' + uid, data: b.callback_data, message: { message_id: id, chat: { id: CHAT }, reply_markup: c.b.reply_markup } } });
  }
  const linhas = (t, filtro) => DB[t].filter(r => filtro(r.row_data)).map(r => r.row_data);

  // A) conta passo a passo, numa obra
  console.log('\nA) /conta passo a passo (obra)');
  await escrever('/conta'); ok(/Qual é o <b>valor<\/b>/.test(ultimoTexto()), 'pergunta o valor');
  await escrever('350'); ok(/Para <b>quem<\/b>/.test(ultimoTexto()), 'pergunta o fornecedor');
  await escrever('casa do constr'); ok(/CASA DO CONSTRUTOR LTDA/.test(ultimoTexto()) && /O que foi<\/b>/.test(ultimoTexto()), 'achou o fornecedor do cadastro pelo começo do nome');
  await escrever('cimento cp2'); ok(/<b>Onde<\/b>/.test(ultimoTexto()), 'pergunta onde entra');
  const kbOnde = ultimoCartao().b.reply_markup.inline_keyboard.flat().map(x => x.text).join(' | ');
  ok(/SES ITARANTIM/.test(kbOnde) && /ESCOLA ITAPETINGA/.test(kbOnde) && /Empresa/.test(kbOnde) && /Ratear/.test(kbOnde) && !/POTIRAGU/.test(kbOnde) && !/PROPOSTA/.test(kbOnde), 'botões: obras em execução, Empresa e Ratear (sem entregue nem proposta): ' + kbOnde);
  await tocar('SES ITARANTIM'); ok(/categoria<\/b>/.test(ultimoTexto()), 'pergunta a categoria');
  await tocar('✓ Materiais'); ok(/Já foi paga/.test(ultimoTexto()), 'pergunta se já foi paga');
  await tocar('Ainda não'); ok(/vencimento<\/b>/.test(ultimoTexto()), 'pergunta o vencimento');
  await tocar('Em 7 dias'); ok(/Forma de pagamento/.test(ultimoTexto()), 'pergunta a forma');
  await tocar('Boleto'); ok(/confira e lance/.test(ultimoTexto()), 'cartão de conferência');
  await tocar('Lançar a conta');
  let c1 = linhas('custos', r => r.descricao === 'Cimento cp2');
  ok(c1.length === 1 && c1[0].titulo_obra === 'SES ITARANTIM' && c1[0].p_total === '350.00' && c1[0].p_unit === '350.00' && c1[0].qtd === '1.00' && c1[0].fator === 'UN' && c1[0].vencimento === em(7) && c1[0].data_pgto === '' && c1[0].tipo === 'Materiais' && c1[0].tipo_de_custo === 'Real' && c1[0].forma_pagamento === 'Boleto' && c1[0].aprovacao === 'aprovada' && c1[0].criado_por === 'Vilson' && /^cp/.test(c1[0].compra_id) && /Lançada pelo Telegram/.test(c1[0].observacao), 'conta gravada em Contas a pagar (custos da obra): ' + JSON.stringify(c1[0]));
  ok(linhas('planejamento', r => r.tipo === 'desc_gasto' && r.descricao === 'Cimento cp2' && r.categoria === 'Materiais').length === 1, 'descrição nova entrou em Categoria › Descrição');
  ok(DB.fornecedores.length === 1, 'fornecedor do cadastro não foi duplicado');
  ok(/Conta lançada/.test(ultimoTexto()), 'confirmou: conta lançada');
  await tocar('Desfazer'); ok(!!linhas('custos', r => r.descricao === 'Cimento cp2')[0]._lixeira_em, 'Desfazer mandou para a Lixeira');
  ok(DB.arquivos.filter(r => r.row_data.tipo === 'telegram_fluxo').length === 0, 'o rascunho saiu do banco depois de terminar');

  // B) rateio entre obras, por uma frase
  console.log('\nB) rateio entre obras (frase)');
  await escrever('lança 1.000,00 de aluguel de container ratear entre itarantim e itapetinga, vence dia 28');
  ok(/Para <b>quem<\/b>/.test(ultimoTexto()), 'pergunta o fornecedor');
  const fl = DB.arquivos.find(r => r.row_data.tipo === 'telegram_fluxo');
  ok(fl && fl.row_data.dados && !/container|aluguel/i.test(JSON.stringify(fl.row_data)), 'o rascunho no banco está cifrado (não dá para ler o conteúdo)');
  await escrever('Locadora Silva'); ok(/categoria<\/b>/.test(ultimoTexto()) && /60%/.test(ultimoTexto()) && /R\$\s600,00/.test(ultimoTexto()), 'mostra o rateio 60% / 40% pelo orçamento');
  await tocar('✓ Equipamentos e locações'); await tocar('Ainda não'); await tocar('PIX'); await tocar('Lançar a conta');
  const rt = linhas('custos', r => r.descricao === 'Aluguel de container');
  ok(rt.length === 2 && rt.find(r => r.titulo_obra === 'SES ITARANTIM').p_total === '600.00' && rt.find(r => r.titulo_obra === 'ESCOLA ITAPETINGA').p_total === '400.00' && rt[0].rateio_id && rt[0].rateio_id === rt[1].rateio_id && /Rateio: 60% de R\$/.test(rt.find(r => r.titulo_obra === 'SES ITARANTIM').observacao), 'duas linhas do rateio (600 + 400), mesmo rateio_id');
  ok(DB.fornecedores.some(r => r.row_data.nome === 'LOCADORA SILVA'), 'fornecedor novo entrou no cadastro');

  // C) "paguei" uma conta que já estava lançada → oferece dar baixa
  console.log('\nC) "paguei 250 da conta de luz no pix" → baixa da conta que já existia');
  await escrever('paguei 250 da conta de luz no pix'); ok(/achei conta em aberto com esse valor/.test(ultimoTexto()) && /COELBA/.test(ultimoTexto()), 'achou a conta da COELBA em aberto');
  await tocar('1'); await tocar('PIX');
  let luz = DB.despesas.find(r => r.id === idLuz).row_data;
  ok(luz.status_pagamento === 'Pago' && luz.data_pagamento === hj && luz.forma_pagamento === 'PIX', 'baixa feita na despesa: ' + JSON.stringify(luz));
  await tocar('Desfazer'); luz = DB.despesas.find(r => r.id === idLuz).row_data;
  ok(luz.status_pagamento === 'Pendente' && !luz.data_pagamento, 'Desfazer da baixa voltou a conta para em aberto');

  // D) despesa da empresa já paga
  console.log('\nD) empresa (custo indireto) já paga');
  await escrever('lança 89,90 de papel sulfite empresa, pago hoje no débito'); ok(/Para <b>quem<\/b>/.test(ultimoTexto()), 'pergunta o fornecedor');
  await escrever('Kalunga'); ok(/✓ Material de Escritório/.test(JSON.stringify(ultimoCartao().b.reply_markup)), 'sugere a categoria Material de Escritório');
  await tocar('✓ Material de Escritório'); ok(/confira e lance/.test(ultimoTexto()), 'pula direto para a conferência (pago e forma já ditos)');
  await tocar('Lançar a conta');
  const dp = linhas('despesas', r => r.descricao === 'Papel sulfite')[0];
  ok(dp && dp.valor === '89.90' && dp.status_pagamento === 'Pago' && dp.data_pagamento === hj && dp.data_despesa === hj && dp.categoria === 'Material de Escritório' && dp.forma_pagamento === 'Cartão de Débito' && dp.tipo_despesa === 'Real', 'despesa da empresa gravada: ' + JSON.stringify(dp));

  // E) /pagar
  console.log('\nE) /pagar areia');
  await escrever('/pagar areia'); ok(/AREIAL BOA VISTA/.test(ultimoTexto()), 'achou a conta da areia');
  await tocar('1'); await tocar('Transferência/TED');
  const ar = DB.custos.find(r => r.id === idAreia).row_data; ok(ar.data_pgto === hj && ar.forma_pagamento === 'Transferência/TED', 'baixa na conta da obra (data do pagamento)');

  // F) notas
  console.log('\nF) /nota');
  let n0 = CALLS.length; await escrever('/nota 1234');
  let docs = CALLS.slice(n0).filter(c => c.m === 'sendDocument');
  ok(docs.length === 1 && /NF-e 1234 - CASA DO CONSTRUTOR LTDA\.xml/.test(docs[0].b.document.nome) && /nota 1234/.test(docs[0].b.document.texto), 'nota recebida: mandou o XML');
  n0 = CALLS.length; await escrever('busca a nota 19');
  docs = CALLS.slice(n0).filter(c => c.m === 'sendDocument');
  ok(docs.length === 2 && docs.some(d => /PDF-1\.4 nota 19/.test(d.b.document.texto)) && docs.some(d => /<NFSe>nota 19/.test(d.b.document.texto)), 'nota emitida: mandou o PDF (Storage) e o XML (partes no banco)');
  n0 = CALLS.length; await escrever('/nota casa do construtor'); ok(/1234/.test(textos(3)), 'busca pelo nome do fornecedor');

  // G) foto com QR do PIX
  console.log('\nG) foto com o QR code do PIX');
  ARQS.f1 = { caminho: 'photos/f1.jpg', buf: JPG };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'f1', width: pp.width, height: pp.height }], caption: 'obra itarantim' } });
  ok(/Li no QR code do PIX: R\$\s120,50 · JOAO DA SILVA/.test(ultimoTexto()), 'leu o valor e quem recebe no QR');
  ok(/obra <b>SES ITARANTIM<\/b>/.test(ultimoTexto()) && /O que foi<\/b>/.test(ultimoTexto()), 'a legenda da foto escolheu a obra; pergunta o que foi');
  ok(!GROQ_CHAMADAS.some(x => x.startsWith('foto')), 'com o QR lido, não precisou da leitura da Groq');
  await escrever('/cancelar'); ok(/Cancelado/.test(ultimoTexto()), '/cancelar');

  // H) PDF do boleto
  console.log('\nH) PDF do boleto');
  ARQS.f2 = { caminho: 'documents/boleto.pdf', buf: PDF };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, document: { file_id: 'f2', file_name: 'boleto.pdf', mime_type: 'application/pdf', file_size: PDF.length } } });
  ok(/linha digitável do boleto \(PDF\): R\$\s1\.234,56 · MADEIREIRA SAO JOSE LTDA · vence/.test(ultimoTexto()), 'leu valor, beneficiário e vencimento do PDF');

  // I) XML da NF-e com parcelas
  console.log('\nI) XML da NF-e com 3 parcelas');
  ARQS.f3 = { caminho: 'documents/nota.xml', buf: Buffer.from(XML) };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, document: { file_id: 'f3', file_name: 'nota.xml', mime_type: 'text/xml', file_size: XML.length } } });
  ok(/Li no XML da NF-e 5678: R\$\s3\.000,00 · CASA DO CONSTRUTOR LTDA · 3 parcelas/.test(ultimoTexto()), 'leu o XML');
  await tocar('SES ITARANTIM'); await tocar('✓ Materiais'); await tocar('Ainda não');
  ok(/3 parcelas<\/b>/.test(ultimoTexto()), 'pergunta se lança nas 3 parcelas da nota');
  await tocar('Sim, em 3 parcelas'); await tocar('Boleto'); await tocar('Lançar');
  const px3 = linhas('custos', r => /^CIMENTO CP II 50KG/.test(r.descricao)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  ok(px3.length === 3 && px3.every(r => r.p_total === '1000.00') && px3[0].vencimento === em(25) && px3[2].vencimento === em(85) && /\(1\/3\)$/.test(px3[0].descricao) && px3[0].grupo_parcelas && px3[0].grupo_parcelas === px3[2].grupo_parcelas && px3[0].data_compra === '2026-11-12' && /Nota\/recibo nº 5678/.test(px3[0].observacao), '3 parcelas gravadas: ' + JSON.stringify(px3.map(r => [r.descricao, r.vencimento, r.p_total])));

  // J) foto sem QR: leitura da Groq (boleto já lançado → avisa)
  console.log('\nJ) foto de boleto sem QR (leitura da Groq) — conta que já existe');
  const cinza = Buffer.from(require('jpeg-js').encode({ data: Buffer.alloc(64 * 64 * 4, 200), width: 64, height: 64 }, 80).data);
  ARQS.f4 = { caminho: 'photos/f4.jpg', buf: cinza };
  DB.custos.find(r => r.id === idAreia).row_data.data_pgto = '';   // a areia volta a ficar em aberto
  GROQ.visao = { tipo: 'boleto', fornecedor: 'AREIAL BOA VISTA', cnpj_cpf: '', valor: 480, vencimento: em(2), data: '', pago: false, numero: '', descricao: 'Areia lavada', linha_digitavel: linhaBoleto(480, em(2)).replace(/\D/g, ''), chave: '' };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'f4', width: 64, height: 64 }] } });
  ok(GROQ_CHAMADAS.some(x => x.startsWith('foto')), 'usou a leitura de foto da Groq');
  ok(/Li na foto: R\$\s480,00 · AREIAL BOA VISTA · vence/.test(ultimoTexto()), 'leu a foto');
  await tocar('SES ITARANTIM'); await tocar('✓ Materiais'); await tocar('Ainda não');
  ok(/Já existe uma conta de R\$\s480,00/.test(ultimoTexto()) && /Lançar mesmo assim/.test(JSON.stringify(ultimoCartao().b.reply_markup)), 'avisa que a conta parece já estar lançada');
  await tocar('Cancelar');

  // K) áudio
  console.log('\nK) áudio');
  ARQS.v1 = { caminho: 'voice/file_1.oga', buf: Buffer.from('OggS-audio-de-mentira') };
  GROQ.transcricao = 'lança trezentos e cinquenta reais de brita na obra de itarantim, já paguei no pix';
  GROQ.intencao = { acao: 'conta', valor: 350, fornecedor: '', descricao: 'brita', onde: 'obra', obra: 'SES ITARANTIM', pago: true, forma: 'PIX' };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, voice: { file_id: 'v1', duration: 4, mime_type: 'audio/ogg' } } });
  ok(CALLS.some(c => c.m === 'sendMessage' && /🎤 <i>lança trezentos/.test(c.b.text || '')), 'mostrou o que entendeu do áudio');
  ok(/Para <b>quem<\/b>/.test(ultimoTexto()) && /R\$\s350,00/.test(ultimoTexto()) && /SES ITARANTIM/.test(ultimoTexto()) && /pago em/.test(ultimoTexto()), 'virou uma conta (350, obra, paga) e pergunta o fornecedor');
  await escrever('/cancelar');

  // L) tarefa, reunião e diesel
  console.log('\nL) tarefa, reunião e diesel');
  await escrever('/tarefa pedir a medição à fiscalização sexta obra itarantim urgente');
  ok(/Pedir a medição à fiscalização/.test(ultimoTexto()) && /SES ITARANTIM/.test(ultimoTexto()) && /Prioridade: Alta/.test(ultimoTexto()) && /sexta-feira/.test(ultimoTexto()), 'cartão da tarefa');
  await tocar('Criar tarefa');
  const ac = linhas('acoes', () => true)[0];
  ok(ac && ac.o_que === 'Pedir a medição à fiscalização' && ac.titulo_obra === 'SES ITARANTIM' && ac.prioridade === 'Alta' && ac.status === 'Aberta' && ac.tipo === 'Medição / fiscalização' && ac.quem === 'Vilson', 'tarefa gravada no Plano de ação: ' + JSON.stringify(ac));
  await escrever('/reuniao amanhã 9h com a fiscalização obra itapetinga');
  ok(/Reunião com a fiscalização/.test(ultimoTexto()) && /às 09:00/.test(ultimoTexto()) && /ESCOLA ITAPETINGA/.test(ultimoTexto()), 'cartão da reunião');
  await tocar('Marcar reunião');
  const re = linhas('reunioes', () => true)[0];
  ok(re && re.data === em(1) && re.hora === '09:00' && re.titulo_obra === 'ESCOLA ITAPETINGA' && re.status === 'Agendada' && re.tipo === 'Reunião com a fiscalização', 'reunião gravada: ' + JSON.stringify(re));
  await escrever('/diesel 120 litros 750 reais obra itarantim posto central');
  ok(/Lançar também em <b>Contas a pagar/.test(ultimoTexto()) && /POSTO CENTRAL/.test(ultimoTexto()) && /R\$\s6,25 o litro/.test(ultimoTexto()), 'cartão do diesel');
  await tocar('Sim, lançar também'); await tocar('Lançar');
  const ab = linhas('planejamento', r => r.tipo === 'abastecimento')[0], cd = linhas('custos', r => r.descricao === 'Óleo diesel')[0];
  ok(ab && ab.litros === '120' && ab.valor === '750.00' && ab.titulo_obra === 'SES ITARANTIM' && ab.fornecedor === 'POSTO CENTRAL', 'abastecimento gravado: ' + JSON.stringify(ab));
  ok(cd && cd.qtd === '120.00' && cd.p_unit === '6.25' && cd.p_total === '750.00' && cd.data_pgto === ab.data && cd.fator === 'L', 'conta do diesel (paga) gravada: ' + JSON.stringify(cd));

  // M) código do PIX colado, pergunta normal e a tarefa de 15 minutos
  console.log('\nM) código colado, pergunta e tarefa agendada');
  await escrever(PIX); ok(/Li no código do PIX: R\$\s120,50/.test(ultimoTexto()), 'PIX copia e cola colado na conversa');
  await escrever('/cancelar');
  n0 = CALLS.length; await escrever('quais contas vencem esta semana?'); ok(CALLS.slice(n0).some(c => c.m === 'sendMessage' && !/Não entendi/.test(c.b.text || '')), 'pergunta respondida pelo sistema (sem IA)');
  const rq = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
  await telegramJs({ method: 'GET', headers: {}, query: { tick: '1' } }, rq);
  const tk = JSON.parse(rq.corpo || '{}'); ok(rq.statusCode === 200 && tk.ok, 'tarefa de 15 minutos rodou: ' + rq.corpo);
  const rs = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
  await telegramJs({ method: 'GET', headers: {}, query: {} }, rs); ok(JSON.parse(rs.corpo).groq === true, 'estado diz que a leitura da Groq está ligada');

  console.log(`\n${passos - falhas} de ${passos} conferências certas.`);
  if (falhas) { console.log(`❌ ${falhas} falha(s).`); process.exit(1); }
  console.log('✅ Tudo certo.');
})().catch(e => { console.error('ERRO NO TESTE:', e && e.message); console.error(e && e.stack || e); process.exit(1); });
