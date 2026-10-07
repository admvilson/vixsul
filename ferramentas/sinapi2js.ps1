# Converte o "SINAPI_Referência_AAAA_MM.xlsx" (Caixa/IBGE) em um arquivo JS que o sistema lê:
#   preços dos insumos na Bahia (sem desoneração) + composições analíticas (coeficientes)
#   + custo das composições na Bahia.
# Uso: sinapi2js.ps1 -Pasta <pasta com xl/ extraído> -Saida <arquivo .js> [-UF BA]
param([string]$Pasta, [string]$Saida, [string]$UF = 'BA')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\xlsx.ps1"
$xl = Join-Path $Pasta 'xl'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$t0 = Get-Date
function T([string]$s){ return ($s -replace '\s+',' ').Trim() }
function J([string]$s){ return '"' + ($s -replace '\\','\\' -replace '"','\"') + '"' }
function N($v){ if($null -eq $v -or "$v" -eq ''){ return $null }; $d = 0.0; if([double]::TryParse("$v", [System.Globalization.NumberStyles]::Float, $inv, [ref]$d)){ return $d }; return $null }
function F($d){ if($null -eq $d){ return '0' }; return ([math]::Round($d, 6)).ToString('0.######', $inv) }

# quais planilhas são quais (pelo workbook)
$wb = [xml](Get-Content (Join-Path $xl 'workbook.xml') -Raw -Encoding UTF8)
$rels = [xml](Get-Content (Join-Path $xl '_rels\workbook.xml.rels') -Raw -Encoding UTF8)
$alvo = @{}
foreach($s in $wb.workbook.sheets.sheet){
  $rid = $s.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $rel = $rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid }
  $alvo[$s.name] = Join-Path $xl ($rel.Target -replace '^/xl/','' -replace '/','\')
}
$ss = Ler-Strings (Join-Path $xl 'sharedStrings.xml')
"strings ok ($([int]((Get-Date)-$t0).TotalSeconds)s)"

# ---------- insumos (ISD) ----------
$colUF = $null; $colsUF = @(); $ref = ''; $emissao = ''; $local = ''
function Classe([string]$a){ if($a -eq 'MATERIAL'){return 'M'}; if($a -like 'MAO DE OBRA*'){return 'O'}; if($a -like 'ENCARGOS*'){return 'C'}; if($a -like 'EQUIPAMENTO (AQUISI*'){return 'Q'}; if($a -like 'EQUIPAMENTO (LOCA*'){return 'L'}; if($a -like 'SERVI*'){return 'S'}; if($a -like 'ESPECIAIS*'){return 'X'}; return 'M' }
$ins = New-Object System.Collections.Generic.List[string]
$precoIns = @{}
Para-Cada-Linha $alvo['ISD'] $ss 1 {
  param($l,$num)
  if($num -eq 3){ $script:ref = T $l['B'] }
  if($num -eq 4){ $script:emissao = T $l['B']; foreach($k in $l.Keys){ if((T $l[$k]) -eq $UF -and $k -ne 'A' -and $k -ne 'B'){ $script:colUF = $k } }; $script:colsUF = @($l.Keys | Where-Object { $_ -notin @('A','B','C','D','E') }) }
  if($num -eq 5 -and $colUF){ $script:local = T $l[$colUF] }
  if($num -le 10){ return }
  $cod = T $l['B']; if(-not $cod){ return }
  $c = Classe (T $l['A'])
  $p = N $l[$colUF]; $med = 0
  if($null -eq $p){ $vs = @(); foreach($k in $colsUF){ $x = N $l[$k]; if($null -ne $x){ $vs += $x } }; if($vs.Count){ $p = ($vs | Measure-Object -Average).Average; $med = 1 } else { $p = 0; $med = 2 } }
  $precoIns[$cod] = $p
  $ins.Add('[' + $cod + ',' + (J (T $l['C'])) + ',' + (J (T $l['D'])) + ',' + (F $p) + ',"' + $c + '"' + ($(if($med){",$med"}else{''})) + ']')
}
"insumos: $($ins.Count) col=$colUF local=$local ref=$ref ($([int]((Get-Date)-$t0).TotalSeconds)s)"

# ---------- custo das composições (CSD) ----------
$colC = $null; $custo = @{}
Para-Cada-Linha $alvo['CSD'] $ss 1 {
  param($l,$num)
  if($num -eq 4){ foreach($k in $l.Keys){ if((T $l[$k]) -eq $UF -and $k -notin @('A','B','C','D')){ $script:colC = $k } } }
  if($num -le 10){ return }
  $cod = T $l['B']; if($l['B!f'] -match ',\s*(\d+)\s*\)\s*$'){ $cod = $matches[1] }; if(-not $cod -or $cod -eq '0'){ return }
  $v = N $l[$colC]; if($null -ne $v){ $custo[$cod] = $v }
}
"custos: $($custo.Count) col=$colC ($([int]((Get-Date)-$t0).TotalSeconds)s)"

# ---------- composições analíticas ----------
$grupos = New-Object System.Collections.Generic.List[string]; $gIdx = @{}
$comp = New-Object System.Collections.Generic.List[string]
$atual = $null; $itens = $null
function Fecha(){ if($script:atual){ $script:comp.Add('[' + $script:atual + ',[' + ($script:itens -join ',') + ']]') }; $script:atual = $null }
$abaAna = @($alvo.Keys | Where-Object { $_ -like 'Anal*' -and $_ -notlike '*Custo*' })[0]
Para-Cada-Linha $alvo[$abaAna] $ss 11 {
  param($l,$num)
  $cod = T $l['B']; if(-not $cod){ return }
  $tipo = T $l['C']
  if(-not $tipo){
    Fecha
    $g = T $l['A']; if(-not $gIdx.ContainsKey($g)){ $gIdx[$g] = $grupos.Count; $grupos.Add((J $g)) }
    $cu = $custo[$cod]
    $script:atual = $cod + ',' + (J (T $l['E'])) + ',' + (J (T $l['F'])) + ',' + $gIdx[$g] + ',' + (F $cu)
    $script:itens = New-Object System.Collections.Generic.List[string]
  } elseif($script:atual) {
    $t = $(if($tipo -eq 'COMPOSICAO'){1}else{0})
    $script:itens.Add("$t," + (T $l['D']) + ',' + (F (N $l['G'])))
  }
}
Fecha
"composicoes: $($comp.Count) ($([int]((Get-Date)-$t0).TotalSeconds)s)"

$mes = ($ref -split '/'); $chave = "$($mes[1])-$($mes[0])"
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("/* SINAPI (Caixa/IBGE) - $UF - $local - referencia $ref, emissao $emissao - precos sem desoneracao. Gerado pelo sistema Vixsul. */`n")
[void]$sb.Append("window.SINAPI=window.SINAPI||{};window.SINAPI['$chave']={uf:'$UF',local:'$local',ref:'$ref',emissao:'$emissao',`n")
[void]$sb.Append("grupos:[" + ($grupos -join ',') + "],`n")
[void]$sb.Append("ins:[`n" + ($ins -join ",`n") + "`n],`n")
[void]$sb.Append("comp:[`n" + ($comp -join ",`n") + "`n]};`n")
[System.IO.File]::WriteAllText($Saida, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
"gravado $Saida  $((Get-Item $Saida).Length) bytes  chave=$chave ($([int]((Get-Date)-$t0).TotalSeconds)s)"
