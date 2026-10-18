/* Autenticação compartilhada pelas funções da Vercel.
   O "passe" do sistema é um JWT (HS256) assinado com o JWT Secret do Supabase: o banco (RLS) só aceita
   leitura/gravação com ele, e as funções da Vercel só atendem quem o apresenta. Sem dependências: crypto do Node. */
const crypto = require('crypto');

const ORIGENS = [/^https:\/\/gestao\.vixsulempreendimentos\.com\.br$/, /^https:\/\/vixsul(-[\w-]+)?\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/];

function cors(req, res) {
  const o = req.headers.origin || '';
  if (ORIGENS.some(r => r.test(o))) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

const b64u = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const deB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function assinar(payload, segredo) {
  const cab = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', segredo).update(cab + '.' + corpo).digest());
  return cab + '.' + corpo + '.' + sig;
}

// devolve o conteúdo do passe se a assinatura confere e ele não venceu; senão null
function verificar(token, segredo) {
  try {
    const [cab, corpo, sig] = String(token || '').split('.');
    if (!cab || !corpo || !sig || !segredo) return null;
    const h = JSON.parse(deB64u(cab).toString('utf8'));
    if (h.alg !== 'HS256') return null;
    const esperado = crypto.createHmac('sha256', segredo).update(cab + '.' + corpo).digest();
    const recebido = deB64u(sig);
    if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) return null;
    const p = JSON.parse(deB64u(corpo).toString('utf8'));
    if (!p.exp || p.exp * 1000 < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}

const tokenDe = req => { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };

// para as outras funções (nota fiscal, leitura de documento): exige o passe quando a segurança está configurada
function exigirLogin(req) {
  const segredo = process.env.SUPABASE_JWT_SECRET;
  if (!segredo) return { ok: true, semConfig: true };
  const p = verificar(tokenDe(req), segredo);
  return p && p.vx === 1 ? { ok: true, p } : { ok: false };
}

module.exports = { ORIGENS, cors, assinar, verificar, tokenDe, exigirLogin, b64u };
