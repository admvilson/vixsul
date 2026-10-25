/* ═══════════════════════════════════════════════════════════════════════════════════════════════════
   PRÉ-MOLDADOS — biblioteca de tipos de peça (catálogo da fábrica)
   ───────────────────────────────────────────────────────────────────────────────────────────────────
   Cada tipo tem: grupo, família geométrica (que define as medidas pedidas, o volume e o desenho técnico),
   a regra de armadura (calculada sozinha pelas medidas), o traço indicado, os dias de cura e os tamanhos
   de mercado (dos catálogos ABCP 2023, Civil Industrial e Machado — só medidas e usos, sem dados de contato).
   "fator" = fator de forma (chanfros, furos, perfis): ajustado pelo peso de catálogo quando ele existe.
   Todas as medidas em centímetros, menos onde a família diz outra coisa.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const GRUPOS=[
  {k:'cerca',rot:'Cercas, muros e postes',ico:'fa-border-all',cor:'#7A2FE0'},
  {k:'via',rot:'Meio-fio, guias e segurança viária',ico:'fa-road',cor:'#DC6803'},
  {k:'pav',rot:'Pisos e pavimentação',ico:'fa-table-cells',cor:'#0E9384'},
  {k:'dren',rot:'Drenagem e saneamento',ico:'fa-water',cor:'#1570EF'},
  {k:'bloco',rot:'Blocos e elementos vazados',ico:'fa-cubes-stacked',cor:'#475467'},
  {k:'estr',rot:'Estruturais (lajes, vigas, pilares)',ico:'fa-building',cor:'#B42318'},
  {k:'rural',rot:'Rural e agropecuária',ico:'fa-cow',cor:'#4E5BA6'},
  {k:'design',rot:'Mobiliário urbano, jardim e decoração',ico:'fa-tree-city',cor:'#C11574'}];

/* Traços padrão (proporção em massa: cimento = 1 : areia : pó de pedra : brita; a/c = água ÷ cimento).
   vz = vazios do concreto (%) — concreto poroso/drenante. "seco" = concreto de consistência seca (vibroprensado). */
const TR={
  c10s:{nome:'Concreto seco fraco — blocos de vedação e cobogós',ar:0,po:10,br:0,ac:0.42,ad:0,seco:true,fck:'4 a 6 MPa'},
  c14s:{nome:'Concreto seco — blocos estruturais',ar:0,po:6,br:0,ac:0.40,ad:0,seco:true,fck:'8 a 12 MPa'},
  c35s:{nome:'Concreto seco forte — pavers e pisos (35 MPa)',ar:0,po:3,br:1.5,ac:0.38,ad:0,seco:true,fck:'35 MPa'},
  poroso:{nome:'Concreto poroso (drenante)',ar:0,po:0,br:4,ac:0.35,ad:0,vz:20,seco:true,fck:'20 MPa'},
  c15:{nome:'Concreto C15 — meio-fio, guias, peças simples',ar:2.5,po:0,br:3.5,ac:0.68,ad:0,fck:'15 MPa'},
  c20:{nome:'Concreto C20 — peças sem armadura',ar:2.2,po:0,br:3,ac:0.60,ad:0,fck:'20 MPa'},
  c25:{nome:'Concreto C25 — peças armadas (mourão, tampa, placa)',ar:2,po:0,br:3,ac:0.55,ad:0,fck:'25 MPa'},
  c30:{nome:'Concreto C30 — tubos, anéis, caixas',ar:1.7,po:0,br:2.6,ac:0.48,ad:0,fck:'30 MPa'},
  c40:{nome:'Concreto C40 — estruturais',ar:1.3,po:0,br:2.3,ac:0.40,ad:0.8,fck:'40 MPa'},
  micro:{nome:'Microconcreto — placas finas e peças decorativas',ar:1.5,po:1.5,br:0,ac:0.45,ad:0.5,fck:'25 MPa'},
  arg:{nome:'Argamassa forte — ladrilho hidráulico e revestimentos',ar:2,po:1,br:0,ac:0.48,ad:0,fck:'20 MPa'}};

/* Famílias geométricas: campos pedidos, volume (cm³), área para malha (cm²), área de forma (cm²) e descrição. */
const PI=Math.PI;
const FAM={
  prisma:{rot:'Prisma (barra retangular)',campos:[['c','Comprimento'],['l','Largura'],['a','Altura']],
    V:d=>d.c*d.l*d.a,face:d=>d.c*d.l,sup:d=>2*(d.c*d.l+d.c*d.a+d.l*d.a),desc:d=>`${n1(d.l)} × ${n1(d.a)} × ${n1(d.c)} cm`},
  placa:{rot:'Placa',campos:[['c','Comprimento'],['l','Largura'],['e','Espessura']],
    V:d=>d.c*d.l*d.e,face:d=>d.c*d.l,sup:d=>2*d.c*d.l+2*(d.c+d.l)*d.e,desc:d=>`${n1(d.c)} × ${n1(d.l)} × ${n1(d.e)} cm`},
  bloco:{rot:'Bloco vazado',campos:[['c','Comprimento'],['l','Largura'],['a','Altura'],['vz','Vazios (%)']],
    V:d=>d.c*d.l*d.a*(1-(d.vz||0)/100),face:()=>0,sup:d=>2*(d.c*d.l+d.c*d.a+d.l*d.a)*(1+(d.vz||0)/100),desc:d=>`${n1(d.l)} × ${n1(d.a)} × ${n1(d.c)} cm`},
  hexagono:{rot:'Peça sextavada',campos:[['d','Largura entre faces'],['e','Espessura']],
    V:d=>Math.sqrt(3)/2*d.d*d.d*d.e,face:d=>Math.sqrt(3)/2*d.d*d.d,sup:d=>Math.sqrt(3)*d.d*d.d+6*(d.d/Math.sqrt(3))*d.e,desc:d=>`${n1(d.d)} × ${n1(d.e)} cm`},
  disco:{rot:'Disco (tampa redonda)',campos:[['d','Diâmetro'],['e','Espessura']],
    V:d=>PI/4*d.d*d.d*d.e,face:d=>PI/4*d.d*d.d,sup:d=>PI/2*d.d*d.d+PI*d.d*d.e,desc:d=>`Ø ${n1(d.d)} × ${n1(d.e)} cm`},
  esfera:{rot:'Esfera',campos:[['d','Diâmetro']],V:d=>PI/6*d.d*d.d*d.d,face:()=>0,sup:d=>PI*d.d*d.d,desc:d=>`Ø ${n1(d.d)} cm`},
  tubo:{rot:'Tubo / anel',campos:[['di','Diâmetro interno'],['esp','Espessura da parede'],['comp','Comprimento']],
    V:d=>PI/4*((d.di+2*d.esp)**2-d.di*d.di)*d.comp,face:d=>PI*(d.di+d.esp)*d.comp,sup:d=>PI*(2*d.di+2*d.esp)*d.comp,desc:d=>`Ø int. ${n1(d.di)} · parede ${n1(d.esp)} · ${n1(d.comp)} cm`},
  calha:{rot:'Meia-cana (calha)',campos:[['di','Diâmetro interno'],['esp','Espessura da parede'],['comp','Comprimento']],
    V:d=>PI/8*((d.di+2*d.esp)**2-d.di*d.di)*d.comp,face:d=>PI/2*(d.di+d.esp)*d.comp,sup:d=>PI/2*(2*d.di+2*d.esp)*d.comp,desc:d=>`Ø ${n1(d.di)} · parede ${n1(d.esp)} · ${n1(d.comp)} cm`},
  trapezio:{rot:'Seção trapezoidal (meio-fio)',campos:[['B','Base'],['b','Topo'],['h','Altura'],['comp','Comprimento']],
    V:d=>(d.B+d.b)/2*d.h*d.comp,face:d=>d.B*d.comp,sup:d=>(d.B+d.b+2*Math.sqrt(d.h*d.h+((d.B-d.b)/2)**2))*d.comp+(d.B+d.b)*d.h,desc:d=>`base ${n1(d.B)} · topo ${n1(d.b)} · altura ${n1(d.h)} · ${n1(d.comp)} cm`},
  canaleta:{rot:'Canaleta em U (aberta)',campos:[['li','Largura interna'],['hi','Altura interna'],['e','Espessura'],['comp','Comprimento']],
    V:d=>((d.li+2*d.e)*(d.hi+d.e)-d.li*d.hi)*d.comp,face:d=>(d.li+d.e+2*(d.hi+d.e/2))*d.comp,sup:d=>2*(d.li+2*d.hi+2*d.e)*d.comp,desc:d=>`interno ${n1(d.li)} × ${n1(d.hi)} · parede ${n1(d.e)} · ${n1(d.comp)} cm`},
  caixa:{rot:'Caixa retangular (com fundo)',campos:[['c','Comprimento externo'],['l','Largura externa'],['a','Altura externa'],['e','Espessura']],
    V:d=>d.c*d.l*d.a-Math.max(0,d.c-2*d.e)*Math.max(0,d.l-2*d.e)*Math.max(0,d.a-d.e),face:d=>2*(d.c+d.l)*d.a+d.c*d.l,sup:d=>2*(2*(d.c+d.l)*d.a+d.c*d.l),desc:d=>`${n1(d.c)} × ${n1(d.l)} × ${n1(d.a)} cm · parede ${n1(d.e)}`},
  pote:{rot:'Peça redonda oca (com fundo)',campos:[['d','Diâmetro externo'],['a','Altura'],['e','Espessura']],
    V:d=>PI/4*(d.d*d.d*d.a-Math.max(0,d.d-2*d.e)**2*Math.max(0,d.a-d.e)),face:d=>PI*d.d*d.a+PI/4*d.d*d.d,sup:d=>2*(PI*d.d*d.a+PI/4*d.d*d.d),desc:d=>`Ø ${n1(d.d)} × ${n1(d.a)} cm · parede ${n1(d.e)}`},
  aduela:{rot:'Aduela / galeria (seção fechada)',campos:[['li','Largura interna'],['hi','Altura interna'],['e','Espessura'],['comp','Comprimento']],
    V:d=>((d.li+2*d.e)*(d.hi+2*d.e)-d.li*d.hi)*d.comp,face:d=>2*(d.li+d.hi+2*d.e)*d.comp,sup:d=>2*(2*(d.li+d.hi)+4*d.e)*d.comp,desc:d=>`interno ${n1(d.li)} × ${n1(d.hi)} · parede ${n1(d.e)} · ${n1(d.comp)} cm`},
  manual:{rot:'Peça especial (volume informado)',campos:[['v','Volume da peça (m³)'],['area','Área de forma (m²)']],
    V:d=>(d.v||0)*1e6,face:d=>(d.area||0)*1e4/2,sup:d=>(d.area||0)*1e4,desc:d=>`${n1(d.v||0,4)} m³ · conforme projeto`}};
function n1(v,c){return (Math.round((+v||0)*Math.pow(10,c||1))/Math.pow(10,c||1)).toLocaleString('pt-BR',{maximumFractionDigits:c||1});}

/* O catálogo. arm: linear (barras + estribos) · malha (tela POP) · fios (fios longitudinais) · gaiola (tubos/anéis) ·
   trelica (vigota/minipainel) · projeto (estrutural: estimativa, confirmar no projeto) · nenhuma.
   armPad=false: a armadura existe mas começa desligada (ex.: tubo simples PS × armado PA). estr=true: peça estrutural. */
