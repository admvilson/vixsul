/* NFS-e Nacional (Receita Federal) — montagem da DPS no leiaute oficial v1.01 e assinatura XMLDSig.
   Roda no servidor (Vercel) e também no navegador (testes), com a biblioteca node-forge.
   Assinatura: RSA-SHA256 sobre o grupo infDPS (Reference URI="#Id"), C14N 1.0 e enveloped-signature —
   o XML é montado já na forma canônica (sem espaços entre as tags, atributos em ordem), então a
   forma canônica do infDPS é exatamente o texto montado com o xmlns da DPS. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('node-forge'));
  else root.NFSeCore = factory(root.forge);
})(typeof self !== 'undefined' ? self : this, function (forge) {
  const NS = 'http://www.sped.fazenda.gov.br/nfse', DS = 'http://www.w3.org/2000/09/xmldsig#';
  const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
  const VERSAO = '1.01', VER_APLIC = 'VixsulGestao-1.0';
  const AMB = {
    1: { sefin: 'https://sefin.nfse.gov.br/SefinNacional', adn: 'https://adn.nfse.gov.br' },
    2: { sefin: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional', adn: 'https://adn.producaorestrita.nfse.gov.br' }
  };
  const so = s => String(s == null ? '' : s).replace(/\D/g, '');
  const pad = (s, n) => so(s).padStart(n, '0').slice(-n);
  // texto e atributo como na forma canônica (C14N): só &, <, > (e " nos atributos) viram entidades
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
  const escAt = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
  const tx = (n, v) => (v == null || v === '') ? '' : `<${n}>${esc(v)}</${n}>`;
  const el = (n, c) => c ? `<${n}>${c}</${n}>` : '';
  const dec2 = v => { const n = Math.round((+v || 0) * 100) / 100; return n.toFixed(2); };
  const limpa = (s, max) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  // data e hora de Brasília (−03:00), um pouco antes de agora (a Receita recusa emissão "no futuro")
  function agoraBrasilia(atrasoSeg) {
    const d = new Date(Date.now() - (atrasoSeg || 60) * 1000 - 3 * 3600 * 1000);
    const z = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}T${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}-03:00`;
  }

  /* ───── certificado A1 (.pfx / .p12) ───── */
  function lerCertificado(pfxB64, senha) {
    let p12;
    try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(pfxB64)), false, senha); }
    catch (e) { throw new Error(/password|mac|invalid/i.test(String(e && e.message)) ? 'Senha do certificado incorreta.' : 'Não consegui abrir o certificado (arquivo .pfx/.p12 inválido).'); }
    const pega = t => (p12.getBags({ bagType: t })[t] || []);
    const kb = pega(forge.pki.oids.pkcs8ShroudedKeyBag).concat(pega(forge.pki.oids.keyBag));
    if (!kb.length || !kb[0].key) throw new Error('O certificado não tem a chave privada.');
    const key = kb[0].key, certs = pega(forge.pki.oids.certBag).map(b => b.cert).filter(Boolean);
    const cert = certs.find(c => c.publicKey && c.publicKey.n && c.publicKey.n.equals(key.n)) || certs[0];
    if (!cert) throw new Error('O certificado não tem o certificado público.');
    const cadeia = certs.filter(c => c !== cert);
    const cn = (cert.subject.getField('CN') || {}).value || '';
    // certificado ICP-Brasil de pessoa jurídica: o nome comum é "RAZÃO SOCIAL:CNPJ"
    const cnpj = (cn.match(/:(\d{14})\s*$/) || [])[1] || '';
    const der = c => forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes();
    return {
      key, cert,
      keyPem: forge.pki.privateKeyToPem(key),
      certPem: [cert].concat(cadeia).map(c => forge.pki.certificateToPem(c)).join('\n'),
      certB64: forge.util.encode64(der(cert)),
      nome: cn.replace(/:\d{14}\s*$/, ''), cnpj,
      validoDe: cert.validity.notBefore.toISOString(), validoAte: cert.validity.notAfter.toISOString()
    };
  }

  /* ───── DPS (leiaute 1.01) ─────
     d = { tpAmb, dCompet:'AAAA-MM-DD', serie, nDPS, cLocEmi,
           prest:{cnpj, im, opSimpNac, regApTribSN, regEspTrib},
           toma:{cnpj|cpf, xNome, email},
           serv:{cLocPrestacao, cTribNac, cTribMun, xDescServ, cNBS, obra:{cObra}|{cep,xLgr,nro,xCpl,xBairro}, xInfComp},
           valores:{vServ, tribISSQN, tpRetISSQN, pAliq, vRetCP, vRetIRRF, vRetCSLL, pTotTribSN} } */
  function idDPS(d) { return 'DPS' + pad(d.cLocEmi, 7) + '2' + pad(d.prest.cnpj, 14) + pad(d.serie, 5) + pad(d.nDPS, 15); }
  function montarInfDPS(d, dhEmi) {
    const id = idDPS(d), p = d.prest, t = d.toma || null, s = d.serv, v = d.valores;
    if (!/^\d{7}$/.test(so(d.cLocEmi))) throw new Error('Código IBGE do município emissor inválido.');
    if (!/^\d{7}$/.test(so(s.cLocPrestacao))) throw new Error('Código IBGE do município da prestação inválido.');
    if (!/^\d{6}$/.test(so(s.cTribNac))) throw new Error('Código de tributação nacional deve ter 6 números (ex.: 070202).');
    if (!(+v.vServ > 0)) throw new Error('Valor do serviço inválido.');
    const sn = String(p.opSimpNac || '1');
    const prest = tx('CNPJ', pad(p.cnpj, 14)) + tx('IM', limpa(p.im, 15)) +
      el('regTrib', tx('opSimpNac', sn) + (sn === '3' ? tx('regApTribSN', String(p.regApTribSN || '1')) : '') + tx('regEspTrib', String(p.regEspTrib == null ? '0' : p.regEspTrib)));
    const toma = t ? ((so(t.cnpj).length === 14 ? tx('CNPJ', so(t.cnpj)) : tx('CPF', pad(t.cpf || t.cnpj, 11))) + tx('xNome', limpa(t.xNome, 300)) + tx('email', limpa(t.email, 80))) : '';
    const ob = s.obra || null;
    const obra = ob ? (so(ob.cObra) ? tx('cObra', so(ob.cObra)) : (so(ob.cep).length === 8 && ob.xLgr && ob.nro && ob.xBairro ? el('end', tx('CEP', so(ob.cep)) + tx('xLgr', limpa(ob.xLgr, 255)) + tx('nro', limpa(ob.nro, 60)) + tx('xCpl', limpa(ob.xCpl, 156)) + tx('xBairro', limpa(ob.xBairro, 60))) : '')) : '';
    const serv = el('locPrest', tx('cLocPrestacao', so(s.cLocPrestacao))) +
      el('cServ', tx('cTribNac', so(s.cTribNac)) + tx('cTribMun', so(s.cTribMun)) + tx('xDescServ', limpa(s.xDescServ, 2000)) + tx('cNBS', so(s.cNBS))) +
      (obra ? el('obra', obra) : '') + (s.xInfComp ? el('infoCompl', tx('xInfComp', limpa(s.xInfComp, 2000))) : '');
    const fed = tx('vRetCP', +v.vRetCP > 0 ? dec2(v.vRetCP) : '') + tx('vRetIRRF', +v.vRetIRRF > 0 ? dec2(v.vRetIRRF) : '') + tx('vRetCSLL', +v.vRetCSLL > 0 ? dec2(v.vRetCSLL) : '');
    const totTrib = +v.pTotTribSN > 0 ? tx('pTotTribSN', dec2(v.pTotTribSN)) : tx('indTotTrib', '0');
    const valores = el('vServPrest', tx('vServ', dec2(v.vServ))) +
      el('trib', el('tribMun', tx('tribISSQN', String(v.tribISSQN || '1')) + tx('tpRetISSQN', String(v.tpRetISSQN || '1')) + tx('pAliq', +v.pAliq > 0 ? dec2(v.pAliq) : '')) + el('tribFed', fed) + el('totTrib', totTrib));
    const corpo = tx('tpAmb', String(d.tpAmb)) + tx('dhEmi', dhEmi) + tx('verAplic', VER_APLIC) + tx('serie', String(+so(d.serie))) + tx('nDPS', String(+so(d.nDPS))) +
      tx('dCompet', d.dCompet) + tx('tpEmit', '1') + tx('cLocEmi', so(d.cLocEmi)) + el('prest', prest) + (toma ? el('toma', toma) : '') + el('serv', serv) + el('valores', valores);
    return { id, inf: `<infDPS Id="${escAt(id)}">${corpo}</infDPS>` };
  }
  function sha256B64(s) { const md = forge.md.sha256.create(); md.update(s, 'utf8'); return forge.util.encode64(md.digest().getBytes()); }
  function assinar(infXml, id, crt) {
    // forma canônica do infDPS dentro da DPS: herda o xmlns padrão da DPS
    const infC14n = infXml.replace(/^<infDPS /, `<infDPS xmlns="${NS}" `);
    const digest = sha256B64(infC14n);
    const si = `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod><Reference URI="#${escAt(id)}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform><Transform Algorithm="${C14N}"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>`;
    const md = forge.md.sha256.create(); md.update(`<SignedInfo xmlns="${DS}">${si}</SignedInfo>`, 'utf8');
    const valor = forge.util.encode64(crt.key.sign(md));
    return `<Signature xmlns="${DS}"><SignedInfo>${si}</SignedInfo><SignatureValue>${valor}</SignatureValue><KeyInfo><X509Data><X509Certificate>${crt.certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  }
  function dpsAssinada(d, crt, dhEmi) {
    const { id, inf } = montarInfDPS(d, dhEmi || agoraBrasilia());
    return { id, xml: `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS}" versao="${VERSAO}">${inf}${assinar(inf, id, crt)}</DPS>` };
  }
  // lê o XML da NFS-e gerada: número, chave, data, valor, descrição e tomador (para conferir se é a mesma nota)
  function lerNFSe(xml) {
    const s = String(xml || '');
    const tag = (n, dentro) => {
      const x = dentro ? ((s.match(new RegExp('<(?:\\w+:)?' + dentro + '[\\s>][\\s\\S]*?</(?:\\w+:)?' + dentro + '>')) || [])[0] || '') : s;
      return (x.match(new RegExp('<(?:\\w+:)?' + n + '(?:\\s[^>]*)?>\\s*([^<]+?)\\s*<')) || [])[1] || '';
    };
    const txt = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#xD;/g, '\r').replace(/&amp;/g, '&');
    return { numero: tag('nNFSe'), chave: (s.match(/Id="NFS(\d{50})"/) || [])[1] || '', data: (tag('dhProc') || tag('dhEmi')).slice(0, 10), valor: parseFloat(tag('vServ')) || 0,
      codVerif: tag('cVerif'), desc: txt(tag('xDescServ')), tomador: tag('CNPJ', 'toma') || tag('CPF', 'toma') };
  }
  return { NS, DS, VERSAO, AMB, agoraBrasilia, lerCertificado, idDPS, montarInfDPS, assinar, dpsAssinada, lerNFSe };
});
