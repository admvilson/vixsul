const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CHAVES = ['obras', 'custos', 'faturamentos', 'aportes', 'cap'];

const ABA_NOMES = {
  obras:        'Obras',
  custos:       'Custos',
  faturamentos: 'Faturamentos',
  aportes:      'Aportes financeiros',
  cap:          'CAP'
};

// De "Obras" → "obras", etc.
const NOME_PARA_CHAVE = Object.fromEntries(
  Object.entries(ABA_NOMES).map(([k, v]) => [v, k])
);

async function getSistemaData() {
  const pacote = {
    obras: [], custos: [], faturamentos: [], aportes: [], cap: [],
    metadata: {}
  };

  for (const chave of CHAVES) {
    const { data, error } = await supabase
      .from(chave)
      .select('*')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) {
      pacote[chave]          = [];
      pacote.metadata[chave] = [];
      continue;
    }

    // Derivar headers dos campos do primeiro registro
    const headers = Object.keys(data[0].row_data || {});
    pacote.metadata[chave] = headers;

    pacote[chave] = data.map((row, i) => ({
      rowid:    row.id,
      visualId: i + 1,
      _aba:     ABA_NOMES[chave],
      ...row.row_data
    }));
  }

  return pacote;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { supabase, CHAVES, ABA_NOMES, NOME_PARA_CHAVE, getSistemaData, cors };
