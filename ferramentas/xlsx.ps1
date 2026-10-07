# Leitor simples de planilha .xlsx (XML) para PowerShell 5.1 / 7
# Ler-Strings: devolve string[] do sharedStrings.xml
# Ler-Planilha: devolve lista de linhas (hashtable coluna->valor) a partir da linha $DeLinha
function Ler-Strings([string]$arq){
  $lista = New-Object System.Collections.Generic.List[string]
  $cfg = New-Object System.Xml.XmlReaderSettings; $cfg.IgnoreWhitespace = $false
  $r = [System.Xml.XmlReader]::Create($arq, $cfg)
  $sb = $null; $dentroT = $false; $dentroRPh = 0
  while($r.Read()){
    if($r.NodeType -eq 'Element'){
      if($r.LocalName -eq 'si'){ $sb = New-Object System.Text.StringBuilder; if($r.IsEmptyElement){ $lista.Add('') ; $sb=$null } }
      elseif($r.LocalName -eq 'rPh'){ if(-not $r.IsEmptyElement){ $dentroRPh++ } }
      elseif($r.LocalName -eq 't' -and $dentroRPh -eq 0){ if(-not $r.IsEmptyElement){ $dentroT = $true } }
    } elseif($r.NodeType -eq 'Text' -or $r.NodeType -eq 'SignificantWhitespace' -or $r.NodeType -eq 'Whitespace'){
      if($dentroT -and $sb){ [void]$sb.Append($r.Value) }
    } elseif($r.NodeType -eq 'EndElement'){
      if($r.LocalName -eq 't'){ $dentroT = $false }
      elseif($r.LocalName -eq 'rPh'){ $dentroRPh-- }
      elseif($r.LocalName -eq 'si'){ $lista.Add($sb.ToString()); $sb = $null }
    }
  }
  $r.Close()
  return ,$lista.ToArray()
}
function Col([string]$ref){ return ($ref -replace '\d','') }
# chama $acao (scriptblock) com cada linha: hashtable { 'A'='...', 'B'='...' } e o número da linha
function Para-Cada-Linha([string]$arq, [string[]]$ss, [int]$DeLinha, [scriptblock]$acao){
  $r = [System.Xml.XmlReader]::Create($arq)
  $linha = $null; $num = 0; $col = $null; $tipo = $null; $dentroV = $false; $valor = $null; $dentroF = $false; $formula = $null
  while($r.Read()){
    if($r.NodeType -eq 'Element'){
      switch($r.LocalName){
        'row' { $num = [int]$r.GetAttribute('r'); $linha = @{}; if($r.IsEmptyElement){ if($num -ge $DeLinha){ & $acao $linha $num }; $linha=$null } }
        'c'   { $col = Col $r.GetAttribute('r'); $tipo = $r.GetAttribute('t'); $valor = $null; $formula = $null }
        'v'   { if(-not $r.IsEmptyElement){ $dentroV = $true } }
        'f'   { if(-not $r.IsEmptyElement){ $dentroF = $true } }
        't'   { if(-not $r.IsEmptyElement){ $dentroV = $true } }
      }
    } elseif($r.NodeType -eq 'Text'){
      if($dentroV){ $valor = $r.Value } elseif($dentroF){ $formula = $r.Value }
    } elseif($r.NodeType -eq 'EndElement'){
      switch($r.LocalName){
        'v' { $dentroV = $false }
        't' { $dentroV = $false }
        'f' { $dentroF = $false }
        'c' { if($null -ne $formula -and $null -ne $linha){ $linha[$col + '!f'] = $formula }; if($null -ne $valor -and $null -ne $linha){ if($tipo -eq 's'){ $linha[$col] = $ss[[int]$valor] } else { $linha[$col] = $valor } } }
        'row' { if($num -ge $DeLinha -and $null -ne $linha){ & $acao $linha $num }; $linha = $null }
      }
    }
  }
  $r.Close()
}
