/* ═══════════════════════════════════════════════════════════════════════════════════════════════════
   PRÉ-MOLDADOS — a fábrica de peças de concreto, à parte das obras (mesmo sistema, mesmo padrão de telas)
   ───────────────────────────────────────────────────────────────────────────────────────────────────
   Tudo fica numa tabela só ("premoldados"), cada linha com o seu tipo (row_data.tipo):
     config   → parâmetros da fábrica (preços dos insumos, equipe, betoneira, rateio, impostos, margem)
     traco    → traços de concreto criados pela empresa (os traços padrão vêm prontos no código)
     peca     → o catálogo: dimensões, traço, armadura (vergalhões, estribos, malha POP), cura, preço
     ordem    → ordem de produção (planejamento)
     producao → diário de produção (peças boas + refugo); guarda o consumo e o custo do dia
     venda    → saída/venda de peças (pedido → entregue → recebida)
     compra   → entrada de insumo no estoque (com valor, vencimento e pagamento)
     ajuste   → acerto de inventário (peça ou insumo)
     custo    → custos da fábrica (mão de obra, energia, água, aluguel, manutenção…) — o rateio real
   Cálculo de engenharia: volume pela geometria; consumo de materiais pelo traço em massa
   (C = 1000·(1−ar) / (1/ρc + a/ρa + p/ρp + b/ρb + a/c)); aço por bitola (0,006165·d² kg/m) com barras de 12 m;
   malha POP em painéis de 2×3 m; mão de obra, betoneira, energia, água e custos fixos rateados por m³.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if(typeof GS==='undefined'||typeof Fin==='undefined'||typeof UI==='undefined'||typeof App==='undefined')return;
const U=Fin.util,{janela,confirmar,executar,salvar,excluir,fe,dt,brDe,isoDe,hoje0,addD,dias}=U;
const {kpiG,cabG,fmtN,mesKey,mesHoje,mesDesloc,mesNome,mesCurto,cap}=GS;
const ABA='Pré-moldados';
// número guardado (já é número) vale como está; texto digitado segue a máscara do sistema ("1.234,56", "R$ 38,00").
// Atenção: sem isto, 0.341 (três casas) seria lido como "milhar" e viraria 341.
const num=s=>{if(typeof s==='number')return isFinite(s)?s:0;if(s==null||s==='')return 0;const n=(typeof Mascara!=='undefined'?Mascara.numero(s):parseFloat(String(s).replace(',','.')));return n==null||!isFinite(n)?0:n;};
const r2=n=>Math.round((+n||0)*100)/100;
const nf=(v,c)=>fmtN(v,c==null?2:c);
const R=v=>fmt(r2(v));
const hojeISO=()=>isoDe(hoje0());
const pill=(t,c,ico)=>`<span class="vk-pill ${c||''}">${ico?`<i class="fas ${ico}"></i>`:''}${t}</span>`;
const pode=()=>GS.pode('premoldados');

/* ═══════════════ PARÂMETROS PADRÃO (ajustáveis na aba Parâmetros) ═══════════════ */
const INS=[
  {k:'cimento',nome:'Cimento',un:'sc',unL:'saco de 50 kg',cor:'#475467'},
  {k:'areia',nome:'Areia média',un:'m³',unL:'m³',cor:'#DC6803'},
  {k:'po',nome:'Pó de pedra',un:'m³',unL:'m³',cor:'#98A2B3'},
  {k:'brita',nome:'Brita 0 (pedrisco)',un:'m³',unL:'m³',cor:'#667085'},
  {k:'aco50',nome:'Aço CA-50 (6,3 mm ou mais)',un:'kg',unL:'kg',cor:'#B42318'},
  {k:'aco60',nome:'Aço CA-60 (4,2 a 6,0 mm)',un:'kg',unL:'kg',cor:'#D92D20'},
  {k:'malha',nome:'Malha POP (painel 2 × 3 m)',un:'pç',unL:'painel',cor:'#7A2FE0'},
  {k:'arame',nome:'Arame recozido',un:'kg',unL:'kg',cor:'#6941C6'},
  {k:'aditivo',nome:'Aditivo plastificante',un:'kg',unL:'kg',cor:'#0E9384'},
  {k:'desmoldante',nome:'Desmoldante',un:'L',unL:'litro',cor:'#1570EF'}];
const insDe=k=>INS.find(i=>i.k===k)||{k,nome:k,un:'',unL:''};
const CFG0={
  precos:{cimento:38,areia:120,po:95,brita:130,aco50:7.5,aco60:8.5,malha:95,arame:18,aditivo:14,desmoldante:12,agua:12,energia:0.95},
  dens:{cimento:3.10,areia:2.62,po:2.70,brita:2.70},        // massa específica (t/m³) — para o traço
  unit:{areia:1.45,po:1.55,brita:1.45},                      // massa unitária solta (t/m³) — para comprar em m³
  ar:2,                                                      // ar incorporado (%)
  massa:{simples:2300,armado:2500},                          // peso do concreto (kg/m³)
  equipe:{pessoas:3,custo:2800},                             // custo mensal por pessoa já com encargos
  prod_m3:30,                                                // produção prevista por mês (m³) — base do rateio
  betoneira:{cap:400,util:70,kw:1.5,min:6,valor:3500,vida:60,manut:100},
  vibrador:{kw:1.1,min:20},                                  // minutos de vibração por m³
  cura_l:150,                                                // água de cura (litros por m³)
  desm_lm2:0.05,                                             // desmoldante (litros por m² de forma)
  malha_m2:6,                                                // área de um painel de malha POP
  arame_pct:1.5,                                             // arame de amarração (% do peso do aço)
  perdas:{concreto:5,aco:8,malha:10},
  fixos:[{nome:'Aluguel do galpão / pátio',valor:0},{nome:'Manutenção de formas',valor:150},{nome:'EPIs e ferramentas',valor:80}],
  impostos:6,margem:30,
  minimos:{cimento:20,areia:2,po:2,brita:2,aco50:50,aco60:50,malha:5,arame:5,aditivo:0,desmoldante:5},
  saldo_inicial:0,saldo_data:''};
const TRACOS0=[
  {id:'p:estrutural',nome:'Concreto estrutural (fck 25)',ar:2,po:0,br:3,ac:0.55,ad:0,uso:'Mourões, estacas, pilares, postes, tampas armadas'},
  {id:'p:po',nome:'Concreto com pó de pedra (fck 20)',ar:1,po:2,br:2,ac:0.55,ad:0,uso:'Meio-fio, placas de muro, peças sem função estrutural'},
  {id:'p:micro',nome:'Microconcreto (placas finas)',ar:1.5,po:1.5,br:0,ac:0.45,ad:0.5,uso:'Placas finas, lajotas, tampas de pouca espessura'},
  {id:'p:seco',nome:'Concreto seco (vibroprensado)',ar:0,po:8,br:0,ac:0.40,ad:0,uso:'Blocos, pavers, peças prensadas'}];
const CATS=['Mourão / estaca','Pilar / coluna','Viga / verga','Placa / painel','Meio-fio / guia','Bloco / canaleta','Tampa / laje','Manilha / tubo / anel','Piso / paver','Poste','Outros'];
const BITOLAS=[4.2,5.0,6.0,6.3,8.0,10.0,12.5,16.0];
const kgm=d=>0.006165*d*d;                // kg por metro (aço: π/4 · d² · 7850)
const ehCA60=d=>+d<6.3;
const FORMAS={
  retangular:{rot:'Retangular maciça',campos:[['c','Comprimento (cm)'],['l','Largura (cm)'],['a','Altura / espessura (cm)']]},
  vazado:{rot:'Retangular vazada (bloco, canaleta)',campos:[['c','Comprimento (cm)'],['l','Largura (cm)'],['a','Altura (cm)'],['vazio','Vazios da peça (%)']]},
  cilindro:{rot:'Cilíndrica maciça',campos:[['d','Diâmetro (cm)'],['h','Altura / comprimento (cm)']]},
  tubo:{rot:'Tubo / anel (manilha)',campos:[['de','Diâmetro externo (cm)'],['esp','Espessura da parede (cm)'],['comp','Comprimento (cm)']]},
  trapezio:{rot:'Seção trapezoidal (meio-fio)',campos:[['B','Base maior (cm)'],['b','Base menor / topo (cm)'],['h','Altura da seção (cm)'],['comp','Comprimento (cm)']]},
  manual:{rot:'Outra forma (volume informado)',campos:[['v','Volume da peça (m³)'],['am','Área de malha por peça (m²)'],['as','Área de forma por peça (m²)']]}};
// modelos prontos (preenchem a peça inteira — dá para ajustar tudo depois)
const MODELOS=[
  {k:'mourao',nome:'Mourão de concreto 10 × 10 cm × 2,20 m',categoria:'Mourão / estaca',forma:'retangular',dims:{c:220,l:10,a:10},traco:'p:estrutural',barras:[{t:'b',d:4.2,q:4,l:215},{t:'e',d:4.2,q:11,l:32}],cura:7},
  {k:'estaca',nome:'Estaca / mourão 12 × 12 cm × 2,50 m',categoria:'Mourão / estaca',forma:'retangular',dims:{c:250,l:12,a:12},traco:'p:estrutural',barras:[{t:'b',d:5.0,q:4,l:245},{t:'e',d:4.2,q:13,l:40}],cura:7},
  {k:'meiofio',nome:'Meio-fio 100 × 30 cm (base 15, topo 12)',categoria:'Meio-fio / guia',forma:'trapezio',dims:{B:15,b:12,h:30,comp:100},traco:'p:po',barras:[],cura:7},
  {k:'placa',nome:'Placa de muro 200 × 50 × 4 cm',categoria:'Placa / painel',forma:'retangular',dims:{c:200,l:50,a:4},traco:'p:micro',barras:[{t:'b',d:4.2,q:3,l:195}],cura:7},
  {k:'pilar',nome:'Pilar de muro 12 × 12 cm × 2,50 m',categoria:'Pilar / coluna',forma:'retangular',dims:{c:250,l:12,a:12},traco:'p:estrutural',barras:[{t:'b',d:5.0,q:4,l:245},{t:'e',d:4.2,q:13,l:40}],cura:7},
  {k:'tampa',nome:'Tampa de caixa 60 × 60 × 6 cm (malha POP)',categoria:'Tampa / laje',forma:'retangular',dims:{c:60,l:60,a:6},traco:'p:estrutural',barras:[],malha:{usa:true,camadas:1,area:''},cura:7},
  {k:'manilha',nome:'Manilha / anel Ø 40 cm × 1,00 m',categoria:'Manilha / tubo / anel',forma:'tubo',dims:{de:50,esp:5,comp:100},traco:'p:estrutural',barras:[],malha:{usa:true,camadas:1,area:''},cura:14},
  {k:'bloco',nome:'Bloco de concreto 14 × 19 × 39 cm',categoria:'Bloco / canaleta',forma:'vazado',dims:{c:39,l:14,a:19,vazio:45},traco:'p:seco',barras:[],cura:7},
  {k:'piso',nome:'Placa de piso 50 × 50 × 5 cm',categoria:'Piso / paver',forma:'retangular',dims:{c:50,l:50,a:5},traco:'p:micro',barras:[],cura:7},
  {k:'paver',nome:'Paver 20 × 10 × 6 cm',categoria:'Piso / paver',forma:'retangular',dims:{c:20,l:10,a:6},traco:'p:seco',barras:[],cura:7}];

/* ═══════════════ DADOS ═══════════════ */
const linhas=()=>(GS.D().premoldados||[]);
const T=t=>linhas().filter(r=>r.tipo===t);
function mesclar(a,b){const o=Array.isArray(a)?a.slice():{...a};if(!b||typeof b!=='object')return o;
  for(const k of Object.keys(b)){const v=b[k];
    if(v&&typeof v==='object'&&!Array.isArray(v)&&a&&a[k]&&typeof a[k]==='object'&&!Array.isArray(a[k]))o[k]=mesclar(a[k],v);
    else if(v!==undefined&&v!==null&&v!=='')o[k]=v;}
  return o;}
const cfgRow=()=>T('config')[0]||null;
const CFG=()=>mesclar(CFG0,(cfgRow()||{}).cfg||{});
const tracos=()=>TRACOS0.map(t=>({...t,padrao:true})).concat(T('traco').map(r=>({id:String(r.rowid),nome:r.nome||'Traço',ar:+r.ar||0,po:+r.po||0,br:+r.br||0,ac:+r.ac||0.5,ad:+r.ad||0,uso:r.uso||'',reg:r})));
const tracoDe=id=>tracos().find(t=>t.id===String(id))||tracos()[0];
const pecas=()=>T('peca').slice().sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
const pecaDe=id=>T('peca').find(p=>String(p.rowid)===String(id))||null;
const nomePeca=id=>{const p=pecaDe(id);return p?p.nome:'(peça excluída)';};
const ordens=()=>T('ordem');
const vendas=()=>T('venda');
async function gravar(o,rowid){
  try{await executar(()=>salvar(ABA,o,rowid||null));}
  catch(e){if(/premoldados|pré-moldados|does not exist|schema cache|relation|could not find the table/i.test(String(e&&e.message)))throw new Error('A tabela da fábrica ainda não existe no banco: rode o passo 6 no Supabase (arquivo seguranca/passo-6-premoldados.sql).');throw e;}
}
async function apagarReg(reg,rotulo,depois){
  if(GS.podeMexer&&!GS.podeMexer(reg))return toast(GS.MSG_DONO,'error');
  confirmar('Excluir?',`<b>${fe(rotulo)}</b> será excluído de vez. Não tem como desfazer.`,'Sim, excluir',async()=>{await executar(()=>excluir(ABA,reg.rowid));toast('Excluído.','success');if(depois)depois();});
}
const proxNum=(tipo,campo)=>T(tipo).reduce((m,r)=>Math.max(m,parseInt(String(r[campo]||'').replace(/\D/g,''),10)||0),0)+1;
const proxCodigo=()=>'PM-'+String(proxNum('peca','codigo')).padStart(3,'0');

/* ═══════════════ ENGENHARIA: geometria, traço, materiais e custo ═══════════════ */
function geo(p){
  const d=p.dims||{},g=k=>num(d[k]);let V=0,face=0,sup=0,desc='';
  switch(p.forma){
    case 'vazado':{const c=g('c'),l=g('l'),a=g('a'),vz=Math.min(90,Math.max(0,g('vazio')));V=c*l*a*(1-vz/100)/1e6;face=c*l/1e4;sup=(2*(c*l+c*a+l*a)*(1+vz/100))/1e4;desc=`${nf(c,1)} × ${nf(l,1)} × ${nf(a,1)} cm · ${nf(vz,0)}% vazios`;break;}
    case 'cilindro':{const D=g('d'),h=g('h');V=Math.PI*D*D/4*h/1e6;face=Math.PI*D*h/1e4;sup=(Math.PI*D*h+2*Math.PI*D*D/4)/1e4;desc=`Ø ${nf(D,1)} × ${nf(h,1)} cm`;break;}
    case 'tubo':{const De=g('de'),e=g('esp'),c=g('comp'),Di=Math.max(0,De-2*e);V=Math.PI/4*(De*De-Di*Di)*c/1e6;face=Math.PI*(De+Di)/2*c/1e4;sup=(Math.PI*(De+Di)*c)/1e4;desc=`Ø ext. ${nf(De,1)} · parede ${nf(e,1)} · ${nf(c,1)} cm`;break;}
    case 'trapezio':{const B=g('B'),b=g('b'),h=g('h'),c=g('comp'),lado=Math.sqrt(h*h+((B-b)/2)**2);V=(B+b)/2*h*c/1e6;face=B*c/1e4;sup=((B+b+2*lado)*c+(B+b)*h)/1e4;desc=`${nf(B,1)}/${nf(b,1)} × ${nf(h,1)} × ${nf(c,1)} cm`;break;}
    case 'manual':{V=g('v');face=g('am');sup=g('as')||(V>0?6*Math.pow(V,2/3):0);desc=`${nf(V,4)} m³`;break;}
    default:{const c=g('c'),l=g('l'),a=g('a');V=c*l*a/1e6;face=c*l/1e4;sup=2*(c*l+c*a+l*a)/1e4;desc=`${nf(c,1)} × ${nf(l,1)} × ${nf(a,1)} cm`;}
  }
  return {V:Math.max(0,V),face:Math.max(0,face),sup:Math.max(0,sup),desc};
}
// consumo por m³ de concreto pelo traço em massa (cimento = 1)
function traco1m3(t,c){
  const den=1/c.dens.cimento+(t.ar||0)/c.dens.areia+(t.po||0)/c.dens.po+(t.br||0)/c.dens.brita+(t.ac||0);
  const C=den>0?1000*(1-(+c.ar||0)/100)/den:0;
  return {cimento:C,areia:C*(t.ar||0),po:C*(t.po||0),brita:C*(t.br||0),agua:C*(t.ac||0),aditivo:C*(t.ad||0)/100};
}
// rateio previsto por m³ (mão de obra, betoneira, energia, água de cura, custos fixos)
function rateio(c){
  const m3=Math.max(0.1,num(c.prod_m3)),b=c.betoneira,v=c.vibrador,pr=c.precos;
  const lPorTr=Math.max(1,num(b.cap)*num(b.util)/100),kwh=num(b.kw)*num(b.min)/60*(1000/lPorTr)+num(v.kw)*num(v.min)/60;
  const fixos=(c.fixos||[]).reduce((s,x)=>s+num(x.valor),0);
  const o={mao:num(c.equipe.pessoas)*num(c.equipe.custo)/m3,betoneira:(num(b.valor)/Math.max(1,num(b.vida))+num(b.manut))/m3,
    energia:kwh*num(pr.energia),agua:num(c.cura_l)/1000*num(pr.agua),fixos:fixos/m3,kwh};
  o.total=o.mao+o.betoneira+o.energia+o.agua+o.fixos;return o;
}
// tudo de uma peça para n unidades: volume, peso, materiais (unidade de compra), aço por bitola e custos
function calc(p,n,c){
  c=c||CFG();n=Math.max(0,+n||0)||1;
  const g=geo(p),t=tracoDe(p.traco),pc=c.perdas,pr=c.precos;
  const perdaC=p.perda!==''&&p.perda!=null&&!isNaN(+p.perda)?+p.perda:num(pc.concreto);
  const Vc=g.V*(1+perdaC/100)*n,k=traco1m3(t,c);
  const kg={cimento:k.cimento*Vc,areia:k.areia*Vc,po:k.po*Vc,brita:k.brita*Vc,aditivo:k.aditivo*Vc},aguaL=k.agua*Vc;
  // aço
  const porBitola={};let kg50=0,kg60=0;
  (p.barras||[]).forEach(b=>{const d=+b.d||0,q=num(b.q),l=num(b.l)/100;if(!d||!q||!l)return;const m=q*l*n*(1+num(pc.aco)/100),k2=m*kgm(d);
    const x=porBitola[d]=porBitola[d]||{d,m:0,kg:0};x.m+=m;x.kg+=k2;if(ehCA60(d))kg60+=k2;else kg50+=k2;});
  Object.values(porBitola).forEach(x=>x.barras=Math.ceil(x.m/12-1e-9));
  const malhaM2=p.malha&&p.malha.usa?(num(p.malha.area)||g.face)*Math.max(1,num(p.malha.camadas)||1)*n*(1+num(pc.malha)/100):0;
  const arameKg=(kg50+kg60)*num(c.arame_pct)/100,desmL=g.sup*num(c.desm_lm2)*n;
  const est={cimento:kg.cimento/50,areia:kg.areia/(num(c.unit.areia)*1000||1450),po:kg.po/(num(c.unit.po)*1000||1550),brita:kg.brita/(num(c.unit.brita)*1000||1450),
    aco50:kg50,aco60:kg60,malha:malhaM2/(num(c.malha_m2)||6),arame:arameKg,aditivo:kg.aditivo,desmoldante:desmL};
  Object.keys(est).forEach(x=>{if(!(est[x]>1e-9))delete est[x];});
  const custoMat={};Object.entries(est).forEach(([x,q])=>custoMat[x]=q*num(pr[x]));
  custoMat.agua=aguaL/1000*num(pr.agua);
  const mat=Object.values(custoMat).reduce((s,v)=>s+v,0),ra=rateio(c),Vn=g.V*n;
  const custo={mat,mao:ra.mao*Vn,betoneira:ra.betoneira*Vn,energia:ra.energia*Vn,agua:ra.agua*Vn,fixos:ra.fixos*Vn};
  custo.total=custo.mat+custo.mao+custo.betoneira+custo.energia+custo.agua+custo.fixos;
  const un=custo.total/n,sug=un*(1+num(c.margem)/100)/Math.max(0.01,1-num(c.impostos)/100);
  const preco=num(p.preco),margem=preco>0?(preco*(1-num(c.impostos)/100)-un)/preco*100:null;
  return {g,t,n,V:g.V,Vt:Vn,Vc,peso:g.V*((kg50+kg60)>0||malhaM2>0?num(c.massa.armado):num(c.massa.simples)),kg,aguaL,est,porBitola,kg50,kg60,malhaM2,custoMat,custo,un,sug,preco,margem,kwh:ra.kwh*Vn};
}

