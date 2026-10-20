/* Assinatura digital de PDF com o certificado A1 da empresa (PKCS#7 destacado — "adbe.pkcs7.detached",
   o formato que o Adobe Reader e os verificadores de assinatura em PDF reconhecem).
   O PDF chega do navegador já preparado: com o campo de assinatura e o espaço reservado
   (/ByteRange [0 /********** /********** /**********] e /Contents <000…>). Aqui só se calcula
   a assinatura sobre o arquivo inteiro (menos o espaço dela) e se escreve no lugar reservado. */
const forge = require('node-forge');

const MAX = 3 * 1024 * 1024;

function assinarPdf(pdfB64, crt) {
  const pdf = Buffer.from(String(pdfB64 || ''), 'base64');
  if (pdf.length < 100 || pdf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('O arquivo enviado não é um PDF.');
  if (pdf.length > MAX) throw new Error('PDF grande demais para assinar (máximo 3 MB).');
  const s = pdf.toString('latin1');
  const br = /\/ByteRange\s*\[\s*0\s+\/\*{10}\s+\/\*{10}\s+\/\*{10}\s*\]/.exec(s);
  if (!br) throw new Error('O PDF não veio preparado para a assinatura.');
  const ct = /\/Contents\s*<(0{4000,})>/.exec(s);
  if (!ct) throw new Error('O PDF não tem o espaço da assinatura.');
  const ini = ct.index + ct[0].indexOf('<'), fim = ini + ct[1].length + 2;
  // os trechos assinados: do começo até o "<" e do ">" até o fim
  const faixa = `/ByteRange [0 ${ini} ${fim} ${pdf.length - fim}]`;
  if (faixa.length > br[0].length) throw new Error('Não coube a faixa da assinatura no PDF.');
  pdf.write(faixa.padEnd(br[0].length, ' '), br.index, 'latin1');
  const dados = Buffer.concat([pdf.slice(0, ini), pdf.slice(fim)]);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(dados.toString('binary'));
  p7.addCertificate(crt.cert);
  (crt.cadeia || []).forEach(c => p7.addCertificate(c));
  p7.addSigner({
    key: crt.key, certificate: crt.cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() }
    ]
  });
  p7.sign({ detached: true });
  const hex = forge.util.bytesToHex(forge.asn1.toDer(p7.toAsn1()).getBytes());
  if (hex.length > ct[1].length) throw new Error('O espaço reservado para a assinatura ficou pequeno.');
  pdf.write(hex.padEnd(ct[1].length, '0'), ini + 1, 'latin1');
  return pdf.toString('base64');
}

module.exports = { assinarPdf };