const T=(k,nome,g,f,arm,tr,cura,d,tam,uso,extra)=>Object.assign({k,nome,g,f,arm,tr,cura,d,tam:tam||[],uso:uso||''},extra||{});
const TIPOS=[
  // ── Cercas, muros e postes ──
  T('mourao','Mourão de concreto (reto)','cerca','prisma','linear','c25',7,{c:220,l:10,a:10},[['10 × 10 × 220 cm',{c:220,l:10,a:10},45.7],['10 × 10 × 250 cm',{c:250,l:10,a:10},52],['10 × 10 × 300 cm',{c:300,l:10,a:10},65.6],['12 × 12 × 250 cm',{c:250,l:12,a:12}]],'Divisas, cercamentos e sinalização',{fator:0.85,norma:'NBR 9062 (projeto e execução de pré-moldados)'}),
  T('mourao_curvo','Mourão ponta virada (curvo)','cerca','prisma','linear','c25',7,{c:290,l:10,a:10},[['10 × 10 × 290 cm',{c:290,l:10,a:10},65],['10 × 10 × 300 cm',{c:300,l:10,a:10},70],['15 × 15 × 330 cm',{c:330,l:15,a:15},170]],'Cercas com arame farpado ou concertina na ponta virada',{fator:0.95}),
  T('esticador','Esticador / estaca de canto','cerca','prisma','linear','c25',7,{c:250,l:12,a:12},[['12 × 12 × 250 cm',{c:250,l:12,a:12}],['15 × 15 × 250 cm',{c:250,l:15,a:15}]],'Cantos e esticadores de cerca'),
  T('pilar_muro','Pilar de muro (coluna em H)','cerca','prisma','linear','c25',7,{c:250,l:12,a:12},[['12 × 12 × 250 cm',{c:250,l:12,a:12}],['15 × 15 × 300 cm',{c:300,l:15,a:15}]],'Coluna com ranhura para encaixar as placas do muro',{fator:0.85}),
  T('placa_muro','Placa de muro lisa','cerca','placa','fios','micro',7,{c:150,l:50,e:3},[['150 × 50 × 3 cm',{c:150,l:50,e:3},54],['200 × 50 × 4 cm',{c:200,l:50,e:4}],['200 × 40 × 4 cm',{c:200,l:40,e:4}]],'Muros pré-moldados (encaixe nos pilares)'),
  T('placa_muro_est','Placa de muro estampada (tijolinho)','cerca','placa','fios','micro',7,{c:150,l:50,e:3},[['150 × 50 × 3 cm',{c:150,l:50,e:3},54]],'Muros com acabamento em relevo'),
  T('pingadeira_capa','Pingadeira / capa de muro','cerca','placa','nenhuma','micro',7,{c:100,l:25,e:3},[['100 × 25 × 3 cm',{c:100,l:25,e:3},18],['80 × 17 × 5 cm',{c:80,l:17,e:5},16],['100 × 30 × 2 cm (plana fina)',{c:100,l:30,e:2}]],'Acabamento e proteção do topo de muros'),
  T('chapeu','Chapéu de pilar (chapitel)','cerca','placa','nenhuma','micro',7,{c:30,l:30,e:3},[['30 × 30 × 3 cm',{c:30,l:30,e:3},7]],'Topo de pilares de muro'),
  T('bloco_h','Bloco H de contenção','cerca','bloco','nenhuma','c14s',7,{c:40,l:20,a:40,vz:45},[['40 × 20 × 40 cm',{c:40,l:20,a:40,vz:45}]],'Paredes de contenção, piscinas, estabilização de terreno'),
  T('bloco_cont','Bloco de contenção (talude)','cerca','bloco','nenhuma','c14s',7,{c:50,l:19,a:46.7,vz:40},[['19 × 50 × 46,7 cm',{c:50,l:19,a:46.7,vz:40}]],'Contenção de aterro e proteção de talude'),
  T('cruzeta_t','Cruzeta de concreto tipo T','cerca','prisma','linear','c30',14,{c:190,l:9,a:11},[['190 cm',{c:190,l:9,a:11}]],'Postes de energia (isoladores e cabos)',{fator:0.9}),
  T('cruzeta_l','Cruzeta de concreto tipo L','cerca','prisma','linear','c30',14,{c:170,l:9,a:11},[['170 cm',{c:170,l:9,a:11}]],'Postes de energia',{fator:0.9}),
  T('cruzeta_ret','Cruzeta retangular 9 × 9','cerca','prisma','linear','c30',14,{c:200,l:9,a:9},[['9 × 9 × 200 cm',{c:200,l:9,a:9}],['9 × 9 × 240 cm',{c:240,l:9,a:9}]],'Postes de energia'),
  T('poste_dt','Poste duplo T (distribuição)','cerca','prisma','projeto','c40',28,{c:900,l:20,a:30},[['9 m',{c:900,l:20,a:30}],['11 m',{c:1100,l:22,a:34}],['12 m',{c:1200,l:24,a:36}]],'Distribuição de energia — exige projeto e padrão da concessionária',{fator:0.45,estr:true}),
  T('poste_cr','Poste circular (distribuição)','cerca','tubo','projeto','c40',28,{di:10,esp:9,comp:900},[['9 m',{di:10,esp:9,comp:900}],['11 m',{di:12,esp:10,comp:1100}]],'Distribuição de energia — exige projeto (concreto centrifugado)',{estr:true}),
  T('marco','Marco geodésico','cerca','prisma','linear','c25',7,{c:50,l:8,a:8},[['8 × 8 × 50 cm',{c:50,l:8,a:8}]],'Demarcação de terrenos'),
  T('esteio','Esteio de curral / poste rural','cerca','prisma','linear','c25',7,{c:250,l:15,a:15},[['15 × 15 × 250 cm',{c:250,l:15,a:15}],['15 × 15 × 300 cm',{c:300,l:15,a:15}]],'Currais, porteiras e cercas reforçadas'),
  // ── Meio-fio, guias e segurança viária ──
  T('meiofio','Meio-fio de concreto (guia)','via','trapezio','nenhuma','c15',7,{B:15,b:12,h:30,comp:100},[['100 × 30 cm (base 15, topo 12)',{B:15,b:12,h:30,comp:100}],['100 × 35 cm (base 12, topo 10)',{B:12,b:10,h:35,comp:100},96],['DNIT 90 × 30 × 12 cm',{B:12,b:12,h:30,comp:90}],['Econômico 90 × 30 × 10 cm',{B:10,b:10,h:30,comp:90}]],'Divisa entre calçada e pista (DNIT 020/2006, NBR 15645)',{norma:'NBR 15645 · DNIT 020/2006'}),
  T('meiofio_vazado','Meio-fio vazado','via','trapezio','nenhuma','c15',7,{B:12,b:12,h:30,comp:100},[['100 × 30 × 12 cm',{B:12,b:12,h:30,comp:100},85],['100 × 30 × 15 cm',{B:15,b:15,h:30,comp:100},108],['80 × 30 × 9 cm',{B:9,b:9,h:30,comp:80},52]],'Meio-fio com aberturas para escoamento',{fator:0.97}),
  T('mini_guia','Mini guia','via','trapezio','nenhuma','c15',7,{B:6,b:6,h:25,comp:90},[['90 × 25 × 6 cm',{B:6,b:6,h:25,comp:90}]],'Calçadas, jardins, passeios (só pedestres)'),
  T('guia_jardim','Guia para jardim','via','placa','nenhuma','c20',7,{c:80,l:20,e:4},[['80 × 20 × 4 cm',{c:80,l:20,e:4},19]],'Delimitar canteiros e jardins'),
  T('guia_vazada','Guia vazada (boca de lobo)','via','placa','nenhuma','c20',7,{c:46.5,l:44.5,e:7.5},[['46,5 × 44,5 × 7,5 cm',{c:46.5,l:44.5,e:7.5},50]],'Direcionar a água da sarjeta',{fator:0.9}),
  T('limitador','Limitador físico para pavimentação','via','prisma','nenhuma','c20',7,{c:100,l:7,a:20},[['100 × 7 × 20 cm',{c:100,l:7,a:20}]],'Contenção lateral de pisos'),
  T('bate_rodas','Bate-rodas / para-rodas','via','trapezio','nenhuma','c20',7,{B:20,b:10,h:15,comp:90},[['90 × 20 × 15 cm',{B:20,b:10,h:15,comp:90},60],['95 × 21 × 15 cm',{B:21,b:11,h:15,comp:95}]],'Vagas de estacionamento e garagens'),
  T('gelo_baiano','Prisma "gelo baiano"','via','prisma','nenhuma','c20',7,{c:100,l:70,a:80},[['70 × 80 × 100 cm',{c:100,l:70,a:80},950]],'Separador de pista e obstáculo de sinalização',{fator:0.7}),
  T('balizador','Balizador esfera','via','esfera','nenhuma','c20',7,{d:40},[['Ø 40 cm',{d:40},80],['Ø 50 cm',{d:50}]],'Delimitar espaços e áreas de segurança'),
  T('jersey','Barreira New Jersey simples','via','prisma','linear','c30',14,{c:150,l:38,a:81},[['38 × 81 × 150 cm',{c:150,l:38,a:81},710]],'Proteção lateral de pistas (NBR 14885)',{fator:0.64,norma:'NBR 14885'}),
  T('jersey_dupla','Barreira New Jersey dupla','via','prisma','linear','c30',14,{c:150,l:61,a:85},[['61 × 85 × 150 cm',{c:150,l:61,a:85}]],'Canteiros centrais (NBR 14885)',{fator:0.6,norma:'NBR 14885'}),
  T('guarda_corpo','Guarda-corpo DNIT','via','placa','malha','c30',14,{c:190,l:70,e:12},[['190 × 70 cm',{c:190,l:70,e:12},175]],'Pontes e viadutos',{fator:0.46}),
  // ── Pisos e pavimentação ──
  T('paver','Paver retangular (Holland)','pav','placa','nenhuma','c35s',7,{c:20,l:10,e:6},[['10 × 20 × 4,5 cm',{c:20,l:10,e:4.5},1.95],['10 × 20 × 6 cm',{c:20,l:10,e:6},2.5],['10 × 20 × 8 cm',{c:20,l:10,e:8},3.5],['10 × 20 × 10 cm',{c:20,l:10,e:10},4.5]],'Calçadas, pátios, ruas (NBR 9781 — 35 MPa)',{norma:'NBR 9781',pecasM2:50}),
  T('paver_16f','Paver 16 faces (Unistein / S)','pav','placa','nenhuma','c35s',7,{c:22,l:11,e:6},[['11 × 22 × 6 cm',{c:22,l:11,e:6}],['11 × 22 × 8 cm',{c:22,l:11,e:8}],['11 × 22 × 10 cm',{c:22,l:11,e:10}]],'Pavimento intertravado (NBR 9781)',{fator:0.92,norma:'NBR 9781',pecasM2:40}),
  T('paver_diamante','Paver diamante (losango)','pav','placa','nenhuma','c35s',7,{c:20,l:20,e:6},[['20 × 20 × 6 cm',{c:20,l:20,e:6}]],'Pavimento decorativo',{fator:0.5}),
  T('paver_dren','Paver drenante','pav','placa','nenhuma','poroso',7,{c:20,l:10,e:8},[['10 × 20 × 6 cm',{c:20,l:10,e:6},2.3],['10 × 20 × 8 cm',{c:20,l:10,e:8},3.2],['11 × 22 × 8 cm (16 faces)',{c:22,l:11,e:8}]],'Pavimento permeável (NBR 16416)',{norma:'NBR 16416'}),
  T('junta_larga','Piso intertravado com junta alargada','pav','placa','nenhuma','c35s',7,{c:20,l:10,e:8},[['10 × 20 × 6 cm',{c:20,l:10,e:6}],['10 × 20 × 8 cm',{c:20,l:10,e:8}]],'Pavimento com junta permeável'),
  T('unigrama','Unigrama / Pavigrama','pav','placa','nenhuma','c35s',7,{c:34.5,l:23,e:6},[['23 × 34,5 × 6 cm',{c:34.5,l:23,e:6},5.95],['23 × 34,5 × 8 cm',{c:34.5,l:23,e:8},6.95]],'Estacionamentos e garagens com grama',{fator:0.55}),
  T('concregrama','Concregrama / Pisograma','pav','placa','nenhuma','c35s',7,{c:43,l:33,e:7},[['33 × 43 × 7 cm',{c:43,l:33,e:7},12],['45 × 45 × 8 cm (piso grama)',{c:45,l:45,e:8}]],'Áreas verdes trafegáveis',{fator:0.5}),
  T('sextavado','Lajota sextavada','pav','hexagono','nenhuma','c35s',7,{d:25,e:6},[['25 × 6 cm',{d:25,e:6},7.4],['25 × 8 cm',{d:25,e:8},9],['30 × 8 cm',{d:30,e:8},10.8],['30 × 10 cm',{d:30,e:10},13.7]],'Ruas, pátios e quintais (NBR 9781)',{norma:'NBR 9781'}),
  T('sextavado_dren','Sextavado drenante','pav','hexagono','nenhuma','poroso',7,{d:25,e:8},[['25 × 6 cm',{d:25,e:6},5.9],['25 × 8 cm',{d:25,e:8},7.2]],'Pavimento permeável'),
  T('tatil','Piso tátil (alerta ou direcional)','pav','placa','nenhuma','c35s',7,{c:40,l:40,e:2.5},[['40 × 40 × 2,5 cm',{c:40,l:40,e:2.5},9],['20 × 20 × 6 cm (paver)',{c:20,l:20,e:6}]],'Acessibilidade (NBR 16537)',{norma:'NBR 16537'}),
  T('placa_dren','Placa drenante / permeável','pav','placa','nenhuma','poroso',7,{c:40,l:40,e:5},[['40 × 40 × 5 cm',{c:40,l:40,e:5},18],['41 × 41 × 6 cm',{c:41,l:41,e:6}],['20 × 20 × 6 cm',{c:20,l:20,e:6}]],'Calçadas e praças permeáveis (NBR 16416)'),
  T('tijolao','Piso tijolão permeável','pav','placa','nenhuma','c35s',7,{c:25,l:15,e:6},[['15 × 25 × 6 cm',{c:25,l:15,e:6}]],'Drenagem urbana, visual rústico'),
  T('placa_rampa','Placa de rampa antiderrapante','pav','placa','nenhuma','micro',7,{c:20,l:20,e:2},[['20 × 20 × 2 cm',{c:20,l:20,e:2}]],'Rampas de garagem'),
  T('placa_deco','Placa decorativa (frisa, rústica, Copacabana)','pav','placa','nenhuma','micro',7,{c:50,l:50,e:2.5},[['20 × 20 × 2,5 cm',{c:20,l:20,e:2.5},2.4],['25 × 25 × 2,5 cm',{c:25,l:25,e:2.5},3.6],['45 × 45 × 3 cm',{c:45,l:45,e:3},14],['50 × 50 × 2,5 cm',{c:50,l:50,e:2.5},14]],'Calçamento, revestimento de parede, áreas de lazer'),
  T('ladrilho','Ladrilho de concreto','pav','placa','nenhuma','arg',7,{c:30,l:30,e:2},[['30 × 30 × 2 cm',{c:30,l:30,e:2}],['33 × 33 × 2,5 cm',{c:33,l:33,e:2.5}],['40 × 40 × 2,5 cm',{c:40,l:40,e:2.5}]],'Calçamento e áreas internas'),
  T('marmorizada','Placa marmorizada','pav','placa','nenhuma','arg',7,{c:40,l:40,e:3},[['40 × 40 × 3 cm',{c:40,l:40,e:3}],['60 × 60 × 3 cm',{c:60,l:60,e:3}]],'Áreas de alto tráfego'),
  T('piso_elevado','Piso elevado','pav','placa','malha','c30',14,{c:60,l:60,e:4},[['60 × 60 × 4 cm',{c:60,l:60,e:4}]],'Escritórios e áreas técnicas'),
  T('confinamento','Piso para confinamento de animais','pav','placa','nenhuma','c35s',7,{c:25,l:25,e:6},[['25 × 25 × 6 cm',{c:25,l:25,e:6},9]],'Áreas de confinamento'),
  T('placa_pav','Placa armada para pavimentação','pav','placa','malha','c30',14,{c:200,l:100,e:12},[['200 × 100 × 12 cm',{c:200,l:100,e:12}]],'Pavimentos de concreto (conforme projeto)'),
  T('pisadeira','Pisadeira','pav','placa','nenhuma','c20',7,{c:40,l:40,e:8},[['40 × 40 × 8 cm',{c:40,l:40,e:8}],['45 × 45 × 4 cm',{c:45,l:45,e:4}],['30 × 50 × 10 cm',{c:50,l:30,e:10}],['50 × 80 × 6 cm',{c:80,l:50,e:6}]],'Caminhos em jardins'),
  T('atermico','Piso atérmico (piscina)','pav','placa','nenhuma','micro',7,{c:50,l:50,e:2.5},[['50 × 50 × 2,5 cm',{c:50,l:50,e:2.5}],['100 × 50 × 2,5 cm',{c:100,l:50,e:2.5}],['Borda reta 50 × 33',{c:50,l:33,e:3}]],'Piscinas e áreas externas'),
  T('deck','Piso para deck de concreto','pav','placa','nenhuma','micro',7,{c:100,l:20,e:2},[['100 × 20 × 2 cm',{c:100,l:20,e:2}],['100 × 30 × 2 cm',{c:100,l:30,e:2}]],'Imitação de deck de madeira'),
  // ── Drenagem e saneamento ──
  T('tubo_mf','Tubo de concreto macho e fêmea','dren','tubo','gaiola','c30',14,{di:60,esp:7,comp:100},[['Ø 30 cm',{di:30,esp:5,comp:100}],['Ø 40 cm',{di:40,esp:5.5,comp:100}],['Ø 50 cm',{di:50,esp:6,comp:100}],['Ø 60 cm',{di:60,esp:7,comp:100}],['Ø 80 cm',{di:80,esp:8,comp:100}],['Ø 100 cm',{di:100,esp:9,comp:100}]],'Águas pluviais (NBR 8890 — simples PS ou armado PA)',{armPad:false,norma:'NBR 8890'}),
  T('tubo_pb','Tubo ponta e bolsa (drenagem / esgoto)','dren','tubo','gaiola','c30',14,{di:40,esp:5.5,comp:150},[['Ø 20 cm',{di:20,esp:4.5,comp:100}],['Ø 30 cm',{di:30,esp:5,comp:150}],['Ø 40 cm',{di:40,esp:5.5,comp:150}],['Ø 60 cm',{di:60,esp:7,comp:150}]],'Drenagem (PS/PA) e esgoto (ES/EA) — NBR 8890',{armPad:false,fator:1.08,norma:'NBR 8890'}),
  T('dreno_perf','Tubo dreno perfurado','dren','tubo','nenhuma','c30',14,{di:20,esp:4,comp:100},[['Ø 20 × 100 cm',{di:20,esp:4,comp:100},71],['Ø 40 × 100 cm',{di:40,esp:4.5,comp:100},135],['Ø 60 × 100 cm',{di:60,esp:5,comp:100},240]],'Drenagem subterrânea',{fator:0.95}),
  T('dreno_poroso','Tubo dreno poroso','dren','tubo','nenhuma','poroso',14,{di:20,esp:4.5,comp:100},[['Ø 20 × 100 cm',{di:20,esp:4.5,comp:100},67],['Ø 30 × 100 cm',{di:30,esp:4.5,comp:100},92]],'Drenagem subterrânea'),
  T('anel_pv','Anel para poço de visita / cisterna','dren','tubo','gaiola','c30',14,{di:100,esp:8,comp:50},[['Ø 60 × 50 cm',{di:60,esp:6,comp:50}],['Ø 80 × 50 cm',{di:80,esp:7,comp:50}],['Ø 100 × 50 cm',{di:100,esp:8,comp:50}],['Ø 120 × 50 cm',{di:120,esp:9,comp:50}],['Ø 150 × 50 cm',{di:150,esp:10,comp:50}]],'Poços de visita, inspeção, cisternas e fossas'),
  T('cone_pv','Cone de redução para poço','dren','tubo','gaiola','c30',14,{di:100,esp:8,comp:60},[['Ø 100 → 60 cm',{di:100,esp:8,comp:60}]],'Topo de poço de visita',{fator:0.8}),
  T('aduela','Aduela fechada (galeria celular)','dren','aduela','projeto','c30',14,{li:100,hi:100,e:15,comp:100},[['1,00 × 1,00 m',{li:100,hi:100,e:15,comp:100}],['1,50 × 1,50 m',{li:150,hi:150,e:18,comp:100}],['2,00 × 2,00 m',{li:200,hi:200,e:20,comp:100}]],'Galerias, travessias, canalização (NBR 15396 — exige projeto)',{estr:true,norma:'NBR 15396'}),
  T('aduela_u','Aduela aberta em U (canal)','dren','canaleta','projeto','c30',14,{li:100,hi:100,e:15,comp:100},[['1,00 × 1,00 m',{li:100,hi:100,e:15,comp:100}]],'Canais abertos (NBR 15396 — exige projeto)',{estr:true}),
  T('canaleta_u','Canaleta de drenagem em U','dren','canaleta','malha','c30',14,{li:30,hi:30,e:6,comp:100},[['30 × 30 cm',{li:30,hi:30,e:6,comp:100}],['40 × 40 cm',{li:40,hi:40,e:7,comp:100}],['50 × 50 cm',{li:50,hi:50,e:8,comp:100}]],'Drenagem superficial, sarjetas'),
  T('canaleta_grelha','Canaleta com grelha','dren','canaleta','malha','c30',14,{li:15,hi:20,e:6,comp:100},[['15 × 50 cm',{li:15,hi:20,e:6,comp:50}],['35 × 50 cm',{li:35,hi:30,e:7,comp:50}],['50 × 50 cm',{li:50,hi:40,e:8,comp:50}]],'Drenagem de pátios e garagens'),
  T('calha','Calha / meia-cana de concreto','dren','calha','nenhuma','c30',14,{di:40,esp:4.5,comp:100},[['Ø 20 cm',{di:20,esp:4,comp:100}],['Ø 30 cm',{di:30,esp:4,comp:100},52.5],['Ø 40 cm',{di:40,esp:4.5,comp:100},79.6],['Ø 50 cm',{di:50,esp:5,comp:100},100],['Ø 60 cm',{di:60,esp:6.5,comp:100},174]],'Escoamento de águas pluviais em áreas abertas'),
  T('caixa_insp','Caixa de inspeção','dren','caixa','nenhuma','c25',7,{c:40,l:40,a:47,e:5},[['20 × 20 × 27 cm',{c:20,l:20,a:27,e:4}],['30 × 30 × 37 cm',{c:30,l:30,a:37,e:4}],['40 × 40 × 47 cm',{c:40,l:40,a:47,e:5}],['50 × 50 × 57 cm',{c:50,l:50,a:57,e:5}],['60 × 60 × 67 cm',{c:60,l:60,a:67,e:6}]],'Esgoto e águas pluviais'),
  T('caixa_gordura','Caixa de gordura retangular','dren','caixa','nenhuma','c25',7,{c:60,l:38,a:60,e:5},[['60 × 38 × 60 cm',{c:60,l:38,a:60,e:5}],['80 × 38 × 80 cm',{c:80,l:38,a:80,e:5}],['100 × 38 × 100 cm',{c:100,l:38,a:100,e:6}]],'Retenção de gordura (padrões CEF)'),
  T('caixa_gord_circ','Caixa de gordura circular','dren','pote','nenhuma','c25',7,{d:30,a:35,e:5},[['Ø 30 × 35 cm',{d:30,a:35,e:5},41]],'Retenção de gordura em residências'),
  T('caixa_pass','Caixa de passagem','dren','caixa','malha','c30',14,{c:60,l:60,a:60,e:8},[['60 × 60 × 60 cm',{c:60,l:60,a:60,e:8}],['80 × 80 × 80 cm',{c:80,l:80,a:80,e:8}],['100 × 100 × 100 cm',{c:100,l:100,a:100,e:10}]],'Redes elétricas, telefonia, drenagem'),
  T('tampa_circ','Tampa circular','dren','disco','malha','c25',7,{d:60,e:5},[['Ø 30 cm',{d:30,e:5},8.2],['Ø 40 cm',{d:40,e:5},15],['Ø 50 cm',{d:50,e:5},23],['Ø 60 cm',{d:60,e:5}],['Ø 80 cm',{d:80,e:6}],['Ø 100 cm',{d:100,e:7}],['Ø 120 cm',{d:120,e:8}]],'Poços, caixas e cisternas'),
  T('tampao','Tampão para poço com sobretampa','dren','disco','malha','c25',7,{d:80,e:4},[['Ø 60 cm',{d:60,e:3.5},22],['Ø 80 cm',{d:80,e:4},51],['Ø 100 cm',{d:100,e:4.5},86],['Ø 120 cm',{d:120,e:5},130],['Ø 150 cm',{d:150,e:5},200]],'Poços e cisternas'),
  T('tampa_ret','Tampa retangular (caixa / boca de lobo)','dren','placa','malha','c25',7,{c:60,l:60,e:6},[['60 × 60 × 6 cm',{c:60,l:60,e:6}],['100 × 50 × 6 cm (boca de lobo)',{c:100,l:50,e:6},70],['100 × 100 × 5 cm (furada)',{c:100,l:100,e:5},92]],'Caixas de passagem, inspeção e boca de lobo'),
  T('grelha','Grelha de concreto (boca de lobo)','dren','placa','malha','c30',14,{c:100,l:60,e:8},[['100 × 60 × 8 cm',{c:100,l:60,e:8},83]],'Drenagem superficial',{fator:0.6}),
  T('quadro_bl','Quadro / cavalete para boca de lobo','dren','prisma','linear','c25',7,{c:116,l:60,a:26},[['116 × 60 × 26 cm',{c:116,l:60,a:26},130]],'Boca de lobo',{fator:0.3}),
  T('cantoneira_bl','Cantoneira para boca de lobo','dren','prisma','nenhuma','c25',7,{c:116,l:26,a:10},[['116 × 26 × 10 cm',{c:116,l:26,a:10},40],['120 × 40 × 12 cm',{c:120,l:40,a:12},60]],'Boca de lobo',{fator:0.6}),
  T('suporte_grelha','Suporte para grelha','dren','prisma','linear','c25',7,{c:105,l:67,a:19},[['105 × 67 × 19 cm',{c:105,l:67,a:19},91]],'Drenagem superficial',{fator:0.27}),
  T('laje_reducao','Laje de redução para poço de visita','dren','disco','malha','c30',14,{d:120,e:10},[['Ø 120 × 10 cm',{d:120,e:10},172]],'Poços de visita',{fator:0.6}),
  T('duto','Duto de concreto','dren','canaleta','nenhuma','c25',7,{li:20,hi:22,e:5,comp:60},[['60 × 30 × 30 cm',{li:20,hi:22,e:5,comp:60},42]],'Passagem de cabos e tubulações'),
  T('abrigo_cavalete','Abrigo de cavalete de água','dren','caixa','nenhuma','c25',7,{c:50,l:50,a:25,e:2.5},[['50 × 50 × 25 cm',{c:50,l:50,a:25,e:2.5},30]],'Proteção do hidrômetro'),
  T('caixa_sao','Caixa separadora de água e óleo','dren','manual','projeto','c30',14,{v:0.5,area:6},[],'Postos e oficinas (conforme projeto)',{estr:true}),
  // ── Blocos e elementos vazados ──
  T('bloco_9','Bloco de vedação 9 × 19 × 39','bloco','bloco','nenhuma','c10s',7,{c:39,l:9,a:19,vz:45},[['9 × 19 × 39 cm',{c:39,l:9,a:19,vz:45},8.35],['9 × 19 × 29 cm',{c:29,l:9,a:19,vz:45},6.9],['9 × 19 × 19 cm (meio)',{c:19,l:9,a:19,vz:40},3.6]],'Alvenaria de vedação (NBR 6136)',{norma:'NBR 6136',pecasM2:12.5}),
  T('bloco_14','Bloco de vedação 14 × 19 × 39','bloco','bloco','nenhuma','c10s',7,{c:39,l:14,a:19,vz:55},[['14 × 19 × 39 cm',{c:39,l:14,a:19,vz:55},10],['14 × 19 × 29 cm',{c:29,l:14,a:19,vz:55},8.4],['14 × 19 × 19 cm (meio)',{c:19,l:14,a:19,vz:50},5.4]],'Alvenaria de vedação (NBR 6136)',{norma:'NBR 6136',pecasM2:12.5}),
  T('bloco_19','Bloco de vedação 19 × 19 × 39','bloco','bloco','nenhuma','c10s',7,{c:39,l:19,a:19,vz:60},[['19 × 19 × 39 cm',{c:39,l:19,a:19,vz:60},12.5],['19 × 19 × 19 cm (meio)',{c:19,l:19,a:19,vz:55},7.8]],'Alvenaria e muros (NBR 6136)',{norma:'NBR 6136',pecasM2:12.5}),
  T('bloco_est','Bloco estrutural (família 39)','bloco','bloco','nenhuma','c14s',14,{c:39,l:14,a:19,vz:50},[['14 × 19 × 39 cm',{c:39,l:14,a:19,vz:50},12],['14 × 19 × 34 cm',{c:34,l:14,a:19,vz:50},10],['14 × 19 × 54 cm',{c:54,l:14,a:19,vz:50},17.5],['19 × 19 × 39 cm',{c:39,l:19,a:19,vz:55},16]],'Alvenaria estrutural (NBR 6136 — 4 a 12 MPa)',{norma:'NBR 6136'}),
  T('bloco_est29','Bloco estrutural (família 29)','bloco','bloco','nenhuma','c14s',14,{c:29,l:14,a:19,vz:45},[['14 × 19 × 29 cm',{c:29,l:14,a:19,vz:45},9.5],['14 × 19 × 44 cm',{c:44,l:14,a:19,vz:45},14],['14 × 19 × 14 cm (meio)',{c:14,l:14,a:19,vz:40},6]],'Alvenaria estrutural (NBR 6136)'),
  T('canaleta_bloco','Canaleta U / J (bloco)','bloco','bloco','nenhuma','c14s',7,{c:39,l:14,a:19,vz:45},[['14 × 19 × 39 cm (U)',{c:39,l:14,a:19,vz:45},15.7],['14 × 19 × 29 cm (U)',{c:29,l:14,a:19,vz:45},8.8],['9 × 19 × 39 cm (U)',{c:39,l:9,a:19,vz:40},9.15],['19 × 19 × 39 cm (U)',{c:39,l:19,a:19,vz:50},18.5]],'Vergas, cintas e amarração'),
  T('compensador','Bloco compensador','bloco','bloco','nenhuma','c14s',7,{c:39,l:14,a:4,vz:0},[['14 × 19 × 4 cm',{c:19,l:14,a:4,vz:0},2.6],['14 × 19 × 9 cm',{c:19,l:14,a:9,vz:30},7]],'Completar a paginação dos blocos'),
  T('bloco_hidr','Bloco hidráulico / elétrico','bloco','bloco','nenhuma','c14s',7,{c:39,l:14,a:19,vz:50},[['14 × 19 × 39 cm',{c:39,l:14,a:19,vz:50},12],['14 × 19 × 19 cm',{c:19,l:14,a:19,vz:50},5.2]],'Paredes com tubulação embutida'),
  T('bloco_jardim','Bloco para jardim vertical / jardineira','bloco','bloco','nenhuma','c14s',7,{c:39,l:19,a:14,vz:45},[['19 × 14 × 39 cm',{c:39,l:19,a:14,vz:45},9.3],['39 × 19 × 21 cm (triangular)',{c:39,l:19,a:21,vz:50},15],['39 × 19 × 23 cm (redonda)',{c:39,l:19,a:23,vz:45},18]],'Paredes verdes e jardineiras'),
  T('cobogo','Cobogó / elemento vazado','bloco','bloco','nenhuma','c20',7,{c:39,l:7,a:39,vz:55},[['39 × 39 × 7 cm (flor, árabe, 16 furos, taco chinês)',{c:39,l:7,a:39,vz:55},15],['30 × 30 × 9 cm (triângulo)',{c:30,l:9,a:30,vz:55},9.8],['49 × 50 × 8 cm (veneziana)',{c:49,l:8,a:50,vz:55},13],['24 × 24 × 7 cm (vintage)',{c:24,l:7,a:24,vz:65},3.5]],'Ventilação e iluminação natural'),
  // ── Estruturais ──
  T('verga','Verga / contraverga','estr','prisma','linear','c25',7,{c:150,l:14,a:10},[['14 × 10 × 120 cm',{c:120,l:14,a:10}],['14 × 10 × 150 cm',{c:150,l:14,a:10}],['14 × 10 × 200 cm',{c:200,l:14,a:10}]],'Sobre portas e janelas'),
  T('vigota','Vigota treliçada (laje)','estr','prisma','trelica','c25',7,{c:400,l:12,a:4},[['3 m',{c:300,l:12,a:4}],['4 m',{c:400,l:12,a:4}],['5 m',{c:500,l:12,a:4}]],'Lajes treliçadas (H8 forro, H12/H16 piso — NBR 14859)',{norma:'NBR 14859'}),
  T('minipainel','Minipainel treliçado (pré-laje)','estr','placa','trelica','c25',7,{c:400,l:25,e:3},[['MP25 × 4 m',{c:400,l:25,e:3}],['MP33 × 4 m',{c:400,l:33,e:3}]],'Lajes treliçadas sem escoramento intermediário'),
  T('laje_placa','Placa de laje maciça','estr','placa','malha','c30',14,{c:200,l:50,e:8},[['200 × 50 × 8 cm',{c:200,l:50,e:8}],['100 × 50 × 5 cm',{c:100,l:50,e:5}]],'Coberturas, tampas de reservatório, passarelas'),
  T('pilar','Pilar pré-fabricado','estr','prisma','linear','c40',28,{c:300,l:20,a:20},[['20 × 20 × 300 cm',{c:300,l:20,a:20}],['25 × 25 × 400 cm',{c:400,l:25,a:25}]],'Galpões e edificações — exige projeto (NBR 9062)',{estr:true,norma:'NBR 9062'}),
  T('viga','Viga pré-fabricada','estr','prisma','linear','c40',28,{c:500,l:15,a:40},[['15 × 40 × 400 cm',{c:400,l:15,a:40}],['15 × 40 × 500 cm',{c:500,l:15,a:40}],['20 × 50 × 600 cm',{c:600,l:20,a:50}]],'Galpões e edificações — exige projeto (NBR 9062)',{estr:true,norma:'NBR 9062'}),
  T('estaca','Estaca quadrada','estr','prisma','linear','c40',28,{c:600,l:20,a:20},[['20 × 20 × 600 cm',{c:600,l:20,a:20}],['25 × 25 × 800 cm',{c:800,l:25,a:25}]],'Fundações — exige projeto (NBR 6122)',{estr:true,norma:'NBR 6122'}),
  T('degrau','Degrau de escada pré-moldada','estr','manual','projeto','c30',14,{v:0.023,area:0.6},[['Degrau 0,8 m',{v:0.016,area:0.45},37],['Degrau 1,0 m',{v:0.023,area:0.6},55]],'Escadas caracol e retas',{estr:true}),
  T('sapata','Sapata pré-fabricada','estr','manual','projeto','c30',14,{v:0.25,area:2},[],'Fundações — exige projeto',{estr:true}),
  T('laje_alveolar','Laje alveolar','estr','manual','projeto','c40',28,{v:0.85,area:12},[],'Lajes de grandes vãos (protendida — exige projeto)',{estr:true}),
  // ── Rural ──
  T('cocho','Cocho de concreto','rural','caixa','malha','c25',7,{c:100,l:60,a:30,e:3.5},[['100 × 60 × 30 cm (pequeno)',{c:100,l:60,a:30,e:3.5},110],['150 × 20 × 30 cm (suíno)',{c:150,l:20,a:30,e:4}],['250 × 70 × 40 cm (tipo U)',{c:250,l:70,a:40,e:5}]],'Comedouro para animais'),
  T('bebedouro','Bebedouro para animais','rural','caixa','malha','c25',7,{c:275,l:60,a:50,e:6},[['275 × 60 × 50 cm (300 L)',{c:275,l:60,a:50,e:6}]],'Bebedouro de gado'),
  T('pe_cocho','Pé de cocho','rural','prisma','nenhuma','c20',7,{c:40,l:20,a:40},[['40 × 20 × 40 cm',{c:40,l:20,a:40}]],'Apoio de calhas e cochos',{fator:0.5}),
  T('dormente','Dormente de concreto','rural','prisma','linear','c40',28,{c:240,l:26,a:21},[['240 × 26 × 21 cm',{c:240,l:26,a:21}]],'Ferrovias (conforme projeto)',{estr:true,fator:0.8}),
  T('mata_burro','Mata-burro de concreto','rural','manual','projeto','c30',14,{v:0.35,area:4},[],'Passagem de veículos em porteiras',{estr:true}),
  // ── Mobiliário urbano, jardim e decoração ──
  T('banco','Banco de concreto','design','manual','fios','c25',7,{v:0.096,area:3.5},[['250 × 50 × 55 cm',{v:0.096,area:3.5},230],['Cubo 40 × 40 × 40 cm',{v:0.025,area:0.96},60]],'Praças, jardins, escolas'),
  T('lixeira','Lixeira de concreto','design','pote','nenhuma','c25',7,{d:56,a:110,e:5},[['Ø 56 × 110 cm (90 L)',{d:56,a:110,e:5},196],['30 × 90 × 40 cm (calçada)',{d:40,a:90,e:4},50]],'Vias públicas'),
  T('vaso','Vaso de cimento','design','pote','nenhuma','micro',7,{d:30,a:25,e:2.5},[['Bowl Ø 30 cm',{d:30,a:15,e:2},3.9],['Tubo Ø 10 × 9 cm',{d:10,a:9,e:1.5},1.2],['Ø 40 × 40 cm',{d:40,a:40,e:3}]],'Plantas e decoração'),
  T('gola','Gola / protetor de árvore','design','tubo','nenhuma','c20',7,{di:80,esp:6,comp:20},[['Ø 80 × 20 cm',{di:80,esp:6,comp:20}]],'Proteção de árvores em calçadas'),
  T('bolacha','Bolacha para jardim','design','disco','nenhuma','c20',7,{d:40,e:5},[['Ø 30 cm',{d:30,e:5},8.2],['Ø 40 cm',{d:40,e:5},15],['Ø 50 cm',{d:50,e:5},23],['Ø 60 cm',{d:60,e:5}]],'Caminhos em jardins'),
  T('balaustre','Balaústre de concreto','design','prisma','fios','micro',7,{c:60,l:12,a:12},[['12 × 12 × 45 cm',{c:45,l:12,a:12},9],['12 × 12 × 60 cm',{c:60,l:12,a:12}],['20 × 20 × 80 cm',{c:80,l:20,a:20},25]],'Guarda-corpos e varandas',{fator:0.6}),
  T('moldura','Moldura / rodapé de concreto','design','prisma','nenhuma','micro',7,{c:100,l:4,a:2},[['4 × 2 × 100 cm',{c:100,l:4,a:2},1.6],['8 × 4 × 100 cm',{c:100,l:8,a:4}],['12 × 1,5 × 100 cm',{c:100,l:12,a:1.5}],['10 × 2 × 100 cm',{c:100,l:10,a:2}]],'Portas, janelas, beirais e rodapés'),
  T('cuba','Cuba / pia de concreto','design','caixa','nenhuma','micro',7,{c:57,l:40,a:15,e:2.5},[['57 × 40 × 15 cm',{c:57,l:40,a:15,e:2.5},19],['46 × 32 × 13 cm',{c:46,l:32,a:13,e:2.5},19],['40 × 40 × 10 cm (rústica)',{c:40,l:40,a:10,e:3},12]],'Banheiros e lavabos'),
  T('bandeja','Bandeja / cinzeiro decorativo','design','placa','nenhuma','micro',7,{c:30,l:19,e:3},[['30 × 19 × 3 cm',{c:30,l:19,e:3},4]],'Decoração',{fator:0.3}),
  T('ladrilho_hidr','Ladrilho hidráulico','design','placa','nenhuma','arg',7,{c:20,l:20,e:1.6},[['20 × 20 × 1,6 cm',{c:20,l:20,e:1.6},1.4],['30 × 30 × 2 cm',{c:30,l:30,e:2},4],['Hexagonal 21 × 18',{c:21,l:18,e:1.6}]],'Pisos decorativos'),
  T('placa_3d','Placa 3D / pirâmide (revestimento)','design','placa','nenhuma','micro',7,{c:48.5,l:48.5,e:4},[['48,5 × 48,5 × 4 cm',{c:48.5,l:48.5,e:4}]],'Fachadas e paredes decorativas',{fator:0.6}),
  T('placa_madeira','Placa amadeirada','design','placa','nenhuma','micro',7,{c:100,l:20,e:2.5},[['20 × 100 cm',{c:100,l:20,e:2.5},12]],'Revestimento imitando madeira'),
  T('telha','Telha de concreto','design','placa','nenhuma','micro',7,{c:42,l:33,e:1.6},[['42 × 33 cm',{c:42,l:33,e:1.6},5.2]],'Coberturas (10,4 peças/m²)',{pecasM2:10.4}),
  T('ponteira','Ponteira decorativa (pinha / bola)','design','esfera','nenhuma','micro',7,{d:30},[['Bola Ø 30 cm',{d:30}]],'Topo de muros e colunas',{fator:0.9}),
  T('chafariz','Chafariz de concreto','design','manual','fios','micro',14,{v:0.08,area:4},[],'Jardins e praças'),
  T('ecofogao','Fogão a lenha ecológico','design','manual','nenhuma','c25',14,{v:0.12,area:3},[],'Cozinhas rurais'),
  T('lareira','Lareira pré-moldada (refratária)','design','manual','nenhuma','c25',14,{v:0.096,area:2.5},[['120 × 75 × 47 cm',{v:0.096,area:2.5},230]],'Lareiras (usar concreto refratário)'),
  T('outra','Outra peça (sob medida)','design','manual','nenhuma','c25',7,{v:0.05,area:1},[],'Peça especial: informe o volume e a área de forma')];
