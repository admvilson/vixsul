/* Cópia de segurança do banco (Supabase) — roda no GitHub Actions todo dia (.github/workflows/copia-seguranca.yml — modelo em seguranca/copia-seguranca.yml).
   Lê todas as tabelas com a chave de serviço (segredo do GitHub, nunca no código) e escreve um JSON na saída
   padrão; o workflow compacta e CRIPTOGRAFA o arquivo com a senha da cópia antes de guardar.
   Da tabela de usuários saem só os dados de cadastro: senhas e segredos da verificação em duas etapas ficam de fora.
   Nada de dado é escrito no log (só contagens). */
const URL_SB = process.env.SUPABASE_URL || 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
const TABELAS = ['obras', 'custos', 'faturamentos', 'aportes', 'cap', 'orcamentos', 'despesas', 'etapas', 'obra_imagens', 'medicoes', 'diario_obra',
  'documentos', 'fornecedores', 'contratos', 'acoes', 'reunioes', 'planejamento', 'arquivos', 'auditoria'];
const CAMPOS_USUARIOS = 'id,nome,cpf,perfil,status,email,acessos,tipo_usuario,obras_permitidas';

async function ler(tabela, campos) {
  const h = { apikey: CHAVE }; if (!/^sb_/.test(CHAVE)) h.Authorization = 'Bearer ' + CHAVE;
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

(async () => {
  if (!CHAVE) { console.error('Falta o segredo SUPABASE_SERVICE_KEY no GitHub (Settings → Secrets and variables → Actions).'); process.exit(1); }
  const out = { sistema: 'Vixsul — gestão', gerado_em: new Date().toISOString(), tabelas: {} };
  for (const t of TABELAS) { const d = await ler(t, '*'); if (d) { out.tabelas[t] = d; console.error(`${t}: ${d.length}`); } }
  out.tabelas.usuarios = (await ler('usuarios', CAMPOS_USUARIOS)) || [];
  console.error(`usuarios: ${out.tabelas.usuarios.length}`);
  process.stdout.write(JSON.stringify(out));
})().catch(e => { console.error('A cópia falhou: ' + e.message); process.exit(1); });
