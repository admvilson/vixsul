/* LICITAÇÕES — o que o navegador não consegue sozinho no PNCP (Portal Nacional de Contratações Públicas, grátis).
   POST { acao:'edital', cnpj, ano, seq, doc } → baixa o arquivo do edital no PNCP (o site barra o navegador) e devolve o
   TEXTO (pdf.js, sem desenhar nada; o PDF não roda código). Edital compactado (.zip) ou em Word (.docx) também é lido.
   Com a leitura grátis da Groq ligada (GROQ_API_KEY, a mesma do robô do Telegram), devolve ainda a LISTA do que o edital
   exige: documentos de habilitação, o que preencher, visita técnica, garantia da proposta, capital/patrimônio mínimo,
   índices e validade da proposta. Sem a Groq (ou se ela falhar), o próprio sistema procura pelas palavras.
   Só atende o sistema logado (passe) e só baixa do pncp.gov.br. */
const zlib = require('zlib');
const { ORIGENS, cors, exigirLogin } = require('./_auth');
const GROQ = process.env.GROQ_API_KEY || '';
const MODELOS = [...new Set([process.env.GROQ_TEXT_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'].filter(Boolean))];
const LIMITE = 30 * 1024 * 1024, MAX_TXT = 260000;

async function baixar(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('O PNCP respondeu ' + r.status + ' ao baixar o edital.');
    if ((+r.headers.get('content-length') || 0) > LIMITE) throw new Error('O edital passa de 30 MB — abra direto no PNCP.');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > LIMITE) throw new Error('O edital passa de 30 MB — abra direto no PNCP.');
    const cd = r.headers.get('content-disposition') || '';
    let nome = (cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i) || [])[1] || '';
    try { nome = decodeURIComponent(nome); } catch (e) { /* fica como veio */ }
    return { buf, tipo: r.headers.get('content-type') || '', nome };
  } catch (e) { if (e && e.name === 'AbortError') throw new Error('O PNCP demorou demais para entregar o edital.'); throw e; }
  finally { clearTimeout(t); }
}