/* ═══════════════ ESTOQUE ═══════════════ */
function estoquePecas(){
  const m={},h=hoje0(),g=id=>m[id]=m[id]||{prod:0,refugo:0,cura:0,lib:0,vend:0,res:0,aj:0,m3:0,custo:0};
  T('producao').forEach(r=>{const p=pecaDe(r.peca),x=g(String(r.peca)),q=num(r.qtd);x.prod+=q;x.refugo+=num(r.refugo);x.custo+=q*num(r.custo_un);
    const d=dt(r.data)||h,lib=addD(d,num(p&&p.cura!=null&&p.cura!==''?p.cura:7));if(lib>h)x.cura+=q;else x.lib+=q;});
  vendas().forEach(v=>{if(v.status==='cancelada')return;(v.itens||[]).forEach(it=>{const x=g(String(it.peca)),q=num(it.qtd);if(v.status==='pedido')x.res+=q;else x.vend+=q;});});
  T('ajuste').forEach(a=>{if(String(a.item||'').startsWith('peca:'))g(a.item.slice(5)).aj+=num(a.qtd);});
  Object.entries(m).forEach(([id,x])=>{x.disp=x.lib-x.vend+x.aj;x.livre=x.disp-x.res;
    const p=pecaDe(id);x.custoUn=x.prod>0?x.custo/x.prod:(p?calc(p,1).un:0);});
  return m;
}
function estoqueInsumos(){
  const c=CFG(),m={};INS.forEach(i=>m[i.k]={ent:0,cons:0,aj:0,valor:0});
  T('compra').forEach(r=>{const x=m[r.insumo];if(!x)return;x.ent+=num(r.qtd);x.valor+=num(r.valor);});
  T('producao').forEach(r=>Object.entries(r.consumo||{}).forEach(([k,q])=>{if(m[k])m[k].cons+=num(q);}));
  T('ajuste').forEach(a=>{if(String(a.item||'').startsWith('insumo:')){const x=m[a.item.slice(7)];if(x)x.aj+=num(a.qtd);}});
  const d30=addD(hoje0(),-30);
  INS.forEach(i=>{const x=m[i.k];x.saldo=x.ent-x.cons+x.aj;x.preco=x.ent>0&&x.valor>0?x.valor/x.ent:num(c.precos[i.k]);x.valorEst=Math.max(0,x.saldo)*x.preco;x.min=num((c.minimos||{})[i.k]);
    const c30=T('producao').filter(r=>{const d=dt(r.data);return d&&d>=d30;}).reduce((s,r)=>s+num((r.consumo||{})[i.k]),0);x.dia=c30/30;x.duraDias=x.dia>0?Math.floor(Math.max(0,x.saldo)/x.dia):null;});
  return m;
}
const prodDaOrdem=id=>T('producao').filter(r=>String(r.ordem||'')===String(id)).reduce((s,r)=>s+num(r.qtd),0);
const totalVenda=v=>r2((v.itens||[]).reduce((s,it)=>s+num(it.qtd)*num(it.preco),0)+num(v.frete)-num(v.desconto));

/* ═══════════════ ESTADO DA TELA ═══════════════ */
const ABAS=[
  {k:'painel',rot:'Painel da fábrica',ico:'fa-gauge-high',sub:'Produção, vendas, margem e alertas do mês'},
  {k:'pecas',rot:'Peças e traços',ico:'fa-cubes',sub:'Catálogo com o cálculo de materiais e custo'},
  {k:'planejamento',rot:'Planejamento da produção',ico:'fa-clipboard-list',sub:'Ordens de produção e o que comprar'},
  {k:'producao',rot:'Diário de produção',ico:'fa-industry',sub:'O que foi confeccionado a cada dia'},
  {k:'estoque',rot:'Estoque',ico:'fa-warehouse',sub:'Peças em cura e prontas, insumos e compras'},
  {k:'vendas',rot:'Vendas e saídas',ico:'fa-truck-ramp-box',sub:'Pedidos, entregas e recebimentos'},
  {k:'caixa',rot:'Fluxo de caixa',ico:'fa-sack-dollar',sub:'Entradas, saídas e custos da fábrica'},
  {k:'relatorios',rot:'Relatórios',ico:'fa-chart-column',sub:'Produção, vendas, consumo, estoque e resultado'},
  {k:'parametros',rot:'Parâmetros e preços',ico:'fa-sliders',sub:'Preços dos insumos, equipe, betoneira e rateio'}];
const PM={aba:'painel',mes:mesHoje(),busca:'',cat:'',rel:{tipo:'producao',de:isoDe(addD(hoje0(),-30)),ate:hojeISO()},cxMes:mesHoje()};
let grafico=null;
const ativa=()=>!!document.getElementById('view-premoldados')?.classList.contains('active');

/* ═══════════════ ESTILO ═══════════════ */
function estilo(){
  if(document.getElementById('pm-estilo'))return;
  const s=document.createElement('style');s.id='pm-estilo';
  s.textContent=`
#pm-app{display:flex;flex-direction:column;gap:16px;}
.pm-abas{display:flex;gap:6px;flex-wrap:wrap;}
.pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;}
.pm-card{background:#fff;border:1px solid #e8e8ed;border-left:4px solid var(--cor,#0071E3);border-radius:14px;padding:12px 14px;cursor:pointer;box-shadow:0 2px 6px rgba(20,20,60,.05);transition:transform .15s,box-shadow .15s;min-width:0;}
.pm-card:hover{transform:translateY(-2px);box-shadow:0 10px 22px -12px rgba(20,20,60,.35);}
.pm-card h4{margin:0;font-size:14px;color:var(--text-1);line-height:1.3;overflow-wrap:anywhere;}
.pm-card .pm-cod{font-size:11px;font-weight:800;color:#667085;letter-spacing:.03em;}
.pm-card .pm-dim{font-size:12px;color:#6e6e73;margin:3px 0 8px;}
.pm-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px;}
.pm-nums div{background:#F8FAFC;border-radius:9px;padding:6px 8px;min-width:0;}
.pm-nums small{display:block;font-size:10.5px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:.03em;}
.pm-nums b{display:block;font-size:13px;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pm-form{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start;}
.pm-form .fin-linha{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));}
.pm-bloco{border:1px solid #E4E9F2;border-radius:14px;padding:12px 14px;margin-bottom:12px;background:#fff;}
.pm-bloco h5{margin:0 0 10px;font:800 12px Inter,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#344054;display:flex;align-items:center;gap:8px;}
.pm-bloco h5 i{color:#1652D8;}
.pm-res{position:sticky;top:0;background:#F8FAFC;border:1px solid #E4E9F2;border-radius:14px;padding:12px 14px;font-size:12.5px;}
.pm-res h5{margin:0 0 8px;font:800 12px Inter,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#344054;}
.pm-res table,.pm-tab{width:100%;border-collapse:collapse;font-size:12.5px;}
.pm-res td,.pm-res th,.pm-tab td,.pm-tab th{padding:6px 7px;border-bottom:1px solid #EEF1F6;text-align:left;vertical-align:top;}
.pm-res th,.pm-tab th{font:800 10px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#667085;background:#F2F4F7;}
.pm-res td.n,.pm-res th.n,.pm-tab td.n,.pm-tab th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
.pm-res tr.t td,.pm-tab tr.t td{font-weight:800;border-top:2px solid var(--text-1);}
.pm-res small,.pm-tab small{display:block;color:#667085;font-size:11px;}
.pm-tab tbody tr.pm-lin{cursor:pointer;} .pm-tab tbody tr.pm-lin:hover{background:#F8FAFF;}
.pm-big{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:10px 12px;margin:8px 0;border-radius:12px;background:#fff;border:1px solid #E4E9F2;}
.pm-big b{font:800 20px Manrope,Inter,sans-serif;color:var(--text-1);} .pm-big span{color:#667085;font-size:12px;}
.pm-arm td{padding:4px;} .pm-arm input,.pm-arm select{width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:9px;font:13px Inter,sans-serif;}
.pm-x{border:0;background:#FEF3F2;color:#B42318;border-radius:8px;width:30px;height:30px;cursor:pointer;}
.pm-rolar{overflow-x:auto;}
.pm-mini{font-size:12px;color:#667085;}
.pm-barra{height:7px;border-radius:99px;background:#EEF1F6;overflow:hidden;margin-top:6px;} .pm-barra i{display:block;height:100%;background:#1652D8;border-radius:99px;} .pm-barra.ok i{background:#12B76A;}
.pm-chart{height:270px;position:relative;}
.pm-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.pm-filtros input,.pm-filtros select{padding:9px 12px;border:1px solid #e8e8ed;border-radius:12px;font:13px Inter,sans-serif;background:#fff;max-width:100%;}
.pm-itens td{padding:4px;} .pm-itens input,.pm-itens select{width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:9px;font:13px Inter,sans-serif;}
@media (max-width:900px){.pm-form{grid-template-columns:1fr;} .pm-res{position:static;}}
`;
  document.head.appendChild(s);
}

/* ═══════════════ TELA E MENU ═══════════════ */
function montar(){
  if(!document.getElementById('view-premoldados')){
    const ref=document.getElementById('view-inicio');if(!ref)return false;
    const v=document.createElement('div');v.className='view';v.id='view-premoldados';v.innerHTML='<div class="cards-scroll"><div id="pm-app"></div></div>';
    ref.parentNode.appendChild(v);
  }
  if(!document.getElementById('nav-premoldados')){
    const rel=document.getElementById('nav-relatorios'),li0=rel&&rel.closest('li');if(!li0)return false;
    const li=document.createElement('li');li.className='vx-cat';li.id='nav-premoldados';li.style.display='none';
    li.innerHTML=`<button type="button" class="vx-cat-bt" aria-haspopup="true"><i class="fas fa-cubes"></i>Pré-moldados<span class="vx-seta"></span></button>
      <div class="vx-painel"><div class="vx-painel-cab"><b>Pré-moldados</b><span>A fábrica de peças: produção, estoque, vendas e caixa — à parte das obras.</span></div>
      <div class="vx-painel-itens">${ABAS.map(a=>`<button type="button" class="vx-item vx-alvo" id="nav-pm-${a.k}" onclick="UI.nav('pm-${a.k}')"><span class="vx-item-ico"><i class="fas ${a.ico}"></i></span><span class="vx-item-txt"><b>${a.rot}</b><small>${a.sub}</small></span></button>`).join('')}</div></div>`;
    li0.parentNode.insertBefore(li,li0);
    // o menu já foi ligado antes de esta categoria existir: liga o abrir/fechar dela do mesmo jeito
    if(UI._navIniciado){
      li.addEventListener('mouseleave',()=>li.classList.remove('vx-fechar'));
      li.querySelector(':scope > .vx-cat-bt').addEventListener('click',ev=>{ev.stopPropagation();const abrir=!li.classList.contains('aberto');document.querySelectorAll('.vx-cat.aberto').forEach(c=>c.classList.remove('aberto'));li.classList.remove('vx-fechar');li.classList.toggle('aberto',abrir);});
    }
  }
  return true;
}
// permissão: a tela entra na lista de telas do sistema (Usuários e permissões)
if(Array.isArray(UI._MODULOS)&&!UI._MODULOS.some(m=>m[0]==='premoldados'))UI._MODULOS.push(['premoldados','Pré-moldados (fábrica)']);
estilo();montar();
// o menu e a lista de telas liberadas: Administrador, quem não tem restrição ou quem recebeu "premoldados"
function ajustarAcesso(){
  const s=typeof Auth!=='undefined'?Auth._session:null,li=document.getElementById('nav-premoldados');if(!li)return;
  if(!s){li.style.display='none';return;}
  const acessos=Array.isArray(s.acessos)?s.acessos:null,ok=UI._ehAdmin(s.perfil)||!acessos||acessos.includes('premoldados');
  // os itens também: o menu do sistema mostra a categoria quando algum item dela está visível
  li.querySelectorAll('.vx-alvo').forEach(b=>{b.style.display=ok?'':'none';});
  li.style.display=ok?'':'none';
  if(ok&&Array.isArray(UI._allowedViews)&&!UI._allowedViews.includes('premoldados'))UI._allowedViews.push('premoldados');
}
if(typeof Auth!=='undefined'&&typeof Auth._applySession==='function'){const ap=Auth._applySession;Auth._applySession=function(){const r=ap.apply(this,arguments);try{ajustarAcesso();}catch(e){console.error(e);}return r;};}
ajustarAcesso();
{const nav0=UI.nav;
  UI.nav=function(v){
    if(typeof v==='string'&&v.indexOf('pm-')===0){const a=v.slice(3);if(ABAS.some(x=>x.k===a))PM.aba=a;v='premoldados';}
    const r=nav0.call(this,v);
    if(v==='premoldados'&&ativa()){
      document.getElementById('nav-premoldados')?.classList.remove('active');
      document.querySelectorAll('[id^="nav-pm-"]').forEach(b=>b.classList.toggle('active',b.id==='nav-pm-'+PM.aba));
      UI._navMarcar&&UI._navMarcar();
      const ab=ABAS.find(x=>x.k===PM.aba);document.title='Pré-moldados · '+(ab?ab.rot:'');const t=document.getElementById('view-title');if(t)t.textContent='Pré-moldados';
    }
    return r;};}
{const re=App._renderEng;App._renderEng=function(v){if(v==='premoldados'){try{render();}catch(e){console.error(e);}return;}return re.apply(this,arguments);};}
{const ra=App.renderAll;App.renderAll=function(){const r=ra.apply(this,arguments);try{if(ativa())render();}catch(e){console.error(e);}return r;};}

