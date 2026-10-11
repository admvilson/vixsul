/* Leitura do cupom fiscal eletrônico (NFC-e) de uma compra, para lançar as contas a pagar.
   O QR code do cupom leva à página de consulta da SEFAZ; o navegador não pode ler essa página
   (outro site), então esta função busca a página e devolve fornecedor, data, itens e total.
   Só aceita endereços de órgãos públicos (*.gov.br). Não guarda nada. */
const ORIGENS = [/^https:\/\/gestao\.vixsulempreendimentos\.com\.br$/, /^https:\/\/vixsul(-[\w-]+)?\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/];

function cors(req, res) {
  const o = req.headers.origin || '';
  if (ORIGENS.some(r => r.test(o))) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}
const permitido = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && /(^|\.)gov\.br$/i.test(x.hostname); } catch (e) { return false; } };
const ent = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&[a-z]+;/gi, ' ');
const limpo = s => ent(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = s => { s = String(s || '').trim(); if (/,\d{1,4}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; };

// layout padrão da consulta pública da NFC-e (txtTit / Rqtd / RUN / RvlUnit / valor), usado pela maioria das SEFAZ
function itensDaPagina(html) {
  const itens = [];
  const re = /<span class="txtTit[^"]*">([\s\S]*?)<\/span>[\s\S]*?class="Rqtd"[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="RUN"[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="RvlUnit"[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="valor"[^>]*>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    const q = limpo(m[2]).replace(/^.*?:\s*/, ''), u = limpo(m[3]).replace(/^.*?:\s*/, ''), pu = limpo(m[4]).replace(/^.*?:\s*/, '');
    itens.push({ desc: limpo(m[1]), qtd: num(q) || 1, un: u, pUnit: num(pu), total: num(limpo(m[5])) });
  }
  return itens;
}

module.exports = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use POST.' });
  const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
  if (b.acao !== 'nfce') return responder(400, { ok: false, msg: 'Ação desconhecida.' });
  const url = String(b.url || '').trim();
  if (!permitido(url)) return responder(400, { ok: false, msg: 'Este QR code não é de uma consulta da SEFAZ.' });
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Accept: 'text/html' } });
    clearTimeout(t);
    if (!permitido(r.url || url)) return responder(400, { ok: false, msg: 'A consulta foi para um endereço que não é da SEFAZ.' });
    const buf = Buffer.from(await r.arrayBuffer()), tipo = String(r.headers.get('content-type') || '');
    const html = /iso-8859-1|latin1|windows-1252/i.test(tipo) ? buf.toString('latin1') : buf.toString('utf8');
    if (!r.ok) return responder(200, { ok: false, msg: `A SEFAZ respondeu com erro (HTTP ${r.status}).` });
    const itens = itensDaPagina(html);
    const forn = limpo((html.match(/class="txtTopo"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
    const cnpj = ((limpo(html).match(/CNPJ:?\s*([\d.\/-]{14,18})/) || [])[1] || '').replace(/\D/g, '');
    const dt = (limpo(html).match(/Emiss[ãa]o:?\s*(\d{2})\/(\d{2})\/(\d{4})/) || []), data = dt.length ? `${dt[3]}-${dt[2]}-${dt[1]}` : '';
    const total = num(limpo((html.match(/class="totalNumb txtMax"[^>]*>([\s\S]*?)<\/span>/) || html.match(/Valor a pagar[\s\S]*?class="totalNumb[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || ''));
    const numero = (limpo(html).match(/N[úu]mero:?\s*(\d{1,9})/) || [])[1] || '';
    return responder(200, { ok: true, forn, cnpj, data, numero, total, itens, texto: itens.length ? '' : ent(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(tr|div|p|li)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim().slice(0, 20000) });
  } catch (e) {
    return responder(200, { ok: false, msg: e && e.name === 'AbortError' ? 'A SEFAZ demorou demais para responder.' : 'Não consegui abrir a consulta da SEFAZ: ' + ((e && e.message) || e) });
  }
};
