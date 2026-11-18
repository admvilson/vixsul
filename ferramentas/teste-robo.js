/* TESTE DO ROBÔ DO TELEGRAM — roda no Node (máquina do GitHub: workflow "Teste do robô"), com dados de mentira:
   o banco (Supabase), o Telegram, a Groq e a BrasilAPI são simulados aqui dentro. Nada sai para a internet.
   Uso: node ferramentas/teste-robo.js   (precisa de "npm install" e do pacote "qrcode" só para o teste) */
'use strict';
const crypto = require('crypto');
const TOKEN = '123456:teste-do-robo';
Object.assign(process.env, { TELEGRAM_BOT_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: 'chave-de-teste', SUPABASE_URL: 'https://sb.teste', GROQ_API_KEY: 'gsk_teste', SUPABASE_JWT_SECRET: 'segredo-de-teste',
  GROQ_VISION_MODEL: 'qwen/qwen3.6-27b',   // o 1º da lista recusa imagem: o teste automático tem de achar o qwen3.8
  GMAIL_USER: 'sistema@exemplo.com', GMAIL_APP_PASSWORD: 'senhadeteste' });
// ── Gmail de mentira (a biblioteca imapflow trocada por uma caixa de entrada na memória) ──
const { Readable } = require('stream');
const CAIXA = { uidValidity: 777n, msgs: [], aberturas: [] };
class FakeImap {
  constructor(o) { this.o = o; this.mailbox = null; }
  on() {}
  async connect() { if (this.o.auth.pass !== 'senhadeteste' || this.o.host !== 'imap.gmail.com') { const e = new Error('Invalid credentials'); e.authenticationFailed = true; throw e; } }
  async getMailboxLock(p, op) { CAIXA.aberturas.push({ p, ro: !!(op && op.readOnly) }); const max = Math.max(0, ...CAIXA.msgs.map(m => m.uid)); this.mailbox = { path: p, uidValidity: CAIXA.uidValidity, uidNext: max + 1, exists: CAIXA.msgs.length }; return { release() {} }; }
  async search(qy) { if (qy.since) return CAIXA.msgs.filter(m => m.date >= qy.since).map(m => m.uid); const a = +String(qy.uid).split(':')[0], L = CAIXA.msgs.filter(m => m.uid >= a).map(m => m.uid); return L.length ? L : CAIXA.msgs.length ? [Math.max(...CAIXA.msgs.map(m => m.uid))] : []; }
  async *fetch(range) { for (const m of CAIXA.msgs) if (range.includes(m.uid)) yield { uid: m.uid, envelope: m.envelope, bodyStructure: m.bodyStructure }; }
  async download(uid, part) { const m = CAIXA.msgs.find(x => x.uid === +uid); return { meta: {}, content: Readable.from([m.partes[part]]) }; }
  async logout() {}
  close() {}
}
require.cache[require.resolve('imapflow')] = { id: 'imapflow', filename: require.resolve('imapflow'), loaded: true, exports: { ImapFlow: FakeImap } };
const SB = 'https://sb.teste';