function irAba(a){PM.aba=a;UI.nav('pm-'+a);}
function render(){
  const box=document.getElementById('pm-app');if(!box)return;
  if(!pode()){box.innerHTML='<div class="gf-vazio"><i class="fas fa-lock"></i><p>Sem acesso aos pré-moldados.</p></div>';return;}
  const ab=ABAS.find(x=>x.k===PM.aba)||ABAS[0];
  const abas=`<div class="gf-abas pm-abas">${ABAS.map(a=>`<button type="button" class="gf-aba ${a.k===ab.k?'on':''}" data-pm-aba="${a.k}"><i class="fas ${a.ico}"></i> ${a.rot.replace(' da fábrica','').replace(' da produção','').replace(' e saídas','').replace(' e preços','')}</button>`).join('')}</div>`;
  let corpo='';
  try{corpo=({painel:telaPainel,pecas:telaPecas,planejamento:telaPlanejamento,producao:telaProducao,estoque:telaEstoque,vendas:telaVendas,caixa:telaCaixa,relatorios:telaRelatorios,parametros:telaParametros}[ab.k]||telaPainel)();}
  catch(e){console.error(e);corpo=`<div class="gf-aviso err"><i class="fas fa-triangle-exclamation"></i><div>Erro ao montar esta aba: ${fe(e.message)}</div></div>`;}
  if(grafico){try{grafico.destroy();}catch(e){}grafico=null;}
  box.innerHTML=abas+corpo;
  if(ab.k==='painel')desenharGrafico();
  if(!box._ligado){box._ligado=1;box.addEventListener('click',clique);box.addEventListener('change',mudou);box.addEventListener('input',digitou);}
}
function digitou(ev){
  const t=ev.target;
  if(t.matches('[data-pm-busca]')){PM.busca=t.value;clearTimeout(PM._t);PM._t=setTimeout(()=>{render();const i=document.querySelector('[data-pm-busca]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},300);}
}
function mudou(ev){
  const t=ev.target;
  if(t.matches('[data-pm-mes]')){PM.mes=t.value;render();}
  else if(t.matches('[data-pm-cat]')){PM.cat=t.value;render();}
  else if(t.matches('[data-pm-cxmes]')){PM.cxMes=t.value;render();}
  else if(t.matches('[data-pm-rel]')){PM.rel[t.dataset.pmRel]=t.value;render();}
}
function clique(ev){
  const a=ev.target.closest('[data-pm-aba]');if(a)return irAba(a.dataset.pmAba);
  const cx=ev.target.closest('[data-pm-cxsel]');if(cx){PM.cxMes=cx.dataset.pmCxsel;return render();}
  const b=ev.target.closest('[data-pm]');if(!b)return;const x=b.dataset.pm,id=b.dataset.id;
  const acoes={
    'nova-peca':()=>formPeca(null),'peca':()=>fichaPeca(pecaDe(id)),'traco-novo':()=>formTraco(null),'traco':()=>formTraco(tracoDe(id)),
    'ordem-nova':()=>formOrdem(null),'ordem':()=>formOrdem(T('ordem').find(o=>String(o.rowid)===id)),
    'prod-nova':()=>formProducao(null),'prod':()=>formProducao(T('producao').find(o=>String(o.rowid)===id)),
    'compra-nova':()=>formCompra(null,b.dataset.ins),'compra':()=>formCompra(T('compra').find(o=>String(o.rowid)===id)),
    'ajuste-novo':()=>formAjuste(null,b.dataset.item),'ajuste':()=>formAjuste(T('ajuste').find(o=>String(o.rowid)===id)),
    'venda-nova':()=>formVenda(null),'venda':()=>fichaVenda(T('venda').find(o=>String(o.rowid)===id)),
    'custo-novo':()=>formCusto(null),'custo':()=>formCusto(T('custo').find(o=>String(o.rowid)===id)),
    'ir':()=>irAba(b.dataset.aba),'cfg-salvar':()=>salvarParametros(),'cfg-fixo-add':()=>addFixo(),'cfg-fixo-x':()=>tirarFixo(b),
    'rel-excel':()=>relatorio(true,false),'rel-pdf':()=>relatorio(false,true),'compras-pdf':()=>imprimirNecessidade(),
    'faltas-ordem':()=>formOrdem(null,{peca:b.dataset.peca,qtd:b.dataset.qtd})};
  if(acoes[x])acoes[x]();
}

/* ═══════════════ PAINEL ═══════════════ */
function resumoMes(k){
  const noM=d=>!!d&&mesKey(d)===k,c=CFG();
  const prod=T('producao').filter(r=>noM(dt(r.data)));
  const pecasProd=prod.reduce((s,r)=>s+num(r.qtd),0),refugo=prod.reduce((s,r)=>s+num(r.refugo),0);
  const m3=prod.reduce((s,r)=>{const p=pecaDe(r.peca);return s+(p?geo(p).V*(num(r.qtd)+num(r.refugo)):0);},0);
  const matCons=prod.reduce((s,r)=>s+num(r.custo_mat_un)*(num(r.qtd)+num(r.refugo)),0);
  const vend=vendas().filter(v=>v.status!=='cancelada'&&v.status!=='pedido'&&noM(dt(v.entrega||v.data)));
  const receita=vend.reduce((s,v)=>s+totalVenda(v),0),ep=estoquePecas();
  let cpvMat=0,cpv=0;const porPeca={};
  vend.forEach(v=>(v.itens||[]).forEach(it=>{const p=pecaDe(it.peca),q=num(it.qtd);const cc=p?calc(p,1,c):null;cpvMat+=q*(cc?cc.custo.mat:0);cpv+=q*(ep[String(it.peca)]?ep[String(it.peca)].custoUn:(cc?cc.un:0));
    const x=porPeca[it.peca]=porPeca[it.peca]||{q:0,v:0};x.q+=q;x.v+=q*num(it.preco);}));
  const impostos=receita*num(c.impostos)/100,mc=receita-impostos-cpvMat;
  const custos=T('custo').filter(x=>noM(dt(x.data))).reduce((s,x)=>s+num(x.valor),0);
  const resultado=mc-custos,custoM3=m3>0?(matCons+custos)/m3:null;
  return {k,prod,pecasProd,refugo,m3,matCons,vend,receita,impostos,cpvMat,cpv,mc,custos,resultado,custoM3,porPeca};
}
// insumos que a fábrica de fato usa: os do catálogo de peças e os que já tiveram compra (o resto não gera alerta)
function insumosUsados(){const s=new Set();const c=CFG();pecas().forEach(p=>{try{Object.keys(calc(p,1,c).est).forEach(k=>s.add(k));}catch(e){}});T('compra').forEach(r=>s.add(r.insumo));return s;}
function faltaInsumo(ei,us){return INS.filter(i=>us.has(i.k)&&(ei[i.k].saldo<0||(ei[i.k].min>0&&ei[i.k].saldo<ei[i.k].min)));}
function alertas(){
  const out=[],h=hoje0(),ei=estoqueInsumos(),ep=estoquePecas(),us=insumosUsados();
  faltaInsumo(ei,us).forEach(i=>{const x=ei[i.k];out.push(x.saldo<0
    ?{tom:'err',ico:'fa-box-open',t:`${i.nome}: estoque negativo (${nf(x.saldo,2)} ${i.un})`,s:'A produção consumiu mais do que entrou: lance a compra (Estoque › Entrada de insumo) ou acerte o inventário.',go:'estoque'}
    :{tom:x.saldo<=0?'err':'warn',ico:'fa-box-open',t:`${i.nome}: ${nf(x.saldo,2)} ${i.un} em estoque`,s:`Abaixo do mínimo (${nf(x.min,2)} ${i.un}).${x.duraDias!=null?` No ritmo atual dura ${x.duraDias} dia(s).`:''}`,go:'estoque'});});
  ordens().filter(o=>o.status!=='concluida'&&o.status!=='cancelada'&&dt(o.fim)&&dt(o.fim)<h).forEach(o=>out.push({tom:'err',ico:'fa-clock',t:`OP nº ${o.numero} atrasada`,s:`${nomePeca(o.peca)} — ${nf(prodDaOrdem(o.rowid),0)} de ${nf(num(o.qtd),0)} feitas; prazo era ${brDe(dt(o.fim))}.`,go:'planejamento'}));
  vendas().filter(v=>v.status==='entregue'&&dt(v.vencimento)&&dt(v.vencimento)<h).forEach(v=>out.push({tom:'err',ico:'fa-hand-holding-dollar',t:`Venda nº ${v.numero} vencida — ${R(totalVenda(v))}`,s:`${v.cliente||'Cliente'} · venceu em ${brDe(dt(v.vencimento))}.`,go:'vendas'}));
  vendas().filter(v=>v.status==='pedido').forEach(v=>{const falta=(v.itens||[]).filter(it=>{const x=ep[String(it.peca)];return !x||x.disp<num(it.qtd);});if(falta.length)out.push({tom:'warn',ico:'fa-triangle-exclamation',t:`Pedido nº ${v.numero}: falta peça pronta`,s:falta.map(it=>`${nomePeca(it.peca)} (pede ${nf(num(it.qtd),0)}, pronto ${nf(Math.max(0,(ep[String(it.peca)]||{}).disp||0),0)})`).join(' · '),go:'vendas'});});
  pecas().forEach(p=>{const x=ep[String(p.rowid)];if(num(p.minimo)>0&&(!x||x.livre<num(p.minimo)))out.push({tom:'info',ico:'fa-cubes',t:`${p.nome}: estoque livre abaixo do mínimo`,s:`Livre ${nf(x?x.livre:0,0)} · mínimo ${nf(num(p.minimo),0)}. Planeje uma ordem de produção.`,go:'planejamento'});});
  return out;
}
function telaPainel(){
  const k=PM.mes,r=resumoMes(k),ra=resumoMes(mesDesloc(k,-1)),c=CFG(),ep=estoquePecas(),ei=estoqueInsumos();
  const disp=Object.values(ep).reduce((s,x)=>s+Math.max(0,x.disp),0),cura=Object.values(ep).reduce((s,x)=>s+x.cura,0);
  const valEst=Object.entries(ep).reduce((s,[id,x])=>s+Math.max(0,x.disp)*x.custoUn,0);
  const aRec=vendas().filter(v=>v.status==='entregue'),aRecV=aRec.reduce((s,v)=>s+totalVenda(v),0),venc=aRec.filter(v=>dt(v.vencimento)&&dt(v.vencimento)<hoje0()).length;
  const faltas=faltaInsumo(ei,insumosUsados()).length,prev=rateio(c);
  const al=alertas();
  const top=Object.entries(r.porPeca).sort((a,b)=>b[1].v-a[1].v).slice(0,5);
  const sem=!pecas().length;
  return cabG('Pré-moldados — painel da fábrica','Produção, vendas e resultado da fábrica de peças, à parte das obras. Os números do mês escolhido.',GS.selMes(k,'data-pm-mes',12,0))+
    (sem?`<div class="gf-aviso warn" style="border-color:#FEDF89;background:#FFFAEB"><i class="fas fa-circle-info"></i><div><b>Comece pelo catálogo.</b> Cadastre as peças em <b>Peças e traços</b> (há modelos prontos: mourão, meio-fio, placa de muro, tampa, manilha, bloco…) e confira os preços dos insumos em <b>Parâmetros e preços</b>.<div style="margin-top:8px"><button type="button" class="gf-bt pri mini" data-pm="nova-peca"><i class="fas fa-plus"></i> Cadastrar a primeira peça</button></div></div></div>`:'')+
    `<div class="gf-kpis">
      ${kpiG('','fa-industry','Produção no mês',`${nf(r.pecasProd,0)} peças`,`${nf(r.m3,2)} m³ de concreto${r.refugo?` · refugo ${nf(r.refugo/(r.pecasProd+r.refugo)*100,1)}%`:''}`,GS.delta(r.m3,ra.m3))}
      ${kpiG('verde','fa-truck-ramp-box','Vendas entregues',R(r.receita),`${r.vend.length} venda(s) no mês`,GS.delta(r.receita,ra.receita))}
      ${kpiG(r.mc>=0?'verde':'vermelho','fa-scale-balanced','Margem de contribuição',R(r.mc),r.receita?`${nf(r.mc/r.receita*100,1)}% da venda (menos impostos e materiais)`:'sem vendas no mês')}
      ${kpiG(r.resultado>=0?'verde':'vermelho','fa-sack-dollar','Resultado do mês',R(r.resultado),`margem − custos da fábrica (${R(r.custos)})`)}
      ${kpiG('roxo','fa-cubes','Peças prontas',`${nf(disp,0)} peças`,`${nf(cura,0)} em cura · ${R(valEst)} a custo`)}
      ${kpiG(venc?'vermelho':'','fa-hand-holding-dollar','A receber',R(aRecV),`${aRec.length} entrega(s)${venc?` · <b>${venc} vencida(s)</b>`:''}`)}
      ${kpiG('laranja','fa-calculator','Custo por m³',r.custoM3!=null?R(r.custoM3):'—',`real do mês · previsto ${R(prev.total+custoMatM3())}`)}
      ${kpiG(faltas?'vermelho':'verde','fa-box-open','Insumos',faltas?`${faltas} abaixo do mínimo`:'em dia',faltas?'veja Estoque › Insumos':'nenhum insumo abaixo do mínimo')}
    </div>
    <div class="gf-duas">
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Precisa da sua atenção</h3><p>Estoque, prazos das ordens e recebimentos.</p></div></div>
        ${al.length?`<ul class="gf-alertas">${al.slice(0,10).map(a=>`<li class="gf-al ${a.tom}" data-pm="ir" data-aba="${a.go}"><span class="gf-al-ico"><i class="fas ${a.ico}"></i></span><div><b>${fe(a.t)}</b><span>${fe(a.s)}</span></div><i class="fas fa-chevron-right gf-al-seta"></i></li>`).join('')}</ul>`:'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Nada pedindo atenção: estoque em dia, ordens no prazo e recebimentos em dia.</p></div>'}</section>
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Produção × vendas</h3><p>Últimos 6 meses: concreto produzido (m³) e vendas entregues (R$).</p></div></div><div class="pm-chart"><canvas id="pm-graf"></canvas></div></section>
    </div>
    <div class="gf-duas">
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Mais vendidas no mês</h3><p>Por valor vendido.</p></div></div>
        ${top.length?`<table class="pm-tab" data-sem-ordem><thead><tr><th>Peça</th><th class="n">Quant.</th><th class="n">Valor</th></tr></thead><tbody>${top.map(([id,x])=>`<tr><td>${fe(nomePeca(id))}</td><td class="n">${nf(x.q,0)}</td><td class="n">${R(x.v)}</td></tr>`).join('')}</tbody></table>`:'<div class="gf-vazio"><i class="fas fa-chart-simple"></i><p>Sem vendas entregues neste mês.</p></div>'}</section>
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Resultado do mês</h3><p>${cap(mesNome(k))} — DRE simplificada da fábrica.</p></div></div>
        <table class="pm-tab" data-sem-ordem><tbody>
          <tr><td>Vendas entregues (receita bruta)</td><td class="n">${R(r.receita)}</td></tr>
          <tr><td>(−) Impostos sobre a venda (${nf(num(c.impostos),1)}%)</td><td class="n">${R(-r.impostos)}</td></tr>
          <tr><td>(−) Materiais das peças vendidas</td><td class="n">${R(-r.cpvMat)}</td></tr>
          <tr class="t"><td>= Margem de contribuição</td><td class="n">${R(r.mc)}</td></tr>
          <tr><td>(−) Custos da fábrica lançados no mês<small>mão de obra, energia, água, aluguel, manutenção…</small></td><td class="n">${R(-r.custos)}</td></tr>
          <tr class="t"><td>= Resultado</td><td class="n" style="color:${r.resultado>=0?'#067647':'#B42318'}">${R(r.resultado)}</td></tr>
        </tbody></table></section>
    </div>`;
}
// custo de materiais por m³ médio do catálogo (para comparar com o real do mês)
function custoMatM3(){const ps=pecas();if(!ps.length)return 0;const c=CFG();let v=0,s=0;ps.forEach(p=>{const x=calc(p,1,c);if(x.V>0){v+=x.V;s+=x.custo.mat;}});return v>0?s/v:0;}
function desenharGrafico(){
  const cv=document.getElementById('pm-graf');if(!cv||typeof Chart==='undefined')return;
  const ks=[];for(let i=5;i>=0;i--)ks.push(mesDesloc(PM.mes,-i));
  const rs=ks.map(k=>resumoMes(k));
  try{grafico=new Chart(cv.getContext('2d'),{type:'bar',data:{labels:ks.map(mesCurto),datasets:[
      {type:'bar',label:'Produção (m³)',data:rs.map(r=>r2(r.m3)),backgroundColor:'rgba(22,82,216,.75)',borderRadius:6,yAxisID:'y'},
      {type:'line',label:'Vendas (R$)',data:rs.map(r=>r2(r.receita)),borderColor:'#12B76A',backgroundColor:'#12B76A',tension:.3,yAxisID:'y1'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,title:{display:true,text:'m³'}},y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v>=10000?'R$ '+fmtN(v/1000,0)+' mil':'R$ '+fmtN(v,0)}}}}});}catch(e){console.error(e);}
}

/* ═══════════════ PEÇAS E TRAÇOS ═══════════════ */
function telaPecas(){
  const ep=estoquePecas(),q=String(PM.busca||'').toLowerCase(),c=CFG();
  const L=pecas().filter(p=>(!PM.cat||p.categoria===PM.cat)&&(!q||[p.nome,p.codigo,p.categoria].join(' ').toLowerCase().includes(q)));
  const cartao=p=>{const x=calc(p,1,c),e=ep[String(p.rowid)]||{},mg=x.margem;
    return `<article class="pm-card" style="--cor:${mg==null?'#98A2B3':mg<0?'#D92D20':mg<10?'#F79009':'#12B76A'}" data-pm="peca" data-id="${p.rowid}">
      <div class="vk-top"><div><span class="pm-cod">${fe(p.codigo||'')}</span><h4>${fe(p.nome)}</h4></div>${pill(fe(p.categoria||'Outros'),'')}</div>
      <div class="pm-dim">${fe(x.g.desc)} · ${nf(x.V,4)} m³ · ${nf(x.peso,1)} kg</div>
      <div class="pm-nums"><div><small>Custo</small><b>${R(x.un)}</b></div>${x.preco?`<div><small>Preço</small><b>${R(x.preco)}</b></div><div><small>Margem</small><b>${nf(mg,1)}%</b></div>`
        :`<div><small>Sugerido</small><b style="color:#1652D8">${R(x.sug)}</b></div><div><small>Margem</small><b style="color:#98A2B3">sem preço</b></div>`}</div>
      <div class="vk-sub" style="margin:8px 0 0">${pill(`${nf(Math.max(0,e.disp||0),0)} prontas`,'ok','fa-check')}${e.cura?pill(`${nf(e.cura,0)} em cura`,'info','fa-hourglass-half'):''}${e.res?pill(`${nf(e.res,0)} reservadas`,'warn','fa-bookmark'):''}</div>
    </article>`;};
  const trs=tracos();
  return cabG('Peças e traços','Cadastre a peça pelas dimensões: o sistema calcula o volume, o peso, os materiais (cimento, areia, pó de pedra, brita, aço, malha) e o custo com mão de obra, betoneira, energia e água rateados.',
      `<button type="button" class="gf-bt pri" data-pm="nova-peca"><i class="fas fa-plus"></i> Nova peça</button>`)+
    `<div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar peça (nome, código)…" value="${fe(PM.busca)}" style="min-width:240px">
      <select data-pm-cat><option value="">Todas as categorias</option>${CATS.map(x=>`<option ${x===PM.cat?'selected':''}>${x}</option>`).join('')}</select>
      <span class="pm-mini">${L.length} peça(s)</span></div>
    ${L.length?`<div class="pm-grid">${L.map(cartao).join('')}</div>`:`<div class="gf-sec"><div class="gf-vazio"><i class="fas fa-cubes"></i><p>${pecas().length?'Nenhuma peça neste filtro.':'Nenhuma peça cadastrada ainda. Use um modelo pronto ou informe as dimensões.'}</p><button type="button" class="gf-bt pri" data-pm="nova-peca"><i class="fas fa-plus"></i> Nova peça</button></div></div>`}
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Traços de concreto</h3><p>Proporções em massa (cimento = 1) e fator água/cimento. O consumo por m³ sai pelas massas específicas (Parâmetros). Os traços padrão podem ser copiados e ajustados.</p></div>
      <button type="button" class="gf-bt mini" data-pm="traco-novo"><i class="fas fa-plus"></i> Novo traço</button></div>
      <div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Traço</th><th>Proporção (cimento : areia : pó : brita)</th><th class="n">a/c</th><th class="n">Cimento/m³</th><th class="n">Custo materiais/m³</th><th>Uso</th></tr></thead><tbody>
      ${trs.map(t=>{const k=traco1m3(t,c),cm=k.cimento/50*num(c.precos.cimento)+k.areia/(num(c.unit.areia)*1000)*num(c.precos.areia)+k.po/(num(c.unit.po)*1000)*num(c.precos.po)+k.brita/(num(c.unit.brita)*1000)*num(c.precos.brita)+k.agua/1000*num(c.precos.agua)+k.aditivo*num(c.precos.aditivo);
        return `<tr class="pm-lin" data-pm="traco" data-id="${t.id}"><td><b>${fe(t.nome)}</b>${t.padrao?'<small>padrão do sistema</small>':''}</td><td>1 : ${nf(t.ar,2)} : ${nf(t.po,2)} : ${nf(t.br,2)}${t.ad?` <small>aditivo ${nf(t.ad,2)}% do cimento</small>`:''}</td><td class="n">${nf(t.ac,2)}</td><td class="n">${nf(k.cimento,0)} kg<small>${nf(k.cimento/50,2)} sacos</small></td><td class="n">${R(cm)}</td><td>${fe(t.uso||'')}</td></tr>`;}).join('')}
      </tbody></table></div></section>`;
}
function fichaPeca(p){
  if(!p)return;const x=calc(p,1),e=estoquePecas()[String(p.rowid)]||{};
  const j=janela(`${p.codigo?p.codigo+' · ':''}${p.nome}`,`<div class="fin-resumo">${fe(p.categoria||'')} · ${fe(FORMAS[p.forma]?FORMAS[p.forma].rot:'')} · ${fe(x.g.desc)} · traço: <b>${fe(x.t.nome)}</b> · cura ${nf(num(p.cura||7),0)} dias</div>
    <div class="pm-nums" style="grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0"><div><small>Prontas</small><b>${nf(Math.max(0,e.disp||0),0)}</b></div><div><small>Em cura</small><b>${nf(e.cura||0,0)}</b></div><div><small>Reservadas</small><b>${nf(e.res||0,0)}</b></div><div><small>Vendidas</small><b>${nf(e.vend||0,0)}</b></div></div>
    ${resumoHtml(p,1)}`,
    [{html:'<i class="fas fa-print"></i> Ficha técnica (PDF)',acao:async()=>{imprimirFicha(p);return false;}},
     {html:'<i class="fas fa-copy"></i> Duplicar',acao:async()=>{setTimeout(()=>formPeca(p,true),60);}},
     {html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(p,p.nome),60);}},
     {html:'<i class="fas fa-clipboard-list"></i> Planejar produção',acao:async()=>{setTimeout(()=>formOrdem(null,{peca:p.rowid}),60);}},
     {html:'<i class="fas fa-pen"></i> Editar',cls:'pri',acao:async()=>{setTimeout(()=>formPeca(p),60);}}],760);
  return j;
}
// resumo de materiais e custos (usado na ficha e no cadastro)
function resumoHtml(p,n){
  const x=calc(p,n),c=CFG(),un=n>1?` (${nf(n,0)} peças)`:'';
  const linhaIns=k=>{const q=x.est[k];if(!q)return '';const i=insDe(k);let det='';
    if(k==='cimento')det=`${nf(x.kg.cimento,1)} kg`;else if(k==='areia'||k==='po'||k==='brita')det=`${nf(x.kg[k],1)} kg`;
    else if(k==='aco50'||k==='aco60')det=Object.values(x.porBitola).filter(b=>(k==='aco60')===ehCA60(b.d)).map(b=>`Ø ${nf(b.d,1)}: ${nf(b.m,2)} m · ${nf(b.kg,2)} kg · ${b.barras} barra(s) de 12 m`).join('<br>');
    else if(k==='malha')det=`${nf(x.malhaM2,2)} m²`;
    return `<tr><td>${fe(i.nome)}<small>${det}</small></td><td class="n">${nf(q,q<1?3:2)} ${i.un}</td><td class="n">${R(x.custoMat[k])}</td></tr>`;};
  return `<div data-sem-ordem><div class="pm-big"><span>Volume${un}</span><b>${nf(x.Vt,4)} m³</b><span>peso ${nf(x.peso*x.n,1)} kg</span></div>
    <h5>Materiais${un}</h5>
    <table><thead><tr><th>Insumo</th><th class="n">Quant.</th><th class="n">Custo</th></tr></thead><tbody>
      ${INS.map(i=>linhaIns(i.k)).join('')}
      <tr><td>Água do traço<small>${nf(x.aguaL,1)} litros</small></td><td class="n">${nf(x.aguaL/1000,3)} m³</td><td class="n">${R(x.custoMat.agua)}</td></tr>
      <tr class="t"><td>Materiais</td><td></td><td class="n">${R(x.custo.mat)}</td></tr></tbody></table>
    <h5 style="margin-top:10px">Custo${un}</h5>
    <table><tbody>
      <tr><td>Materiais</td><td class="n">${R(x.custo.mat)}</td></tr>
      <tr><td>Mão de obra <small>rateio: ${R(rateio(c).mao)}/m³</small></td><td class="n">${R(x.custo.mao)}</td></tr>
      <tr><td>Betoneira (depreciação + manutenção)</td><td class="n">${R(x.custo.betoneira)}</td></tr>
      <tr><td>Energia <small>${nf(x.kwh,2)} kWh</small></td><td class="n">${R(x.custo.energia)}</td></tr>
      <tr><td>Água de cura</td><td class="n">${R(x.custo.agua)}</td></tr>
      <tr><td>Custos fixos rateados</td><td class="n">${R(x.custo.fixos)}</td></tr>
      <tr class="t"><td>Custo total${un}</td><td class="n">${R(x.custo.total)}</td></tr>
      <tr><td><b>Custo por peça</b></td><td class="n"><b>${R(x.un)}</b></td></tr>
      <tr><td>Preço sugerido <small>margem ${nf(num(c.margem),0)}% + impostos ${nf(num(c.impostos),1)}%</small></td><td class="n">${R(x.sug)}</td></tr>
      ${x.preco?`<tr><td>Preço de venda praticado</td><td class="n">${R(x.preco)}</td></tr><tr><td>Margem sobre o preço</td><td class="n" style="color:${x.margem<0?'#B42318':x.margem<10?'#B54708':'#067647'}"><b>${nf(x.margem,1)}%</b></td></tr>`:''}
    </tbody></table></div>`;
}
function imprimirFicha(p){
  const x=calc(p,1),c=CFG(),ins=INS.filter(i=>x.est[i.k]);
  App._relExportPaginado({titulo:`Ficha técnica — ${p.nome}`,subLinhas:[`${p.codigo||''} · ${p.categoria||''} · ${x.g.desc} · ${nf(x.V,4)} m³ · ${nf(x.peso,1)} kg`,`Traço: ${x.t.nome} (1 : ${nf(x.t.ar,2)} : ${nf(x.t.po,2)} : ${nf(x.t.br,2)}, a/c ${nf(x.t.ac,2)}) · cura ${nf(num(p.cura||7),0)} dias`],
    theadHtml:'<tr><th>Item</th><th style="text-align:right">Quantidade por peça</th><th style="text-align:right">Custo</th></tr>',
    rowsArr:ins.map(i=>`<tr><td>${fe(i.nome)}</td><td style="text-align:right">${nf(x.est[i.k],3)} ${i.un}</td><td style="text-align:right">${R(x.custoMat[i.k])}</td></tr>`)
      .concat([`<tr><td>Água do traço</td><td style="text-align:right">${nf(x.aguaL,1)} L</td><td style="text-align:right">${R(x.custoMat.agua)}</td></tr>`,
        ...Object.values(x.porBitola).map(b=>`<tr><td>Aço Ø ${nf(b.d,1)} mm (${ehCA60(b.d)?'CA-60':'CA-50'})</td><td style="text-align:right">${nf(b.m,2)} m · ${nf(b.kg,3)} kg</td><td></td></tr>`),
        `<tr><td><b>Materiais</b></td><td></td><td style="text-align:right"><b>${R(x.custo.mat)}</b></td></tr>`,
        `<tr><td>Mão de obra, betoneira, energia, água de cura e fixos (rateio por m³)</td><td></td><td style="text-align:right">${R(x.custo.total-x.custo.mat)}</td></tr>`,
        `<tr><td><b>Custo por peça</b></td><td></td><td style="text-align:right"><b>${R(x.un)}</b></td></tr>`,
        `<tr><td>Preço sugerido (margem ${nf(num(c.margem),0)}%, impostos ${nf(num(c.impostos),1)}%)</td><td></td><td style="text-align:right">${R(x.sug)}</td></tr>`])});
}
function formPeca(reg,copia){
  const novo=!reg||copia,base=reg?JSON.parse(JSON.stringify(reg)):{forma:'retangular',dims:{},traco:'p:estrutural',barras:[],malha:{usa:false,camadas:1,area:''},cura:7,categoria:CATS[0],unidade:'un'};
  if(copia){delete base.rowid;base.nome=(base.nome||'')+' (cópia)';}
  if(novo)base.codigo=proxCodigo();
  const optTr=sel=>tracos().map(t=>`<option value="${t.id}" ${t.id===String(sel)?'selected':''}>${fe(t.nome)}</option>`).join('');
  const dimsHtml=(f,d)=>(FORMAS[f]||FORMAS.retangular).campos.map(([k,l])=>`<div class="fin-fld"><label>${l}</label><input data-dim="${k}" inputmode="decimal" value="${d&&d[k]!=null&&d[k]!==''?fe(String(d[k]).replace('.',',')):''}" placeholder="0"></div>`).join('');
  const barraLin=b=>`<tr data-barra><td><select data-b="t"><option value="b" ${b.t!=='e'?'selected':''}>Barra longitudinal</option><option value="e" ${b.t==='e'?'selected':''}>Estribo</option></select></td>
    <td><select data-b="d">${BITOLAS.map(d=>`<option value="${d}" ${+b.d===d?'selected':''}>Ø ${nf(d,1)} mm ${d<6.3?'(CA-60)':'(CA-50)'}</option>`).join('')}</select></td>
    <td><input data-b="q" inputmode="decimal" value="${b.q!=null?fe(String(b.q)):''}" placeholder="0"></td><td><input data-b="l" inputmode="decimal" value="${b.l!=null?fe(String(b.l).replace('.',',')):''}" placeholder="0"></td>
    <td><button type="button" class="pm-x" data-pmf="barra-x" title="Tirar"><i class="fas fa-xmark"></i></button></td></tr>`;
  const html=`<div class="pm-form"><div>
    ${novo?`<div class="pm-bloco"><h5><i class="fas fa-wand-magic-sparkles"></i> Começar de um modelo pronto (opcional)</h5><div class="fin-fld"><select data-pmf="modelo"><option value="">— escolha um modelo para preencher tudo —</option>${MODELOS.map(m=>`<option value="${m.k}">${fe(m.nome)}</option>`).join('')}</select></div></div>`:''}
    <div class="pm-bloco"><h5><i class="fas fa-tag"></i> Identificação</h5><div class="fin-linha">
      <div class="fin-fld"><label>Código</label><input data-k="codigo" value="${fe(base.codigo||'')}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Nome da peça <span class="obg">*</span></label><input data-k="nome" value="${fe(base.nome||'')}" placeholder="Ex.: Mourão 10 × 10 × 2,20 m"></div>
      <div class="fin-fld"><label>Categoria</label><select data-k="categoria">${CATS.map(x=>`<option ${x===base.categoria?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Preço de venda (R$)</label><input data-k="preco" value="${base.preco?fe(String(base.preco)):''}" placeholder="vazio = usar o sugerido"></div>
      <div class="fin-fld"><label>Dias de cura até liberar</label><input data-k="cura" inputmode="numeric" value="${fe(String(base.cura!=null?base.cura:7))}"></div>
      <div class="fin-fld"><label>Estoque mínimo (peças)</label><input data-k="minimo" inputmode="numeric" value="${fe(String(base.minimo||''))}" placeholder="0"></div>
    </div></div>
    <div class="pm-bloco"><h5><i class="fas fa-ruler-combined"></i> Dimensões</h5>
      <div class="fin-fld"><label>Forma da peça</label><select data-k="forma">${Object.entries(FORMAS).map(([k,f])=>`<option value="${k}" ${k===base.forma?'selected':''}>${f.rot}</option>`).join('')}</select></div>
      <div class="fin-linha" data-dims style="margin-top:10px">${dimsHtml(base.forma,base.dims)}</div></div>
    <div class="pm-bloco"><h5><i class="fas fa-fill-drip"></i> Concreto</h5><div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Traço</label><select data-k="traco">${optTr(base.traco)}</select></div>
      <div class="fin-fld"><label>Perda de concreto (%)</label><input data-k="perda" value="${base.perda!=null&&base.perda!==''?fe(String(base.perda)):''}" placeholder="padrão ${nf(num(CFG().perdas.concreto),0)}%"></div></div></div>
    <div class="pm-bloco"><h5><i class="fas fa-grip-lines"></i> Armadura — vergalhões e estribos</h5>
      <div class="pm-rolar"><table class="pm-arm" style="width:100%"><thead><tr><th>Tipo</th><th>Bitola</th><th>Quantidade por peça</th><th>Comprimento de cada (cm)</th><th></th></tr></thead><tbody data-barras>${(base.barras||[]).map(barraLin).join('')}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="barra-add" style="margin-top:6px"><i class="fas fa-plus"></i> Barra ou estribo</button>
      <p class="pm-mini" style="margin:8px 0 0">Estribo: informe o comprimento total de cada um (perímetro + ganchos). Peça sem aço: deixe vazio.</p></div>
    <div class="pm-bloco"><h5><i class="fas fa-border-all"></i> Malha POP (tela soldada)</h5><div class="fin-linha">
      <label class="nfc-amb" style="grid-column:1/-1"><input type="checkbox" data-k="malha_usa" ${base.malha&&base.malha.usa?'checked':''}><span>Esta peça leva malha POP</span></label>
      <div class="fin-fld"><label>Camadas</label><input data-k="malha_camadas" inputmode="numeric" value="${fe(String((base.malha&&base.malha.camadas)||1))}"></div>
      <div class="fin-fld"><label>Área de malha por peça (m²)</label><input data-k="malha_area" inputmode="decimal" value="${base.malha&&base.malha.area?fe(String(base.malha.area).replace('.',',')):''}" placeholder="vazio = calcula pela peça"></div></div></div>
    <div class="fin-fld"><label>Observações</label><textarea data-k="obs" rows="2">${fe(base.obs||'')}</textarea></div>
  </div>
  <div class="pm-res"><div class="fin-fld" style="margin-bottom:8px"><label>Calcular para quantas peças?</label><input data-pmf="lote" inputmode="numeric" value="1"></div><div data-pm-res></div></div></div>`;
  const j=janela(novo?'Nova peça':'Editar peça',html,[{html:`<i class="fas fa-floppy-disk"></i> ${novo?'Cadastrar peça':'Salvar'}`,cls:'pri',acao:async jj=>{
    if(!novo&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
    const o=lerPeca(jj,novo?{tipo:'peca',data_lancamento:todayDateTime()}:{...reg});
    if(!o.nome)throw new Error('Informe o nome da peça.');
    if(!(geo(o).V>0))throw new Error('Informe as dimensões: o volume da peça está zerado.');
    if(o.codigo&&T('peca').some(x=>x.codigo===o.codigo&&String(x.rowid)!==String(novo?'':reg.rowid)))throw new Error(`Já existe uma peça com o código ${o.codigo}.`);
    await gravar(o,novo?null:reg.rowid);toast(novo?'Peça cadastrada.':'Peça salva.','success');}}],1080);
  const corpo=j.querySelector('.fin-jan-corpo');
  const atualizar=()=>{const o=lerPeca(j,{}),n=Math.max(1,num((j.querySelector('[data-pmf="lote"]')||{}).value)||1),box=j.querySelector('[data-pm-res]');if(box)box.innerHTML=geo(o).V>0?resumoHtml(o,n):'<div class="gf-vazio"><i class="fas fa-ruler-combined"></i><p>Informe as dimensões para ver os materiais e o custo.</p></div>';};
  corpo.addEventListener('input',()=>{clearTimeout(j._pmT);j._pmT=setTimeout(atualizar,120);});
  corpo.addEventListener('change',ev=>{const t=ev.target;
    if(t.matches('[data-k="forma"]')){j.querySelector('[data-dims]').innerHTML=dimsHtml(t.value,{});}
    if(t.matches('[data-pmf="modelo"]')&&t.value){const m=MODELOS.find(x=>x.k===t.value);if(m){
      const set=(k,v)=>{const e=j.querySelector(`[data-k="${k}"]`);if(e){if(e.type==='checkbox')e.checked=!!v;else e.value=v;}};
      set('nome',m.nome);set('categoria',m.categoria);set('forma',m.forma);set('traco',m.traco);set('cura',m.cura||7);
      j.querySelector('[data-dims]').innerHTML=dimsHtml(m.forma,m.dims);
      j.querySelector('[data-barras]').innerHTML=(m.barras||[]).map(barraLin).join('');
      set('malha_usa',m.malha&&m.malha.usa);set('malha_camadas',(m.malha&&m.malha.camadas)||1);set('malha_area','');}}
    atualizar();});
  corpo.addEventListener('click',ev=>{const b=ev.target.closest('[data-pmf]');if(!b)return;
    if(b.dataset.pmf==='barra-add'){j.querySelector('[data-barras]').insertAdjacentHTML('beforeend',barraLin({t:'b',d:6.3,q:'',l:''}));}
    else if(b.dataset.pmf==='barra-x'){b.closest('tr').remove();atualizar();}});
  atualizar();
  return j;
}
function lerPeca(j,o){
  const v=k=>{const e=j.querySelector(`[data-k="${k}"]`);return e?(e.type==='checkbox'?e.checked:String(e.value||'').trim()):'';};
  o.codigo=v('codigo');o.nome=v('nome');o.categoria=v('categoria');o.forma=v('forma')||'retangular';o.traco=v('traco')||'p:estrutural';
  o.preco=v('preco')?r2(num(v('preco'))):'';o.cura=v('cura')!==''?num(v('cura')):7;o.minimo=v('minimo')?num(v('minimo')):'';o.perda=v('perda')!==''?num(v('perda')):'';o.obs=v('obs');o.unidade=o.unidade||'un';
  o.dims={};j.querySelectorAll('[data-dim]').forEach(e=>{if(String(e.value).trim()!=='')o.dims[e.dataset.dim]=num(e.value);});
  o.barras=[...j.querySelectorAll('[data-barra]')].map(tr=>{const g=k=>tr.querySelector(`[data-b="${k}"]`).value;return {t:g('t'),d:+g('d'),q:num(g('q')),l:num(g('l'))};}).filter(b=>b.q>0&&b.l>0);
  o.malha={usa:!!v('malha_usa'),camadas:Math.max(1,num(v('malha_camadas'))||1),area:v('malha_area')?num(v('malha_area')):''};
  return o;
}
function formTraco(t){
  const padrao=t&&t.padrao,reg=t&&t.reg,c=CFG();
  const b=t||{nome:'',ar:2,po:0,br:3,ac:0.55,ad:0,uso:''};
  const fld=(k,l,ph)=>`<div class="fin-fld"><label>${l}</label><input data-k="${k}" inputmode="decimal" value="${fe(String(b[k]!=null?b[k]:'').replace('.',','))}" placeholder="${ph||'0'}" ${padrao?'readonly':''}></div>`;
  const prev=jj=>{const x={ar:num(jj.querySelector('[data-k="ar"]').value),po:num(jj.querySelector('[data-k="po"]').value),br:num(jj.querySelector('[data-k="br"]').value),ac:num(jj.querySelector('[data-k="ac"]').value),ad:num(jj.querySelector('[data-k="ad"]').value)},k=traco1m3(x,c);
    return `Por m³ de concreto: <b>${nf(k.cimento,0)} kg de cimento</b> (${nf(k.cimento/50,2)} sacos)${x.ar?` · areia ${nf(k.areia,0)} kg`:''}${x.po?` · pó de pedra ${nf(k.po,0)} kg`:''}${x.br?` · brita ${nf(k.brita,0)} kg`:''} · água ${nf(k.agua,0)} L${x.ad?` · aditivo ${nf(k.aditivo,2)} kg`:''}.`;};
  const j=janela(padrao?`Traço padrão — ${b.nome}`:reg?'Editar traço':'Novo traço',`${padrao?'<div class="fin-aviso"><div>Traço padrão do sistema: para usar outra proporção, clique em <b>Copiar e ajustar</b>.</div></div>':''}
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld" style="grid-column:1/-1"><label>Nome <span class="obg">*</span></label><input data-k="nome" value="${fe(b.nome||'')}" ${padrao?'readonly':''}></div>
    ${fld('ar','Areia (partes por 1 de cimento)')}${fld('po','Pó de pedra (partes)')}${fld('br','Brita 0 / pedrisco (partes)')}${fld('ac','Fator água/cimento','0,55')}${fld('ad','Aditivo (% do cimento)')}
    <div class="fin-fld" style="grid-column:1/-1"><label>Uso indicado</label><input data-k="uso" value="${fe(b.uso||'')}" ${padrao?'readonly':''}></div></div>
    <div class="fin-aviso" style="margin-top:10px"><div data-tr-prev></div></div>`,
    padrao?[{html:'<i class="fas fa-copy"></i> Copiar e ajustar',cls:'pri',acao:async()=>{setTimeout(()=>formTraco({...b,id:'',padrao:false,nome:b.nome+' (ajustado)'}),60);}}]
    :[...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{const usa=T('peca').filter(p=>String(p.traco)===String(reg.rowid));if(usa.length)throw new Error(`${usa.length} peça(s) usam este traço: troque o traço delas antes.`);setTimeout(()=>apagarReg(reg,reg.nome),60);}}]:[]),
      {html:'<i class="fas fa-floppy-disk"></i> Salvar traço',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),o=reg?{...reg}:{tipo:'traco',data_lancamento:todayDateTime()};
      o.nome=g('nome');if(!o.nome)throw new Error('Dê um nome ao traço.');['ar','po','br','ac','ad'].forEach(k=>o[k]=num(g(k)));o.uso=g('uso');
      if(!(o.ac>0))throw new Error('Informe o fator água/cimento (ex.: 0,55).');
      await gravar(o,reg?reg.rowid:null);toast('Traço salvo.','success');}}],620);
  const at=()=>{const e=j.querySelector('[data-tr-prev]');if(e)e.innerHTML=prev(j);};
  j.querySelector('.fin-jan-corpo').addEventListener('input',at);at();
}

/* ═══════════════ PLANEJAMENTO (ordens de produção) ═══════════════ */
const COLS_OP=[{k:'planejada',rot:'Planejadas',cor:'#7F56D9',ico:'fa-clipboard-list'},{k:'producao',rot:'Em produção',cor:'#1652D8',ico:'fa-industry'},{k:'concluida',rot:'Concluídas',cor:'#067647',ico:'fa-circle-check'}];
function necessidade(){
  // o que falta produzir nas ordens abertas → materiais × estoque dos insumos
  const c=CFG(),abertas=ordens().filter(o=>o.status==='planejada'||o.status==='producao'),ei=estoqueInsumos(),tot={};let m3=0;
  abertas.forEach(o=>{const p=pecaDe(o.peca);if(!p)return;const falta=Math.max(0,num(o.qtd)-prodDaOrdem(o.rowid));if(!falta)return;const x=calc(p,falta,c);m3+=x.Vt;Object.entries(x.est).forEach(([k,q])=>tot[k]=(tot[k]||0)+q);});
  const lin=INS.filter(i=>tot[i.k]).map(i=>{const pr=ei[i.k].preco,comprar=Math.max(0,tot[i.k]-Math.max(0,ei[i.k].saldo));return {i,prec:tot[i.k],saldo:ei[i.k].saldo,comprar,custo:comprar*pr};});
  const cap=num(c.prod_m3)/22;return {abertas,lin,m3,diasProd:cap>0?Math.ceil(m3/cap):null,custo:lin.reduce((s,x)=>s+x.custo,0)};
}
function telaPlanejamento(){
  const h=hoje0(),L=ordens().filter(o=>o.status!=='cancelada');
  const card=o=>{const p=pecaDe(o.peca),feito=prodDaOrdem(o.rowid),tot=num(o.qtd),pc=tot?Math.min(100,feito/tot*100):0,fim=dt(o.fim),atras=o.status!=='concluida'&&fim&&fim<h;
    return `<article class="vk-card" style="--cor:${COLS_OP.find(c=>c.k===o.status)?.cor||'#7F56D9'}" data-pm="ordem" data-id="${o.rowid}" draggable="true" data-card="${o.rowid}">
      <div class="vk-top"><b>OP nº ${fe(String(o.numero||''))}</b>${atras?pill('atrasada','err','fa-clock'):fim?pill('até '+brDe(fim).slice(0,5),'info'):''}</div>
      <div class="vk-obra"><i class="fas fa-cube"></i>${fe(p?p.nome:'(peça excluída)')}</div>
      ${o.cliente?`<div class="vk-sub">para ${fe(o.cliente)}</div>`:''}
      <div class="vk-val"><span>${nf(feito,0)} de ${nf(tot,0)} peças</span><b>${nf(pc,0)}%</b></div><div class="pm-barra ${pc>=100?'ok':''}"><i style="width:${pc}%"></i></div></article>`;};
  const cols=COLS_OP.map(c=>{const itens=L.filter(o=>(o.status||'planejada')===c.k).sort((a,b)=>String(a.fim||'9').localeCompare(String(b.fim||'9')));return {c,itens,sub:`${itens.length} ordem(ns) · ${nf(itens.reduce((s,o)=>s+num(o.qtd),0),0)} peças`};});
  const nec=necessidade();
  setTimeout(()=>{const w=document.querySelector('#pm-app .vk-quadro');if(w&&!w._lig){w._lig=1;GS.ligarArraste(w,moverOrdem);}},0);
  return cabG('Planejamento da produção','Ordens de produção (OP): o que fazer, quanto e até quando. Arraste o cartão para mudar a fase. A produção registrada no diário avança a ordem.',
      `<button type="button" class="gf-bt pri" data-pm="ordem-nova"><i class="fas fa-plus"></i> Nova ordem de produção</button>`)+
    GS.colunasHtml(cols,card,{planejada:'Nenhuma ordem planejada',producao:'Nenhuma ordem em produção',concluida:'Ordens concluídas aparecem aqui'})+
    `<section class="gf-sec"><div class="gf-sec-cab"><div><h3>Materiais para as ordens abertas</h3><p>O que falta produzir (${nf(nec.m3,2)} m³ de concreto${nec.diasProd!=null?`, cerca de ${nec.diasProd} dia(s) de produção no ritmo previsto`:''}) comparado com o estoque dos insumos.</p></div>
      ${nec.lin.length?'<button type="button" class="gf-bt mini" data-pm="compras-pdf"><i class="fas fa-print"></i> Lista de compras (PDF)</button>':''}</div>
      ${nec.lin.length?`<div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Insumo</th><th class="n">Precisa</th><th class="n">Em estoque</th><th class="n">Comprar</th><th class="n">Custo estimado</th></tr></thead><tbody>
        ${nec.lin.map(x=>`<tr><td>${fe(x.i.nome)}</td><td class="n">${nf(x.prec,2)} ${x.i.un}</td><td class="n">${nf(x.saldo,2)} ${x.i.un}</td><td class="n" style="${x.comprar>0?'color:#B42318;font-weight:800':''}">${x.comprar>0?nf(x.comprar,2)+' '+x.i.un:'—'}</td><td class="n">${x.comprar>0?R(x.custo):'—'}</td></tr>`).join('')}
        <tr class="t"><td colspan="4">Total a comprar</td><td class="n">${R(nec.custo)}</td></tr></tbody></table></div>`:'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Nenhuma ordem aberta pedindo material.</p></div>'}</section>`;
}
async function moverOrdem(id,col){
  const o=ordens().find(x=>String(x.rowid)===String(id));if(!o||!col||o.status===col)return;
  try{await gravar({...o,status:col,...(col==='producao'&&!o.inicio?{inicio:hojeISO()}:{}),...(col==='concluida'?{concluida_em:hojeISO()}:{})},o.rowid);toast(`OP nº ${o.numero}: ${COLS_OP.find(c=>c.k===col).rot.toLowerCase()}.`,'success');}catch(e){toast(e.message,'error');}
}
function imprimirNecessidade(){
  const nec=necessidade();
  App._relExportPaginado({titulo:'Lista de compras — ordens de produção abertas',subLinhas:[`${nec.abertas.length} ordem(ns) aberta(s) · ${nf(nec.m3,2)} m³ de concreto a produzir`],
    theadHtml:'<tr><th>Insumo</th><th style="text-align:right">Precisa</th><th style="text-align:right">Em estoque</th><th style="text-align:right">Comprar</th><th style="text-align:right">Custo estimado</th></tr>',
    rowsArr:nec.lin.map(x=>`<tr><td>${fe(x.i.nome)}</td><td style="text-align:right">${nf(x.prec,2)} ${x.i.un}</td><td style="text-align:right">${nf(x.saldo,2)} ${x.i.un}</td><td style="text-align:right">${x.comprar>0?nf(x.comprar,2)+' '+x.i.un:'—'}</td><td style="text-align:right">${x.comprar>0?R(x.custo):'—'}</td></tr>`),
    posHtml:`<p style="text-align:right;font-weight:800">Total a comprar: ${R(nec.custo)}</p>`});
}
function formOrdem(reg,pre){
  pre=pre||{};const b=reg||{status:'planejada',inicio:hojeISO(),peca:pre.peca||'',qtd:pre.qtd||''};
  if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e traços).','error');
  const feito=reg?prodDaOrdem(reg.rowid):0;
  const j=janela(reg?`OP nº ${reg.numero}`:'Nova ordem de produção',`<div class="fin-linha">
      <div class="fin-fld" style="grid-column:1/-1"><label>Peça <span class="obg">*</span></label><select data-k="peca">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(b.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade (peças) <span class="obg">*</span></label><input data-k="qtd" inputmode="numeric" value="${fe(String(b.qtd||''))}"></div>
      <div class="fin-fld"><label>Situação</label><select data-k="status">${COLS_OP.concat([{k:'cancelada',rot:'Cancelada'}]).map(c=>`<option value="${c.k}" ${c.k===b.status?'selected':''}>${c.rot.replace(/s$/,'')}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Início</label><input type="date" data-k="inicio" value="${fe(b.inicio||'')}"></div>
      <div class="fin-fld"><label>Prazo (terminar até)</label><input type="date" data-k="fim" value="${fe(b.fim||'')}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Para (cliente ou pedido — opcional)</label><input data-k="cliente" value="${fe(b.cliente||'')}" placeholder="Ex.: estoque, ou Pedido nº 12 — João"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Observações</label><textarea data-k="obs" rows="2">${fe(b.obs||'')}</textarea></div></div>
      ${reg?`<div class="fin-aviso" style="margin-top:8px"><div>Produzido nesta ordem: <b>${nf(feito,0)} de ${nf(num(reg.qtd),0)}</b> peças.</div></div>`:''}
      <div class="fin-aviso" style="margin-top:8px"><div data-op-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`OP nº ${reg.numero}`),60);}},
      {html:'<i class="fas fa-industry"></i> Registrar produção',acao:async()=>{setTimeout(()=>formProducao(null,{peca:reg.peca,ordem:reg.rowid}),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),o=reg?{...reg}:{tipo:'ordem',numero:proxNum('ordem','numero'),data_lancamento:todayDateTime()};
      o.peca=g('peca');o.qtd=num(g('qtd'));o.status=g('status');o.inicio=g('inicio');o.fim=g('fim');o.cliente=g('cliente');o.obs=g('obs');
      if(!(o.qtd>0))throw new Error('Informe a quantidade de peças.');if(o.fim&&o.inicio&&o.fim<o.inicio)throw new Error('O prazo não pode ser antes do início.');
      await gravar(o,reg?reg.rowid:null);toast(reg?'Ordem salva.':`Ordem de produção nº ${o.numero} criada.`,'success');}}],620);
  const at=()=>{const p=pecaDe(j.querySelector('[data-k="peca"]').value),q=num(j.querySelector('[data-k="qtd"]').value),e=j.querySelector('[data-op-prev]');if(!e)return;
    if(!p||!q){e.innerHTML='Escolha a peça e a quantidade para ver o material necessário.';return;}const x=calc(p,q);
    e.innerHTML=`Para <b>${nf(q,0)} peças</b>: ${nf(x.Vt,2)} m³ de concreto · ${INS.filter(i=>x.est[i.k]).map(i=>`${insDe(i.k).nome.split(' (')[0].toLowerCase()} ${nf(x.est[i.k],2)} ${i.un}`).join(' · ')} · custo estimado <b>${R(x.custo.total)}</b>.`;};
  j.querySelector('.fin-jan-corpo').addEventListener('input',at);j.querySelector('.fin-jan-corpo').addEventListener('change',at);at();
}

/* ═══════════════ DIÁRIO DE PRODUÇÃO ═══════════════ */
function telaProducao(){
  const k=PM.mes,L=T('producao').filter(r=>{const d=dt(r.data);return d&&mesKey(d)===k;}).sort((a,b)=>String(b.data).localeCompare(String(a.data))||(+b.rowid-+a.rowid));
  const h=hoje0(),dias={};L.forEach(r=>(dias[r.data]=dias[r.data]||[]).push(r));
  const tot=L.reduce((s,r)=>s+num(r.qtd),0),ref=L.reduce((s,r)=>s+num(r.refugo),0),m3=L.reduce((s,r)=>{const p=pecaDe(r.peca);return s+(p?geo(p).V*(num(r.qtd)+num(r.refugo)):0);},0),custo=L.reduce((s,r)=>s+num(r.custo_un)*num(r.qtd),0);
  const nDias=Object.keys(dias).length;
  return cabG('Diário de produção','O que foi confeccionado a cada dia. Cada registro baixa os insumos do estoque e põe as peças em cura — elas ficam prontas para venda depois dos dias de cura de cada peça.',
      `${GS.selMes(k,'data-pm-mes',12,0)}<button type="button" class="gf-bt pri" data-pm="prod-nova"><i class="fas fa-plus"></i> Registrar produção</button>`)+
    `<div class="gf-kpis">${kpiG('','fa-cubes','Peças produzidas',nf(tot,0),`${nDias} dia(s) de produção no mês`)}${kpiG('','fa-fill-drip','Concreto',nf(m3,2)+' m³',nDias?`média ${nf(m3/nDias,2)} m³ por dia`:'—')}
      ${kpiG(ref&&ref/(tot+ref)>0.03?'vermelho':'verde','fa-triangle-exclamation','Refugo',nf(ref,0)+' peças',tot+ref?`${nf(ref/(tot+ref)*100,1)}% da produção`:'—')}${kpiG('laranja','fa-money-bill-wave','Custo produzido',R(custo),tot?`média ${R(custo/tot)} por peça`:'—')}</div>
    <section class="gf-sec">${nDias?Object.keys(dias).sort().reverse().map(d=>{const ls=dias[d];return `<div class="gf-dia-cab" style="margin-top:6px"><i class="fas fa-calendar-day" style="color:#1652D8"></i>${fe(brDe(dt(d)))}<span>${cap(GS.SEMANA[dt(d).getDay()])} · ${nf(ls.reduce((s,r)=>s+num(r.qtd),0),0)} peças</span></div>
      <div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Peça</th><th class="n">Boas</th><th class="n">Refugo</th><th>Ordem</th><th>Cura</th><th class="n">Custo/peça</th><th>Equipe / obs.</th></tr></thead><tbody>
      ${ls.map(r=>{const p=pecaDe(r.peca),lib=addD(dt(r.data),num(p&&p.cura!=null&&p.cura!==''?p.cura:7)),o=ordens().find(x=>String(x.rowid)===String(r.ordem||''));
        return `<tr class="pm-lin" data-pm="prod" data-id="${r.rowid}"><td><b>${fe(p?p.nome:'(peça excluída)')}</b></td><td class="n">${nf(num(r.qtd),0)}</td><td class="n">${num(r.refugo)?nf(num(r.refugo),0):'—'}</td><td>${o?'OP nº '+fe(String(o.numero)):'—'}</td><td>${lib>h?pill('em cura até '+brDe(lib).slice(0,5),'info','fa-hourglass-half'):pill('liberada','ok','fa-check')}</td><td class="n">${R(num(r.custo_un))}</td><td>${fe([r.equipe,r.obs].filter(Boolean).join(' · '))}</td></tr>`;}).join('')}</tbody></table></div>`;}).join('')
      :'<div class="gf-vazio"><i class="fas fa-industry"></i><p>Nenhuma produção registrada neste mês.</p></div>'}</section>`;
}
function formProducao(reg,pre){
  pre=pre||{};if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e traços).','error');
  const b=reg||{data:hojeISO(),peca:pre.peca||(pecas()[0]||{}).rowid,ordem:pre.ordem||'',qtd:'',refugo:''};
  const opsOrd=pid=>`<option value="">— sem ordem (produção para estoque) —</option>`+ordens().filter(o=>String(o.peca)===String(pid)&&(o.status==='planejada'||o.status==='producao'||String(o.rowid)===String(b.ordem))).map(o=>`<option value="${o.rowid}" ${String(o.rowid)===String(b.ordem)?'selected':''}>OP nº ${o.numero} — ${nf(prodDaOrdem(o.rowid),0)} de ${nf(num(o.qtd),0)}</option>`).join('');
  const j=janela(reg?'Editar produção':'Registrar produção',`<div class="fin-linha">
      <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}" max="${hojeISO()}"></div>
      <div class="fin-fld"><label>Peça <span class="obg">*</span></label><select data-k="peca">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(b.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Ordem de produção</label><select data-k="ordem">${opsOrd(b.peca)}</select></div>
      <div class="fin-fld"><label>Peças boas <span class="obg">*</span></label><input data-k="qtd" inputmode="numeric" value="${fe(String(b.qtd||''))}"></div>
      <div class="fin-fld"><label>Refugo (peças perdidas)</label><input data-k="refugo" inputmode="numeric" value="${fe(String(b.refugo||''))}" placeholder="0"></div>
      <div class="fin-fld"><label>Equipe / turno</label><input data-k="equipe" value="${fe(b.equipe||'')}" placeholder="Ex.: João e Pedro — manhã"></div>
      <div class="fin-fld"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}" placeholder="Ex.: chuva à tarde, forma 3 trincada"></div></div>
      <div class="fin-aviso" style="margin-top:8px"><div data-pr-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Produção de ${brDe(dt(reg.data))} — ${nomePeca(reg.peca)}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),o=reg?{...reg}:{tipo:'producao',data_lancamento:todayDateTime()};
      o.data=g('data');o.peca=g('peca');o.ordem=g('ordem');o.qtd=num(g('qtd'));o.refugo=num(g('refugo'));o.equipe=g('equipe');o.obs=g('obs');
      if(!o.data)throw new Error('Informe a data.');if(o.data>hojeISO())throw new Error('A data da produção não pode ser no futuro.');
      if(!(o.qtd>0)&&!(o.refugo>0))throw new Error('Informe quantas peças foram feitas.');
      const p=pecaDe(o.peca);if(!p)throw new Error('Escolha a peça.');
      // retrato do dia: consumo de insumos (boas + refugo) e custo por peça — o estoque e os relatórios usam este retrato
      const x=calc(p,o.qtd+o.refugo),u=calc(p,1);o.consumo={};Object.entries(x.est).forEach(([k,q])=>o.consumo[k]=Math.round(q*10000)/10000);
      o.custo_un=r2(u.un);o.custo_mat_un=r2(u.custo.mat);o.m3=Math.round(x.Vt*10000)/10000;
      await gravar(o,reg?reg.rowid:null);
      // ordem que chegou na quantidade: concluída
      const op=o.ordem&&ordens().find(z=>String(z.rowid)===String(o.ordem));
      if(op&&op.status!=='concluida'&&prodDaOrdem(op.rowid)>=num(op.qtd))await gravar({...op,status:'concluida',concluida_em:o.data},op.rowid);
      else if(op&&op.status==='planejada')await gravar({...op,status:'producao',inicio:op.inicio||o.data},op.rowid);
      toast('Produção registrada: insumos baixados e peças em cura.','success');}}],640);
  const at=()=>{const p=pecaDe(j.querySelector('[data-k="peca"]').value),q=num(j.querySelector('[data-k="qtd"]').value)+num(j.querySelector('[data-k="refugo"]').value),e=j.querySelector('[data-pr-prev]');if(!e)return;
    if(!p||!q){e.innerHTML='Informe a peça e a quantidade para ver o que sai do estoque de insumos.';return;}const x=calc(p,q),ei=estoqueInsumos(),d=dt(j.querySelector('[data-k="data"]').value)||hoje0();
    e.innerHTML=`Sai do estoque: ${INS.filter(i=>x.est[i.k]).map(i=>{const f=ei[i.k].saldo<x.est[i.k];return `<span style="${f?'color:#B42318;font-weight:700':''}">${insDe(i.k).nome.split(' (')[0].toLowerCase()} ${nf(x.est[i.k],2)} ${i.un}${f?' (estoque insuficiente)':''}</span>`;}).join(' · ')}. Peças liberadas para venda em <b>${brDe(addD(d,num(p.cura!=null&&p.cura!==''?p.cura:7)))}</b>.`;};
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-k="peca"]'))j.querySelector('[data-k="ordem"]').innerHTML=opsOrd(ev.target.value);at();});
  corpo.addEventListener('input',at);at();
}

