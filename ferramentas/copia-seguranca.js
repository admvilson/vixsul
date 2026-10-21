/* Cópia de segurança do banco (Supabase) — roda no GitHub Actions todo dia (.github/workflows/copia-seguranca.yml — modelo em seguranca/copia-seguranca.yml).
   Lê todas as tabelas com a chave de serviço (segredo do GitHub, nunca no código) e escreve um JSON na saída
   padrão; o workflow compacta e CRIPTOGRAFA o arquivo com a senha da cópia antes de guardar.
   Da tabela de usuários saem só os dados de cadastro: senhas e segredos da verificação em duas etapas ficam de fora.
   Os arquivos guardados no Storage (anexos, fotos do diário, desenhos — pasta "anexos") também vão na cópia,
   em "storage": { caminho: conteúdo em base64 }.
   Nada de dado é escrito no log (só contagens). */
const URL_SB = process.env.SUPABASE_URL || 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
const TABELAS = ['obras', 'custos', 'faturamentos', 'aportes', 'cap', 'orcamentos', 'despesas', 'etapas', 'obra_imagens', 'medicoes', 'diario_obra',
  'documentos', 'fornecedores', 'contratos', 'acoes', 'reunioes', 'planejamento', 'arquivos', 'auditoria'];
const CAMPOS_USUARIOS = 'id,nome,cpf,perfil,status,email,acessos,tipo_usuario,obras_permitidas';
const BUCKET = 'anexos';

const cabecalhos = () => { const h = { apikey: CHAVE }; if (!/^sb_/.test(CHAVE)) h.Authorization = 'Bearer ' + CHAVE; return h; };

async function ler(tabela, campos) {
  const h = cabecalhos();
  const L = [];
  for (let i = 0; ; i += 1000) {
    const r = await fetch(`${URL_SB}/rest/v1/${tabela}?select=${campos}&order=id.asc`, { headers: { ...h, Range: `${i}-${i + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|Could not find|PGRST20[05]/i.test(t)) return null;   // tabela ainda não criada
      throw new Error(`${tabela}: erro ${r.status}`);
    }
    const d = await r.json(); L.push(...d); if (d.length < 1000) break;
  }
  return L;
}

// Storage: lista uma pasta (arquivos têm id; subpastas vêm com id nulo). null = pasta "anexos" ainda não existe.
async function listar(pasta) {
  const L = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_SB}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST', headers: { ...cabecalhos(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: pasta, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } })
    });
    if (!r.ok) { if (r.status === 400 || r.status === 404) return null; throw new Error(`storage (${pasta || 'raiz'}): erro ${r.status}`); }
    const d = await r.json(); L.push(...d); if (d.length < 1000) break;
  }
  return L;
}
async function baixar(caminho) {
  const r = await fetch(`${URL_SB}/storage/v1/object/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`, { headers: cabecalhos() });
  if (!r.ok) throw new Error(`storage: erro ${r.status} ao baixar um arquivo`);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}
async function copiarStorage() {
  const raiz = await listar('');
  if (!raiz) return null;
  const arq = o => o.id && o.name !== '.emptyFolderPlaceholder', cams = [];
  for (const p of (await listar('p')) || []) if (!p.id) ((await listar('p/' + p.name)) || []).filter(arq).forEach(o => cams.push(`p/${p.name}/${o.name}`));
  ((await listar('d')) || []).filter(arq).forEach(o => cams.push('d/' + o.name));
  const out = {};
  for (let i = 0; i < cams.length; i += 8) await Promise.all(cams.slice(i, i + 8).map(async c => { out[c] = await baixar(c); }));
  return out;
}

(async () => {
  if (!CHAVE) { console.error('Falta o segredo SUPABASE_SERVICE_KEY no GitHub (Settings → Secrets and variables → Actions).'); process.exit(1); }
  const out = { sistema: 'Vixsul — gestão', gerado_em: new Date().toISOString(), tabelas: {} };
  for (const t of TABELAS) { const d = await ler(t, '*'); if (d) { out.tabelas[t] = d; console.error(`${t}: ${d.length}`); } }
  out.tabelas.usuarios = (await ler('usuarios', CAMPOS_USUARIOS)) || [];
  console.error(`usuarios: ${out.tabelas.usuarios.length}`);
  // os arquivos do Storage nunca derrubam a cópia das tabelas: se falharem, a cópia segue sem eles (e o log avisa)
  let st = null;
  try { st = await copiarStorage(); } catch (e) { console.error('storage: ' + e.message + ' — cópia segue só com as tabelas'); }
  if (st) { out.storage = st; console.error(`storage: ${Object.keys(st).length} arquivo(s)`); } else console.error('storage: sem arquivos copiados (pasta "anexos" ainda não criada — passo 5 — ou indisponível)');
  process.stdout.write(JSON.stringify(out));
})().catch(e => { console.error('A cópia falhou: ' + e.message); process.exit(1); });
