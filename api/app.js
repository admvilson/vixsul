/* APP NO IPHONE — o "perfil" que põe o ícone da Vixsul na tela de início, abrindo em tela cheia (Web Clip).
   A Apple não deixa site nenhum se instalar sozinho no iPhone: com este arquivo, o próprio iPhone pergunta se pode baixar
   ("Permitir") e depois instala pelos Ajustes (Perfil Transferido › Instalar, com a senha do aparelho).
   O perfil só tem o endereço público do sistema e o ícone — nada de dado, nada de senha. Grátis (sem App Store). */
const SITE = 'https://gestao.vixsulempreendimentos.com.br';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(); }
  // o ícone do iPhone (com fundo branco: sem fundo o iPhone pinta de preto), lido do próprio site
  let icone = '';
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(SITE + '/img/vixsul-app-180.png', { signal: ctl.signal }); clearTimeout(t);
    if (r.ok) icone = Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch (e) { /* sem ícone, o iPhone usa uma miniatura da página */ }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key><true/>
      ${icone ? `<key>Icon</key><data>${icone}</data>` : ''}
      <key>IsRemovable</key><true/>
      <key>Label</key><string>Vixsul</string>
      <key>Precomposed</key><true/>
      <key>URL</key><string>${esc(SITE + '/')}</string>
      <key>PayloadDescription</key><string>Ícone do sistema de gestão da Vixsul na tela de início</string>
      <key>PayloadDisplayName</key><string>Vixsul — Sistema de gestão</string>
      <key>PayloadIdentifier</key><string>br.com.vixsulempreendimentos.gestao.icone</string>
      <key>PayloadType</key><string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key><string>B7E4C2A1-5D3F-4E8A-9C6B-2F1D7A8E3C40</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Coloca o ícone do sistema da Vixsul na tela de início do iPhone. Abre o sistema em tela cheia, como um aplicativo. Para tirar: Ajustes › Geral › VPN e Gerenciamento de Dispositivo.</string>
  <key>PayloadDisplayName</key><string>App da Vixsul</string>
  <key>PayloadIdentifier</key><string>br.com.vixsulempreendimentos.gestao</string>
  <key>PayloadOrganization</key><string>Vixsul Empreendimentos</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>3A9F6E2D-8B1C-4D7E-A5F3-6C2B9E1D4F87</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', 'attachment; filename="Vixsul.mobileconfig"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(req.method === 'HEAD' ? '' : xml);
};