/* ═══════════════ ESTOQUE ═══════════════ */
function telaEstoque(){
  const ep=estoquePecas(),ei=estoqueInsumos(),c=CFG();
  const ps=pecas(),valP=ps.reduce((s,p)=>{const x=ep[String(p.rowid)];return s+(x?Math.max(0,x.disp)*x.custoUn:0);},0),valI=INS.reduce((s,i)=>s+ei[i.k].valorEst,0);
  const movs=T('compra').map(r=>({r,t:'compra',d:r.data})).concat(T('ajuste').map(r=>({r,t:'ajuste',d:r.data}))).sort((a,b)=>String(b.d).localeCompare(String(a.d))).slice(0,40);
  return cabG('Estoque','Peças em cura e prontas, reservadas para pedidos, e o saldo dos insumos (entradas das compras − consumo da produção ± acertos de inventário).',
      `<button type="button" class="gf-bt" data-pm="ajuste-novo"><i class="fas fa-scale-balanced"></i> Acerto de inventário</button><button type="button" class="gf-bt pri" data-pm="compra-nova"><i class="fas fa-cart-plus"></i> Entrada de insumo (compra)</button>`)+
    `<div class="gf-kpis">${kpiG('roxo','fa-cubes','Peças prontas',nf(Object.values(ep).reduce((s,x)=>s+Math.max(0,x.disp),0),0),`${R(valP)} a custo`)}${kpiG('','fa-hourglass-half','Em cura',nf(Object.values(ep).reduce((s,x)=>s+x.cura,0),0),'liberam com os dias de cura de cada peça')}
      ${kpiG('laranja','fa-boxes-stacked','Insumos em estoque',R(valI),'pelo preço médio das compras')}${(()=>{const n=faltaInsumo(ei,insumosUsados()).length;return kpiG(n?'vermelho':'verde','fa-box-open','Abaixo do mínimo',nf(n,0)+' insumo(s)','dos usados pelas peças · mínimos em Parâmetros');})()}</div>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Peças</h3><p>Livre = pronta − reservada em pedidos ainda não entregues.</p></div></div>
      ${ps.length?`<div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Peça</th><th class="n">Em cura</th><th class="n">Prontas</th><th class="n">Reservadas</th><th class="n">Livres</th><th class="n">Mínimo</th><th class="n">Custo médio</th><th class="n">Valor</th><th></th></tr></thead><tbody>
        ${ps.map(p=>{const x=ep[String(p.rowid)]||{cura:0,disp:0,res:0,livre:0,custoUn:calc(p,1).un},baixo=num(p.minimo)>0&&x.livre<num(p.minimo);
          return `<tr><td><b>${fe(p.nome)}</b><small>${fe(p.codigo||'')}</small></td><td class="n">${nf(x.cura,0)}</td><td class="n">${nf(x.disp,0)}</td><td class="n">${nf(x.res,0)}</td><td class="n" style="${x.livre<0||baixo?'color:#B42318;font-weight:800':''}">${nf(x.livre,0)}</td><td class="n">${num(p.minimo)?nf(num(p.minimo),0):'—'}</td><td class="n">${R(x.custoUn)}</td><td class="n">${R(Math.max(0,x.disp)*x.custoUn)}</td>
            <td style="white-space:nowrap">${baixo?`<button type="button" class="gf-bt mini" data-pm="faltas-ordem" data-peca="${p.rowid}" data-qtd="${Math.max(1,num(p.minimo)-x.livre)}"><i class="fas fa-clipboard-list"></i> Produzir</button>`:''}<button type="button" class="gf-bt mini" data-pm="ajuste-novo" data-item="peca:${p.rowid}"><i class="fas fa-scale-balanced"></i></button></td></tr>`;}).join('')}</tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-cubes"></i><p>Cadastre as peças em Peças e traços.</p></div>'}</section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Insumos</h3><p>Saldo atual, consumo médio dos últimos 30 dias e para quantos dias ainda dá.</p></div></div>
      <div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Insumo</th><th class="n">Entradas</th><th class="n">Consumo</th><th class="n">Acertos</th><th class="n">Saldo</th><th class="n">Mínimo</th><th class="n">Preço médio</th><th class="n">Dura</th><th></th></tr></thead><tbody>
      ${INS.map(i=>{const x=ei[i.k],baixo=x.min>0&&x.saldo<x.min;return `<tr><td><b>${fe(i.nome)}</b><small>${fe(i.unL)}</small></td><td class="n">${nf(x.ent,2)}</td><td class="n">${nf(x.cons,2)}</td><td class="n">${x.aj?nf(x.aj,2):'—'}</td>
        <td class="n" style="${baixo||x.saldo<0?'color:#B42318;font-weight:800':'font-weight:700'}">${nf(x.saldo,2)} ${i.un}</td><td class="n">${x.min?nf(x.min,2):'—'}</td><td class="n">${R(x.preco)}</td><td class="n">${x.duraDias!=null?x.duraDias+' dia(s)':'—'}</td>
        <td style="white-space:nowrap"><button type="button" class="gf-bt mini" data-pm="compra-nova" data-ins="${i.k}" title="Entrada (compra)"><i class="fas fa-cart-plus"></i></button><button type="button" class="gf-bt mini" data-pm="ajuste-novo" data-item="insumo:${i.k}" title="Acerto de inventário"><i class="fas fa-scale-balanced"></i></button></td></tr>`;}).join('')}
      </tbody></table></div></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Últimas entradas e acertos</h3><p>Clique para editar ou excluir.</p></div></div>
      ${movs.length?`<div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Data</th><th>Movimento</th><th>Item</th><th class="n">Quantidade</th><th class="n">Valor</th><th>Pagamento</th></tr></thead><tbody>
        ${movs.map(({r,t})=>{if(t==='compra'){const i=insDe(r.insumo);return `<tr class="pm-lin" data-pm="compra" data-id="${r.rowid}"><td>${fe(brDe(dt(r.data)))}</td><td>${pill('compra','ok','fa-cart-plus')}</td><td>${fe(i.nome)}${r.fornecedor?`<small>${fe(r.fornecedor)}</small>`:''}</td><td class="n">${nf(num(r.qtd),2)} ${i.un}</td><td class="n">${R(num(r.valor))}</td><td>${r.pago_em?pill('pago '+brDe(dt(r.pago_em)).slice(0,5),'ok'):r.vencimento?pill('vence '+brDe(dt(r.vencimento)).slice(0,5),dt(r.vencimento)<hoje0()?'err':'warn'):'—'}</td></tr>`;}
          const pc=String(r.item||'').startsWith('peca:'),nm=pc?nomePeca(r.item.slice(5)):insDe(String(r.item).slice(7)).nome;return `<tr class="pm-lin" data-pm="ajuste" data-id="${r.rowid}"><td>${fe(brDe(dt(r.data)))}</td><td>${pill('acerto','info','fa-scale-balanced')}</td><td>${fe(nm)}<small>${fe(r.motivo||'')}</small></td><td class="n">${num(r.qtd)>0?'+':''}${nf(num(r.qtd),2)}</td><td class="n">—</td><td>—</td></tr>`;}).join('')}</tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-cart-flatbed"></i><p>Nenhuma compra lançada. Lance as entradas para o estoque e o custo médio ficarem certos.</p></div>'}</section>`;
}
function formCompra(reg,insPre){
  const b=reg||{data:hojeISO(),insumo:insPre||'cimento'},c=CFG();
  const j=janela(reg?'Editar entrada de insumo':'Entrada de insumo (compra)',`<div class="fin-linha">
      <div class="fin-fld"><label>Data da compra <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Insumo <span class="obg">*</span></label><select data-k="insumo">${INS.map(i=>`<option value="${i.k}" ${i.k===b.insumo?'selected':''}>${fe(i.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade <span data-un></span> <span class="obg">*</span></label><input data-k="qtd" inputmode="decimal" value="${b.qtd?fe(String(b.qtd).replace('.',',')):''}"></div>
      <div class="fin-fld"><label>Valor total (R$) <span class="obg">*</span></label><input data-k="valor" value="${b.valor?fe(String(b.valor)):''}"></div>
      <div class="fin-fld"><label>Fornecedor</label><input data-k="fornecedor" value="${fe(b.fornecedor||'')}" list="vx-forn-pm"></div>
      <div class="fin-fld"><label>Nº da nota</label><input data-k="nf" value="${fe(b.nf||'')}"></div>
      <div class="fin-fld"><label>Vencimento</label><input type="date" data-k="vencimento" value="${fe(b.vencimento||'')}"></div>
      <div class="fin-fld"><label>Pago em</label><input type="date" data-k="pago_em" value="${fe(b.pago_em||'')}"></div></div>
      <datalist id="vx-forn-pm">${[...new Set(T('compra').map(x=>x.fornecedor).filter(Boolean).concat((GS.D().fornecedores||[]).map(f=>f.nome||f.razao_social||'').filter(Boolean)))].slice(0,300).map(n=>`<option value="${fe(n)}">`).join('')}</datalist>
      <label class="nfc-amb" style="margin-top:8px"><input type="checkbox" data-k="atualiza" checked><span>Usar este preço nos cálculos das peças (atualiza o preço do insumo em Parâmetros)</span></label>
      <div class="fin-aviso" style="margin-top:8px"><div data-cp-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Compra de ${insDe(reg.insumo).nome} em ${brDe(dt(reg.data))}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`),o=reg?{...reg}:{tipo:'compra',data_lancamento:todayDateTime()};
      o.data=g('data').value;o.insumo=g('insumo').value;o.qtd=num(g('qtd').value);o.valor=r2(num(g('valor').value));o.fornecedor=g('fornecedor').value.trim();o.nf=g('nf').value.trim();o.vencimento=g('vencimento').value;o.pago_em=g('pago_em').value;
      if(!o.data)throw new Error('Informe a data.');if(!(o.qtd>0))throw new Error('Informe a quantidade.');if(!(o.valor>0))throw new Error('Informe o valor total.');
      await gravar(o,reg?reg.rowid:null);
      if(g('atualiza').checked){const r=cfgRow(),cf=r&&r.cfg?JSON.parse(JSON.stringify(r.cfg)):{};cf.precos=cf.precos||{};cf.precos[o.insumo]=Math.round(o.valor/o.qtd*100)/100;await gravar(r?{...r,cfg:cf}:{tipo:'config',cfg:cf,data_lancamento:todayDateTime()},r?r.rowid:null);}
      toast('Entrada lançada no estoque.','success');}}],620);
  const at=()=>{const i=insDe(j.querySelector('[data-k="insumo"]').value),q=num(j.querySelector('[data-k="qtd"]').value),v=num(j.querySelector('[data-k="valor"]').value);
    j.querySelector('[data-un]').textContent=`(${i.unL})`;const e=j.querySelector('[data-cp-prev]');
    e.innerHTML=q>0&&v>0?`Preço: <b>${R(v/q)}</b> por ${i.unL} · nos parâmetros hoje: ${R(num(c.precos[i.k]))}.`:`Informe a quantidade em ${i.unL} e o valor total da nota.`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}
function formAjuste(reg,itemPre){
  const b=reg||{data:hojeISO(),item:itemPre||'insumo:cimento'},ei=estoqueInsumos(),ep=estoquePecas();
  const ops=`<optgroup label="Insumos">${INS.map(i=>`<option value="insumo:${i.k}" ${('insumo:'+i.k)===b.item?'selected':''}>${fe(i.nome)}</option>`).join('')}</optgroup><optgroup label="Peças">${pecas().map(p=>`<option value="peca:${p.rowid}" ${('peca:'+p.rowid)===b.item?'selected':''}>${fe(p.nome)}</option>`).join('')}</optgroup>`;
  const saldoDe=it=>it.startsWith('peca:')?((ep[it.slice(5)]||{}).disp||0):((ei[it.slice(7)]||{}).saldo||0);
  const j=janela(reg?'Editar acerto de inventário':'Acerto de inventário',`<div class="fin-aviso"><div>Use quando a contagem física não bate com o sistema: informe <b>quanto existe de verdade</b> — o sistema lança a diferença.</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Item <span class="obg">*</span></label><select data-k="item">${ops}</select></div>
      <div class="fin-fld"><label>Saldo no sistema</label><input data-k="sist" readonly></div>
      <div class="fin-fld"><label>Contagem física <span class="obg">*</span></label><input data-k="fisico" inputmode="decimal" value="${reg?fe(String(r2(saldoDe(reg.item))).replace('.',',')):''}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Motivo</label><input data-k="motivo" value="${fe(b.motivo||'')}" placeholder="Ex.: inventário do mês, quebra no transporte, saco de cimento empedrado"></div></div>
      <div class="fin-aviso" style="margin-top:8px"><div data-aj-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,'Acerto de inventário'),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Lançar acerto',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`),it=g('item').value,sist=saldoDe(it)-(reg&&reg.item===it?num(reg.qtd):0),fis=num(g('fisico').value);
      if(String(g('fisico').value).trim()==='')throw new Error('Informe a contagem física.');
      const o=reg?{...reg}:{tipo:'ajuste',data_lancamento:todayDateTime()};o.data=g('data').value;o.item=it;o.qtd=Math.round((fis-sist)*10000)/10000;o.motivo=g('motivo').value.trim();
      if(!o.data)throw new Error('Informe a data.');if(Math.abs(o.qtd)<1e-6)throw new Error('A contagem bate com o sistema: não há acerto a lançar.');
      await gravar(o,reg?reg.rowid:null);toast('Acerto lançado.','success');}}],600);
  const at=()=>{const it=j.querySelector('[data-k="item"]').value,sist=saldoDe(it)-(reg&&reg.item===it?num(reg.qtd):0),f=j.querySelector('[data-k="fisico"]').value,un=it.startsWith('peca:')?'peças':insDe(it.slice(7)).un;
    j.querySelector('[data-k="sist"]').value=nf(sist,2)+' '+un;const e=j.querySelector('[data-aj-prev]');
    e.innerHTML=String(f).trim()===''?'Informe a contagem física.':`Diferença: <b>${num(f)-sist>0?'+':''}${nf(num(f)-sist,2)} ${un}</b>.`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}

