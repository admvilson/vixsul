# Atualiza a tabela SINAPI (Caixa/IBGE) do sistema Vixsul, sozinho:
#   1. lê a tabela "atual" do public/sinapi-manifest.js;
#   2. procura na Caixa os meses publicados DEPOIS dela ("SINAPI-AAAA-MM-formato-xlsx.zip");
#   3. converte cada um com o sinapi2js.ps1 (preços da Bahia sem desoneração + composições);
#   4. grava o sinapi-ba-AAAA-MM.js (em public/ e na raiz) e acrescenta no manifesto (o mais novo vira o "atual").
# Roda no GitHub (todo mês, pela tarefa .github/workflows/sinapi-mensal.yml) e também no Windows:
#   powershell -File ferramentas/sinapi-atualizar.ps1
param([string]$Raiz = (Split-Path $PSScriptRoot -Parent), [string]$UF = 'BA', [int]$MaxMeses = 6)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding $false
$noWin = ($env:OS -eq 'Windows_NT')
$curl = $(if($noWin){ 'curl.exe' } else { 'curl' })
# vale o manifesto da raiz (é o que o site publica); a cópia de public/ (bancada local) acompanha, se existir
$man = Join-Path $Raiz 'sinapi-manifest.js'
$pub = Join-Path $Raiz 'public'; $temPub = Test-Path (Join-Path $pub 'index.html')
$txt = [IO.File]::ReadAllText($man)
if($txt -notmatch "atual:'(\d{4})-(\d{2})'"){ throw 'O sinapi-manifest.js não tem a tabela atual.' }
$ano = [int]$matches[1]; $mes = [int]$matches[2]
# tabelas que já estão no manifesto
$tabs = New-Object System.Collections.Generic.List[object]
foreach($m in [regex]::Matches($txt, "\{chave:'([^']+)',arquivo:'([^']+)',ref:'([^']+)',emissao:'([^']*)'\}")){
  $tabs.Add([pscustomobject]@{ chave = $m.Groups[1].Value; arquivo = $m.Groups[2].Value; ref = $m.Groups[3].Value; emissao = $m.Groups[4].Value })
}
$hoje = Get-Date
$novos = 0
for($i = 1; $i -le $MaxMeses; $i++){
  $d = (Get-Date -Year $ano -Month $mes -Day 1).AddMonths($i)
  if($d -gt $hoje){ break }
  $k = $d.ToString('yyyy-MM')
  if($tabs | Where-Object { $_.chave -eq $k }){ continue }
  $url = "https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-$k-formato-xlsx.zip"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("vx-sinapi-" + $k)
  if(Test-Path $tmp){ Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp 'sinapi.zip'; $cj = Join-Path $tmp 'cookies.txt'
  # a Caixa manda um cookie e redireciona para o mesmo endereço: precisa guardar o cookie entre os pedidos
  $cod = & $curl -s -L --max-redirs 10 -c $cj -b $cj -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' -o $zip -w '%{http_code}' --max-time 300 $url
  $tam = $(if(Test-Path $zip){ (Get-Item $zip).Length } else { 0 })
  $assin = ''
  if($tam -gt 4){ $fs = [IO.File]::OpenRead($zip); $b = New-Object byte[] 2; [void]$fs.Read($b, 0, 2); $fs.Close(); $assin = [Text.Encoding]::ASCII.GetString($b) }
  if($cod -ne '200' -or $assin -ne 'PK' -or $tam -lt 1000000){ "SINAPI $k ainda não está publicado (HTTP $cod, $tam bytes)."; continue }
  "SINAPI $k baixado ($tam bytes)."
  $ext = Join-Path $tmp 'zip'; Expand-Archive -Path $zip -DestinationPath $ext -Force
  $xlsx = Get-ChildItem -Path $ext -Recurse -Filter '*.xlsx' | Where-Object { $_.Name -match 'Refer' } | Select-Object -First 1
  if(-not $xlsx){ $xlsx = Get-ChildItem -Path $ext -Recurse -Filter '*.xlsx' | Sort-Object Length -Descending | Select-Object -First 1 }
  if(-not $xlsx){ "SINAPI ${k}: não achei a planilha dentro do arquivo."; continue }
  $px = Join-Path $tmp 'xlsx'; $copia = Join-Path $tmp 'planilha.zip'
  Copy-Item $xlsx.FullName $copia; Expand-Archive -Path $copia -DestinationPath $px -Force
  $arq = "sinapi-$($UF.ToLower())-$k.js"
  $saida = Join-Path $Raiz $arq
  & (Join-Path $PSScriptRoot 'sinapi2js.ps1') -Pasta $px -Saida $saida -UF $UF
  $js = [IO.File]::ReadAllText($saida)
  if($js -notmatch "window\.SINAPI\['$k'\]" -or (Get-Item $saida).Length -lt 1000000){ Remove-Item $saida -Force; throw "A conversão do SINAPI $k não ficou certa (o formato da planilha pode ter mudado)." }
  $ref = $(if($js -match "ref:'([^']+)'"){ $matches[1] } else { $d.ToString('MM/yyyy') })
  $emi = $(if($js -match "emissao:'([^']*)'"){ $matches[1] } else { '' })
  if($temPub){ Copy-Item $saida (Join-Path $pub $arq) -Force }
  $tabs.Add([pscustomobject]@{ chave = $k; arquivo = $arq; ref = $ref; emissao = $emi })
  $novos++
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
if(-not $novos){ 'Nenhuma tabela nova.'; exit 0 }
$ord = @($tabs | Sort-Object chave)
$atual = $ord[-1].chave
$lista = ($ord | ForEach-Object { "{chave:'$($_.chave)',arquivo:'$($_.arquivo)',ref:'$($_.ref)',emissao:'$($_.emissao)'}" }) -join ','
$novo = "/* Tabelas SINAPI (Caixa/IBGE) disponíveis no sistema — o CAP sempre usa a 'atual'. Atualizado a cada mês publicado (sozinho, pela tarefa sinapi-mensal do GitHub). */`nwindow.SINAPI_MANIFEST={uf:'$UF',atual:'$atual',tabelas:[$lista]};`n"
[IO.File]::WriteAllText($man, $novo, $utf8)
if($temPub){ [IO.File]::WriteAllText((Join-Path $pub 'sinapi-manifest.js'), $novo, $utf8) }
"Manifesto atualizado: atual = $atual ($novos tabela(s) nova(s))."