// ── banco de mentira (PostgREST: select com apelidos, filtros eq/in/like/ilike/lt, order, limit, offset, Range) ──
const DB = {}; let seq = 1;
['custos', 'despesas', 'planejamento', 'obras', 'orcamentos', 'fornecedores', 'faturamentos', 'arquivos', 'acoes', 'reunioes', 'documentos', 'diario_obra', 'aportes', 'contratos', 'medicoes', 'obra_imagens'].forEach(t => { DB[t] = []; });
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
  if (m === 'getMe') r = { id: 1, is_bot: true, username: 'vixsul_gestao_bot' };
  if (m === 'sendMessage' || m === 'sendDocument') r = { message_id: ++msgId, chat: { id: b.chat_id } };
  if (m === 'editMessageText') r = { message_id: b.message_id };
  if (m === 'getFile') { const a = ARQS[b.file_id]; if (!a) return json(400, { ok: false, description: 'arquivo não existe' }); r = { file_id: b.file_id, file_path: a.caminho, file_size: a.buf.length }; }
  CALLS.push({ m, b, r });
  return json(200, { ok: true, result: r });
}
// ── Groq de mentira: as respostas que cada teste quer ──
const GROQ = { transcricao: '', intencao: {}, visao: {} }, GROQ_CHAMADAS = [];
async function groq(url, op) {
  // a lista de modelos da Groq (como em 2026): o scout ainda aparece, mas foi desligado; o qwen3.6 não aceita imagem
  if (url.endsWith('/models')) return json(200, { data: ['meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3.6-27b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'whisper-large-v3', 'meta-llama/llama-guard-4-12b', 'openai/gpt-oss-safeguard-20b'].map(id => ({ id, active: true })) });
  // áudio: com "verbose_json" vem a confiança de cada trecho (o teste escolhe com GROQ.segmentos); guarda a "cola" (prompt)
  if (url.endsWith('/audio/transcriptions')) { const fd = op.body; GROQ_CHAMADAS.push('audio:' + (fd && fd.get ? fd.get('model') : '')); GROQ.ultimoPrompt = (fd && fd.get && fd.get('prompt')) || ''; const vj = fd && fd.get && fd.get('response_format') === 'verbose_json';
    return json(200, vj ? { text: GROQ.transcricao, segments: GROQ.segmentos || [{ text: GROQ.transcricao, avg_logprob: -0.2, no_speech_prob: 0.01, compression_ratio: 1.2 }] } : { text: GROQ.transcricao }); }
  const b = JSON.parse(op.body), foto = Array.isArray(b.messages[b.messages.length - 1].content); GROQ.ultimoCorpo = b;
  GROQ_CHAMADAS.push(foto ? 'foto:' + b.model : 'texto:' + b.model);
  if (/scout|maverick/.test(b.model)) return json(400, { error: { message: `The model \`${b.model}\` has been decommissioned and is no longer supported.` } });
  if (foto && b.model === 'qwen/qwen3.6-27b') return json(400, { error: { message: 'This model does not support image input.' } });
  return json(200, { choices: [{ message: { content: JSON.stringify(foto ? GROQ.visao : GROQ.intencao) } }] });
}
global.fetch = async (url, op = {}) => {
  url = String(url); const metodo = String(op.method || 'GET').toUpperCase();
  if (url.startsWith(SB + '/rest/v1/')) return rest(url, metodo, op);
  if (url.startsWith(SB + '/storage/v1/object/list/')) { const pre = JSON.parse(op.body).prefix + '/'; return json(200, Object.keys(STORAGE).filter(k => k.startsWith(pre)).map(k => ({ id: 'x' + k, name: k.slice(pre.length) }))); }
  if (url.startsWith(SB + '/storage/v1/object/')) { const k = url.split('/storage/v1/object/anexos/')[1]; if (metodo === 'POST') { STORAGE[k] = Buffer.from(op.body); return json(200, { Key: 'anexos/' + k }); } return STORAGE[k] ? resp(200, STORAGE[k], 'application/octet-stream') : json(404, {}); }
  if (url.startsWith(`https://api.telegram.org/file/bot${TOKEN}/`)) { const c = url.split(`/file/bot${TOKEN}/`)[1], a = Object.values(ARQS).find(x => x.caminho === c); return a ? resp(200, a.buf, 'application/octet-stream') : json(404, {}); }
  if (url.startsWith('https://api.telegram.org/bot')) return telegram(url, op);
  if (url.startsWith('https://api.groq.com/')) return groq(url, op);
  if (url.startsWith('https://brasilapi.com.br/')) return json(200, { razao_social: 'MADEIREIRA SAO JOSE LTDA' });
  if (url.startsWith('https://gestao.vixsulempreendimentos.com.br/img/')) return resp(200, Buffer.from('\x89PNG-icone-de-teste'), 'image/png');
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
  ok(T.intencao('recebi a nota 19') === 'receb' && T.intencao('recebi 50 mil da Embasa') === 'receb' && T.intencao('recebi a nota do fornecedor de 300') !== 'receb' && T.intencao('terminei a tarefa de pedir a medição') === 'concluir' && T.intencao('manda a certidão do fgts') === 'doc', 'pedidos novos: recebimento, concluir tarefa e documento');
  // quem pagou, dito na frase (a empresa ou um sócio — o do sócio vira aporte na aprovação)
  const SOC = ['Vilson Souza', 'Carlos Lima'];
  f = T.lerFrase('paguei 350 de cimento na obra de itarantim com o cartão da empresa', OB, hj, SOC);
  ok(f.socio === '' && f.onde === 'obra' && f.forma === 'Cartão de Crédito' && f.desc === 'Cimento' && f.pago === hj, '"cartão da empresa": a empresa pagou (e a conta é da obra): ' + JSON.stringify(f));
  f = T.lerFrase('paguei 120 de gasolina do meu bolso, empresa', OB, hj, SOC);
  ok(f.socioEu === true && f.onde === 'empresa' && f.desc === 'Gasolina', '"do meu bolso": quem está falando pagou: ' + JSON.stringify(f));
  f = T.lerFrase('lança 500 de areia na obra itarantim, pago pelo sócio Carlos no pix', OB, hj, SOC);
  ok(f.socioNome === 'Carlos' && f.forma === 'PIX' && f.obra === 'SES ITARANTIM' && f.desc === 'Areia', '"pago pelo sócio Carlos": ' + JSON.stringify(f));
  f = T.lerFrase('paguei 80 de almoço, quem pagou foi o Vilson', OB, hj, SOC);
  ok(f.socio === 'Vilson Souza' && f.desc === 'Almoço' && f.pago === hj, '"quem pagou foi o Vilson" (da lista dos sócios): ' + JSON.stringify(f));
  f = T.lerFrase('lança uma conta da empresa de 300 de internet vence dia 28', OB, hj, SOC);
  ok(f.onde === 'empresa' && f.socio === undefined && f.desc === 'Internet', '"conta da empresa" continua sendo custo indireto (não é quem pagou): ' + JSON.stringify(f));
  ok(T.semOi('Oi robô, bom dia, por favor lança 300 de cimento') === 'lança 300 de cimento' && T.semOi('Eis o boleto') === 'Eis o boleto', 'tira o "oi robô, bom dia" do começo');
  const pv = T.promptVoz({ obras: ['SES ITARANTIM', 'ESCOLA ITAPETINGA'], socios: SOC, forns: ['CASA DO CONSTRUTOR LTDA'] });
  ok(pv.length <= 480 && /SES ITARANTIM/.test(pv) && /Vilson Souza/.test(pv) && /CASA DO CONSTRUTOR/.test(pv) && /R\$ 1\.200,00/.test(pv), 'a "cola" do áudio tem as obras, os sócios e os fornecedores (' + pv.length + ' letras)');
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
  // comprovante da maquininha (texto, como sai no papel)
  const slip = 'CIELO\nVIA CLIENTE\nMADEIREIRA SAO JOSE\nITARANTIM - BA\nCNPJ: 12.345.678/0001-95\nDOC: 123456   AUT: 654321\n' + R.br(hj) + '/' + hj.slice(2, 4) + ' 14:32\nVISA CREDITO PARCELADO LOJA 3X\n************1234\nVALOR APROVADO: R$ 900,00\nTRANSACAO AUTORIZADA MEDIANTE SENHA';
  const ms = T.lerTextoDoc(slip);
  ok(ms.tipo === 'cartao' && ms.pago && ms.forma === 'Cartão de Crédito' && ms.parcCartao === 3 && ms.valor === 900 && ms.data === hj && ms.cnpj === '12345678000195', 'comprovante da maquininha (texto): ' + JSON.stringify(ms));
  ok(ms.cartaoFinal === '1234' && T.cartaoFinalDe('Operação #185732442364\nCRÉDITO MASTERCARD 3434\n668499 NFC') === '3434', 'o final do cartão no comprovante (************1234 e "CRÉDITO MASTERCARD 3434")');
  const md = T.lerTextoDoc('STONE\nVIA DO CLIENTE\nPADARIA BOM PAO\nDEBITO\nNSU 998877\nVALOR: R$ 18,50\n' + R.br(hj) + '/' + hj.slice(0, 4));
  ok(md.tipo === 'cartao' && md.forma === 'Cartão de Débito' && !md.parcCartao && md.valor === 18.5, 'maquininha no débito: ' + JSON.stringify(md));
  const ni = T.normIA({ tipo: 'cartao', fornecedor: 'CIELO', cnpj_cpf: '12.345.678/0001-95', valor: 900, data: hj, pago: true, forma: 'credito', parcelas: 3, descricao: 'material eletrico' });
  ok(ni.tipo === 'cartao' && ni.pago && !ni.forn && ni.cnpj === '12345678000195' && ni.forma === 'Cartão de Crédito' && ni.parcCartao === 3, 'leitura da foto da maquininha (a Cielo não vira fornecedor): ' + JSON.stringify(ni));
  // teste automático da Groq: o 1º da lista de foto recusa imagem → acha o qwen3.8 e guarda; áudio e texto também
  const tg0 = await T.testarGroq(true);
  ok(tg0 && tg0.foto === 'qwen/qwen3.8-27b' && /image/i.test(tg0.erros['qwen/qwen3.6-27b'] || '') && tg0.audio === 'whisper-large-v3' && tg0.texto === 'openai/gpt-oss-120b', 'teste automático da Groq achou o que funciona: ' + JSON.stringify(tg0));
  ok(DB.arquivos.some(r => r.row_data.tipo === 'telegram_groq' && r.row_data.foto === 'qwen/qwen3.8-27b'), 'o resultado do teste ficou guardado');
  ok((await T.testarGroq()) === null, 'não testa de novo antes da hora');
  const mods = await T.modelosDe(['meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3.6-27b'], 'visao'), eg = await T.estadoGroq();
  ok(mods[0] === 'qwen/qwen3.8-27b' && !mods.some(m => /guard|maverick/.test(m)), 'foto: o testado vem primeiro e o que sumiu sai (' + mods.join(', ') + ')');
  let erroTodos = ''; try { await T.chatJson([{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } }] }], ['meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3.6-27b'], 5000, 100); } catch (e) { erroTodos = e.message; }
  ok(/llama-4-scout.*decommissioned/.test(erroTodos) && /qwen3\.6-27b: This model does not support image/.test(erroTodos), 'quando todos falham, o erro conta o que cada um disse: ' + erroTodos);
  await T.chatJson([{ role: 'user', content: 'oi' }], ['openai/gpt-oss-120b'], 5000, 500);
  ok(GROQ.ultimoCorpo.model === 'openai/gpt-oss-120b' && GROQ.ultimoCorpo.reasoning_effort === 'low' && GROQ.ultimoCorpo.include_reasoning === false && GROQ.ultimoCorpo.max_completion_tokens >= 2000, 'modelo que "pensa" (gpt-oss): pensa pouco e tem espaço para responder');
  await T.chatJson([{ role: 'user', content: 'oi' }], ['qwen/qwen3.8-27b'], 5000, 500);
  ok(GROQ.ultimoCorpo.reasoning_effort === 'none' && GROQ.ultimoCorpo.max_completion_tokens === 500, 'qwen responde direto (sem pensar)');
  await T.chatJson([{ role: 'user', content: 'oi' }], ['llama-3.3-70b-versatile'], 5000, 500);
  ok(!('reasoning_effort' in GROQ.ultimoCorpo) && GROQ.ultimoCorpo.max_completion_tokens === 500, 'os outros modelos ficam como estão');
  ok(eg.groqOk && eg.modelos.foto === 'qwen/qwen3.8-27b' && eg.modelos.audio === 'whisper-large-v3' && eg.modelos.texto === 'openai/gpt-oss-120b' && eg.teste && eg.teste.foto === 'qwen/qwen3.8-27b', 'estado da Groq: ' + JSON.stringify(eg));
  // HORÍMETRO pela foto (a tela do Diário de obra chama pela /api/compra): a Groq lê o visor; ilegível volta vazio; o que não é foto é recusado
  { const vis0 = GROQ.visao, img = 'data:image/jpeg;base64,' + Buffer.alloc(30, 7).toString('base64');
    GROQ.visao = { horimetro: 7502.3, digitos: '075023', decimal: true, confianca: 'alta' };
    const h1 = await B.lerHorimetro(img);
    ok(h1.ok && h1.horimetro === 7502.3 && h1.digitos === '075023' && h1.decimal === true && h1.confianca === 'alta' && GROQ_CHAMADAS[GROQ_CHAMADAS.length - 1] === 'foto:qwen/qwen3.8-27b', 'horímetro: a Groq lê o visor com o modelo testado (' + JSON.stringify(h1) + ')');
    GROQ.visao = { horimetro: null, digitos: '', decimal: false, confianca: 'baixa' };
    const h2 = await B.lerHorimetro(img);
    ok(h2.ok && h2.horimetro === null, 'horímetro: visor ilegível volta vazio (nunca inventa)');
    GROQ.visao = { horimetro: '7.502,3', digitos: '75023', decimal: true, confianca: 'media' };
    const h3 = await B.lerHorimetro(img);
    ok(h3.ok && h3.horimetro === null && h3.digitos === '75023', 'horímetro: número em formato estranho não vira valor errado (fica a escolha pelos dígitos na tela)');
    const h4 = await B.lerHorimetro('nao-e-uma-foto');
    ok(!h4.ok, 'horímetro: o que não é foto é recusado');
    GROQ.visao = vis0; }
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
  add('fornecedores', { nome: 'CASA DO CONSTRUTOR LTDA', cnpj: '11.222.333/0001-81', telefone: '(77) 3333-0000', pix: '11.222.333/0001-81' });
  add('aportes', { quem_aportou: 'Vilson Souza', valor_aportado: '1000.00', titulo_obra: 'SES ITARANTIM', movimento: 'Aporte', data_aporte: em(-30) });
  // kit da empresa: o FGTS em dia e a certidão federal vencida
  add('arquivos', { tipo: 'anexo', titulo_obra: '__empresa__', aba: 'kit', kit: 'crf_fgts', uid: 'axFGTS', nome: 'CRF FGTS.pdf', mime: 'application/pdf', validade: em(20) });
  STORAGE['p/axFGTS/0000'] = Buffer.from('%PDF-1.4 crf fgts');
  add('arquivos', { tipo: 'anexo', titulo_obra: '__empresa__', aba: 'kit', kit: 'cnd_federal', uid: 'axCND', nome: 'CND federal.pdf', mime: 'application/pdf', validade: em(-3) });
  STORAGE['p/axCND/0000'] = Buffer.from('%PDF-1.4 cnd');
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
  ok(c1.length === 1 && c1[0].titulo_obra === 'SES ITARANTIM' && c1[0].p_total === '350.00' && c1[0].p_unit === '350.00' && c1[0].qtd === '1.00' && c1[0].fator === 'UN' && c1[0].vencimento === em(7) && c1[0].data_pgto === '' && c1[0].tipo === 'Materiais' && c1[0].tipo_de_custo === 'Real' && c1[0].forma_pagamento === 'Boleto' && c1[0].criado_por === 'Vilson' && /^cp/.test(c1[0].compra_id) && /Lançada pelo Telegram/.test(c1[0].observacao), 'conta gravada em Contas a pagar (custos da obra): ' + JSON.stringify(c1[0]));
  ok(c1[0].aprovacao === 'pendente' && c1[0].origem_lanc === 'telegram' && c1[0].lancado_por === 'Vilson' && !c1[0].aprovado_por, 'a conta do Telegram fica "Aguardando aprovação" (origem telegram)');
  ok(/aguardando sua aprovação/.test(ultimoTexto()), 'a mensagem avisa que aguarda a aprovação');
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
  ok(/<b>Pago com dinheiro do sócio\?<\/b>/.test(ultimoTexto()) && /Não — dinheiro da empresa/.test(JSON.stringify(ultimoCartao().b.reply_markup)) && /Sim — Vilson Souza/.test(JSON.stringify(ultimoCartao().b.reply_markup)), 'a baixa pergunta "Pago com dinheiro do sócio?" (Não = empresa; Sim = qual sócio)');
  await tocar('Vilson Souza');
  let luz = DB.despesas.find(r => r.id === idLuz).row_data;
  ok(luz.status_pagamento === 'Pago' && luz.data_pagamento === hj && luz.forma_pagamento === 'PIX', 'baixa feita na despesa: ' + JSON.stringify(luz));
  ok(luz.aprovacao === 'pendente' && luz.socio_pendente === 'Vilson Souza' && /PIX/.test(luz.baixa_telegram || '') && /Pago por Vilson Souza \(sócio\)/.test(luz.observacao || '') && !DB.aportes.some(r => r.row_data.valor_aportado === '250.00'), 'baixa do sócio: aguarda aprovação e o aporte só entra quando aprovar');
  await tocar('Desfazer'); luz = DB.despesas.find(r => r.id === idLuz).row_data;
  ok(luz.status_pagamento === 'Pendente' && !luz.data_pagamento && !('socio_pendente' in luz) && !('aprovacao' in luz) && !('baixa_telegram' in luz), 'Desfazer da baixa voltou a conta para em aberto (como era antes)');

  // D) despesa da empresa já paga
  console.log('\nD) empresa (custo indireto) já paga');
  await escrever('lança 89,90 de papel sulfite empresa, pago hoje no débito'); ok(/Para <b>quem<\/b>/.test(ultimoTexto()), 'pergunta o fornecedor');
  await escrever('Kalunga'); ok(/✓ Material de Escritório/.test(JSON.stringify(ultimoCartao().b.reply_markup)), 'sugere a categoria Material de Escritório');
  await tocar('✓ Material de Escritório'); ok(/<b>Pago com dinheiro do sócio\?<\/b>/.test(ultimoTexto()), 'conta paga: pergunta se foi com dinheiro do sócio');
  await tocar('dinheiro da empresa'); ok(/confira e lance/.test(ultimoTexto()) && /Pago com dinheiro do sócio: <b>Não<\/b>/.test(ultimoTexto()), 'pula direto para a conferência (pago, forma e "Não" já ditos)');
  await tocar('Lançar a conta');
  const dp = linhas('despesas', r => r.descricao === 'Papel sulfite')[0];
  ok(dp && dp.valor === '89.90' && dp.status_pagamento === 'Pago' && dp.data_pagamento === hj && dp.data_despesa === hj && dp.categoria === 'Material de Escritório' && dp.forma_pagamento === 'Cartão de Débito' && dp.tipo_despesa === 'Real', 'despesa da empresa gravada: ' + JSON.stringify(dp));
  ok(dp.aprovacao === 'pendente' && dp.origem_lanc === 'telegram' && !dp.socio_pendente, 'paga pela empresa: aguarda aprovação, sem sócio');

  // E) /pagar
  console.log('\nE) /pagar areia');
  await escrever('/pagar areia'); ok(/AREIAL BOA VISTA/.test(ultimoTexto()), 'achou a conta da areia');
  await tocar('1'); await tocar('Transferência/TED'); await tocar('dinheiro da empresa');
  const ar = DB.custos.find(r => r.id === idAreia).row_data; ok(ar.data_pgto === hj && ar.forma_pagamento === 'Transferência/TED' && ar.aprovacao === 'pendente' && !ar.socio_pendente, 'baixa na conta da obra (data do pagamento), aguardando aprovação');
  ok(/aguardando sua aprovação/.test(ultimoTexto()), 'a mensagem da baixa avisa que aguarda a aprovação');

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
  ARQS.f1 = { caminho: 'photos/f1.jpg', buf: JPG }; const g0 = GROQ_CHAMADAS.length;
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'f1', width: pp.width, height: pp.height }], caption: 'obra itarantim' } });
  ok(/Li no QR code do PIX: R\$\s120,50 · JOAO DA SILVA/.test(ultimoTexto()), 'leu o valor e quem recebe no QR');
  ok(/obra <b>SES ITARANTIM<\/b>/.test(ultimoTexto()) && /O que foi<\/b>/.test(ultimoTexto()), 'a legenda da foto escolheu a obra; pergunta o que foi');
  ok(!GROQ_CHAMADAS.slice(g0).some(x => x.startsWith('foto')), 'com o QR lido, não precisou da leitura da Groq');
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
  ok(cd.aprovacao === 'pendente' && cd.origem_lanc === 'telegram' && /aguardando sua aprovação/.test(ultimoTexto()), 'a conta do diesel também aguarda a aprovação');

  // N) comprovante da maquininha: crédito em 3x → 1ª parcela paga, as outras a pagar (casa com a fatura na Conciliação)
  console.log('\nN) comprovante da maquininha (crédito em 3x)');
  ARQS.f5 = { caminho: 'photos/f5.jpg', buf: cinza };
  GROQ.visao = { tipo: 'cartao', fornecedor: 'CIELO', cnpj_cpf: '12345678000195', valor: 900, vencimento: '', data: hj, pago: true, forma: 'credito', parcelas: 3, cartao_final: '3434', numero: '', descricao: 'Material elétrico', linha_digitavel: '', chave: '' };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'f5', width: 64, height: 64 }], caption: 'obra itarantim' } });
  ok(/Li no comprovante da maquininha: R\$\s900,00 · MADEIREIRA SAO JOSE LTDA · crédito em 3x · cartão final 3434 · compra em/.test(ultimoTexto()), 'leu o comprovante da maquininha (com o final do cartão)');
  ok(/MADEIREIRA SAO JOSE LTDA/.test(ultimoTexto()) && /cartão de crédito em 3x/.test(ultimoTexto()) && /\(paga\)/.test(ultimoTexto()), 'fornecedor pelo CNPJ (não a Cielo) e as 3 parcelas no cartão');
  ok(GROQ_CHAMADAS[GROQ_CHAMADAS.length - 1] === 'foto:qwen/qwen3.8-27b', 'leu a foto direto com o modelo testado (qwen3.8), sem tentar os que falham');
  await tocar('✓ Materiais');
  ok(/Pago com dinheiro do sócio\?/.test(ultimoTexto()) && /Cartão final 3434: a resposta fica guardada/.test(ultimoTexto()), 'cartão novo: pergunta e avisa que vai guardar a resposta');
  await tocar('dinheiro da empresa');
  ok(DB.arquivos.some(r => r.row_data.tipo === 'telegram_cartoes' && r.row_data.mapa && r.row_data.mapa['3434'] && r.row_data.mapa['3434'].socio === ''), 'guardou: o cartão final 3434 é da empresa');
  await tocar('Lançar');
  const mq = linhas('custos', r => /^Material elétrico/.test(r.descricao)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  ok(mq.length === 3 && mq.every(r => r.p_total === '300.00' && r.forma_pagamento === 'Cartão de Crédito' && r.titulo_obra === 'SES ITARANTIM') && mq[0].data_pgto === hj && mq[0].vencimento === hj && mq[1].data_pgto === '' && mq[1].vencimento === T.somaMes(hj, 1) && mq[2].vencimento === T.somaMes(hj, 2) && /\(1\/3\)$/.test(mq[0].descricao) && /Cartão de crédito em 3x/.test(mq[0].observacao) && /maquininha/.test(mq[0].observacao) && mq[0].grupo_parcelas === mq[2].grupo_parcelas, 'parcelas no cartão: ' + JSON.stringify(mq.map(r => [r.descricao, r.vencimento, r.data_pgto, r.p_total])));
  await escrever('paguei 640 no cartão de crédito em 2x de areia obra itarantim fornecedor areial boa vista');
  ok(/cartão de crédito em 2x/.test(ultimoTexto()) && /R\$\s320,00 \(paga\)/.test(ultimoTexto()), 'escrito: "paguei … no cartão de crédito em 2x"');
  await escrever('/cancelar');
  // o mesmo cartão de novo (o comprovante da churrascaria, R$ 30 no crédito, final 3434): não pergunta mais
  ARQS.f6 = { caminho: 'photos/f6.jpg', buf: cinza };
  GROQ.visao = { tipo: 'cartao', fornecedor: 'DOHA CHURRASCARIA', cnpj_cpf: '', valor: 30, vencimento: '', data: em(-1), pago: true, forma: 'credito', parcelas: 1, cartao_final: '3434', numero: '', descricao: 'Almoço', linha_digitavel: '', chave: '' };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'f6', width: 64, height: 64 }], caption: 'empresa' } });
  await tocar('✓ ');
  ok(/confira e lance/.test(ultimoTexto()) && /Pago com dinheiro do sócio: <b>Não<\/b> — dinheiro da empresa \(o cartão final 3434 é da empresa\)/.test(ultimoTexto()), 'cartão conhecido: já sabe que é da empresa (não pergunta)');
  await escrever('/cancelar');

  // P) quem pagou dito na frase: "com meu cartão" = quem está falando (Vilson é sócio) → o aporte entra quando aprovar
  console.log('\nP) "paguei com meu cartão" (sócio) — fica aguardando aprovação');
  await escrever('paguei 80 de almoço com meu cartão, empresa, fornecedor restaurante sabor');
  ok(/Pago com dinheiro do sócio: <b>Sim — Vilson Souza<\/b>/.test(ultimoTexto()), 'entendeu que o sócio que está falando pagou');
  await tocar('✓ '); ok(/confira e lance/.test(ultimoTexto()), 'não pergunta de novo quem pagou');
  await tocar('Lançar a conta');
  const alm = linhas('despesas', r => r.descricao === 'Almoço')[0];
  ok(alm && alm.socio_pendente === 'Vilson Souza' && alm.aprovacao === 'pendente' && alm.status_pagamento === 'Pago' && /Pago por Vilson Souza \(sócio\) — entra no aporte quando a conta for aprovada/.test(alm.observacao || '') && DB.aportes.length === 1, 'conta paga pelo sócio: socio_pendente gravado e nenhum aporte antes da aprovação: ' + JSON.stringify(alm || { ultimas: DB.despesas.slice(-2).map(r => r.row_data), custos: DB.custos.slice(-1).map(r => r.row_data), texto: textos(4) }));
  ok(/O aporte de <b>Vilson Souza<\/b>|aporte de Vilson Souza|Vilson Souza/.test(ultimoTexto()) && /aguardando sua aprovação/.test(ultimoTexto()), 'a mensagem fala do aporte na aprovação');

  // Q) /aprovar — o que espera a conferência
  console.log('\nQ) /aprovar');
  await escrever('/aprovar');
  ok(/Aguardando aprovação<\/b>: \d+ conta/.test(ultimoTexto()) && /📱/.test(ultimoTexto()) && /RESTAURANTE SABOR/.test(ultimoTexto()) && /👤 Vilson Souza/.test(ultimoTexto()), 'lista as contas aguardando aprovação (as do Telegram com 📱 e quem pagou)');

  // R) /recebi — o dinheiro da nota emitida entrou
  console.log('\nR) recebimento de nota emitida');
  await escrever('recebi a nota 19');
  ok(/Registrar recebimento/.test(ultimoTexto()) && /NF 19/.test(ultimoTexto()) && /Entrou na conta em/.test(ultimoTexto()), 'achou a NF 19 a receber e confirma a data');
  await tocar('Confirmar recebimento');
  let fat = DB.faturamentos[0].row_data;
  ok(fat.data_recebimento === hj && /Vilson/.test(fat.recebido_telegram || '') && /Recebimento registrado/.test(ultimoTexto()), 'recebimento gravado na nota: ' + JSON.stringify(fat));
  await tocar('Desfazer'); fat = DB.faturamentos[0].row_data;
  ok(!('data_recebimento' in fat) && !('recebido_telegram' in fat) && /voltou para "a receber"/.test(ultimoTexto()), 'Desfazer: a nota voltou para "a receber"');

  // S) /concluir — tarefa feita
  console.log('\nS) concluir tarefa');
  await escrever('/concluir medição');
  ok(/Concluir tarefa/.test(ultimoTexto()) && /Pedir a medição à fiscalização/.test(ultimoTexto()), 'lista a tarefa aberta');
  await tocar('1');
  let tf = linhas('acoes', r => r.o_que === 'Pedir a medição à fiscalização')[0];
  ok(tf.status === 'Concluída' && tf.data_conclusao === hj, 'tarefa concluída: ' + JSON.stringify(tf));
  await tocar('Desfazer'); tf = linhas('acoes', r => r.o_que === 'Pedir a medição à fiscalização')[0];
  ok(tf.status === 'Aberta' && tf.data_conclusao === '', 'Desfazer: a tarefa voltou a ficar aberta');

  // T) /doc — documentos do kit da empresa
  console.log('\nT) documentos da empresa');
  n0 = CALLS.length; await escrever('/doc');
  ok(/Documentos<\/b> — kit da empresa/.test(ultimoTexto()) && /vencido<\/b>/.test(ultimoTexto()) && /FGTS/.test(ultimoTexto()), 'lista o kit (a certidão vencida marcada)');
  await tocar('2');
  docs = CALLS.slice(n0).filter(c => c.m === 'sendDocument');
  ok(docs.length === 1 && /crf fgts/.test(docs[0].b.document.texto) && docs[0].b.document.nome === 'CRF FGTS.pdf', 'mandou o PDF do FGTS');
  await tocar('1'); ok(/está <b>vencido<\/b>/.test(ultimoTexto()), 'documento vencido não vai (como no sistema)');
  n0 = CALLS.length; await escrever('manda a certidão do fgts');
  ok(CALLS.slice(n0).some(c => c.m === 'sendDocument' && /crf fgts/.test(c.b.document.texto)), 'pedido escrito ("certidão do FGTS"): achou e mandou o FGTS');

  // U) fotos da obra
  console.log('\nU) fotos da obra');
  ARQS.p1 = { caminho: 'photos/p1.jpg', buf: cinza }; ARQS.p1m = { caminho: 'photos/p1m.jpg', buf: cinza };
  const g1 = GROQ_CHAMADAS.length;
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'p1m', width: 320, height: 240 }, { file_id: 'p1', width: 1280, height: 960 }], caption: 'fotos da obra itarantim, concretagem da laje' } });
  let im = linhas('obra_imagens', () => true);
  ok(im.length === 1 && im[0].titulo_obra === 'SES ITARANTIM' && im[0].origem === 'sistema' && im[0].etapa_obra === 'durante' && /Concretagem da laje/.test(im[0].descricao) && !!STORAGE['p/' + im[0].foto_uid + '/0000'] && !!STORAGE['p/' + im[0].thumb_uid + '/0000'], 'foto guardada na galeria da obra (no Storage): ' + JSON.stringify(im[0]));
  ok(/Foto guardada<\/b> em <b>SES ITARANTIM/.test(ultimoTexto()) && GROQ_CHAMADAS.length === g1, 'confirmou (sem gastar leitura da Groq)');
  await tocar('Desfazer'); ok(!!linhas('obra_imagens', () => true)[0]._lixeira_em, 'Desfazer mandou a foto para a Lixeira');
  ARQS.p2 = { caminho: 'photos/p2.jpg', buf: cinza }; ARQS.p3 = { caminho: 'photos/p3.jpg', buf: cinza };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'p2', width: 800, height: 600 }], caption: 'fotos obra itapetinga', media_group_id: 'al1' } });
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'p3', width: 800, height: 600 }], media_group_id: 'al1' } });
  im = linhas('obra_imagens', r => r.titulo_obra === 'ESCOLA ITAPETINGA');
  ok(im.length === 2 && CALLS.filter(c => c.m === 'setMessageReaction').length === 2, 'álbum (legenda só na 1ª): as 2 fotos foram para a obra da legenda, com 👍');
  GROQ.visao = { tipo: 'outro', fornecedor: '', cnpj_cpf: '', valor: 0, vencimento: '', data: '', pago: false, numero: '', descricao: '', linha_digitavel: '', chave: '' };
  ARQS.p4 = { caminho: 'photos/p4.jpg', buf: cinza };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'p4', width: 64, height: 64 }] } });
  ok(/É uma <b>foto de obra<\/b>/.test(ultimoTexto()), 'foto sem boleto nem comprovante: pergunta se é foto de obra');
  await tocar('Sim'); await tocar('ESCOLA ITAPETINGA');
  ok(linhas('obra_imagens', r => r.titulo_obra === 'ESCOLA ITAPETINGA').length === 3 && /Foto guardada/.test(ultimoTexto()), 'guardou na obra escolhida');

  // V) áudio: quem pagou, a "cola" do Whisper, a frase inventada e o aviso de áudio pouco claro
  console.log('\nV) áudio mais certeiro');
  ARQS.v2 = { caminho: 'voice/file_2.oga', buf: Buffer.from('OggS-audio-2') };
  GROQ.transcricao = 'Oi robô, lança 200 de internet da empresa, já paguei com meu cartão. Legendas pela comunidade Amara.org';
  GROQ.segmentos = [{ text: 'Oi robô, lança 200 de internet da empresa, já paguei com meu cartão.', avg_logprob: -1.05, no_speech_prob: 0.05, compression_ratio: 1.3 }, { text: ' Legendas pela comunidade Amara.org', avg_logprob: -0.3, no_speech_prob: 0.1, compression_ratio: 1.1 }];
  GROQ.intencao = { acao: 'conta', valor: 200, fornecedor: '', descricao: 'internet', onde: 'empresa', obra: '', pago: true, forma: '', quem_pagou: 'eu' };
  const a0 = GROQ_CHAMADAS.length;
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, voice: { file_id: 'v2', duration: 5, mime_type: 'audio/ogg' } } });
  ok(GROQ_CHAMADAS.slice(a0).includes('audio:whisper-large-v3'), 'o áudio foi no whisper-large-v3 (o mais preciso)');
  ok(/SES ITARANTIM/.test(GROQ.ultimoPrompt || '') && /Vilson Souza/.test(GROQ.ultimoPrompt || ''), 'a "cola" do Whisper levou as obras e os sócios');
  const tr = CALLS.filter(c => c.m === 'sendMessage' && /🎤/.test(c.b.text || '')).pop();
  ok(tr && !/Amara/.test(tr.b.text) && /não ficou clara/.test(tr.b.text), 'tirou a frase inventada pelo Whisper e avisou que o áudio não ficou claro');
  ok(/Pago com dinheiro do sócio: <b>Sim — Vilson Souza<\/b>/.test(ultimoTexto()) && /R\$\s200,00/.test(ultimoTexto()), 'a IA entendeu "paguei com meu cartão": quem falou (sócio) pagou');
  await escrever('/cancelar');
  ARQS.v3 = { caminho: 'voice/file_3.oga', buf: Buffer.from('OggS-audio-3') };
  GROQ.segmentos = null; GROQ.transcricao = 'lança 75 de pregos na obra de itapetinga, vence dia 28';
  GROQ.intencao = { acao: 'conta', valor: 75, descricao: 'pregos', onde: '', obra: '', pago: null };
  await webhook({ update_id: ++uid, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, voice: { file_id: 'v3', duration: 3, mime_type: 'audio/ogg' } } });
  ok(/ESCOLA ITAPETINGA/.test(ultimoTexto()) && /R\$\s75,00/.test(ultimoTexto()), 'o que a IA deixou em branco (a obra), as regras completaram');
  await escrever('/cancelar');

  // W) consultas novas
  console.log('\nW) consultas: /obra, /fornecedor, /buscar, /receber');
  await escrever('/obra itarantim'); ok(/🏗 <b>SES ITARANTIM<\/b>/.test(ultimoTexto()) && /Contas em aberto/.test(ultimoTexto()), 'ficha da obra');
  await escrever('/fornecedor casa do construtor'); ok(/🏪 <b>CASA DO CONSTRUTOR LTDA<\/b>/.test(ultimoTexto()) && /<code>11\.222\.333\/0001-81<\/code>/.test(ultimoTexto()), 'ficha do fornecedor com o PIX para copiar');
  await escrever('qual o pix da casa do construtor?'); ok(/🏪 <b>CASA DO CONSTRUTOR LTDA<\/b>/.test(ultimoTexto()), 'pergunta escrita: "qual o pix da casa do construtor?"');
  await escrever('/buscar areia'); ok(/🔎 <b>\d+ conta\(s\) com “areia”<\/b>/.test(ultimoTexto()) && /AREIAL BOA VISTA/.test(ultimoTexto()), 'busca nas contas');
  await escrever('/receber'); ok(/💵 <b>A receber<\/b>: 1 nota/.test(ultimoTexto()) && /NF 19/.test(ultimoTexto()), 'o que falta receber');
  await escrever('/avisos'); ok(/Para onde vão os avisos automáticos/.test(ultimoTexto()) && /Resumo do dia/.test(ultimoTexto()) && /📱 Vilson/.test(ultimoTexto()) && /Conversas ligadas ao robô<\/b>: Vilson/.test(ultimoTexto()), '/avisos: para onde vai cada aviso (Telegram e e-mail)');
  await escrever('/app'); ok(/https:\/\/gestao\.vixsulempreendimentos\.com\.br\/\?instalar=1/.test(ultimoTexto()), '/app: o link que abre direto na instalação');
  // o "perfil" do iPhone (api/app.js): ícone da Vixsul na tela de início, em tela cheia
  const appJs = require('../api/app.js'), rp = { statusCode: 0, h: {}, setHeader(k, v) { this.h[String(k).toLowerCase()] = v; }, end(b) { this.corpo = b; } };
  await appJs({ method: 'GET', headers: {}, query: {} }, rp);
  ok(rp.statusCode === 200 && rp.h['content-type'] === 'application/x-apple-aspen-config' && /attachment; filename="Vixsul\.mobileconfig"/.test(rp.h['content-disposition'] || '') && /com\.apple\.webClip\.managed/.test(rp.corpo) && /<key>FullScreen<\/key><true\/>/.test(rp.corpo) && /<key>Icon<\/key><data>[A-Za-z0-9+\/=]+<\/data>/.test(rp.corpo) && /<string>https:\/\/gestao\.vixsulempreendimentos\.com\.br\/<\/string>/.test(rp.corpo), 'perfil do iPhone: tipo certo, ícone e endereço em tela cheia');

  // M) código do PIX colado, pergunta normal e a tarefa de 15 minutos
  console.log('\nM) código colado, pergunta e tarefa agendada');
  await escrever(PIX); ok(/Li no código do PIX: R\$\s120,50/.test(ultimoTexto()), 'PIX copia e cola colado na conversa');
  await escrever('/cancelar');
  n0 = CALLS.length; await escrever('quais contas vencem esta semana?'); ok(CALLS.slice(n0).some(c => c.m === 'sendMessage' && !/Não entendi/.test(c.b.text || '')), 'pergunta respondida pelo sistema (sem IA)');
  const rq = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
  await telegramJs({ method: 'GET', headers: {}, query: { tick: '1' } }, rq);
  const tk = JSON.parse(rq.corpo || '{}'); ok(rq.statusCode === 200 && tk.ok, 'tarefa de 15 minutos rodou: ' + rq.corpo);
  const cmds = CALLS.filter(c => c.m === 'setMyCommands').pop();
  ok(cmds && ['aprovar', 'recebi', 'concluir', 'doc', 'obra', 'fornecedor', 'buscar', 'receber'].every(k => cmds.b.commands.some(x => x.command === k)), 'o menu de comandos do Telegram foi atualizado sozinho (versão 4)');
  const rs = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
  await telegramJs({ method: 'GET', headers: {}, query: {} }, rs); const es = JSON.parse(rs.corpo); ok(es.groq === true && es.groqOk === true && es.modelos && es.modelos.audio === 'whisper-large-v3', 'estado diz que a leitura da Groq está ligada e funcionando: ' + rs.corpo);

  // O) caixa de e-mail: boletos e notas que chegam no Gmail viram aviso no Telegram com "Lançar conta" e "Ignorar"
  console.log('\nO) e-mail: boletos e notas que chegam no Gmail');
  ok(CAIXA.aberturas.length >= 1 && CAIXA.aberturas.every(a => a.p === 'INBOX' && a.ro), 'a caixa de entrada foi aberta só para leitura (a 1ª olhada guardou o marcador)');
  const env = (nome, end, assunto) => ({ from: [{ name: nome, address: end }], subject: assunto });
  const multi = (...ps) => ({ type: 'multipart/mixed', childNodes: ps }), agora = new Date();
  const XML_VIXSUL = XML.replace('<CNPJ>11222333000181</CNPJ><xNome>CASA DO CONSTRUTOR LTDA</xNome>', '<CNPJ>64518375000120</CNPJ><xNome>VIXSUL EMPREENDIMENTOS</xNome>').replace('<CNPJ>64518375000120</CNPJ><xNome>VIXSUL</xNome>', '<CNPJ>13000000000100</CNPJ><xNome>PREFEITURA</xNome>');
  const linhaCorpo = linhaBoleto(480.5, em(10));
  CAIXA.msgs.push(
    { uid: 101, date: agora, envelope: env('Madeireira São José', 'financeiro@madeireira.exemplo', 'Boleto - NF 4455'), bodyStructure: multi({ part: '1', type: 'text/plain', size: 120 }, { part: '2', type: 'application/pdf', size: PDF.length, disposition: 'attachment', dispositionParameters: { filename: 'boleto.pdf' } }), partes: { 1: Buffer.from('Segue o boleto.'), 2: PDF } },
    { uid: 102, date: agora, envelope: env('Loja X', 'ofertas@loja.exemplo', 'Promoção de fim de ano'), bodyStructure: { type: 'text/html', size: 500 }, partes: { 1: Buffer.from('<p>Ofertas imperdíveis</p>') } },
    { uid: 103, date: agora, envelope: env('Casa do Construtor', 'nfe@casa.exemplo', 'NF-e 5678'), bodyStructure: multi({ part: '1', type: 'text/plain', size: 50 }, { part: '2', type: 'application/xml', size: XML.length, dispositionParameters: { filename: 'nota-5678.xml' } }), partes: { 1: Buffer.from('Nota em anexo'), 2: Buffer.from(XML) } },
    { uid: 104, date: agora, envelope: env('Sistema', 'sistema@exemplo.com', 'NFS-e emitida'), bodyStructure: multi({ part: '1', type: 'application/xml', size: XML_VIXSUL.length, dispositionParameters: { filename: 'emitida.xml' } }), partes: { 1: Buffer.from(XML_VIXSUL) } },
    { uid: 105, date: agora, envelope: env('Areial Boa Vista', 'cobranca@areial.exemplo', 'Sua fatura chegou'), bodyStructure: { type: 'text/plain', size: 300 }, partes: { 1: Buffer.from('Olá! Sua fatura de areia está disponível.\nLinha digitável:\n' + linhaCorpo + '\nObrigado.') } },
    { uid: 106, date: agora, envelope: env('Madeireira São José', 'financeiro@madeireira.exemplo', 'Boleto - NF 4455 (reenvio)'), bodyStructure: multi({ part: '1', type: 'application/pdf', size: PDF.length, dispositionParameters: { filename: 'boleto.pdf' } }), partes: { 1: PDF } });
  n0 = CALLS.length;
  const rq2 = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
  await telegramJs({ method: 'GET', headers: {}, query: { tick: '1' } }, rq2);
  const avisos = CALLS.slice(n0).filter(c => (c.m === 'sendDocument' && /Chegou no e-mail/.test(c.b.caption || '')) || (c.m === 'sendMessage' && /Chegou no e-mail/.test(c.b.text || '')));
  ok(/e-mail: 3 aviso/.test(rq2.corpo), 'a tarefa de 15 minutos avisou 3 cobranças: ' + rq2.corpo);
  ok(avisos.length === 3, '3 avisos no Telegram (boleto em PDF, nota em XML e boleto escrito no e-mail) — propaganda, nota da Vixsul e boleto repetido ficaram de fora');
  const av1 = avisos.find(c => /boleto/.test(c.b.caption || '') && c.m === 'sendDocument'), av3 = avisos.find(c => /NF-e/.test(c.b.caption || '')), av5 = avisos.find(c => c.m === 'sendMessage');
  ok(av1 && /R\$\s1\.234,56/.test(av1.b.caption) && /vence/.test(av1.b.caption) && av1.b.document.nome === 'boleto.pdf' && av1.b.parse_mode === 'HTML' && /e:[0-9a-f]+:l/.test(av1.b.reply_markup), 'aviso do boleto: com o PDF, valor, vencimento e os botões');
  ok(av3 && /3 parcelas/.test(av3.b.caption) && /CASA DO CONSTRUTOR LTDA/.test(av3.b.caption), 'aviso da nota (XML) com as 3 parcelas');
  ok(av5 && /R\$\s480,50/.test(av5.b.text) && /Areial/i.test(av5.b.text), 'aviso do boleto escrito no corpo do e-mail');
  ok(DB.arquivos.filter(r => r.row_data.tipo === 'telegram_email').length === 3 && !DB.arquivos.some(r => r.row_data.tipo === 'telegram_email' && /Madeireira|CONSTRUTOR|Boleto - NF/i.test(JSON.stringify(r.row_data))), 'o que foi lido de cada aviso ficou guardado cifrado');
  const apertar = async (c, txt) => { const kb = JSON.parse(c.m === 'sendDocument' ? c.b.reply_markup : JSON.stringify(c.b.reply_markup)), b = kb.inline_keyboard.flat().find(x => x.text.includes(txt));
    return webhook({ update_id: ++uid, callback_query: { id: 'cq' + uid, data: b.callback_data, message: { message_id: c.r.message_id, chat: { id: CHAT } } } }); };
  await apertar(av1, 'Lançar conta');
  ok(/Li na linha digitável do boleto \(PDF\): R\$\s1\.234,56/.test(ultimoTexto()) && /Nova conta/.test(ultimoTexto()), '"Lançar conta" abriu o cartão da conta já preenchido');
  await apertar(av3, 'Ignorar'); n0 = CALLS.length; await apertar(av3, 'Ignorar');
  ok(CALLS.slice(n0).some(c => c.m === 'answerCallbackQuery' && /Já ignorado/.test(c.b.text || '')), '"Ignorar" vale uma vez só');
  n0 = CALLS.length; const rq3 = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } };
  await telegramJs({ method: 'GET', headers: {}, query: { tick: '1' } }, rq3);
  ok(!CALLS.slice(n0).some(c => /Chegou no e-mail/.test((c.b.caption || c.b.text || ''))), 'na próxima olhada não repete os mesmos avisos');
  const est2 = JSON.parse((await (async () => { const r = { statusCode: 0, setHeader() {}, end(b) { this.corpo = b; } }; await telegramJs({ method: 'GET', headers: {}, query: {} }, r); return r; })()).corpo);
  ok(est2.caixa && est2.caixa.avisados === 3 && !est2.caixa.erro && est2.caixa.ultima, 'o estado mostra a última olhada no e-mail: ' + JSON.stringify(est2.caixa));
  await escrever('/cancelar');

  console.log(`\n${passos - falhas} de ${passos} conferências certas.`);
  if (falhas) { console.log(`❌ ${falhas} falha(s).`); process.exit(1); }
  console.log('✅ Tudo certo.');
})().catch(e => { console.error('ERRO NO TESTE:', e && e.message); console.error(e && e.stack || e); process.exit(1); });
