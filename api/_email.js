/* E-MAIL do sistema Vixsul — sai pela PRÓPRIA conta do Gmail do dono (grátis, até 500 por dia), com uma "senha de app"
   do Google. O FormSubmit (usado antes) bloqueia pedidos que vêm de servidor (erro 403), por isso o envio automático
   passou para cá. Configuração (só na Vercel, nunca no código): GMAIL_USER = o endereço do Gmail que manda;
   GMAIL_APP_PASSWORD = a senha de app de 16 letras (myaccount.google.com/apppasswords, com a verificação em duas
   etapas do Google ligada). */
const USER = process.env.GMAIL_USER || '';
const PASS = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const SITE = 'https://gestao.vixsulempreendimentos.com.br';
let transp = null;

const emailPronto = () => !!(USER && PASS);
const emailsDe = txt => [...new Set(String(txt || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))].slice(0, 10);
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function transporte() {
  if (!transp) {
    const nodemailer = require('nodemailer');
    transp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: USER, pass: PASS }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  }
  return transp;
}
// erro do Gmail em português simples
function erroEmail(e) {
  const m = String((e && (e.response || e.message)) || e || '');
  if (/535|Username and Password not accepted|Invalid login|BadCredentials/i.test(m)) return 'O Gmail não aceitou a senha de app — confira GMAIL_USER (o endereço inteiro) e GMAIL_APP_PASSWORD (as 16 letras) na Vercel.';
  if (/534|Application-specific password required/i.test(m)) return 'O Gmail pede uma "senha de app" (não a senha normal da conta) — crie em myaccount.google.com/apppasswords.';
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|timeout/i.test(m)) return 'O servidor do Gmail não respondeu a tempo — tente de novo em instantes.';
  if (/limit|quota|550 5\.4\.5/i.test(m)) return 'O Gmail chegou ao limite de envios do dia — amanhã volta ao normal.';
  return 'O Gmail recusou o envio (' + m.slice(0, 160) + ').';
}
/* manda um e-mail: para = lista de endereços; html e texto; anexos = [{filename, content: Buffer, contentType}] */
async function mandarEmail({ para, assunto, html, texto, anexos }) {
  if (!emailPronto()) { const e = new Error('Falta configurar o envio de e-mail na Vercel (GMAIL_USER e GMAIL_APP_PASSWORD).'); e.config = true; throw e; }
  const L = Array.isArray(para) ? para : emailsDe(para);
  if (!L.length) throw new Error('Nenhum e-mail para mandar.');
  try {
    return await transporte().sendMail({ from: { name: 'Vixsul Gestão', address: USER }, to: L.join(', '), subject: assunto, html, text: texto || undefined, attachments: anexos || undefined });
  } catch (e) { transp = null; throw new Error(erroEmail(e)); }
}
/* o corpo padrão: título, partes ([titulo, texto com "• " por linha]) e o botão do sistema */
function htmlPartes(titulo, partes, rodape) {
  const parte = ([t, txt]) => {
    const linhas = String(txt || '').split('\n').filter(Boolean);
    const itens = linhas.filter(l => /^•\s?/.test(l)).map(l => `<li style="margin:2px 0">${escH(l.replace(/^•\s?/, ''))}</li>`).join('');
    const soltas = linhas.filter(l => !/^•\s?/.test(l)).map(l => `<p style="margin:2px 0;color:#475467">${escH(l)}</p>`).join('');
    return `<tr><td style="padding:12px 18px;border-top:1px solid #EAECF0"><div style="font:700 14px Arial,sans-serif;color:#101828;margin-bottom:4px">${escH(t)}</div>${soltas}${itens ? `<ul style="margin:4px 0 0;padding-left:18px;font:13px/1.5 Arial,sans-serif;color:#344054">${itens}</ul>` : ''}</td></tr>`;
  };
  return `<div style="background:#F5F7FA;padding:20px 10px"><table role="presentation" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #E4E9F2;border-radius:14px;overflow:hidden;font-family:Arial,sans-serif">
    <tr><td style="background:#0A0A52;color:#fff;padding:14px 18px;font:700 16px Arial,sans-serif">${escH(titulo)}</td></tr>
    ${partes.length ? partes.map(parte).join('') : '<tr><td style="padding:14px 18px;font:13px Arial,sans-serif;color:#344054">Tudo em dia: nada pedindo atenção.</td></tr>'}
    <tr><td style="padding:14px 18px;border-top:1px solid #EAECF0"><a href="${SITE}" style="display:inline-block;background:#1652D8;color:#fff;text-decoration:none;padding:9px 16px;border-radius:9px;font:700 13px Arial,sans-serif">Abrir o sistema</a>${rodape ? `<p style="margin:10px 0 0;font:11.5px Arial,sans-serif;color:#667085">${escH(rodape)}</p>` : ''}</td></tr></table></div>`;
}
const textoPartes = (titulo, partes) => titulo + '\n\n' + (partes.length ? partes.map(([t, x]) => t + '\n' + x).join('\n\n') : 'Tudo em dia.') + '\n\n' + SITE;
const remetente = () => (USER ? USER.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : '');

module.exports = { emailPronto, emailsDe, mandarEmail, htmlPartes, textoPartes, remetente, erroEmail };