/* ═══════════════ VENDAS E SAÍDAS ═══════════════ */
const COLS_V=[{k:'pedido',rot:'Pedidos (reservados)',cor:'#B54708',ico:'fa-bookmark'},{k:'entregue',rot:'Entregues · a receber',cor:'#1652D8',ico:'fa-truck'},{k:'recebida',rot:'Recebidas',cor:'#067647',ico:'fa-circle-check'}];
function telaVendas(){
  const h=hoje0(),q=String(PM.busca||'').toLowerCase(),lim=addD(h,-60);
  const L=vendas().filter(v=>v.status!=='cancelada'&&(!q||[v.cliente,v.numero,(v.itens||[]).map(it=>nomePeca(it.peca)).join(' ')].join(' ').toLowerCase().includes(q)));
  const card=v=>{const tot=totalVenda(v),ve=dt(v.vencimento);
    return `<article class="vk-card" style="--cor:${COLS_V.find(c=>c.k===v.status)?.cor||'#B54708'}" data-pm="venda" data-id="${v.rowid}" draggable="true" data-card="${v.rowid}">
      <div class="vk-top"><b>Venda nº ${fe(String(v.numero||''))}</b>${v.status==='recebida'?pill('recebida '+brDe(dt(v.recebido_em)).slice(0,5),'ok','fa-check'):ve?(ve<h&&v.status==='entregue'?pill('vencida','err'):pill('vence '+brDe(ve).slice(0,5),'info')):''}</div>
      <div class="vk-obra"><i class="fas fa-user"></i>${fe(v.cliente||'—')}</div>
      <ul class="vk-itens">${(v.itens||[]).slice(0,3).map(it=>`<li><span>${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}</span><b>${R(num(it.qtd)*num(it.preco))}</b></li>`).join('')}${(v.itens||[]).length>3?`<li class="mais">+ ${(v.itens||[]).length-3} item(ns)</li>`:''}</ul>
      <div class="vk-val"><span>${v.status==='pedido'&&v.entrega_prev?'entrega prevista '+brDe(dt(v.entrega_prev)).slice(0,5):v.entrega?'entregue '+brDe(dt(v.entrega)).slice(0,5):''}</span><b>${R(tot)}</b></div></article>`;};
  const cols=COLS_V.map(c=>{let itens=L.filter(v=>(v.status||'pedido')===c.k);if(c.k==='recebida')itens=itens.filter(v=>!dt(v.recebido_em)||dt(v.recebido_em)>=lim);
    itens.sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));return {c,itens,total:itens.reduce((s,v)=>s+totalVenda(v),0)};});
  setTimeout(()=>{const w=document.querySelector('#pm-app .vk-quadro');if(w&&!w._lig){w._lig=1;GS.ligarArraste(w,moverVenda);}},0);
  return cabG('Vendas e saídas','Pedido reserva as peças; ao entregar, elas saem do estoque e a venda fica a receber; ao receber, entra no caixa da fábrica. Arraste o cartão para mudar a fase.',
      `<button type="button" class="gf-bt pri" data-pm="venda-nova"><i class="fas fa-plus"></i> Nova venda</button>`)+
    `<div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar cliente, nº ou peça…" value="${fe(PM.busca)}" style="min-width:260px"><span class="pm-mini">Recebidas: últimos 60 dias (as anteriores ficam nos Relatórios).</span></div>`+
    GS.colunasHtml(cols,card,{pedido:'Nenhum pedido aberto',entregue:'Nada a receber',recebida:'Recebimentos aparecem aqui'});
}
async function moverVenda(id,col){
  const v=vendas().find(x=>String(x.rowid)===String(id));if(!v||!col||v.status===col)return;
  if(col==='entregue')return entregar(v);if(col==='recebida')return receber(v);
  try{await gravar({...v,status:'pedido',entrega:'',recebido_em:''},v.rowid);toast('Venda voltou para pedido.','success');}catch(e){toast(e.message,'error');}
}
function faltasVenda(v){const ep=estoquePecas();return (v.itens||[]).map(it=>{const x=ep[String(it.peca)]||{disp:0};return {it,disp:Math.max(0,x.disp),falta:Math.max(0,num(it.qtd)-Math.max(0,x.disp))};}).filter(x=>x.falta>0);}
function entregar(v){
  const f=faltasVenda(v);
  janela(`Entregar a venda nº ${v.numero}`,`${f.length?`<div class="fin-aviso laranja"><div><b>Peça pronta insuficiente:</b> ${f.map(x=>`${fe(nomePeca(x.it.peca))} (pede ${nf(num(x.it.qtd),0)}, pronto ${nf(x.disp,0)})`).join(' · ')}. Entregando assim, o estoque fica negativo — confira se as peças em cura já podem sair.</div></div>`:''}
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data da entrega <span class="obg">*</span></label><input type="date" data-k="entrega" value="${hojeISO()}" max="${hojeISO()}"></div>
    <div class="fin-fld"><label>Vencimento do pagamento</label><input type="date" data-k="vencimento" value="${fe(v.vencimento||hojeISO())}"></div></div>`,
    [{html:'<i class="fas fa-truck"></i> Confirmar entrega',cls:'pri',acao:async j=>{const e=j.querySelector('[data-k="entrega"]').value;if(!e)throw new Error('Informe a data da entrega.');
      await gravar({...v,status:'entregue',entrega:e,vencimento:j.querySelector('[data-k="vencimento"]').value||e},v.rowid);toast(`Venda nº ${v.numero} entregue: peças baixadas do estoque.`,'success');}}],560);
}
function receber(v){
  janela(`Receber a venda nº ${v.numero}`,`<div class="fin-resumo">${fe(v.cliente||'')} · total <b>${R(totalVenda(v))}</b></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Recebido em <span class="obg">*</span></label><input type="date" data-k="rec" value="${hojeISO()}" max="${hojeISO()}"></div>
    <div class="fin-fld"><label>Forma de pagamento</label><select data-k="forma">${['Pix','Dinheiro','Transferência','Boleto','Cartão','Cheque'].map(x=>`<option ${x===(v.forma||'Pix')?'selected':''}>${x}</option>`).join('')}</select></div></div>`,
    [{html:'<i class="fas fa-circle-check"></i> Confirmar recebimento',cls:'pri',acao:async j=>{const d=j.querySelector('[data-k="rec"]').value;if(!d)throw new Error('Informe a data.');
      await gravar({...v,status:'recebida',recebido_em:d,forma:j.querySelector('[data-k="forma"]').value,entrega:v.entrega||d},v.rowid);toast(`Venda nº ${v.numero} recebida.`,'success');}}],520);
}
function fichaVenda(v){
  if(!v)return;const tot=totalVenda(v),f=v.status==='pedido'?faltasVenda(v):[];
  const bts=[];
  bts.push({html:'<i class="fas fa-print"></i> Imprimir pedido',acao:async()=>{imprimirVenda(v);return false;}});
  if(v.status!=='recebida')bts.push({html:'<i class="fas fa-ban"></i> Cancelar venda',acao:async()=>{setTimeout(()=>confirmar('Cancelar a venda?',`A venda nº ${v.numero} fica cancelada (as peças voltam a ficar livres).`,'Sim, cancelar',async()=>{await gravar({...v,status:'cancelada'},v.rowid);toast('Venda cancelada.','success');}),60);}});
  if(v.status==='pedido'&&f.length)bts.push({html:'<i class="fas fa-clipboard-list"></i> Produzir o que falta',acao:async()=>{setTimeout(async()=>{try{for(const x of f){const o={tipo:'ordem',numero:proxNum('ordem','numero'),peca:x.it.peca,qtd:x.falta,status:'planejada',inicio:hojeISO(),fim:v.entrega_prev||'',cliente:`Venda nº ${v.numero} — ${v.cliente||''}`,data_lancamento:todayDateTime()};await gravar(o,null);}toast(`${f.length} ordem(ns) de produção criada(s).`,'success');}catch(e){toast(e.message,'error');}},60);}});
  if(v.status!=='pedido')bts.push({html:'<i class="fas fa-rotate-left"></i> Voltar para pedido',acao:async()=>{await gravar({...v,status:'pedido',entrega:'',recebido_em:''},v.rowid);toast('Voltou para pedido.','success');}});
  bts.push({html:'<i class="fas fa-pen"></i> Editar',acao:async()=>{setTimeout(()=>formVenda(v),60);}});
  if(v.status==='pedido')bts.push({html:'<i class="fas fa-truck"></i> Entregar',cls:'pri',acao:async()=>{setTimeout(()=>entregar(v),60);}});
  if(v.status==='entregue')bts.push({html:'<i class="fas fa-hand-holding-dollar"></i> Receber',cls:'pri',acao:async()=>{setTimeout(()=>receber(v),60);}});
  janela(`Venda nº ${v.numero}`,`<div class="fin-resumo"><b>${fe(v.cliente||'')}</b>${v.telefone?' · '+fe(v.telefone):''}${v.doc?' · '+fe(v.doc):''}<br>${fe(COLS_V.find(c=>c.k===v.status)?.rot||v.status)}${v.data?' · pedido em '+brDe(dt(v.data)):''}${v.entrega?' · entregue em '+brDe(dt(v.entrega)):''}${v.recebido_em?' · recebida em '+brDe(dt(v.recebido_em)):''}</div>
    ${f.length?`<div class="fin-aviso laranja" style="margin-top:8px"><div>Falta peça pronta: ${f.map(x=>`${fe(nomePeca(x.it.peca))} (faltam ${nf(x.falta,0)})`).join(' · ')}.</div></div>`:''}
    <table class="pm-tab" data-sem-ordem style="margin-top:8px"><thead><tr><th>Peça</th><th class="n">Quant.</th><th class="n">Preço</th><th class="n">Total</th></tr></thead><tbody>
    ${(v.itens||[]).map(it=>`<tr><td>${fe(nomePeca(it.peca))}</td><td class="n">${nf(num(it.qtd),0)}</td><td class="n">${R(num(it.preco))}</td><td class="n">${R(num(it.qtd)*num(it.preco))}</td></tr>`).join('')}
    ${num(v.frete)?`<tr><td colspan="3">Frete</td><td class="n">${R(num(v.frete))}</td></tr>`:''}${num(v.desconto)?`<tr><td colspan="3">Desconto</td><td class="n">${R(-num(v.desconto))}</td></tr>`:''}
    <tr class="t"><td colspan="3">Total</td><td class="n">${R(tot)}</td></tr></tbody></table>
    ${v.endereco?`<p class="pm-mini" style="margin:8px 0 0"><i class="fas fa-location-dot"></i> ${fe(v.endereco)}</p>`:''}${v.obs?`<p class="pm-mini" style="margin:4px 0 0">${fe(v.obs)}</p>`:''}`,bts,720);
}
function imprimirVenda(v){
  App._relExportPaginado({titulo:`Pedido de venda nº ${v.numero}`,subLinhas:[`Cliente: ${v.cliente||''}${v.doc?' · '+v.doc:''}${v.telefone?' · '+v.telefone:''}`,`${v.endereco?'Entrega: '+v.endereco+' · ':''}Data: ${brDe(dt(v.data))}${v.vencimento?' · vencimento '+brDe(dt(v.vencimento)):''}${v.forma?' · '+v.forma:''}`],
    theadHtml:'<tr><th>Peça</th><th style="text-align:right">Quantidade</th><th style="text-align:right">Preço unitário</th><th style="text-align:right">Total</th></tr>',
    rowsArr:(v.itens||[]).map(it=>`<tr><td>${fe(nomePeca(it.peca))}</td><td style="text-align:right">${nf(num(it.qtd),0)}</td><td style="text-align:right">${R(num(it.preco))}</td><td style="text-align:right">${R(num(it.qtd)*num(it.preco))}</td></tr>`)
      .concat(num(v.frete)?[`<tr><td colspan="3">Frete</td><td style="text-align:right">${R(num(v.frete))}</td></tr>`]:[]).concat(num(v.desconto)?[`<tr><td colspan="3">Desconto</td><td style="text-align:right">${R(-num(v.desconto))}</td></tr>`]:[]),
    posHtml:`<p style="text-align:right;font-size:14px;font-weight:800">Total: ${R(totalVenda(v))}</p>${v.obs?`<p>${fe(v.obs)}</p>`:''}`});
}
function formVenda(reg){
  if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e traços).','error');
  const b=reg?JSON.parse(JSON.stringify(reg)):{data:hojeISO(),status:'pedido',itens:[{peca:pecas()[0].rowid,qtd:'',preco:''}],forma:'Pix'},ep=estoquePecas();
  const precoDe=pid=>{const p=pecaDe(pid);if(!p)return 0;const x=calc(p,1);return x.preco||r2(x.sug);};
  const itemLin=it=>`<tr data-item><td><select data-i="peca">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(it.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></td>
    <td><input data-i="qtd" inputmode="numeric" value="${fe(String(it.qtd||''))}" placeholder="0"></td><td><input data-i="preco" data-mask="moeda" value="${it.preco!==''&&it.preco!=null?fe(R(num(it.preco))):fe(R(precoDe(it.peca)))}"></td>
    <td class="n" data-i="tot" style="white-space:nowrap;text-align:right"></td><td><button type="button" class="pm-x" data-pmf="item-x"><i class="fas fa-xmark"></i></button></td></tr>`;
  const j=janela(reg?`Editar venda nº ${reg.numero}`:'Nova venda',`<div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Cliente <span class="obg">*</span></label><input data-k="cliente" value="${fe(b.cliente||'')}" list="pm-clientes"></div>
      <div class="fin-fld"><label>Telefone</label><input data-k="telefone" value="${fe(b.telefone||'')}"></div>
      <div class="fin-fld"><label>CPF / CNPJ</label><input data-k="doc" value="${fe(b.doc||'')}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Endereço de entrega</label><input data-k="endereco" value="${fe(b.endereco||'')}"></div></div>
      <datalist id="pm-clientes">${[...new Set(vendas().map(x=>x.cliente).filter(Boolean))].map(n=>`<option value="${fe(n)}">`).join('')}</datalist>
      <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-cubes"></i> Itens</h5><div class="pm-rolar"><table class="pm-itens" style="width:100%"><thead><tr><th>Peça</th><th style="width:90px">Quant.</th><th style="width:140px">Preço unit. (R$)</th><th style="width:110px;text-align:right">Total</th><th></th></tr></thead><tbody data-itens>${(b.itens||[]).map(itemLin).join('')}</tbody></table></div>
        <button type="button" class="gf-bt mini" data-pmf="item-add" style="margin-top:6px"><i class="fas fa-plus"></i> Item</button></div>
      <div class="fin-linha"><div class="fin-fld"><label>Frete (R$)</label><input data-k="frete" value="${num(b.frete)?fe(R(num(b.frete))):''}"></div><div class="fin-fld"><label>Desconto (R$)</label><input data-k="desconto" value="${num(b.desconto)?fe(R(num(b.desconto))):''}"></div>
        <div class="fin-fld"><label>Data do pedido <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div><div class="fin-fld"><label>Entrega prevista</label><input type="date" data-k="entrega_prev" value="${fe(b.entrega_prev||'')}"></div>
        <div class="fin-fld"><label>Forma de pagamento</label><select data-k="forma">${['Pix','Dinheiro','Transferência','Boleto','Cartão','Cheque'].map(x=>`<option ${x===(b.forma||'Pix')?'selected':''}>${x}</option>`).join('')}</select></div><div class="fin-fld"><label>Vencimento</label><input type="date" data-k="vencimento" value="${fe(b.vencimento||'')}"></div>
        <div class="fin-fld"><label>Nº da nota fiscal</label><input data-k="nf" value="${fe(b.nf||'')}"></div><div class="fin-fld"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}"></div></div>
      <div class="pm-big"><span>Total da venda</span><b data-v-tot>—</b><span data-v-est></span></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Venda nº ${reg.numero}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),o=reg?{...reg}:{tipo:'venda',numero:proxNum('venda','numero'),status:'pedido',data_lancamento:todayDateTime()};
      ['cliente','telefone','doc','endereco','data','entrega_prev','forma','vencimento','nf','obs'].forEach(k=>o[k]=g(k));o.frete=r2(num(g('frete')));o.desconto=r2(num(g('desconto')));
      o.itens=lerItens(jj);if(!o.cliente)throw new Error('Informe o cliente.');if(!o.data)throw new Error('Informe a data do pedido.');if(!o.itens.length)throw new Error('Inclua ao menos um item com quantidade.');
      o.total=totalVenda(o);await gravar(o,reg?reg.rowid:null);toast(reg?'Venda salva.':`Venda nº ${o.numero} criada (peças reservadas).`,'success');}}],860);
  const at=()=>{const its=lerItens(j);j.querySelectorAll('[data-item]').forEach(tr=>{const q=num(tr.querySelector('[data-i="qtd"]').value),p=num(tr.querySelector('[data-i="preco"]').value);tr.querySelector('[data-i="tot"]').textContent=q?R(q*p):'';});
    const tot=totalVenda({itens:its,frete:num(j.querySelector('[data-k="frete"]').value),desconto:num(j.querySelector('[data-k="desconto"]').value)});j.querySelector('[data-v-tot]').textContent=R(tot);
    const falta=its.filter(it=>{const x=ep[String(it.peca)]||{livre:0};const minha=reg&&reg.status==='pedido'?(reg.itens||[]).filter(z=>String(z.peca)===String(it.peca)).reduce((s,z)=>s+num(z.qtd),0):0;return num(it.qtd)>x.livre+minha;});
    j.querySelector('[data-v-est]').innerHTML=falta.length?`<span style="color:#B54708"><i class="fas fa-triangle-exclamation"></i> sem estoque livre: ${falta.map(it=>fe(nomePeca(it.peca))).join(', ')}</span>`:'estoque livre suficiente';};
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('input',()=>{clearTimeout(j._pmT);j._pmT=setTimeout(at,100);});
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-i="peca"]')){const tr=ev.target.closest('tr'),pr=tr.querySelector('[data-i="preco"]');pr.value=R(precoDe(ev.target.value));}at();});
  corpo.addEventListener('click',ev=>{const b2=ev.target.closest('[data-pmf]');if(!b2)return;if(b2.dataset.pmf==='item-add'){j.querySelector('[data-itens]').insertAdjacentHTML('beforeend',itemLin({peca:pecas()[0].rowid,qtd:'',preco:''}));}else if(b2.dataset.pmf==='item-x'){b2.closest('tr').remove();}at();});
  at();
}
function lerItens(j){return [...j.querySelectorAll('[data-item]')].map(tr=>({peca:tr.querySelector('[data-i="peca"]').value,qtd:num(tr.querySelector('[data-i="qtd"]').value),preco:r2(num(tr.querySelector('[data-i="preco"]').value))})).filter(it=>it.qtd>0);}

/* ═══════════════ FLUXO DE CAIXA ═══════════════ */
const CAT_CUSTO=['Mão de obra (salários e encargos)','Energia elétrica','Água','Betoneira / equipamentos','Aluguel','Manutenção de formas','Combustível / frete','Impostos','Outros'];
function caixaMes(k){
  const noM=d=>!!d&&mesKey(d)===k,o={entR:0,entP:0,saiR:0,saiP:0,mov:[]};
  vendas().forEach(v=>{if(v.status==='cancelada')return;const t=totalVenda(v);
    if(v.status==='recebida'){if(noM(dt(v.recebido_em))){o.entR+=t;o.mov.push({d:v.recebido_em,t:`Venda nº ${v.numero} — ${v.cliente||''}`,v:t,real:true,tipo:'venda',id:v.rowid});}}
    else{const d=dt(v.vencimento)||dt(v.entrega_prev)||dt(v.data);if(noM(d)){o.entP+=t;o.mov.push({d:isoDe(d),t:`Venda nº ${v.numero} — ${v.cliente||''} (${v.status==='pedido'?'pedido':'a receber'})`,v:t,real:false,tipo:'venda',id:v.rowid});}}});
  const saida=(r,rot,tipo)=>{const v=num(r.valor);if(r.pago_em){if(noM(dt(r.pago_em))){o.saiR+=v;o.mov.push({d:r.pago_em,t:rot,v:-v,real:true,tipo,id:r.rowid});}}
    else{const d=dt(r.vencimento)||dt(r.data);if(noM(d)){o.saiP+=v;o.mov.push({d:isoDe(d),t:rot+' (a pagar)',v:-v,real:false,tipo,id:r.rowid});}}};
  T('compra').forEach(r=>saida(r,`Compra — ${insDe(r.insumo).nome}${r.fornecedor?' · '+r.fornecedor:''}`,'compra'));
  T('custo').forEach(r=>saida(r,`${r.categoria||'Custo'}${r.descricao?' — '+r.descricao:''}`,'custo'));
  o.mov.sort((a,b)=>String(a.d).localeCompare(String(b.d)));o.saldo=o.entR+o.entP-o.saiR-o.saiP;return o;
}
function telaCaixa(){
  const c=CFG(),ks=[];for(let i=-5;i<=5;i++)ks.push(mesDesloc(mesHoje(),i));
  // saldo acumulado: parte do saldo inicial informado (Parâmetros) e soma mês a mês
  let acum=num(c.saldo_inicial);const ini=c.saldo_data?mesKey(dt(c.saldo_data)||hoje0()):null;
  const todos=[];{const ms=new Set();vendas().forEach(v=>{[v.recebido_em,v.vencimento,v.entrega_prev,v.data].forEach(d=>{const x=dt(d);if(x)ms.add(mesKey(x));});});T('compra').concat(T('custo')).forEach(r=>[r.pago_em,r.vencimento,r.data].forEach(d=>{const x=dt(d);if(x)ms.add(mesKey(x));}));
    [...ms].filter(k=>k<ks[0]&&(!ini||k>=ini)).sort().forEach(k=>todos.push(k));}
  todos.forEach(k=>{acum+=caixaMes(k).saldo;});
  const rows=ks.map(k=>{const x=caixaMes(k);if(!ini||k>=ini)acum+=x.saldo;return {k,x,acum};});
  const sel=caixaMes(PM.cxMes);
  return cabG('Fluxo de caixa da fábrica','Entradas das vendas (recebidas e a receber) e saídas das compras de insumos e dos custos da fábrica. Realizado nos meses que passaram, previsto daqui para frente.',
      `<button type="button" class="gf-bt" data-pm="compra-nova"><i class="fas fa-cart-plus"></i> Compra de insumo</button><button type="button" class="gf-bt pri" data-pm="custo-novo"><i class="fas fa-plus"></i> Custo da fábrica</button>`)+
    `<section class="gf-sec"><div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Mês</th><th class="n">Entrou</th><th class="n">A receber</th><th class="n">Saiu</th><th class="n">A pagar</th><th class="n">Saldo do mês</th><th class="n">Saldo acumulado</th></tr></thead><tbody>
      ${rows.map(({k,x,acum})=>`<tr class="pm-lin" data-pm-cxsel="${k}" style="${k===PM.cxMes?'background:#EEF4FF':''}"><td><b>${cap(mesNome(k))}</b>${k===mesHoje()?' <small>mês atual</small>':''}</td><td class="n">${x.entR?R(x.entR):'—'}</td><td class="n">${x.entP?R(x.entP):'—'}</td><td class="n">${x.saiR?R(-x.saiR):'—'}</td><td class="n">${x.saiP?R(-x.saiP):'—'}</td><td class="n" style="color:${x.saldo<0?'#B42318':'#067647'};font-weight:700">${R(x.saldo)}</td><td class="n" style="font-weight:800;color:${acum<0?'#B42318':'var(--text-1)'}">${R(acum)}</td></tr>`).join('')}
    </tbody></table></div><p class="pm-mini" style="margin:8px 0 0">Saldo inicial: ${R(num(c.saldo_inicial))}${c.saldo_data?' em '+brDe(dt(c.saldo_data)):''} (ajuste em Parâmetros e preços). Clique num mês para ver os lançamentos.</p></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Lançamentos de ${mesNome(PM.cxMes)}</h3><p>Clique para abrir.</p></div><label class="gf-mes"><i class="fas fa-calendar"></i><select data-pm-cxmes>${ks.map(k=>`<option value="${k}" ${k===PM.cxMes?'selected':''}>${cap(mesNome(k))}</option>`).join('')}</select></label></div>
      ${sel.mov.length?`<div class="pm-rolar"><table class="pm-tab"><thead><tr><th>Data</th><th>Lançamento</th><th></th><th class="n">Valor</th></tr></thead><tbody>${sel.mov.map(m=>`<tr class="pm-lin" data-pm="${m.tipo}" data-id="${m.id}"><td>${fe(brDe(dt(m.d)))}</td><td>${fe(m.t)}</td><td>${m.real?pill('realizado','ok'):pill('previsto','info')}</td><td class="n" style="color:${m.v<0?'#B42318':'#067647'};font-weight:700">${R(m.v)}</td></tr>`).join('')}</tbody></table></div>`
        :'<div class="gf-vazio"><i class="fas fa-receipt"></i><p>Nenhum lançamento neste mês.</p></div>'}</section>`;
}
function formCusto(reg){
  const b=reg||{data:hojeISO(),categoria:CAT_CUSTO[0]};
  janela(reg?'Editar custo da fábrica':'Custo da fábrica',`<div class="fin-aviso"><div>Custos do mês da fábrica: mão de obra, energia, água, aluguel, manutenção… Entram no fluxo de caixa e no custo real por m³.</div></div><div class="fin-linha" style="margin-top:8px">
      <div class="fin-fld"><label>Categoria <span class="obg">*</span></label><select data-k="categoria">${CAT_CUSTO.map(x=>`<option ${x===b.categoria?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Valor (R$) <span class="obg">*</span></label><input data-k="valor" value="${b.valor?fe(R(num(b.valor))):''}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Descrição</label><input data-k="descricao" value="${fe(b.descricao||'')}" placeholder="Ex.: folha de outubro — 3 pessoas"></div>
      <div class="fin-fld"><label>Competência (data) <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Vencimento</label><input type="date" data-k="vencimento" value="${fe(b.vencimento||'')}"></div>
      <div class="fin-fld"><label>Pago em</label><input type="date" data-k="pago_em" value="${fe(b.pago_em||'')}"></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`${reg.categoria} — ${R(num(reg.valor))}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),o=reg?{...reg}:{tipo:'custo',data_lancamento:todayDateTime()};
      o.categoria=g('categoria');o.valor=r2(num(g('valor')));o.descricao=g('descricao');o.data=g('data');o.vencimento=g('vencimento');o.pago_em=g('pago_em');
      if(!(o.valor>0))throw new Error('Informe o valor.');if(!o.data)throw new Error('Informe a competência.');
      await gravar(o,reg?reg.rowid:null);toast('Custo lançado.','success');}}],600);
}