const tipoDe=k=>TIPOS.find(t=>t.k===k)||null;

/* ═══════ geometria ═══════ */
function geo(t,d){
  const F=FAM[t.f]||FAM.manual,dd={};Object.keys(d||{}).forEach(k=>dd[k]=+d[k]||0);
  const fator=t.fator||1,V=Math.max(0,F.V(dd))*fator/1e6;
  return {V,face:Math.max(0,F.face(dd))/1e4,sup:Math.max(0,F.sup(dd))/1e4,desc:F.desc(dd),fam:F};
}

/* ═══════ armadura automática pelas medidas ═══════
   Regras práticas de fábrica para peças correntes (NBR 9062 / 6118 como referência): cobrimento de 1,5 cm
   (peças pequenas) a 2,5 cm (estruturais); barras nos cantos; estribos; malha POP em placas e caixas;
   gaiola (espiras + longitudinais) em tubos e anéis armados. Estruturais: estimativa — confirmar no projeto. */
function armadura(t,d,ligada){
  const o={tipo:t.arm,barras:[],malha:null,cob:0,obs:'',projeto:!!t.estr,kgExtra:0};
  if(!ligada||t.arm==='nenhuma')return o;
  const g=k=>+(d||{})[k]||0;
  if(t.arm==='linear'&&t.f==='prisma'){
    const L=g('c'),b=g('l'),h=g('a'),s=Math.min(b,h),S=Math.max(b,h);if(!L||!s)return o;
    let fl=s<=10?4.2:s<=12?5:s<=15?6.3:s<=20?8:s<=30?10:12.5;
    if(L>300&&fl<6.3)fl=fl===4.2?5:6.3;
    if(t.estr)fl=Math.max(fl,L<=300?8:L<=450?10:L<=600?12.5:16);
    const nb=s>=25?8:S>20?6:4,cob=t.estr?2.5:s<=12?1.5:2,ft=s<=15&&!t.estr?4.2:5,esp=t.estr?15:s<=12?25:20;
    const ne=Math.floor((L-2*cob)/esp)+1,le=2*(b-2*cob)+2*(h-2*cob)+10;
    o.cob=cob;o.barras.push({t:'b',d:fl,q:nb,l:r1(L-2*cob),txt:`${nb} barras longitudinais (${nb===4?'uma em cada canto':'distribuídas nas faces'})`});
    o.barras.push({t:'e',d:ft,q:ne,l:r1(le),dob:`${r1(b-2*cob)} × ${r1(h-2*cob)} cm`,esp,txt:`estribos a cada ${esp} cm`});
    if(t.estr)o.obs='Peça estrutural: a armadura acima é uma estimativa para orçamento e compra — siga o projeto estrutural assinado.';
    return o;
  }
  if(t.arm==='linear'){ // perfis (barreira, quadro) — armadura construtiva: 4 barras + estribos espaçados
    const geom=geo(t,d),L=g('c')||g('comp')||100;o.cob=2.5;
    o.barras.push({t:'b',d:8,q:4,l:r1(L-5),txt:'4 barras construtivas'});
    o.barras.push({t:'e',d:5,q:Math.floor((L-5)/30)+1,l:r1(Math.max(40,Math.sqrt(geom.V*1e6/Math.max(1,L))*3)),esp:30,txt:'estribos construtivos a cada 30 cm'});return o;
  }
  if(t.arm==='fios'){
    if(t.f==='manual'){o.cob=2;o.kgExtra=geo(t,d).V*25;o.obs='Peça especial: fios de reforço estimados em 25 kg de aço CA-60 por m³.';return o;}
    const L=t.f==='prisma'?g('c'):g('c'),w=t.f==='prisma'?Math.min(g('l'),g('a')):g('l');if(!L)return o;
    const n=t.f==='prisma'?4:Math.max(2,Math.floor(Math.max(0,w-3)/20)+1);o.cob=1.5;
    o.barras.push({t:'b',d:4.2,q:n,l:r1(L-3),txt:`${n} fios ao longo do comprimento`});return o;
  }
  if(t.arm==='malha'){
    const geom=geo(t,d),esp=g('e')||g('esp')||0,cam=esp>=12?2:1;o.cob=1.5;
    o.malha={m2:geom.face,camadas:cam,txt:`malha POP (tela soldada Ø 4,2 mm, 15 × 15 cm) em ${cam===2?'duas camadas':'uma camada'} no meio da espessura`};return o;
  }
  if(t.arm==='gaiola'){
    const di=g('di'),e=g('esp'),c=g('comp');if(!di||!c)return o;
    const dm=di+e,fe=di<=80?5:6.3,nes=Math.floor(c/15)+1,nl=Math.max(6,Math.round(PI*dm/20));o.cob=2;
    o.barras.push({t:'r',d:fe,q:nes,l:r1(PI*dm+10),dob:`anel Ø ${r1(dm)} cm`,txt:`espiras (anéis) a cada 15 cm`});
    o.barras.push({t:'b',d:fe,q:nl,l:r1(c-4),txt:`${nl} barras retas ao redor`});return o;
  }
  if(t.arm==='trelica'){
    const L=g('c'),n=t.f==='placa'?Math.max(1,Math.round(g('l')/25)):1;o.cob=1.5;
    o.barras.push({t:'t',d:6,q:n,l:r1(L-2),kgm:0.735,txt:`${n} treliça(s) TR 8644 (0,735 kg/m)`});return o;
  }
  if(t.arm==='projeto'){
    const geom=geo(t,d);o.cob=3;o.kgExtra=geom.V*80;o.obs='Peça estrutural: aço estimado em 80 kg de CA-50 por m³ de concreto, só para orçamento — use o projeto estrutural.';return o;
  }
  return o;
}
function r1(v){return Math.round((+v||0)*10)/10;}