// ── texto do PDF (pdf.js, como o leitor do Firefox), até MAX_TXT caracteres ──
async function textoPdf(buf) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  let txt = '';
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 200) && txt.length < MAX_TXT; p++) {
      const tc = await (await doc.getPage(p)).getTextContent(); let y0 = null;
      for (const it of tc.items) { const y = it.transform ? Math.round(it.transform[5]) : null; if (y0 !== null) txt += y !== y0 ? '\n' : ' '; txt += it.str || ''; y0 = y; if (it.hasEOL) { txt += '\n'; y0 = null; } }
      txt += '\n';
    }
    return { texto: txt, paginas: doc.numPages };
  } finally { try { await doc.destroy(); } catch (e) { /* nada */ } }
}
// ── .zip e .docx (que também é um zip): leitor mínimo, só com o zlib do Node ──
function entradasZip(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) return [];
  const n = buf.readUInt16LE(e + 10), out = []; let p = buf.readUInt32LE(e + 16);
  for (let k = 0; k < n && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32);
    out.push({ nome: buf.slice(p + 46, p + 46 + ln).toString('utf8'), metodo: buf.readUInt16LE(p + 10), comp: buf.readUInt32LE(p + 20), loc: buf.readUInt32LE(p + 42) });
    p += 46 + ln + le + lc;
  }
  return out;
}
function abrirZip(buf, ent) {
  const p = ent.loc; if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) return null;
  const ini = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28), dados = buf.slice(ini, ini + ent.comp);
  if (ent.metodo === 0) return dados;
  if (ent.metodo === 8) { try { return zlib.inflateRawSync(dados); } catch (e) { return null; } }
  return null;
}
const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function textoDocx(buf) {
  const e = entradasZip(buf).find(x => x.nome === 'word/document.xml'); if (!e) return '';
  const xml = (abrirZip(buf, e) || Buffer.alloc(0)).toString('utf8');
  return ent(xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
}
const ehPdf = b => b.length > 4 && b.slice(0, 4).toString('latin1') === '%PDF';
const ehZip = b => b.length > 4 && b.readUInt32LE(0) === 0x04034b50;
async function textoDe(buf, nome) {
  if (ehPdf(buf)) return { ...(await textoPdf(buf)), arquivos: [nome || 'edital.pdf'] };
  if (ehZip(buf)) {
    const es = entradasZip(buf);
    if (es.some(x => x.nome === 'word/document.xml')) return { texto: textoDocx(buf), paginas: 0, arquivos: [nome || 'edital.docx'] };
    // .zip com os arquivos do edital: o edital primeiro (pelo nome), depois os outros PDFs e Words
    const docs = es.filter(x => /\.(pdf|docx)$/i.test(x.nome) && !/__MACOSX/.test(x.nome))
      .sort((a, b) => (/edital/i.test(b.nome) ? 1 : 0) - (/edital/i.test(a.nome) ? 1 : 0) || a.nome.localeCompare(b.nome));
    let texto = '', paginas = 0; const arquivos = [];
    for (const x of docs) {
      if (texto.length >= MAX_TXT) break;
      const b = abrirZip(buf, x); if (!b) continue;
      try {
        const t = ehPdf(b) ? await textoPdf(b) : { texto: textoDocx(b), paginas: 0 };
        texto += `\n===== ${x.nome.split('/').pop()} =====\n` + t.texto; paginas += t.paginas || 0; arquivos.push(x.nome.split('/').pop());
      } catch (e) { arquivos.push(x.nome.split('/').pop() + ' (não deu para ler)'); }
    }
    return { texto, paginas, arquivos };
  }
  throw new Error('O edital não está em PDF, Word nem ZIP — abra direto no PNCP.');
}

// ── o trecho que interessa (habilitação, proposta e exigências especiais), para caber na leitura da Groq ──
function trecho(txt, max) {
  const t = txt.replace(/[ \t]+/g, ' '), partes = [], usado = [];
  const pega = (i, n) => { if (i < 0) return; const a = Math.max(0, i - 200), b = Math.min(t.length, i + n); if (usado.some(([x, y]) => a < y && b > x)) return; usado.push([a, b]); partes.push([a, t.slice(a, b)]); };
  const ach = rx => { const m = rx.exec(t); return m ? m.index : -1; };
  const iH = ach(/DOCUMENTOS? (DE|PARA|DA) HABILITA[CÇ][AÃ]O|DA HABILITA[CÇ][AÃ]O|HABILITA[CÇ][AÃ]O JUR[IÍ]DICA/);
  pega(iH >= 0 ? iH : ach(/documentos? (de|para|da) habilita[cç][aã]o|habilita[cç][aã]o jur[ií]dica/i), 9000);
  pega(ach(/QUALIFICA[CÇ][AÃ]O T[EÉ]CNICA/i), 2500);
  pega(ach(/QUALIFICA[CÇ][AÃ]O ECON[OÔ]MICO/i), 1800);
  pega(ach(/DA PROPOSTA|PROPOSTA DE PRE[CÇ]OS|DO ENVIO DA PROPOSTA/), 2200);
  [/visita t[eé]cnica/i, /garantia (de|da) proposta/i, /capital social m[ií]nimo|patrim[oô]nio l[ií]quido m[ií]nimo/i, /validade da proposta/i, /amostra/i].forEach(rx => pega(ach(rx), 700));
  let s = partes.sort((a, b) => a[0] - b[0]).map(p => p[1]).join('\n…\n');
  if (s.length < 3000) s = t.slice(0, max);
  return s.slice(0, max);
}
async function listaGroq(txt) {
  if (!GROQ) return { lista: null, msg: 'A leitura grátis da Groq não está ligada — o sistema procurou pelas palavras.' };
  const pedido = `Do trecho do edital abaixo (licitação no Brasil, Lei 14.133/2021), liste o que a empresa licitante precisa apresentar. Responda SÓ com um JSON neste formato:
{"documentos":[{"grupo":"juridica|fiscal|trabalhista|economica|tecnica|declaracao|outro","nome":"","detalhe":""}],
"preencher":[{"nome":"","detalhe":""}],
"visita_tecnica":{"exige":"sim|nao|facultativa","detalhe":""},
"garantia_proposta":{"exige":"sim|nao","detalhe":""},
"capital_ou_patrimonio":"","indices":"","validade_proposta":"","observacoes":[""]}
Regras: só o que estiver escrito no trecho; cada "detalhe" com no máximo 25 palavras (validade, quantidade mínima, índice, prazo); "preencher" = o que a empresa tem de montar ou preencher (proposta de preços, planilha orçamentária, composições de BDI e encargos, cronograma, declarações, modelos dos anexos).
TRECHO DO EDITAL:
${trecho(txt, 14000)}`;
  const erros = [];
  for (const m of MODELOS) {
    const corpo = { model: m, temperature: 0.1, max_completion_tokens: 2600, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: 'Você lê editais de licitação de obras e serviços de engenharia e lista, de forma objetiva e em português, o que a empresa licitante precisa apresentar. Responda apenas com JSON válido.' }, { role: 'user', content: pedido }] };
    if (/gpt-oss/i.test(m)) { corpo.reasoning_effort = 'low'; corpo.include_reasoning = false; corpo.max_completion_tokens = 4000; }
    else if (/qwen/i.test(m)) corpo.reasoning_effort = 'none';
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 40000);
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: ctl.signal });
      const j = await r.json().catch(() => null);
      if (!r.ok) { erros.push(m + ': ' + ((j && j.error && j.error.message) || r.status)); continue; }
      let s = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
      s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
      if (o && typeof o === 'object') return { lista: o, modelo: m };
    } catch (e) { erros.push(m + ': ' + (e && e.name === 'AbortError' ? 'demorou demais' : (e && e.message) || e)); }
    finally { clearTimeout(t); }
  }
  return { lista: null, msg: 'A Groq não conseguiu ler agora (' + erros.slice(0, 2).join(' · ') + ') — o sistema procurou pelas palavras.' };
}

