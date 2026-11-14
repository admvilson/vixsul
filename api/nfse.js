/* Emissão automática da NFS-e Nacional (Receita Federal) para o sistema de gestão da Vixsul.
   O certificado digital e a senha vêm do navegador do usuário a cada pedido (HTTPS) e são usados só na
   memória desta execução: nada é gravado aqui. Só aceita certificado do CNPJ da Vixsul.
   Ações: ping · info (confere o certificado) · convenio (o município está no Emissor Nacional?) ·
   emitir (monta, assina e envia a DPS; devolve o XML da NFS-e e o PDF do DANFSe) · recuperar (pela chave
   ou pelo Id da DPS, se a resposta da emissão se perdeu) · teste-assinatura (só monta e assina, sem enviar) ·
   assinar-pdf (assina um PDF do sistema — orçamento — com o certificado). */
const https = require('https'), zlib = require('zlib');
const core = require('./_nfse_core');
const { assinarPdf } = require('./_pdf_assina');
const CNPJ_EMPRESA = '64518375000120';
// origens aceitas, cabeçalhos e o "passe" de login: ver _auth.js
const { ORIGENS, cors, exigirLogin } = require('./_auth');
// chamada à Receita com o certificado do cliente (TLS mútuo)
function pedir(url, { metodo = 'GET', corpo = null, crt, aceitar = 'application/json' }) {
  return new Promise((ok, er) => {
    const u = new URL(url);
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: metodo, key: crt.keyPem, cert: crt.certPem, timeout: 25000,
      headers: Object.assign({ Accept: aceitar }, corpo ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {})
    }, resp => { const ch = []; resp.on('data', c => ch.push(c)); resp.on('end', () => ok({ status: resp.statusCode, tipo: String(resp.headers['content-type'] || ''), buf: Buffer.concat(ch) })); });
    r.on('timeout', () => r.destroy(new Error('A Receita demorou demais para responder.')));
    r.on('error', er);
    if (corpo) r.write(corpo);
    r.end();
  });
}
const json = b => { try { return JSON.parse(b.toString('utf8')); } catch (e) { return null; } };
/* ═══ NOTAS DE COMPRA (emitidas CONTRA a Vixsul) ═══
   NF-e (produto): distribuição da SEFAZ no Ambiente Nacional (NFeDistribuicaoDFe, SOAP 1.2), a partir do último NSU
   lido — até 50 documentos por vez (resumo da nota, nota completa, eventos), já descompactados. Regra da SEFAZ: sem
   nada novo (cStat 137) ou já no último NSU, só perguntar de novo depois de 1 hora (senão 656 — consumo indevido).
   NFS-e (serviço): distribuição do Ambiente de Dados Nacional (ADN) para o contribuinte, a partir do último NSU. */