/* ═══════════════ RELATÓRIOS ═══════════════ */
const RELS={producao:'Produção por período',vendas:'Vendas por período',consumo:'Consumo de materiais',estoque:'Posição do estoque',resultado:'Resultado mês a mês (DRE)'};
function dadosRel(){
  const {tipo,de,ate}=PM.rel,dD=dt(de),dA=dt(ate),dentro=s=>{const d=dt(s);return !!d&&(!dD||d>=dD)&&(!dA||d<=dA);},c=CFG();
  if(tipo==='producao'){const L=T('producao').filter(r=>dentro(r.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    const cab=[{l:'Data'},{l:'Peça'},{l:'Boas',d:1},{l:'Refugo',d:1},{l:'m³',d:1},{l:'Custo/peça',d:1},{l:'Custo total',d:1}];
    const lin=L.map(r=>[brDe(dt(r.data)),nomePeca(r.peca),nf(num(r.qtd),0),nf(num(r.refugo),0),nf(num(r.m3),3),R(num(r.custo_un)),R(num(r.custo_un)*num(r.qtd))]);
    const tot=['Total','',nf(L.reduce((s,r)=>s+num(r.qtd),0),0),nf(L.reduce((s,r)=>s+num(r.refugo),0),0),nf(L.reduce((s,r)=>s+num(r.m3),0),3),'',R(L.reduce((s,r)=>s+num(r.custo_un)*num(r.qtd),0))];return {cab,lin,tot};}
  if(tipo==='vendas'){const L=vendas().filter(v=>v.status!=='cancelada'&&dentro(v.entrega||v.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    const cab=[{l:'Nº'},{l:'Data'},{l:'Cliente'},{l:'Itens'},{l:'Situação'},{l:'Total',d:1},{l:'Recebido em'}];
    const SIT={pedido:'Pedido',entregue:'Entregue (a receber)',recebida:'Recebida'};
    const lin=L.map(v=>[String(v.numero),brDe(dt(v.data)),v.cliente||'',(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${nomePeca(it.peca)}`).join('; '),SIT[v.status]||v.status,R(totalVenda(v)),v.recebido_em?brDe(dt(v.recebido_em)):'']);
    return {cab,lin,tot:['Total','','','','',R(L.reduce((s,v)=>s+totalVenda(v),0)),'']};}
  if(tipo==='consumo'){const tot={};T('producao').filter(r=>dentro(r.data)).forEach(r=>Object.entries(r.consumo||{}).forEach(([k,q])=>tot[k]=(tot[k]||0)+num(q)));const ei=estoqueInsumos();
    const cab=[{l:'Insumo'},{l:'Unidade'},{l:'Consumido',d:1},{l:'Custo estimado',d:1}];const lin=INS.filter(i=>tot[i.k]).map(i=>[i.nome,i.unL,nf(tot[i.k],3),R(tot[i.k]*ei[i.k].preco)]);
    return {cab,lin,tot:['Total','','',R(INS.filter(i=>tot[i.k]).reduce((s,i)=>s+tot[i.k]*ei[i.k].preco,0))]};}
  if(tipo==='estoque'){const ep=estoquePecas(),ei=estoqueInsumos();const cab=[{l:'Tipo'},{l:'Item'},{l:'Em cura',d:1},{l:'Pronto / saldo',d:1},{l:'Reservado',d:1},{l:'Valor',d:1}];
    const lin=pecas().map(p=>{const x=ep[String(p.rowid)]||{cura:0,disp:0,res:0,custoUn:0};return ['Peça',p.nome,nf(x.cura,0),nf(x.disp,0),nf(x.res,0),R(Math.max(0,x.disp)*x.custoUn)];})
      .concat(INS.map(i=>['Insumo',i.nome,'',nf(ei[i.k].saldo,2)+' '+i.un,'',R(ei[i.k].valorEst)]));return {cab,lin,tot:null};}
  // resultado
  const ks=[];let k=mesKey(dD||hoje0());const kf=mesKey(dA||hoje0());for(let i=0;i<36&&k<=kf;i++){ks.push(k);k=mesDesloc(k,1);}
  const cab=[{l:'Mês'},{l:'Receita',d:1},{l:'Impostos',d:1},{l:'Materiais vendidos',d:1},{l:'Margem de contribuição',d:1},{l:'Custos da fábrica',d:1},{l:'Resultado',d:1},{l:'Produção (m³)',d:1}];
  const rs=ks.map(resumoMes);const lin=rs.map(r=>[cap(mesNome(r.k)),R(r.receita),R(-r.impostos),R(-r.cpvMat),R(r.mc),R(-r.custos),R(r.resultado),nf(r.m3,2)]);
  const s=f=>rs.reduce((a,r)=>a+f(r),0);return {cab,lin,tot:['Total',R(s(r=>r.receita)),R(-s(r=>r.impostos)),R(-s(r=>r.cpvMat)),R(s(r=>r.mc)),R(-s(r=>r.custos)),R(s(r=>r.resultado)),nf(s(r=>r.m3),2)]};
}
function telaRelatorios(){
  const d=dadosRel(),r=PM.rel;
  return cabG('Relatórios da fábrica','Escolha o relatório e o período. Dá para baixar em Excel ou imprimir/salvar em PDF.',
      `<button type="button" class="gf-bt" data-pm="rel-excel"><i class="fas fa-file-excel"></i> Excel</button><button type="button" class="gf-bt pri" data-pm="rel-pdf"><i class="fas fa-file-pdf"></i> PDF</button>`)+
    `<div class="pm-filtros"><select data-pm-rel="tipo">${Object.entries(RELS).map(([k,l])=>`<option value="${k}" ${k===r.tipo?'selected':''}>${l}</option>`).join('')}</select>
      ${r.tipo==='estoque'?'<span class="pm-mini">posição de hoje</span>':`<label class="pm-mini">de <input type="date" data-pm-rel="de" value="${fe(r.de)}"></label><label class="pm-mini">até <input type="date" data-pm-rel="ate" value="${fe(r.ate)}"></label>`}</div>
    <section class="gf-sec">${d.lin.length?`<div class="pm-rolar"><table class="pm-tab"><thead><tr>${d.cab.map(c=>`<th class="${c.d?'n':''}">${c.l}</th>`).join('')}</tr></thead><tbody>${d.lin.map(l=>`<tr>${l.map((v,i)=>`<td class="${d.cab[i].d?'n':''}">${fe(v)}</td>`).join('')}</tr>`).join('')}${d.tot?`<tr class="t">${d.tot.map((v,i)=>`<td class="${d.cab[i].d?'n':''}">${fe(v)}</td>`).join('')}</tr>`:''}</tbody></table></div>`:'<div class="gf-vazio"><i class="fas fa-chart-column"></i><p>Nada neste período.</p></div>'}</section>`;
}
function relatorio(excel,pdf){
  const d=dadosRel(),r=PM.rel,tit=RELS[r.tipo]+(r.tipo==='estoque'?'':` — ${brDe(dt(r.de))} a ${brDe(dt(r.ate))}`);
  if(!d.lin.length)return toast('Nada para exportar neste período.','error');
  const linhas=d.tot?d.lin.concat([d.tot]):d.lin;
  if(excel)return GS.baixarCSV?GS.baixarCSV('Pre-moldados '+RELS[r.tipo],d.cab.map(c=>c.l),linhas):toast('Exportação indisponível.','error');
  if(pdf)App._relExportPaginado({titulo:'Pré-moldados — '+tit,subLinhas:['Vixsul Empreendimentos · fábrica de pré-moldados'],paisagem:d.cab.length>5,
    theadHtml:`<tr>${d.cab.map(c=>`<th style="${c.d?'text-align:right':''}">${fe(c.l)}</th>`).join('')}</tr>`,
    rowsArr:linhas.map((l,ix)=>`<tr${d.tot&&ix===linhas.length-1?' style="font-weight:800"':''}>${l.map((v,i)=>`<td style="${d.cab[i].d?'text-align:right':''}">${fe(v)}</td>`).join('')}</tr>`)});
}

/* ═══════════════ PARÂMETROS ═══════════════ */
function telaParametros(){
  const c=CFG(),ra=rateio(c),pr=c.precos;
  const f=(cam,l,v,extra)=>`<div class="fin-fld"><label>${l}</label><input data-cfg="${cam}" value="${fe(v==null?'':String(v).replace('.',','))}" ${extra||''}></div>`;
  const mo=(cam,l,v)=>`<div class="fin-fld"><label>${l} (R$)</label><input data-cfg="${cam}" data-mask="moeda" value="${fe(R(num(v)))}"></div>`;
  return cabG('Parâmetros e preços','A base de todos os cálculos: preço dos insumos, características dos materiais, equipe, betoneira e os custos que são rateados por m³ de concreto produzido.',
      `<button type="button" class="gf-bt pri" data-pm="cfg-salvar"><i class="fas fa-floppy-disk"></i> Salvar parâmetros</button>`)+
    `<div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Preços dos insumos</h3><p>Atualizados também pelas compras (Estoque › Entrada de insumo).</p></div></div><div class="fin-linha">
       ${mo('precos.cimento','Cimento — saco de 50 kg',pr.cimento)}${mo('precos.areia','Areia — m³',pr.areia)}${mo('precos.po','Pó de pedra — m³',pr.po)}${mo('precos.brita','Brita 0 — m³',pr.brita)}
       ${mo('precos.aco50','Aço CA-50 — kg',pr.aco50)}${mo('precos.aco60','Aço CA-60 — kg',pr.aco60)}${mo('precos.malha','Malha POP — painel 2 × 3 m',pr.malha)}${mo('precos.arame','Arame recozido — kg',pr.arame)}
       ${mo('precos.aditivo','Aditivo — kg',pr.aditivo)}${mo('precos.desmoldante','Desmoldante — litro',pr.desmoldante)}${mo('precos.agua','Água — m³',pr.agua)}${mo('precos.energia','Energia — kWh',pr.energia)}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Rateio previsto por m³</h3><p>Quanto cada m³ de concreto carrega de mão de obra, equipamento, energia, água e custos fixos.</p></div></div>
       <table class="pm-tab" data-sem-ordem><tbody><tr><td>Mão de obra</td><td class="n">${R(ra.mao)}</td></tr><tr><td>Betoneira (depreciação + manutenção)</td><td class="n">${R(ra.betoneira)}</td></tr><tr><td>Energia (${nf(ra.kwh,2)} kWh/m³)</td><td class="n">${R(ra.energia)}</td></tr><tr><td>Água de cura</td><td class="n">${R(ra.agua)}</td></tr><tr><td>Custos fixos</td><td class="n">${R(ra.fixos)}</td></tr><tr class="t"><td>Total por m³ (sem materiais)</td><td class="n">${R(ra.total)}</td></tr></tbody></table>
       <div class="fin-linha" style="margin-top:12px">${f('prod_m3','Produção prevista por mês (m³)',c.prod_m3,'inputmode="decimal"')}${f('equipe.pessoas','Pessoas na produção',c.equipe.pessoas,'inputmode="numeric"')}${mo('equipe.custo','Custo mensal por pessoa (com encargos)',c.equipe.custo)}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Betoneira e vibrador</h3><p>Energia por m³ = potência × tempo das traçadas; depreciação pela vida útil.</p></div></div><div class="fin-linha">
       ${f('betoneira.cap','Capacidade da betoneira (litros)',c.betoneira.cap,'inputmode="numeric"')}${f('betoneira.util','Aproveitamento por traçada (%)',c.betoneira.util)}${f('betoneira.kw','Potência da betoneira (kW)',c.betoneira.kw,'inputmode="decimal"')}${f('betoneira.min','Minutos por traçada',c.betoneira.min,'inputmode="decimal"')}
       ${mo('betoneira.valor','Valor da betoneira',c.betoneira.valor)}${f('betoneira.vida','Vida útil (meses)',c.betoneira.vida,'inputmode="numeric"')}${mo('betoneira.manut','Manutenção por mês',c.betoneira.manut)}
       ${f('vibrador.kw','Potência do vibrador (kW)',c.vibrador.kw,'inputmode="decimal"')}${f('vibrador.min','Minutos de vibração por m³',c.vibrador.min,'inputmode="decimal"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Custos fixos mensais (rateados)</h3><p>Aluguel, manutenção de formas, EPIs… divididos pela produção prevista.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-fixo-add"><i class="fas fa-plus"></i> Custo fixo</button></div>
       <div data-fixos>${(c.fixos||[]).map((x,i)=>`<div class="fin-linha" data-fixo style="margin-bottom:6px;grid-template-columns:1fr 160px 36px"><div class="fin-fld"><input data-fx="nome" value="${fe(x.nome||'')}" placeholder="Descrição"></div><div class="fin-fld"><input data-fx="valor" data-mask="moeda" value="${fe(R(num(x.valor)))}"></div><button type="button" class="pm-x" data-pm="cfg-fixo-x"><i class="fas fa-xmark"></i></button></div>`).join('')}</div>
       <div class="fin-linha" style="margin-top:10px">${f('impostos','Impostos sobre a venda (%)',c.impostos)}${f('margem','Margem desejada (%)',c.margem)}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Materiais e perdas</h3><p>Massas específicas (traço) e unitárias (compra em m³), perdas e consumos.</p></div></div><div class="fin-linha">
       ${f('dens.cimento','Massa específica do cimento (t/m³)',c.dens.cimento,'inputmode="decimal"')}${f('dens.areia','Massa específica da areia (t/m³)',c.dens.areia,'inputmode="decimal"')}${f('dens.po','Massa específica do pó de pedra (t/m³)',c.dens.po,'inputmode="decimal"')}${f('dens.brita','Massa específica da brita (t/m³)',c.dens.brita,'inputmode="decimal"')}
       ${f('unit.areia','Massa unitária da areia (t/m³)',c.unit.areia,'inputmode="decimal"')}${f('unit.po','Massa unitária do pó de pedra (t/m³)',c.unit.po,'inputmode="decimal"')}${f('unit.brita','Massa unitária da brita (t/m³)',c.unit.brita,'inputmode="decimal"')}${f('ar','Ar incorporado no concreto (%)',c.ar)}
       ${f('perdas.concreto','Perda de concreto (%)',c.perdas.concreto)}${f('perdas.aco','Perda de aço — pontas e transpasse (%)',c.perdas.aco)}${f('perdas.malha','Perda / transpasse de malha (%)',c.perdas.malha)}${f('arame_pct','Arame de amarração (% do aço)',c.arame_pct)}
       ${f('cura_l','Água de cura (litros por m³)',c.cura_l,'inputmode="decimal"')}${f('desm_lm2','Desmoldante (litros por m² de forma)',c.desm_lm2,'inputmode="decimal"')}${f('malha_m2','Área do painel de malha (m²)',c.malha_m2,'inputmode="decimal"')}
       ${f('massa.simples','Peso do concreto simples (kg/m³)',c.massa.simples,'inputmode="numeric"')}${f('massa.armado','Peso do concreto armado (kg/m³)',c.massa.armado,'inputmode="numeric"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Estoque mínimo e caixa</h3><p>Abaixo do mínimo, o painel avisa. Saldo inicial do caixa da fábrica.</p></div></div><div class="fin-linha">
       ${INS.map(i=>f('minimos.'+i.k,`${i.nome.split(' (')[0]} — mínimo (${i.unL})`,(c.minimos||{})[i.k],'inputmode="decimal"')).join('')}
       ${mo('saldo_inicial','Saldo inicial do caixa',c.saldo_inicial)}<div class="fin-fld"><label>Data do saldo inicial</label><input type="date" data-cfg="saldo_data" value="${fe(c.saldo_data||'')}"></div></div></section></div>
    <div style="display:flex;justify-content:flex-end"><button type="button" class="gf-bt pri" data-pm="cfg-salvar"><i class="fas fa-floppy-disk"></i> Salvar parâmetros</button></div>`;
}
function addFixo(){const box=document.querySelector('#pm-app [data-fixos]');if(!box)return;box.insertAdjacentHTML('beforeend',`<div class="fin-linha" data-fixo style="margin-bottom:6px;grid-template-columns:1fr 160px 36px"><div class="fin-fld"><input data-fx="nome" placeholder="Descrição"></div><div class="fin-fld"><input data-fx="valor" data-mask="moeda" placeholder="R$ 0,00"></div><button type="button" class="pm-x" data-pm="cfg-fixo-x"><i class="fas fa-xmark"></i></button></div>`);}
function tirarFixo(b){const d=b.closest('[data-fixo]');if(d)d.remove();}
async function salvarParametros(){
  const box=document.getElementById('pm-app'),c=JSON.parse(JSON.stringify(CFG()));
  box.querySelectorAll('[data-cfg]').forEach(e=>{const path=e.dataset.cfg.split('.'),v=e.type==='date'?e.value:num(e.value);let o=c;for(let i=0;i<path.length-1;i++){o[path[i]]=o[path[i]]||{};o=o[path[i]];}o[path[path.length-1]]=v;});
  c.fixos=[...box.querySelectorAll('[data-fixo]')].map(d=>({nome:d.querySelector('[data-fx="nome"]').value.trim(),valor:r2(num(d.querySelector('[data-fx="valor"]').value))})).filter(x=>x.nome||x.valor);
  if(!(num(c.prod_m3)>0))return toast('Informe a produção prevista por mês (m³): é a base do rateio.','error');
  const r=cfgRow();
  try{await gravar(r?{...r,cfg:c}:{tipo:'config',cfg:c,data_lancamento:todayDateTime()},r?r.rowid:null);toast('Parâmetros salvos: os custos das peças foram recalculados.','success');}catch(e){toast(e.message,'error',false);}
}

window.PM_FABRICA={calc,geo,traco1m3,rateio,estoquePecas,estoqueInsumos,CFG,render,irAba,resumoMes,necessidade,caixaMes};
})();