module.exports = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    if (req.method === 'GET') return responder(200, { ok: true, groq: !!GROQ });
    if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use GET ou POST.' });
    const l = exigirLogin(req);
    if (!l.ok) return responder(401, { ok: false, sair: true, msg: 'A sessão terminou. Entre no sistema de novo.' });
    if (!ORIGENS.some(r => r.test(req.headers.origin || ''))) return responder(403, { ok: false, msg: 'Origem não permitida.' });
    const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
    if (b.acao !== 'edital') return responder(400, { ok: false, msg: 'Ação desconhecida.' });
    const cnpj = String(b.cnpj || '').replace(/\D/g, ''), ano = String(b.ano || '').replace(/\D/g, ''), seq = String(b.seq || '').replace(/\D/g, ''), doc = String(b.doc || '').replace(/\D/g, '');
    if (cnpj.length !== 14 || ano.length !== 4 || !seq || !doc) return responder(400, { ok: false, msg: 'Licitação ou documento inválido.' });
    const arq = await baixar(`https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${+seq}/arquivos/${+doc}`);
    const t = await textoDe(arq.buf, arq.nome);
    const texto = String(t.texto || '').replace(/\u0000/g, '').slice(0, MAX_TXT);
    if (texto.replace(/\s/g, '').length < 200) return responder(200, { ok: true, nome: arq.nome, paginas: t.paginas, arquivos: t.arquivos, texto: '', lista: null, msg: 'O edital parece ser uma imagem escaneada (sem texto para ler) — confira os documentos exigidos abrindo no PNCP.' });
    const g = b.semGroq ? { lista: null } : await listaGroq(texto);
    return responder(200, { ok: true, nome: arq.nome, paginas: t.paginas, arquivos: t.arquivos, tamanho: arq.buf.length, texto, lista: g.lista, modelo: g.modelo || '', msg: g.msg || '' });
  } catch (e) {
    return responder(200, { ok: false, msg: (e && e.message) || String(e) });
  }
};