/* ═══════ desenho técnico (SVG) com as medidas ═══════ */
const COR={c:'#E4E7EC',cl:'#475467',a:'#D92D20',m:'#7A2FE0',ct:'#667085',tx:'#1D2939'};
const nf=v=>n1(v,1);
const svg=(w,h,b,leg)=>`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="pm-svg" font-family="Inter,Arial,sans-serif" role="img">${b}${leg?`<text x="${w-6}" y="${h-6}" text-anchor="end" font-size="9" fill="#98A2B3">${leg}</text>`:''}</svg>`;
function cotaH(x1,x2,y,t){return `<g stroke="${COR.ct}" stroke-width="1"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y-4}" x2="${x1}" y2="${y+4}"/><line x1="${x2}" y1="${y-4}" x2="${x2}" y2="${y+4}"/></g><text x="${(x1+x2)/2}" y="${y-5}" text-anchor="middle" font-size="11" font-weight="700" fill="${COR.tx}">${t}</text>`;}
function cotaV(x,y1,y2,t,lado){const tx=lado==='d'?x+6:x-6;return `<g stroke="${COR.ct}" stroke-width="1"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x-4}" y1="${y1}" x2="${x+4}" y2="${y1}"/><line x1="${x-4}" y1="${y2}" x2="${x+4}" y2="${y2}"/></g><text x="${tx}" y="${(y1+y2)/2+4}" text-anchor="${lado==='d'?'start':'end'}" font-size="11" font-weight="700" fill="${COR.tx}">${t}</text>`;}
const tit=(x,y,t)=>`<text x="${x}" y="${y}" font-size="10" font-weight="800" fill="#98A2B3" letter-spacing=".06em">${t}</text>`;
const fit=(w,h,mw,mh)=>{const k=Math.min(mw/Math.max(w,1e-6),mh/Math.max(h,1e-6));return [w*k,h*k];};
function desenho(t,d,arm){
  const g=k=>+(d||{})[k]||0,A=arm||{barras:[],malha:null},temA=A.barras.length||A.malha||A.kgExtra;
  const W=380,H=210;let b='';
  switch(t.f){
    case 'prisma':{
      const L=g('c'),l=g('l'),a=g('a');
      const [sw,sh]=fit(l,a,80,80),sx=36,sy=50;   // corte
      b+=tit(sx,24,'CORTE')+`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      b+=cotaH(sx,sx+sw,sy-8,nf(l))+cotaV(sx-8,sy,sy+sh,nf(a));
      if(temA&&A.barras.length){const c=Math.max(4,Math.min(sw,sh)*0.18);b+=`<rect x="${sx+c}" y="${sy+c}" width="${sw-2*c}" height="${sh-2*c}" fill="none" stroke="${COR.a}" stroke-width="1.6"/>`;
        const nb=(A.barras.find(x=>x.t==='b')||{q:4}).q;const pts=[[sx+c,sy+c],[sx+sw-c,sy+c],[sx+c,sy+sh-c],[sx+sw-c,sy+sh-c]];if(nb>=6)pts.push([sx+sw/2,sy+c],[sx+sw/2,sy+sh-c]);if(nb>=8)pts.push([sx+c,sy+sh/2],[sx+sw-c,sy+sh/2]);
        pts.forEach(([x,y])=>b+=`<circle cx="${x}" cy="${y}" r="3.2" fill="${COR.a}"/>`);}
      const ex=146,ey=70,ew=192,eh=Math.max(22,Math.min(70,ew*a/Math.max(L,1)*1.8));
      b+=tit(ex,24,'VISTA LATERAL')+`<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      b+=cotaH(ex,ex+ew,ey+eh+18,nf(L)+' cm')+cotaV(ex+ew+8,ey,ey+eh,nf(a),'d');
      if(temA&&A.barras.length){const c=5;b+=`<line x1="${ex+c}" y1="${ey+c}" x2="${ex+ew-c}" y2="${ey+c}" stroke="${COR.a}" stroke-width="1.6"/><line x1="${ex+c}" y1="${ey+eh-c}" x2="${ex+ew-c}" y2="${ey+eh-c}" stroke="${COR.a}" stroke-width="1.6"/>`;
        const e=A.barras.find(x=>x.t==='e');if(e){const n=Math.min(e.q,16);for(let i=0;i<n;i++){const x=ex+c+i*(ew-2*c)/Math.max(1,n-1);b+=`<line x1="${x}" y1="${ey+c}" x2="${x}" y2="${ey+eh-c}" stroke="${COR.a}" stroke-width="1"/>`;}}}
      break;}
    case 'placa':{
      const c=g('c'),l=g('l'),e=g('e'),[pw,ph]=fit(c,l,230,120),px=70,py=40;
      b+=tit(px,24,'VISTA DE CIMA')+`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5" rx="1"/>`;
      if(temA&&A.malha){const n=Math.max(3,Math.round(pw/14));for(let i=1;i<n;i++){const x=px+i*pw/n;b+=`<line x1="${x}" y1="${py+3}" x2="${x}" y2="${py+ph-3}" stroke="${COR.m}" stroke-width=".8" stroke-dasharray="3 2"/>`;}const m=Math.max(2,Math.round(ph/14));for(let i=1;i<m;i++){const y=py+i*ph/m;b+=`<line x1="${px+3}" y1="${y}" x2="${px+pw-3}" y2="${y}" stroke="${COR.m}" stroke-width=".8" stroke-dasharray="3 2"/>`;}}
      if(temA&&A.barras.length){const q=A.barras[0].q;for(let i=0;i<q;i++){const y=py+(i+1)*ph/(q+1);b+=`<line x1="${px+4}" y1="${y}" x2="${px+pw-4}" y2="${y}" stroke="${COR.a}" stroke-width="1.6"/>`;}}
      b+=cotaH(px,px+pw,py+ph+18,nf(c)+' cm')+cotaV(px-10,py,py+ph,nf(l));
      const sx=px+pw+28,sh=Math.max(6,Math.min(40,e*3));b+=tit(sx-6,24,'ESPESSURA')+`<rect x="${sx}" y="${py}" width="${sh}" height="${ph}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaH(sx,sx+sh,py+ph+18,nf(e));
      break;}
    case 'bloco':{
      const c=g('c'),l=g('l'),a=g('a'),vz=g('vz'),[pw,ph]=fit(c,l,220,90),px=50,py=50;
      b+=tit(px,24,'VISTA DE CIMA')+`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      if(vz>0){const n=c>=29?2:1,fw=pw/n*Math.sqrt(vz/100)*0.95,fh=ph*Math.sqrt(vz/100)*0.95;for(let i=0;i<n;i++){const cx=px+(i+0.5)*pw/n;b+=`<rect x="${cx-fw/2}" y="${py+(ph-fh)/2}" width="${fw}" height="${fh}" fill="#fff" stroke="${COR.cl}" rx="3"/>`;}}
      b+=cotaH(px,px+pw,py+ph+18,nf(c)+' cm')+cotaV(px-10,py,py+ph,nf(l));
      const sx=px+pw+30,[fw2,fh2]=fit(l,a,60,90);b+=tit(sx,24,'ALTURA')+`<rect x="${sx}" y="${py}" width="${fw2}" height="${fh2}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaV(sx+fw2+8,py,py+fh2,nf(a),'d');
      if(vz>0)b+=`<text x="${px}" y="${py+ph+38}" font-size="10" fill="${COR.ct}">vazios ≈ ${n1(vz,0)}%</text>`;
      break;}
    case 'hexagono':{
      const dd=g('d'),e=g('e'),r=60,cx=110,cy=110,pts=[];for(let i=0;i<6;i++){const an=PI/3*i;pts.push(`${cx+r*Math.cos(an)},${cy+r*Math.sin(an)}`);}
      b+=tit(40,24,'VISTA DE CIMA')+`<polygon points="${pts.join(' ')}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaV(cx-r-12,cy-r*0.866,cy+r*0.866,nf(dd));
      b+=tit(240,24,'ESPESSURA')+`<rect x="240" y="80" width="110" height="${Math.max(8,Math.min(40,e*4))}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaV(362,80,80+Math.max(8,Math.min(40,e*4)),nf(e),'d');
      break;}
    case 'disco':case 'esfera':{
      const dd=g('d'),e=g('e'),r=62,cx=110,cy=112;
      b+=tit(40,24,t.f==='esfera'?'VISTA':'VISTA DE CIMA')+`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      if(temA&&A.malha){b+=`<clipPath id="pmc"><circle cx="${cx}" cy="${cy}" r="${r-3}"/></clipPath><g clip-path="url(#pmc)">`;for(let i=-4;i<=4;i++){b+=`<line x1="${cx+i*14}" y1="${cy-r}" x2="${cx+i*14}" y2="${cy+r}" stroke="${COR.m}" stroke-width=".8" stroke-dasharray="3 2"/><line x1="${cx-r}" y1="${cy+i*14}" x2="${cx+r}" y2="${cy+i*14}" stroke="${COR.m}" stroke-width=".8" stroke-dasharray="3 2"/>`;}b+='</g>';}
      if(t.f==='esfera')b+=`<ellipse cx="${cx-18}" cy="${cy-20}" rx="18" ry="10" fill="#fff" opacity=".5"/>`;
      b+=cotaH(cx-r,cx+r,cy+r+18,'Ø '+nf(dd)+' cm');
      if(t.f==='disco'){const sh=Math.max(6,Math.min(40,e*4));b+=tit(240,24,'ESPESSURA')+`<rect x="240" y="96" width="120" height="${sh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaV(370,96,96+sh,nf(e),'d');}
      break;}
    case 'tubo':case 'calha':case 'gola':{
      const di=g('di'),e=g('esp'),c=g('comp'),R=58,ri=R*di/Math.max(1,di+2*e),cx=95,cy=112,meia=t.f==='calha';
      b+=tit(30,24,'SEÇÃO');
      if(meia)b+=`<path d="M ${cx-R} ${cy} A ${R} ${R} 0 0 0 ${cx+R} ${cy} L ${cx+ri} ${cy} A ${ri} ${ri} 0 0 1 ${cx-ri} ${cy} Z" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      else b+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${ri}" fill="#fff" stroke="${COR.cl}" stroke-width="1.5"/>`;
      if(temA&&A.barras.length&&!meia){b+=`<circle cx="${cx}" cy="${cy}" r="${(R+ri)/2}" fill="none" stroke="${COR.a}" stroke-width="1.6"/>`;const nl=(A.barras.find(x=>x.t==='b')||{q:8}).q;for(let i=0;i<Math.min(nl,24);i++){const an=2*PI*i/Math.min(nl,24);b+=`<circle cx="${cx+(R+ri)/2*Math.cos(an)}" cy="${cy+(R+ri)/2*Math.sin(an)}" r="2.4" fill="${COR.a}"/>`;}}
      b+=cotaH(cx-ri,cx+ri,cy+(meia?14:0)-(meia?0:4),'Ø '+nf(di))+`<text x="${cx}" y="${cy-R-6}" text-anchor="middle" font-size="11" font-weight="700" fill="${COR.tx}">parede ${nf(e)} cm</text>`;
      const ex=200,ey=60,ew=160,eh=100;b+=tit(ex,24,'VISTA LATERAL')+`<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      const it=eh*e/Math.max(1,di+2*e);b+=`<line x1="${ex}" y1="${ey+it}" x2="${ex+ew}" y2="${ey+it}" stroke="${COR.cl}" stroke-dasharray="4 3"/>`+(meia?'':`<line x1="${ex}" y1="${ey+eh-it}" x2="${ex+ew}" y2="${ey+eh-it}" stroke="${COR.cl}" stroke-dasharray="4 3"/>`);
      if(temA&&A.barras.length&&!meia){const n=Math.min(12,(A.barras.find(x=>x.t==='r')||{q:6}).q);for(let i=0;i<n;i++){const x=ex+6+i*(ew-12)/Math.max(1,n-1);b+=`<line x1="${x}" y1="${ey+2}" x2="${x}" y2="${ey+eh-2}" stroke="${COR.a}" stroke-width="1"/>`;}}
      b+=cotaH(ex,ex+ew,ey+eh+18,nf(c)+' cm');
      break;}
    case 'trapezio':{
      const B=g('B'),bb=g('b'),h=g('h'),c=g('comp'),k=Math.min(110/Math.max(h,1),90/Math.max(B,1)),x0=50,y0=170,wB=B*k,wb=bb*k,hh=h*k;
      b+=tit(30,24,'SEÇÃO')+`<polygon points="${x0},${y0} ${x0+wB},${y0} ${x0+wB-(wB-wb)/2},${y0-hh} ${x0+(wB-wb)/2},${y0-hh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      b+=cotaH(x0,x0+wB,y0+16,nf(B))+cotaH(x0+(wB-wb)/2,x0+(wB+wb)/2,y0-hh-8,nf(bb))+cotaV(x0-10,y0-hh,y0,nf(h));
      const ex=190,ey=80,ew=170,eh=Math.max(24,Math.min(80,hh*0.7));b+=tit(ex,24,'VISTA LATERAL')+`<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaH(ex,ex+ew,ey+eh+18,nf(c)+' cm');
      break;}
    case 'canaleta':case 'caixa':case 'aduela':case 'pote':{
      const fechado=t.f==='aduela',li=t.f==='canaleta'||fechado?g('li'):(t.f==='pote'?g('d')-2*g('e'):g('c')-2*g('e')),hi=t.f==='canaleta'||fechado?g('hi'):(t.f==='pote'?g('a')-g('e'):g('a')-g('e')),e=g('e');
      const We=li+2*e,He=fechado?hi+2*e:hi+e,k=Math.min(150/Math.max(We,1),130/Math.max(He,1)),x0=40,y0=40,w=We*k,hh=He*k,ek=Math.max(4,e*k);
      b+=tit(x0,24,'CORTE')+`<rect x="${x0}" y="${y0}" width="${w}" height="${hh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`;
      b+=`<rect x="${x0+ek}" y="${fechado?y0+ek:y0-1}" width="${w-2*ek}" height="${fechado?hh-2*ek:hh-ek+1}" fill="#fff" stroke="${COR.cl}" stroke-width="1.2"/>`;
      if(temA&&A.malha)b+=`<path d="M ${x0+ek/2} ${y0} L ${x0+ek/2} ${y0+hh-ek/2} L ${x0+w-ek/2} ${y0+hh-ek/2} L ${x0+w-ek/2} ${y0}" fill="none" stroke="${COR.m}" stroke-width="1.4" stroke-dasharray="4 2"/>`;
      if(temA&&A.kgExtra)b+=`<rect x="${x0+ek/2}" y="${fechado?y0+ek/2:y0}" width="${w-ek}" height="${fechado?hh-ek:hh-ek/2}" fill="none" stroke="${COR.a}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
      b+=cotaH(x0,x0+w,y0+hh+18,nf(t.f==='pote'?g('d'):We)+(t.f==='pote'?' (Ø)':''))+cotaV(x0+w+10,y0,y0+hh,nf(t.f==='canaleta'||fechado?He:g('a')),'d');
      b+=`<text x="${x0+w/2}" y="${y0+hh/2+4}" text-anchor="middle" font-size="10" fill="${COR.ct}">interno ${nf(li)} × ${nf(hi)}</text>`;
      if(t.f==='canaleta'||fechado){const ex=230,ey=70,ew=130,eh=70;b+=tit(ex,24,'COMPRIMENTO')+`<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="${COR.c}" stroke="${COR.cl}" stroke-width="1.5"/>`+cotaH(ex,ex+ew,ey+eh+18,nf(g('comp'))+' cm');}
      else b+=`<text x="${x0+w+40}" y="${y0+20}" font-size="11" fill="${COR.tx}" font-weight="700">parede ${nf(e)} cm</text>`;
      break;}
    default:{
      b+=`<g transform="translate(120 40)"><polygon points="70,0 140,35 70,70 0,35" fill="#F2F4F7" stroke="${COR.cl}"/><polygon points="0,35 70,70 70,140 0,105" fill="${COR.c}" stroke="${COR.cl}"/><polygon points="140,35 70,70 70,140 140,105" fill="#D0D5DD" stroke="${COR.cl}"/></g>`;
      b+=`<text x="190" y="196" text-anchor="middle" font-size="11" font-weight="700" fill="${COR.tx}">${g('v')?n1(g('v'),3)+' m³ — ':''}peça especial: conforme projeto</text>`;}
  }
  return svg(W,H,b,'desenho esquemático · medidas em cm');
}

/* ═══════ ilustração 3D (para o cliente ver a peça como ela é) ═══════
   Malha de faces em centímetros (x = comprimento, y = largura, z = altura), vista em perspectiva de cima e
   de frente, luz difusa, sombra no chão e textura de concreto. Desenhada nas medidas da peça. */
const ILU=(function(){
  const RAD=PI/180,AX=20*RAD,AY=38*RAD,KX0=Math.cos(AX),KX1=Math.sin(AX),KY0=Math.cos(AY),KY1=Math.sin(AY);
  const nrm=v=>{const m=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/m,v[1]/m,v[2]/m];};
  const VW=nrm([KY0,KX0,Math.sin(AX+AY)]),LUZ=nrm([0.3,0.55,0.9]);
  const pj=p=>[p[0]*KX0-p[1]*KY0,p[0]*KX1+p[1]*KY1-p[2]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const Fc=(p,n,o)=>Object.assign({p,n:nrm(n),ly:1},o||{});
  const ar2=r=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return s;};
  const ccw=r=>ar2(r)<0?r.slice().reverse():r;
  const circ=(cx,cy,R,N,a0)=>{const o=[];for(let i=0;i<N;i++){const a=(a0||0)+2*PI*i/N;o.push([cx+R*Math.cos(a),cy+R*Math.sin(a)]);}return o;};
  const ret=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const retR=(x,y,w,h,r)=>{r=Math.min(r,w/2,h/2);if(r<=0.05)return ret(x,y,w,h);const o=[],cs=[[x+w-r,y+r,-90],[x+w-r,y+h-r,0],[x+r,y+h-r,90],[x+r,y+r,180]];
    cs.forEach(([cx,cy,a0])=>{for(let i=0;i<=4;i++){const a=(a0+22.5*i)*RAD;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}});return o;};
  const COR={conc:[196,193,186],poroso:[160,156,146],grama:[92,148,58],madeira:[168,122,80],telha:[180,96,70],claro:[226,222,212],agua:[126,186,226],escuro:[58,56,52],aco:[132,138,148]};
  // extrusão ao longo de x (perfil no plano y-z), ao longo de z (perfil no plano x-y) e sólido de revolução (perfil r-z)
  function extrX(ext,L,furos,o){o=o||{};const fs=[],x0=o.x0||0,x1=x0+L;
    const lados=(ring,dentro)=>{ring=ccw(ring);const n=ring.length;for(let i=0;i<n;i++){const a=ring[i],b=ring[(i+1)%n],dy=b[0]-a[0],dz=b[1]-a[1];
      fs.push(Fc([[x0,a[0],a[1]],[x1,a[0],a[1]],[x1,b[0],b[1]],[x0,b[0],b[1]]],dentro?[0,-dz,dy]:[0,dz,-dy],{ly:dentro?0:1,liso:o.liso}));}};
    lados(ext,false);(furos||[]).forEach(h=>lados(h,true));
    fs.push(Fc(ext.map(q=>[x1,q[0],q[1]]),[1,0,0],{furos:(furos||[]).map(h=>h.map(q=>[x1,q[0],q[1]])),cor:o.corTampa}));
    return fs;}
  function extrZ(ext,H,furos,o){o=o||{};const fs=[],z0=o.z0||0,z1=z0+H,zf=z0+(o.fundo||0);
    const lados=(ring,dentro)=>{ring=ccw(ring);const n=ring.length,za=dentro?zf:z0;for(let i=0;i<n;i++){const a=ring[i],b=ring[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1];
      fs.push(Fc([[a[0],a[1],za],[b[0],b[1],za],[b[0],b[1],z1],[a[0],a[1],z1]],dentro?[-dy,dx,0]:[dy,-dx,0],{ly:dentro?0:1,liso:o.liso}));}};
    lados(ext,false);(furos||[]).forEach(h=>{lados(h,true);if(o.fundo||o.corFundo)fs.push(Fc(h.map(q=>[q[0],q[1],zf]),[0,0,1],{ly:-1,cor:o.corFundo}));});
    fs.push(Fc(ext.map(q=>[q[0],q[1],z1]),[0,0,1],{furos:(furos||[]).map(h=>h.map(q=>[q[0],q[1],z1])),cor:o.corTampa}));
    return fs;}
  function revol(prof,N,o){o=o||{};const fs=[],ly=o.ly||{},z0=o.z0||0,cx=o.cx||0,cy=o.cy||0;
    for(let i=0;i<prof.length;i++){const a=prof[i],b=prof[(i+1)%prof.length];if(a[0]<1e-9&&b[0]<1e-9)continue;const dr=b[0]-a[0],dz=b[1]-a[1];
      for(let k=0;k<N;k++){const f0=2*PI*k/N,f1=2*PI*(k+1)/N,fm=(f0+f1)/2,P=(q,f)=>[cx+q[0]*Math.cos(f),cy+q[0]*Math.sin(f),z0+q[1]];
        fs.push(Fc([P(a,f0),P(b,f0),P(b,f1),P(a,f1)],[dz*Math.cos(fm),dz*Math.sin(fm),-dr],{ly:ly[i]!=null?ly[i]:(dz<-1e-9?0:1),liso:true,cor:o.cor}));}}
    return fs;}
  function piramide(x0,y0,w,h,z0,alt){const A=[x0+w/2,y0+h/2,z0+alt],B=[[x0,y0,z0],[x0+w,y0,z0],[x0+w,y0+h,z0],[x0,y0+h,z0]],fs=[];
    for(let i=0;i<4;i++){const a=B[i],b=B[(i+1)%4],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[A[0]-a[0],A[1]-a[1],A[2]-a[2]];fs.push(Fc([a,b,A],[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]));}return fs;}
  const mapear=(fs,lin,t)=>{t=t||[0,0,0];const P=p=>{const q=lin(p);return [q[0]+t[0],q[1]+t[1],q[2]+t[2]];};
    return fs.map(f=>Object.assign({},f,{p:f.p.map(P),n:nrm(lin(f.n)),furos:f.furos&&f.furos.map(h=>h.map(P))}));};
  // detalhes desenhados sobre as faces visíveis (furos de arame, botões do piso tátil, veios…)
  const circ3=(c,r,plano,N)=>{N=N||14;const o=[];for(let i=0;i<N;i++){const a=2*PI*i/N,u=r*Math.cos(a),v=r*Math.sin(a);o.push(plano==='z'?[c[0]+u,c[1]+v,c[2]]:plano==='y'?[c[0]+u,c[1],c[2]+v]:[c[0],c[1]+u,c[2]+v]);}return o;};
  const rgb=(c,k)=>`rgb(${c.map(v=>Math.max(0,Math.min(255,Math.round(v*k)))).join(',')})`;
  const DEF={prisma:{c:100,l:15,a:15},placa:{c:50,l:50,e:5},bloco:{c:39,l:14,a:19,vz:50},hexagono:{d:25,e:6},disco:{d:60,e:5},esfera:{d:40},tubo:{di:40,esp:5,comp:100},calha:{di:40,esp:5,comp:100},
    trapezio:{B:15,b:12,h:30,comp:100},canaleta:{li:30,hi:30,e:6,comp:100},caixa:{c:40,l:40,a:40,e:5},pote:{d:40,a:40,e:4},aduela:{li:100,hi:100,e:15,comp:100},manual:{v:0.05}};
  function furosBloco(c,l,vz,nf){if(!(vz>0))return [];const n=nf||(c>=29?2:1),alvo=vz/100*c*l;let lo=0,hi=Math.min(l/2,c/(n+1))-0.05;
    for(let i=0;i<40;i++){const t=(lo+hi)/2,ar=n*(l-2*t)*((c-(n+1)*t)/n);if(ar>alvo)lo=t;else hi=t;}
    const t=(lo+hi)/2,hw=l-2*t,hl=(c-(n+1)*t)/n,o=[];for(let i=0;i<n;i++)o.push(retR(t+i*(hl+t),t,hl,hw,Math.min(hl,hw)*0.18));return o;}
  function gradeFuros(c,l,nx,ny,frac,forma){const cx=c/nx,cy=l/ny,s=Math.min(Math.sqrt(frac*c*l/(nx*ny)),0.82*Math.min(cx,cy)),o=[];
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const x=cx*(i+0.5),y=cy*(j+0.5);o.push(forma==='circ'?circ(x,y,s/2,18):retR(x-s/2,y-s/2,s,s,s*0.2));}return o;}
  const trelica=(m,L,y,z0,alt)=>{const n=Math.max(2,Math.round(L/20)),top=[],zz=[];for(let i=0;i<=n;i++){const x=L*i/n;top.push([x,y,z0+alt]);zz.push([x,y+(i%2?2:-2),i%2?z0+alt:z0+0.6]);}
    m.decor.push({p:zz,aberto:1,stroke:'#7A808A',w:1.1},{p:top,aberto:1,stroke:'#7A808A',w:1.6},{p:[[0,y-2,z0+0.6],[L,y-2,z0+0.6]],aberto:1,stroke:'#7A808A',w:1.2});};
  function modelo(t,d){
    const F0=DEF[t.f]||DEF.manual,dd=Object.assign({},F0,t.d||{});Object.keys(d||{}).forEach(k=>{const v=d[k];if(v!==''&&v!=null&&isFinite(+v)&&(+v>0||k==='vz'))dd[k]=+v;});
    const g=k=>Math.max(0,+dd[k]||0),k=t.k,m={meshes:[],decor:[],cotas:[],cor:null};
    const cm=v=>`${n1(v)} cm`,cotaBox=(L,W,A,tx,ty,tz)=>{m.cotas.push({a:[0,W,0],b:[L,W,0],txt:tx},{a:[L,0,0],b:[L,W,0],txt:ty},{a:[L,0,0],b:[L,0,A],txt:tz});};
    // peça muito comprida: vista interrompida (como no desenho técnico) — a medida escrita é a real
    const longo=(L,sec)=>Math.min(L,12*Math.max(1,sec)),cmL=L=>L>=300?`${n1(L/100,2)} m`:cm(L);
    const quebra=(xm,W,A)=>{const z=[[xm-1.2,0,A],[xm+1.2,W*0.25,A],[xm-1.2,W*0.5,A],[xm+1.2,W*0.75,A],[xm-1.2,W,A],[xm+1.2,W,A*0.66],[xm-1.2,W,A*0.33],[xm+1.2,W,0]];
      m.decor.push({p:z,aberto:1,stroke:'#fff',w:4},{p:z,aberto:1,stroke:'#475467',w:1.2});};
    if(['paver_dren','placa_dren','sextavado_dren','dreno_poroso','junta_larga'].includes(k))m.cor=COR.poroso;
    if(['deck','placa_madeira'].includes(k))m.cor=COR.madeira;if(k==='telha')m.cor=COR.telha;if(k==='atermico')m.cor=COR.claro;
    // ── formas próprias de cada peça ──
    switch(k){
      case 'mourao':case 'esticador':case 'esteio':case 'mourao_curvo':{const Lr=g('c'),W=g('l'),A=g('a'),L=longo(Lr,Math.max(W,A)),ponta=k==='mourao_curvo'?Math.min(45,L*0.16):0;
        m.meshes.push(extrX(ret(0,0,W,A),L-ponta));
        if(ponta){const c45=Math.cos(PI/4),s45=Math.sin(PI/4);m.meshes.push(mapear(extrX(ret(0,0,W,A),ponta),p=>[p[0]*c45-p[2]*s45,p[1],p[0]*s45+p[2]*c45],[L-ponta,0,0]));}
        const nf=Math.max(3,Math.floor((L-ponta)/24));for(let i=0;i<nf;i++){const x=(L-ponta)*(i+0.6)/(nf+0.2);if(L<Lr&&Math.abs(x-(L-ponta)/2)<A)continue;m.decor.push({p:circ3([x,W,A/2],Math.min(1.1,A*0.11),'y'),fill:'#4A4844'});}
        if(L<Lr)quebra((L-ponta)/2,W,A);cotaBox(L,W,A,cmL(Lr),cm(W),cm(A));return m;}
      case 'pilar_muro':{const Lr=g('c'),W=g('l'),A=g('a'),L=longo(Lr,Math.max(W,A)),s=Math.min(4,A*0.35),p=Math.min(3,W*0.25);
        m.meshes.push(extrX([[0,0],[W,0],[W,A/2-s/2],[W-p,A/2-s/2],[W-p,A/2+s/2],[W,A/2+s/2],[W,A],[0,A],[0,A/2+s/2],[p,A/2+s/2],[p,A/2-s/2],[0,A/2-s/2]],L));if(L<Lr)quebra(L/2,W,A);cotaBox(L,W,A,cmL(Lr),cm(W),cm(A));return m;}
      case 'poste_dt':{const Lr=g('c'),W=g('l'),A=g('a'),L=longo(Lr,Math.max(W,A)),tf=A*0.2,w=W*0.4;
        m.meshes.push(extrX([[0,0],[W,0],[W,tf],[(W+w)/2,tf],[(W+w)/2,A-tf],[W,A-tf],[W,A],[0,A],[0,A-tf],[(W-w)/2,A-tf],[(W-w)/2,tf],[0,tf]],L));if(L<Lr)quebra(L/2,W,A);cotaBox(L,W,A,cmL(Lr),cm(W),cm(A));return m;}
      case 'jersey':case 'jersey_dupla':{const L=g('c'),B=g('l'),A=g('a');
        const pr=k==='jersey_dupla'?[[0,0],[B,0],[B,0.09*A],[B*0.8,0.31*A],[B*0.62,A],[B*0.38,A],[B*0.2,0.31*A],[0,0.09*A]]:[[0,0],[B,0],[B,0.09*A],[B*0.66,0.31*A],[B*0.42,A],[0,A]];
        m.meshes.push(extrX(pr,L));cotaBox(L,B,A,cm(L),cm(B),cm(A));return m;}
      case 'gelo_baiano':{const L=g('c'),B=g('l'),A=g('a');m.meshes.push(extrX([[0,0],[B,0],[B*0.68,A],[B*0.32,A]],L));cotaBox(L,B,A,cm(L),cm(B),cm(A));return m;}
      case 'placa_muro':case 'placa_muro_est':case 'guarda_corpo':{const L=g('c'),A=g('l'),E=g('e');m.meshes.push(extrX(ret(0,0,E,A),L));
        if(k==='placa_muro_est'){const nl=6,h=A/nl;for(let i=1;i<nl;i++)m.decor.push({p:[[0.3,E,h*i],[L-0.3,E,h*i]],aberto:1,stroke:'rgba(0,0,0,.28)',w:.8});
          for(let i=0;i<nl;i++){const of=i%2?0:L/24;for(let x=of+L/12;x<L-1;x+=L/12)m.decor.push({p:[[x,E,h*i+0.3],[x,E,h*(i+1)-0.3]],aberto:1,stroke:'rgba(0,0,0,.28)',w:.8});}}
        m.cotas.push({a:[0,E,0],b:[L,E,0],txt:cm(L)},{a:[L,0,0],b:[L,0,A],txt:cm(A)});return m;}
      case 'pingadeira_capa':{const L=g('c'),W=g('l'),E=g('e');m.meshes.push(extrX([[0,0],[W,0],[W,E*0.55],[W/2,E],[0,E*0.55]],L));cotaBox(L,W,E,cm(L),cm(W),cm(E));return m;}
      case 'chapeu':{const c=g('c'),l=g('l'),e=g('e');m.meshes.push(extrZ(ret(0,0,c,l),e*0.45),piramide(0,0,c,l,e*0.45,Math.max(e*0.9,c*0.22)));cotaBox(c,l,e,cm(c),cm(l),'');m.cotas.pop();return m;}
      case 'meiofio_vazado':{const B=g('B'),b=g('b'),h=g('h'),L=g('comp');m.meshes.push(extrX([[0,0],[B,0],[(B+b)/2,h],[(B-b)/2,h]],L));
        const n=Math.max(2,Math.round(L/30));for(let i=0;i<n;i++){const xa=L*(i+0.2)/n,xb=L*(i+0.8)/n,P=(x,s)=>[x,B-s*(B-b)/2,s*h];m.decor.push({p:[P(xa,0.25),P(xb,0.25),P(xb,0.7),P(xa,0.7)],fill:'#4A4844'});}
        cotaBox(L,B,h,cm(L),cm(B),cm(h));return m;}
      case 'paver':case 'paver_dren':case 'junta_larga':case 'tijolao':case 'confinamento':{const c=g('c'),l=g('l'),e=g('e'),ch=Math.min(c,l)*0.07;m.meshes.push(extrZ(ret(0,0,c,l),e));
        m.decor.push({p:[[ch,ch,e],[c-ch,ch,e],[c-ch,l-ch,e],[ch,l-ch,e]],fill:'rgba(255,255,255,.08)',stroke:'rgba(0,0,0,.16)',w:.8});
        if(k==='tijolao')[1/3,2/3].forEach(f=>m.decor.push({p:[[c*f,ch,e],[c*f,l-ch,e]],aberto:1,stroke:'rgba(0,0,0,.3)',w:1.2}));
        cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'paver_16f':{const c=g('c'),l=g('l'),e=g('e'),n=4,a=0.13*l,pts=[];for(let i=0;i<=2*n;i++)pts.push([c*i/(2*n),i%2?0:a]);for(let i=2*n;i>=0;i--)pts.push([c*i/(2*n),i%2?l:l-a]);
        m.meshes.push(extrZ(pts,e));cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'paver_diamante':{const c=g('c'),l=g('l')*0.62,e=g('e');m.meshes.push(extrZ([[c/2,0],[c,l/2],[c/2,l],[0,l/2]],e));cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'unigrama':case 'concregrama':{const c=g('c'),l=g('l'),e=g('e'),[nx,ny]=k==='unigrama'?[2,1]:(c>=40&&l>=40?[3,3]:[3,2]);
        m.meshes.push(extrZ(ret(0,0,c,l),e,gradeFuros(c,l,nx,ny,0.45),{corFundo:COR.grama}));cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'tatil':{const c=g('c'),l=g('l'),e=g('e'),n=Math.max(4,Math.round(c/5.5)),ny=Math.max(4,Math.round(l/5.5));m.meshes.push(extrZ(ret(0,0,c,l),e));
        for(let i=0;i<n;i++)for(let j=0;j<ny;j++){const x=c*(i+0.5)/n,y=l*(j+0.5)/ny,r=Math.min(c/n,l/ny)*0.3;m.decor.push({p:circ3([x,y,e],r,'z'),fill:'rgb(214,211,203)',stroke:'rgba(0,0,0,.25)',w:.6},{p:circ3([x-r*0.25,y-r*0.25,e],r*0.4,'z',10),fill:'rgba(255,255,255,.55)'});}
        cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'placa_rampa':case 'placa_deco':case 'ladrilho':case 'marmorizada':case 'deck':case 'placa_madeira':case 'ladrilho_hidr':case 'atermico':case 'pisadeira':{
        const c=g('c'),l=g('l'),e=g('e');m.meshes.push(extrZ(ret(0,0,c,l),e));const L=(a,b,st,w)=>m.decor.push({p:[[a[0],a[1],e],[b[0],b[1],e]],aberto:1,stroke:st,w:w||.8});
        if(k==='placa_rampa'){const s=Math.max(2.2,Math.min(c,l)/7);for(let q=-l+s/2;q<c;q+=s){let x1=Math.max(0,q),y1=x1-q,x2=Math.min(c,q+l),y2=x2-q;if(y1<0){y1=0;x1=q;}if(y2>l){y2=l;x2=q+l;}if(x2>x1)L([x1,y1],[x2,y2],'rgba(0,0,0,.28)',1);}}
        if(k==='placa_deco'||k==='pisadeira'){const n=k==='pisadeira'?2:4;for(let i=1;i<n;i++){L([c*i/n,0.4],[c*i/n,l-0.4],'rgba(0,0,0,.25)');L([0.4,l*i/n],[c-0.4,l*i/n],'rgba(0,0,0,.25)');}}
        if(k==='deck'||k==='placa_madeira'){const n=Math.max(3,Math.round(l/4));for(let i=1;i<n;i++){const y=l*i/n,pts=[];for(let s=0;s<=10;s++)pts.push([c*s/10,y+Math.sin(s*1.3+i)*l*0.012,e]);m.decor.push({p:pts,aberto:1,stroke:'rgba(70,40,15,.38)',w:.8});}}
        if(k==='marmorizada'){[[0.1,0.2,0.9,0.7],[0.2,0.9,0.7,0.1],[0.05,0.55,0.6,0.95]].forEach(([a,b,cc,dd2],i)=>{const pts=[];for(let s=0;s<=12;s++){const f=s/12;pts.push([c*(a+(cc-a)*f)+Math.sin(f*7+i)*c*0.03,l*(b+(dd2-b)*f)+Math.cos(f*5+i)*l*0.03,e]);}m.decor.push({p:pts,aberto:1,stroke:'rgba(255,255,255,.65)',w:1});});}
        if(k==='ladrilho_hidr'){m.decor.push({p:[[c/2,l*0.08,e],[c*0.92,l/2,e],[c/2,l*0.92,e],[c*0.08,l/2,e]],fill:'rgb(176,82,58)'},{p:circ3([c/2,l/2,e],Math.min(c,l)*0.2,'z',24),fill:'rgb(46,86,146)'},{p:circ3([c/2,l/2,e],Math.min(c,l)*0.08,'z',16),fill:'rgb(236,226,200)'});
          [[0,0],[c,0],[c,l],[0,l]].forEach(([x,y])=>{const a0=Math.atan2(l/2-y,c/2-x)-PI/4,pts=[[x,y,e]];for(let s=0;s<=6;s++){const a=a0+s/6*PI/2;pts.push([x+Math.cos(a)*c*0.16,y+Math.sin(a)*l*0.16,e]);}m.decor.push({p:pts,fill:'rgb(46,86,146)'});});}
        cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'placa_3d':{const c=g('c'),l=g('l'),e=g('e'),b=e*0.35,n=3,pir=[];m.meshes.push(extrZ(ret(0,0,c,l),b));for(let i=0;i<n;i++)for(let j=0;j<n;j++)pir.push(...piramide(c*i/n,l*j/n,c/n,l/n,b,e-b));m.meshes.push(pir);cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'telha':{const c=g('c'),l=g('l'),e=g('e'),A=Math.max(2.5,l*0.1),N=24,top=[],bot=[];for(let i=0;i<=N;i++){const y=l*i/N,z=e+A*(0.5-0.5*Math.cos(2*PI*y/(l/2)));top.push([y,z]);bot.push([y,z-e]);}
        m.meshes.push(extrX(top.concat(bot.reverse()),c,[],{liso:true}));m.cotas.push({a:[0,l,0],b:[c,l,0],txt:cm(c)},{a:[c,0,0],b:[c,l,0],txt:cm(l)});return m;}
      case 'grelha':case 'guia_vazada':case 'tampa_ret':{const c=g('c'),l=g('l'),e=g('e');let fur=[];
        if(k==='grelha'){const n=Math.max(4,Math.round(c/11));for(let i=0;i<n;i++){const w=c/n*0.42;fur.push(retR(c*(i+0.5)/n-w/2,l*0.12,w,l*0.76,w*0.4));}}
        if(k==='guia_vazada'){const n=3;for(let i=0;i<n;i++){const w=c/n*0.45;fur.push(retR(c*(i+0.5)/n-w/2,l*0.18,w,l*0.64,w*0.3));}}
        m.meshes.push(extrZ(ret(0,0,c,l),e,fur));
        if(k==='tampa_ret')[[0.5,0.12],[0.5,0.88]].forEach(([fx,fy])=>m.decor.push({p:[[c*fx-c*0.08,l*fy-1.2,e],[c*fx+c*0.08,l*fy-1.2,e],[c*fx+c*0.08,l*fy+1.2,e],[c*fx-c*0.08,l*fy+1.2,e]],fill:'#4A4844'}));
        cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'tampa_circ':case 'tampao':case 'bolacha':{const R=g('d')/2,e=g('e');m.meshes.push(revol([[0,0],[R,0],[R,e],[0,e]],56));
        if(k==='tampao')m.meshes.push(revol([[0,0],[R*0.72,0],[R*0.72,e*0.6],[0,e*0.6]],56,{z0:e}));
        if(k!=='bolacha'){const z=k==='tampao'?e*1.6:e;[-1,1].forEach(s=>m.decor.push({p:[[s*R*0.5-R*0.1,-R*0.03,z],[s*R*0.5+R*0.1,-R*0.03,z],[s*R*0.5+R*0.1,R*0.03,z],[s*R*0.5-R*0.1,R*0.03,z]],fill:'#4A4844'}));}
        m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)});return m;}
      case 'laje_reducao':{const R=g('d')/2,e=g('e');m.meshes.push(extrZ(circ(0,0,R,64),e,[circ(R*0.22,0,R*0.42,40)],{liso:true}));m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)});return m;}
      case 'anel_pv':case 'gola':case 'cone_pv':{const ri=g('di')/2,es=g('esp'),h=g('comp'),R=ri+es;
        if(k==='cone_pv'){const rt=Math.max(30,ri*0.6);m.meshes.push(revol([[ri,0],[R,0],[rt+es,h],[rt,h]],56));}else m.meshes.push(revol([[ri,0],[R,0],[R,h],[ri,h]],56));
        m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø int. '+cm(2*ri)},{a:[R,0,0],b:[R,0,h],txt:cm(h)});return m;}
      case 'tubo_pb':case 'tubo_mf':case 'dreno_perf':case 'dreno_poroso':case 'poste_cr':{const r=g('di')/2,es=g('esp'),Lr=g('comp'),R=r+es,L=k==='poste_cr'?longo(Lr,2*R):Lr,Rb=R+es*0.9,C=k==='tubo_pb'?Rb:R;
        if(k==='tubo_pb'){const lb=Math.min(L*0.14,18);m.meshes.push(extrX(circ(C,C,Rb,48),lb,[circ(C,C,r,48)],{liso:true}),extrX(circ(C,C,R,48),L-lb,[circ(C,C,r,48)],{liso:true,x0:lb}));}
        else if(k==='tubo_mf'){const s=Math.min(6,L*0.06);m.meshes.push(extrX(circ(C,C,R,48),L-s,[circ(C,C,r,48)],{liso:true}),extrX(circ(C,C,R-es*0.45,48),s,[circ(C,C,r,48)],{liso:true,x0:L-s}));}
        else m.meshes.push(extrX(circ(C,C,R,48),L,[circ(C,C,r,48)],{liso:true}));
        if(k==='dreno_perf'){const na=10,nx=Math.max(3,Math.round(L/16));for(let i=0;i<na;i++){const f=2*PI*i/na,nn=[0,Math.cos(f),Math.sin(f)];if(dot(nn,VW)<0.25)continue;
          for(let j=0;j<nx;j++){const x=L*(j+0.5)/nx,c0=[x,C+R*Math.cos(f),C+R*Math.sin(f)],rr=Math.min(1.4,R*0.08),pts=[];for(let s=0;s<12;s++){const a=2*PI*s/12;pts.push([c0[0]+rr*Math.cos(a),c0[1]-rr*Math.sin(a)*Math.sin(f),c0[2]+rr*Math.sin(a)*Math.cos(f)]);}m.decor.push({p:pts,fill:'#4A4844'});}}}
        m.cotas.push({a:[0,2*C,C*0.15],b:[L,2*C,C*0.15],txt:k==='poste_cr'?cmL(Lr):cm(L)},{a:[L,C-r,C],b:[L,C+r,C],txt:'Ø '+cm(2*r),dentro:1});return m;}
      case 'canaleta_grelha':{const li=g('li'),hi=g('hi'),e=g('e'),L=g('comp'),W=li+2*e,H=hi+e,n=Math.max(3,Math.round(L/9)),fur=[];
        m.meshes.push(extrX([[0,0],[W,0],[W,H],[W-e,H],[W-e,e],[e,e],[e,H],[0,H]],L));for(let i=0;i<n;i++){const w=L/n*0.45;fur.push(retR(L*(i+0.5)/n-w/2,e+li*0.08,w,li*0.84,w*0.3));}
        m.meshes.push(extrZ(ret(0,0,L,W),3,fur,{z0:H}));cotaBox(L,W,H+3,cm(L),cm(W),cm(H+3));return m;}
      case 'quadro_bl':case 'suporte_grelha':{const c=g('c'),l=g('l'),a=g('a'),b=Math.min(c,l)*0.16;m.meshes.push(extrZ(ret(0,0,c,l),a,[ret(b,b,c-2*b,l-2*b)]));cotaBox(c,l,a,cm(c),cm(l),cm(a));return m;}
      case 'cantoneira_bl':{const L=g('c'),W=g('l'),A=g('a'),tt=Math.min(W,A)*0.45;m.meshes.push(extrX([[0,0],[W,0],[W,tt],[tt,tt],[tt,A],[0,A]],L));cotaBox(L,W,A,cm(L),cm(W),cm(A));return m;}
      case 'bloco_h':{const c=g('c'),l=g('l'),a=g('a'),tt=c*0.22,w=l*0.4;m.meshes.push(extrZ([[0,0],[tt,0],[tt,(l-w)/2],[c-tt,(l-w)/2],[c-tt,0],[c,0],[c,l],[c-tt,l],[c-tt,(l+w)/2],[tt,(l+w)/2],[tt,l],[0,l]],a));cotaBox(c,l,a,cm(c),cm(l),cm(a));return m;}
      case 'canaleta_bloco':{const c=g('c'),l=g('l'),a=g('a'),e=Math.min(2.5,l*0.2);m.meshes.push(extrX([[0,0],[l,0],[l,a],[l-e,a],[l-e,e*1.4],[e,e*1.4],[e,a],[0,a]],c));cotaBox(c,l,a,cm(c),cm(l),cm(a));return m;}
      case 'bloco_jardim':{const c=g('c'),l=g('l'),a=g('a');m.meshes.push(extrZ(ret(0,0,c,l),a,furosBloco(c,l,g('vz')||45,1)));cotaBox(c,l,a,cm(c),cm(l),cm(a));return m;}
      case 'cobogo':{const c=g('c'),es=g('l'),a=g('a'),n=c>=35?4:3,cel=c/n,rr=Math.min(cel*0.4,cel*Math.sqrt((g('vz')||55)/100/PI)),fur=[];
        for(let i=0;i<n;i++)for(let j=0;j<Math.max(1,Math.round(a/cel));j++)fur.push(circ(cel*(i+0.5),a/Math.max(1,Math.round(a/cel))*(j+0.5),rr,20));
        m.meshes.push(mapear(extrX(ret(0,0,c,a),es,fur),p=>[p[1],p[0],p[2]]));m.cotas.push({a:[0,es,0],b:[c,es,0],txt:cm(c)},{a:[c,0,0],b:[c,0,a],txt:cm(a)});return m;}
      case 'vigota':case 'verga':{const Lr=g('c'),W=g('l'),A=g('a'),L=longo(Lr,Math.max(W,A+(k==='vigota'?8:0)));m.meshes.push(extrX(ret(0,0,W,A),L));if(k==='vigota')trelica(m,L,W/2,A,8);if(L<Lr)quebra(L/2,W,A);cotaBox(L,W,A,cmL(Lr),cm(W),cm(A));return m;}
      case 'minipainel':{const L=g('c'),W=g('l'),E=g('e');m.meshes.push(extrZ(ret(0,0,L,W),E));[W*0.3,W*0.7].forEach(y=>trelica(m,L,y,E,8));cotaBox(L,W,E,`${n1(L/100,2)} m`,cm(W),cm(E));return m;}
      case 'balaustre':{const H=g('c'),w=g('l'),pr=[[0,0],[0.5,0],[0.5,0.07],[0.34,0.1],[0.3,0.18],[0.44,0.36],[0.46,0.48],[0.36,0.62],[0.22,0.76],[0.3,0.84],[0.5,0.88],[0.5,1],[0,1]].map(([r,z])=>[r*w,z*H]);
        m.meshes.push(revol(pr,36));m.cotas.push({a:[w/2,0,0],b:[w/2,0,H],txt:cm(H)});return m;}
      case 'balizador':case 'ponteira':{const R=g('d')/2,b=k==='ponteira'?Math.max(4,R*0.25):0,pr=[];for(let i=0;i<=18;i++){const a=-PI/2+PI*i/18;pr.push([R*Math.cos(a),R+R*Math.sin(a)]);}
        if(b)m.meshes.push(extrZ(ret(-R*0.55,-R*0.55,R*1.1,R*1.1),b));m.meshes.push(revol(pr,40,{z0:b}));m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)});return m;}
      case 'lixeira':case 'vaso':case 'caixa_gord_circ':{const R=g('d')/2,a=g('a'),e=g('e'),ri=R-e,k1=k==='caixa_gord_circ'?1:0.8;
        m.meshes.push(revol([[0,0],[R*k1,0],[R,a],[ri,a],[ri*k1,e],[0,e]],56,{ly:{4:-1}}));m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)},{a:[R,0,0],b:[R,0,a],txt:cm(a)});return m;}
      case 'bandeja':{const c=g('c'),l=g('l'),e=g('e'),w=Math.min(1.5,e*0.5);m.meshes.push(extrZ(ret(0,0,c,l),e,[retR(w,w,c-2*w,l-2*w,2)],{fundo:Math.min(1,e*0.35)}));cotaBox(c,l,e,cm(c),cm(l),cm(e));return m;}
      case 'banco':{m.meshes.push(extrZ(ret(18,2,16,46),40),extrZ(ret(216,2,16,46),40),extrZ(ret(0,0,250,50),9,[],{z0:40}));cotaBox(250,50,49,'250 cm','50 cm','');m.cotas.pop();return m;}
      case 'degrau':{m.meshes.push(extrX([[0,0],[28,0],[28,17],[-3,17],[-3,14],[0,14]],100));cotaBox(100,28,17,'100 cm','28 cm','17 cm');return m;}
      case 'sapata':{m.meshes.push(extrZ(ret(0,0,100,100),25),extrZ(ret(32,32,36,36),45,[],{z0:25}));cotaBox(100,100,70,'100 cm','100 cm','70 cm');return m;}
      case 'laje_alveolar':{const fur=[];for(let i=0;i<6;i++)fur.push(circ(10+20*i,10,6.6,22));m.meshes.push(extrX(ret(0,0,120,20),300,fur));cotaBox(300,120,20,'até 15 m','120 cm','20 cm');return m;}
      case 'mata_burro':{m.meshes.push(extrX(ret(8,0,16,20),300),extrX(ret(176,0,16,20),300));const bars=[];for(let x=6;x<300;x+=22)bars.push(...extrZ(ret(x,0,9,200),10,[],{z0:20}));m.meshes.push(bars);cotaBox(300,200,30,'300 cm','200 cm','');m.cotas.pop();return m;}
      case 'chafariz':{m.meshes.push(revol([[0,0],[16,0],[11,10],[11,42],[16,46],[0,46]],32),revol([[0,0],[40,0],[55,22],[51,22],[37,4],[0,4]],56,{z0:44,ly:{4:-1}}));
        m.decor.push({p:circ3([0,0,63],49,'z',40),fill:'rgba(126,186,226,.85)'});m.cotas.push({a:[-55,55,0],b:[55,55,0],txt:'Ø 110 cm'});return m;}
      case 'ecofogao':{m.meshes.push(extrZ(ret(0,0,90,60),70),extrZ(ret(6,6,14,14),70,[],{z0:70}));m.decor.push({p:[[30,60,10],[60,60,10],[60,60,32],[30,60,32]],fill:'#3E3B37'},{p:circ3([45,30,70],9,'z',20),fill:'#3E3B37'},{p:circ3([72,30,70],7,'z',18),fill:'#3E3B37'});cotaBox(90,60,70,'90 cm','60 cm','70 cm');return m;}
      case 'lareira':{m.meshes.push(extrZ(ret(0,0,120,47),75));const pts=[[30,47,8],[90,47,8],[90,47,45]];for(let s=0;s<=10;s++){const a=PI*s/10;pts.push([60+30*Math.cos(a),47,45+14*Math.sin(a)]);}pts.push([30,47,45]);m.decor.push({p:pts,fill:'#2E2B28'});cotaBox(120,47,75,'120 cm','47 cm','75 cm');return m;}
      case 'caixa_sao':{m.meshes.push(extrZ(ret(0,0,150,80),80,[ret(8,8,62,64),ret(78,8,64,64)],{fundo:8}));cotaBox(150,80,80,'150 cm','80 cm','80 cm');return m;}
    }
    // ── formas da família ──
    switch(t.f){
      case 'prisma':{const Lr=g('c'),W=g('l'),A=g('a'),L=longo(Lr,Math.max(W,A));m.meshes.push(extrX(ret(0,0,W,A),L));if(L<Lr)quebra(L/2,W,A);cotaBox(L,W,A,cmL(Lr),cm(W),cm(A));break;}
      case 'placa':{const c=g('c'),l=g('l'),e=g('e');m.meshes.push(extrZ(ret(0,0,c,l),e));cotaBox(c,l,e,cm(c),cm(l),cm(e));break;}
      case 'bloco':{const c=g('c'),l=g('l'),a=g('a');m.meshes.push(extrZ(ret(0,0,c,l),a,furosBloco(c,l,g('vz'))));cotaBox(c,l,a,cm(c),cm(l),cm(a));break;}
      case 'hexagono':{const D=g('d'),e=g('e'),R=D/Math.sqrt(3);m.meshes.push(extrZ(circ(0,0,R,6,PI/6),e));m.cotas.push({a:[-R,D/2,0],b:[R,D/2,0],txt:cm(D)},{a:[R,0,0],b:[R,0,e],txt:cm(e)});break;}
      case 'disco':{const R=g('d')/2,e=g('e');m.meshes.push(revol([[0,0],[R,0],[R,e],[0,e]],56));m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)});break;}
      case 'esfera':{const R=g('d')/2,pr=[];for(let i=0;i<=18;i++){const a=-PI/2+PI*i/18;pr.push([R*Math.cos(a),R+R*Math.sin(a)]);}m.meshes.push(revol(pr,40));m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)});break;}
      case 'tubo':{const r=g('di')/2,R=r+g('esp'),L=g('comp');m.meshes.push(extrX(circ(R,R,R,48),L,[circ(R,R,r,48)],{liso:true}));m.cotas.push({a:[0,2*R,R*0.15],b:[L,2*R,R*0.15],txt:cm(L)},{a:[L,R-r,R],b:[L,R+r,R],txt:'Ø '+cm(2*r),dentro:1});break;}
      case 'calha':{const r=g('di')/2,R=r+g('esp'),L=g('comp'),N=24,pr=[];for(let i=0;i<=N;i++){const a=PI+PI*i/N;pr.push([R+R*Math.cos(a),R+R*Math.sin(a)]);}for(let i=N;i>=0;i--){const a=PI+PI*i/N;pr.push([R+r*Math.cos(a),R+r*Math.sin(a)]);}
        m.meshes.push(extrX(pr,L,[],{liso:true}));m.cotas.push({a:[0,2*R,R*0.5],b:[L,2*R,R*0.5],txt:cm(L)});break;}
      case 'trapezio':{const B=g('B'),b=g('b'),h=g('h'),L=g('comp');m.meshes.push(extrX([[0,0],[B,0],[(B+b)/2,h],[(B-b)/2,h]],L));cotaBox(L,B,h,cm(L),cm(B),cm(h));break;}
      case 'canaleta':{const li=g('li'),hi=g('hi'),e=g('e'),L=g('comp'),W=li+2*e,H=hi+e;m.meshes.push(extrX([[0,0],[W,0],[W,H],[W-e,H],[W-e,e],[e,e],[e,H],[0,H]],L));cotaBox(L,W,H,cm(L),cm(W),cm(H));break;}
      case 'caixa':{const c=g('c'),l=g('l'),a=g('a'),e=g('e');m.meshes.push(extrZ(ret(0,0,c,l),a,[retR(e,e,c-2*e,l-2*e,Math.min(2,e*0.3))],{fundo:e}));cotaBox(c,l,a,cm(c),cm(l),cm(a));break;}
      case 'pote':{const R=g('d')/2,a=g('a'),e=g('e'),ri=R-e;m.meshes.push(revol([[0,0],[R,0],[R,a],[ri,a],[ri,e],[0,e]],56,{ly:{4:-1}}));m.cotas.push({a:[-R,R,0],b:[R,R,0],txt:'Ø '+cm(2*R)},{a:[R,0,0],b:[R,0,a],txt:cm(a)});break;}
      case 'aduela':{const li=g('li'),hi=g('hi'),e=g('e'),L=g('comp'),W=li+2*e,H=hi+2*e;m.meshes.push(extrX(ret(0,0,W,H),L,[ret(e,e,li,hi)]));cotaBox(L,W,H,cm(L),cm(W),cm(H));break;}
      default:{const s=Math.max(10,Math.cbrt(Math.max(0.001,g('v')))*100);m.meshes.push(extrZ(retR(0,0,s*1.3,s,s*0.08),s*0.75));m.cor=m.cor||COR.claro;}
    }
    return m;
  }
  function hull(P){const p=P.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
    for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
    for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}
    up.pop();lo.pop();return lo.concat(up);}
  let SEQ=0;
  function ilustracao(t,d,o){
    o=o||{};const W=o.w||380,H=o.h||210,id='pm3d'+(++SEQ),m=modelo(t,d||{}),base=m.cor||COR.conc,todas=m.meshes.flat();
    if(!todas.length)return '';
    let zmin=Infinity;todas.forEach(f=>f.p.forEach(p=>{if(p[2]<zmin)zmin=p[2];}));
    const pts=[];todas.forEach(f=>f.p.forEach(p=>pts.push(pj(p))));m.decor.forEach(dc=>dc.p.forEach(p=>pts.push(pj(p))));
    const cx3=todas.reduce((s,f)=>s+f.p[0][0],0)/todas.length,cy3=todas.reduce((s,f)=>s+f.p[0][1],0)/todas.length;
    const somb=hull(todas.flatMap(f=>f.p.map(p=>{const q=[cx3+(p[0]-cx3)*1.05,cy3+(p[1]-cy3)*1.05,zmin];return pj(q);})));somb.forEach(q=>pts.push(q));
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;pts.forEach(([x,y])=>{if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;});
    const pad=o.cotas?40:10,s=Math.min((W-2*pad)/Math.max(1e-6,x1-x0),(H-2*pad)/Math.max(1e-6,y1-y0)),ox=(W-(x1-x0)*s)/2,oy=(H-(y1-y0)*s)/2;
    const T=q=>[(q[0]-x0)*s+ox,(q[1]-y0)*s+oy],P=p=>T(pj(p)),f2=v=>Math.round(v*10)/10,cam=a=>a.map(p=>{const q=P(p);return f2(q[0])+' '+f2(q[1]);});
    const caminho=(ps,aberto)=>'M'+cam(ps).join('L')+(aberto?'':'Z');
    let faces='';
    m.meshes.forEach(fs=>{fs.filter(f=>dot(f.n,VW)>1e-6).map(f=>{const c=f.p.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>v/f.p.length);return {f,dp:dot(c,VW)};})
      .sort((a,b)=>(a.f.ly-b.f.ly)||(a.dp-b.dp)).forEach(({f})=>{const c=f.cor||base,lam=dot(f.n,LUZ);let k=0.55+0.5*Math.max(-0.2,lam);if(f.ly<=0&&!f.cor)k*=0.52;
        const fill=rgb(c,k),d=caminho(f.p)+(f.furos||[]).map(h=>caminho(h)).join('');
        faces+=`<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${f.liso?fill:rgb(c,k*0.8)}" stroke-width="${f.liso?0.6:0.8}" stroke-linejoin="round"/>`;});});
    const dec=m.decor.map(dc=>`<path d="${caminho(dc.p,dc.aberto)}" fill="${dc.aberto?'none':(dc.fill||'none')}" stroke="${dc.stroke||'none'}" stroke-width="${dc.w||0.8}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    let cot='';
    if(o.cotas){const cen=T([(x0+x1)/2,(y0+y1)/2]);m.cotas.forEach(ct=>{if(!ct.txt)return;const a=P(ct.a),b=P(ct.b),dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<6)return;
      let nx=-dy/L,ny=dx/L;const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(!ct.dentro&&((mid[0]-cen[0])*nx+(mid[1]-cen[1])*ny)<0){nx=-nx;ny=-ny;}
      const off=ct.dentro?0:9,A=[a[0]+nx*off,a[1]+ny*off],B=[b[0]+nx*off,b[1]+ny*off],tk=4,tx=mid[0]+nx*(off+(ct.dentro?-6:11)),ty=mid[1]+ny*(off+(ct.dentro?-6:11))+4;
      cot+=`<g stroke="#475467" stroke-width="1"><line x1="${f2(A[0])}" y1="${f2(A[1])}" x2="${f2(B[0])}" y2="${f2(B[1])}"/><line x1="${f2(A[0]-nx*tk)}" y1="${f2(A[1]-ny*tk)}" x2="${f2(A[0]+nx*tk)}" y2="${f2(A[1]+ny*tk)}"/><line x1="${f2(B[0]-nx*tk)}" y1="${f2(B[1]-ny*tk)}" x2="${f2(B[0]+nx*tk)}" y2="${f2(B[1]+ny*tk)}"/></g>`+
        `<text x="${f2(tx)}" y="${f2(ty)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1D2939" paint-order="stroke" stroke="#fff" stroke-width="3">${ct.txt}</text>`;});}
    const grao=o.grao!==false;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="pm-svg pm-3d" font-family="Inter,Arial,sans-serif" role="img" aria-label="${String(t.nome||'').replace(/"/g,'')}"><defs>
      <filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(2,s*1.5)}"/></filter>
      ${grao?`<filter id="${id}g"><feTurbulence type="fractalNoise" baseFrequency="${m.cor===COR.poroso?1.4:0.9}" numOctaves="2" seed="5" result="t"/>
        <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${m.cor===COR.poroso?'1.3 0 0 0 -.45':'.9 0 0 0 -.33'}" result="e"/>
        <feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 .8 0 0 -.4" result="c"/>
        <feComposite in="e" in2="SourceAlpha" operator="in" result="e2"/><feComposite in="c" in2="SourceAlpha" operator="in" result="c2"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="e2"/><feMergeNode in="c2"/></feMerge></filter>`:''}</defs>
      <path d="M${somb.map(q=>{const r=T(q);return f2(r[0])+' '+f2(r[1]);}).join('L')}Z" fill="rgba(16,24,40,.2)" filter="url(#${id}s)"/>
      <g ${grao?`filter="url(#${id}g)"`:''}>${faces}</g>${dec}${cot}</svg>`;
  }
  return {ilustracao,modelo};
})();

window.PM_CAT={GRUPOS,TR,FAM,TIPOS,tipoDe,geo,armadura,desenho,n1,ilustracao:ILU.ilustracao};
})();