function pedirSoap(url, corpo, crt, acao) {
  return new Promise((ok, er) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', key: crt.keyPem, cert: crt.certPem, timeout: 25000,
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${acao}"`, 'Content-Length': Buffer.byteLength(corpo) } },
      resp => { const ch = []; resp.on('data', c => ch.push(c)); resp.on('end', () => ok({ status: resp.statusCode, txt: Buffer.concat(ch).toString('utf8') })); });
    r.on('timeout', () => r.destroy(new Error('A SEFAZ demorou demais para responder.')));
    r.on('error', er); r.write(corpo); r.end();
  });
}
const tagX = (xml, t) => { const m = new RegExp(`<(?:[\\w-]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${t}>`).exec(String(xml || '')); return m ? m[1].trim() : ''; };
async function nfeRecebidas(crt, ult, tpAmb) {
  const url = tpAmb === 1 ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx' : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
  const nsu = (String(ult || '0').replace(/\D/g, '') || '0').padStart(15, '0').slice(-15);
  const corpo = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${tpAmb}</tpAmb><cUFAutor>29</cUFAutor><CNPJ>${CNPJ_EMPRESA}</CNPJ><distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
  const r = await pedirSoap(url, corpo, crt, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse');
  if (r.status !== 200) return { ok: false, msg: `A SEFAZ respondeu HTTP ${r.status}.`, bruto: r.txt.slice(0, 400) };
  const ret = tagX(r.txt, 'retDistDFeInt'), docs = [];
  if (!ret) return { ok: false, msg: 'A SEFAZ não devolveu a resposta esperada.', bruto: r.txt.slice(0, 400) };
  const re = /<(?:[\w-]+:)?docZip([^>]*)>([^<]+)<\/(?:[\w-]+:)?docZip>/g; let m;
  while ((m = re.exec(ret))) {
    const at = m[1], n = (/NSU="(\d+)"/.exec(at) || [])[1] || '', sc = (/schema="([^"]+)"/.exec(at) || [])[1] || '';
    try { docs.push({ nsu: n, schema: sc, xml: zlib.gunzipSync(Buffer.from(m[2].trim(), 'base64')).toString('utf8') }); } catch (e) { docs.push({ nsu: n, schema: sc, xml: '', erro: 'não descompactou' }); }
  }
  return { ok: true, origem: 'nfe', cStat: tagX(ret, 'cStat'), xMotivo: tagX(ret, 'xMotivo'), ultNSU: tagX(ret, 'ultNSU'), maxNSU: tagX(ret, 'maxNSU'), docs };
}
async function nfseRecebidas(crt, ult, tpAmb) {
  const amb = core.AMB[tpAmb === 1 ? 1 : 2], nsu = Math.max(0, parseInt(String(ult || '0').replace(/\D/g, '') || '0', 10));
  const r = await pedir(`${amb.adn}/contribuintes/DFe/${nsu}?cnpjConsulta=${CNPJ_EMPRESA}&lote=true`, { crt }), j = json(r.buf);
  // os nomes dos campos sem depender de maiúsculas/minúsculas (LoteDFe, NSU, ChaveAcesso, TipoDocumento, ArquivoXml…)
  const pega = (o, rx) => { if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined; const k = Object.keys(o).find(x => rx.test(x)); return k ? o[k] : undefined; };
  const st = String(pega(j, /status/i) || '');
  if (r.status === 404 || /NENHUM/i.test(st)) return { ok: true, origem: 'nfse', status: st || 'NENHUM_DOCUMENTO_LOCALIZADO', ultNSU: String(nsu), docs: [] };
  if (r.status !== 200 || !j) return { ok: false, msg: `O Ambiente Nacional da NFS-e respondeu HTTP ${r.status}.`, erros: erros(j), bruto: r.buf.toString('utf8').slice(0, 400) };
  const lote = Array.isArray(j) ? j : (pega(j, /^lote/i) || pega(j, /documentos|dfe/i) || []);
  const docs = []; let maior = nsu;
  (Array.isArray(lote) ? lote : []).forEach(d => {
    const n = parseInt(pega(d, /^nsu$/i), 10) || 0; if (n > maior) maior = n;
    const b64 = pega(d, /arquivo|xml/i); let xml = '';
    if (typeof b64 === 'string' && b64) { try { xml = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'); } catch (e) { try { xml = Buffer.from(b64, 'base64').toString('utf8'); } catch (e2) { xml = ''; } } }
    docs.push({ nsu: String(n), chave: String(pega(d, /chave/i) || ''), tipo: String(pega(d, /^tipo.?doc/i) || pega(d, /^tipo/i) || ''), xml });
  });
  return { ok: true, origem: 'nfse', status: st, ultNSU: String(maior), docs, erros: erros(j) };
}
const erros = j => { const l = j && (j.erros || j.Erros || j.erro || j.Erro); return (Array.isArray(l) ? l : l ? [l] : []).map(e => ({ codigo: e.Codigo || e.codigo || '', descricao: e.Descricao || e.descricao || e.mensagem || e.Mensagem || '', complemento: e.Complemento || e.complemento || '' })); };
const xmlDaResposta = j => { if (!j) return ''; for (const k of Object.keys(j)) if (/xml.*gzip.*b64/i.test(k) && typeof j[k] === 'string') return zlib.gunzipSync(Buffer.from(j[k], 'base64')).toString('utf8'); return ''; };
async function danfse(amb, chave, crt) {
  try {
    const p = await pedir(`${amb.adn}/danfse/${chave}`, { crt, aceitar: 'application/pdf' });
    if (p.status === 200 && /pdf/i.test(p.tipo)) return { pdf: p.buf.toString('base64'), aviso: '' };
    return { pdf: '', aviso: `o PDF (DANFSe) não veio agora (HTTP ${p.status}) — dá para baixar depois` };
  } catch (e) { return { pdf: '', aviso: 'o PDF (DANFSe) não veio agora: ' + e.message }; }
}
async function notaPelaChave(amb, chave, crt) {
  const r = await pedir(`${amb.sefin}/nfse/${chave}`, { crt }), j = json(r.buf), xml = xmlDaResposta(j);
  if (r.status !== 200 || !xml) return null;
  const d = await danfse(amb, chave, crt);
  return { chave, xml, pdf: d.pdf, avisoPdf: d.aviso, nota: core.lerNFSe(xml) };
}

module.exports = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use POST.' });
  // só quem entrou no sistema usa (depois que a segurança estiver configurada na Vercel)
  if (!exigirLogin(req).ok) return responder(401, { ok: false, sair: true, msg: 'A sessão terminou. Entre no sistema de novo.' });
  const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
  try {
    if (b.acao === 'ping') return responder(200, { ok: true, leiaute: core.VERSAO });
    if (!b.pfx || !b.senha) return responder(400, { ok: false, msg: 'Envie o certificado e a senha.' });
    const crt = core.lerCertificado(b.pfx, b.senha);
    const info = { nome: crt.nome, cnpj: crt.cnpj, validoDe: crt.validoDe, validoAte: crt.validoAte };
    // só monta e assina (sem enviar nada à Receita): serve para conferir o XML com qualquer certificado
    if (b.acao === 'teste-assinatura') { const r = core.dpsAssinada(b.dps, crt); return responder(200, { ok: true, info, id: r.id, xml: r.xml }); }
    if (b.acao === 'teste-evento') { const r = core.eventoCancelamento({ tpAmb: 2, chave: b.chave, cMotivo: b.cMotivo, xMotivo: b.xMotivo, cnpj: crt.cnpj }, crt); return responder(200, { ok: true, info, id: r.id, xml: r.xml }); }
    if (crt.cnpj !== CNPJ_EMPRESA) return responder(403, { ok: false, info, msg: `Este certificado é de outro CNPJ (${crt.cnpj || 'sem CNPJ'}): use o certificado A1 da Vixsul.` });
    if (new Date(crt.validoAte) < new Date()) return responder(400, { ok: false, info, msg: 'O certificado venceu em ' + crt.validoAte.slice(0, 10).split('-').reverse().join('/') + '.' });
    if (b.acao === 'info') return responder(200, { ok: true, info });
    // assina um PDF do sistema (ex.: orçamento) com o certificado A1 da empresa
    if (b.acao === 'assinar-pdf') return responder(200, { ok: true, info, pdf: assinarPdf(b.pdf, crt) });
    // notas de compra emitidas contra a Vixsul: NF-e (SEFAZ) e NFS-e (Ambiente Nacional) — produção, salvo ambiente 2
    if (b.acao === 'nfe-recebidas') return responder(200, await nfeRecebidas(crt, b.ultNSU, +b.ambiente === 2 ? 2 : 1));
    if (b.acao === 'nfse-recebidas') return responder(200, await nfseRecebidas(crt, b.ultNSU, +b.ambiente === 2 ? 2 : 1));
    const amb = core.AMB[+b.ambiente === 1 ? 1 : 2];
    if (b.acao === 'convenio') {
      const cm = String(b.cMun || '').replace(/\D/g, '');
      const tentativas = [`${amb.sefin}/parametros_municipais/${cm}/convenio`, `${amb.adn}/parametrizacao/${cm}/convenio`];
      let ult = null;
      for (const u of tentativas) {
        const r = await pedir(u, { crt }); ult = { status: r.status, url: u, resposta: json(r.buf) || r.buf.toString('utf8').slice(0, 500) };
        if (r.status === 200) return responder(200, { ok: true, info, ...ult });
      }
      return responder(200, { ok: false, info, ...ult });
    }
    if (b.acao === 'emitir') {
      const d = b.dps || {};
      d.tpAmb = +b.ambiente === 1 ? 1 : 2;
      d.prest = Object.assign({}, d.prest, { cnpj: CNPJ_EMPRESA });
      const { id, xml } = core.dpsAssinada(d, crt);
      const corpo = JSON.stringify({ dpsXmlGZipB64: zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64') });
      const r = await pedir(`${amb.sefin}/nfse`, { metodo: 'POST', corpo, crt }), j = json(r.buf);
      const chave = j && (j.chaveAcesso || j.ChaveAcesso);
      if (r.status >= 200 && r.status < 300 && chave) {
        const xmlN = xmlDaResposta(j), d2 = await danfse(amb, chave, crt);
        return responder(200, { ok: true, info, id, chave, xml: xmlN, pdf: d2.pdf, avisoPdf: d2.aviso, alertas: (j.alertas || j.Alertas || []), nota: core.lerNFSe(xmlN) });
      }
      return responder(200, { ok: false, info, id, status: r.status, erros: erros(j), msg: j ? '' : `Resposta inesperada da Receita (HTTP ${r.status}): ${r.buf.toString('utf8').slice(0, 300)}`, dps: xml });
    }
    // cancelamento da NFS-e (evento e101101): motivo 1 erro na emissão, 2 serviço não prestado, 9 outros
    if (b.acao === 'cancelar') {
      const chave = String(b.chave || '').replace(/\D/g, '');
      const ev = core.eventoCancelamento({ tpAmb: +b.ambiente === 1 ? 1 : 2, chave, cMotivo: b.cMotivo, xMotivo: b.xMotivo, cnpj: CNPJ_EMPRESA }, crt);
      const corpo = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: zlib.gzipSync(Buffer.from(ev.xml, 'utf8')).toString('base64') });
      const r = await pedir(`${amb.sefin}/nfse/${chave}/eventos`, { metodo: 'POST', corpo, crt }), j = json(r.buf), er = erros(j);
      if (r.status >= 200 && r.status < 300 && j && !er.length) return responder(200, { ok: true, info, evento: xmlDaResposta(j) });
      return responder(200, { ok: false, info, status: r.status, erros: er, msg: j ? '' : `Resposta inesperada da Receita (HTTP ${r.status}): ${r.buf.toString('utf8').slice(0, 300)}` });
    }
    // procura as notas que o sistema emitiu (série e faixa de nº de DPS): serve para recuperar nota emitida e não concluída
    if (b.acao === 'procurar') {
      const serie = String(b.serie || '900').replace(/\D/g, ''), de = Math.max(1, +b.de || 1), ate = Math.min(de + 39, Math.max(de, +b.ate || de));
      const notas = [];
      for (let n = de; n <= ate; n++) {
        const id = core.idDPS({ cLocEmi: b.cLocEmi, prest: { cnpj: CNPJ_EMPRESA }, serie, nDPS: n });
        let r; try { r = await pedir(`${amb.sefin}/dps/${id}`, { crt }); } catch (e) { continue; }
        const j = json(r.buf), chave = j && (j.chaveAcesso || j.ChaveAcesso);
        if (r.status !== 200 || !chave) continue;
        const r2 = await pedir(`${amb.sefin}/nfse/${chave}`, { crt }), xml = xmlDaResposta(json(r2.buf));
        notas.push({ nDPS: n, id, chave, xml, nota: xml ? core.lerNFSe(xml) : null });
      }
      return responder(200, { ok: true, info, de, ate, notas });
    }
    if (b.acao === 'recuperar') {
      let chave = String(b.chave || '').replace(/\D/g, '');
      if (!chave && b.id) { const r = await pedir(`${amb.sefin}/dps/${encodeURIComponent(b.id)}`, { crt }), j = json(r.buf); chave = j && (j.chaveAcesso || j.ChaveAcesso) || ''; }
      if (!chave) return responder(200, { ok: false, msg: 'A Receita não tem nota gerada para esta DPS.' });
      const n = await notaPelaChave(amb, chave, crt);
      return responder(200, n ? Object.assign({ ok: true, info }, n) : { ok: false, msg: 'Não consegui baixar a nota ' + chave + ' agora.' });
    }
    return responder(400, { ok: false, msg: 'Ação desconhecida.' });
  } catch (e) {
    return responder(400, { ok: false, msg: (e && e.message) || String(e) });
  }
};
