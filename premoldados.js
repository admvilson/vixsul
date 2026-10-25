/* ═══════════════════════════════════════════════════════════════════════════════════════════════════
   PRÉ-MOLDADOS — a fábrica de peças de concreto, à parte das obras (versão 2)
   ───────────────────────────────────────────────────────────────────────────────────────────────────
   Tabela "premoldados" (row_data.tipo):
     config      → parâmetros (preços, equipe, betoneira, rateio, impostos, margem, sinal, equipe da fábrica,
                   situação dos tipos do catálogo: ativo / oculto / excluído)
     tipo_custom → tipos de peça criados pela empresa (os do catálogo vêm de pm-catalogo.js)
     traco       → traços próprios (os padrão vêm do catálogo)
     peca        → peça da empresa = tipo do catálogo + medidas (armadura, forma e traço saem do tipo)
     ordem       → ordem de produção (pode estar ligada a uma venda)
     producao    → diário do dia (turno, clima, equipe presente, betonadas, ocorrência e itens produzidos)
     venda       → pronta entrega ou encomenda; pagamentos (sinal 25%, quitação, estorno), entrega, devolução
     cliente     → cadastro dos clientes (varejo / atacado)
     compra · ajuste · custo · avaria
   Regras de venda: encomenda só reserva com o sinal (25%); reservada sem peça pronta gera a ordem de produção
   (uma vez); só entrega pronta e paga; pronta entrega só paga; cancelar só o Administrador e só sem produção
   iniciada; editar com produção iniciada não pode; devolução com estorno; avarias medem as perdas.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if(typeof GS==='undefined'||typeof Fin==='undefined'||typeof UI==='undefined'||typeof App==='undefined'||!window.PM_CAT)return;
const CAT=window.PM_CAT;
const U=Fin.util,{janela,confirmar,executar,salvar,excluir,fe,dt,brDe,isoDe,hoje0,addD,dias}=U;
const {kpiG,cabG,fmtN,mesKey,mesHoje,mesDesloc,mesNome,mesCurto,cap}=GS;
const ABA='Pré-moldados';
// número guardado vale como está; texto digitado segue a máscara do sistema (0.341 com três casas não vira 341)
const num=s=>{if(typeof s==='number')return isFinite(s)?s:0;if(s==null||s==='')return 0;const n=(typeof Mascara!=='undefined'?Mascara.numero(s):parseFloat(String(s).replace(',','.')));return n==null||!isFinite(n)?0:n;};
const r2=n=>Math.round((+n||0)*100)/100;
const nf=(v,c)=>fmtN(v,c==null?2:c);
const R=v=>fmt(r2(v));
const hojeISO=()=>isoDe(hoje0());
const pill=(t,c,ico)=>`<span class="vk-pill ${c||''}">${ico?`<i class="fas ${ico}"></i>`:''}${t}</span>`;
const pode=()=>GS.pode('premoldados');
const ehAdm=()=>{const s=Auth._session||{};return UI._ehAdmin(s.perfil);};
const eu=()=>{const s=Auth._session||{};return s.nome||'Usuário';};

/* ═══════════════ PARÂMETROS PADRÃO ═══════════════ */
const INS=[
  {k:'cimento',nome:'Cimento',un:'sc',unL:'saco de 50 kg'},{k:'areia',nome:'Areia média',un:'m³',unL:'m³'},
  {k:'po',nome:'Pó de pedra',un:'m³',unL:'m³'},{k:'brita',nome:'Brita 0 (pedrisco)',un:'m³',unL:'m³'},
  {k:'aco50',nome:'Aço CA-50 (6,3 mm ou mais)',un:'kg',unL:'kg'},{k:'aco60',nome:'Aço CA-60 (4,2 a 6,0 mm)',un:'kg',unL:'kg'},
  {k:'malha',nome:'Malha POP (painel 2 × 3 m)',un:'pç',unL:'painel'},{k:'arame',nome:'Arame recozido',un:'kg',unL:'kg'},
  {k:'aditivo',nome:'Aditivo plastificante',un:'kg',unL:'kg'},{k:'desmoldante',nome:'Desmoldante',un:'L',unL:'litro'}];
const insDe=k=>INS.find(i=>i.k===k)||{k,nome:k,un:'',unL:''};
const CFG0={
  precos:{cimento:38,areia:120,po:95,brita:130,aco50:7.5,aco60:8.5,malha:95,arame:18,aditivo:14,desmoldante:12,agua:12,energia:0.95},
  dens:{cimento:3.10,areia:2.62,po:2.70,brita:2.70},unit:{areia:1.45,po:1.55,brita:1.45},ar:2,
  massa:{simples:2300,armado:2500},equipe:{pessoas:3,custo:2800},prod_m3:30,
  betoneira:{cap:400,util:70,kw:1.5,min:6,valor:3500,vida:60,manut:100},vibrador:{kw:1.1,min:20},
  cura_l:150,desm_lm2:0.05,malha_m2:6,arame_pct:1.5,perdas:{concreto:5,aco:8,malha:10},
  fixos:[{nome:'Aluguel do galpão / pátio',valor:0},{nome:'Manutenção de formas',valor:150},{nome:'EPIs e ferramentas',valor:80}],
  impostos:6,margem:30,sinal:25,lata:18,cidade:'',uf:'BA',
  minimos:{cimento:20,areia:2,po:2,brita:2,aco50:50,aco60:50,malha:5,arame:5,aditivo:0,desmoldante:5},
  saldo_inicial:0,saldo_data:'',equipe_lista:[],tipos_status:{}};
const LEGADO_TR={'p:estrutural':'p:c25','p:po':'p:c20','p:micro':'p:micro','p:seco':'p:c10s'};
const BITOLAS=[4.2,5.0,6.0,6.3,8.0,10.0,12.5,16.0];
const kgm=d=>0.006165*d*d;
const ehCA60=d=>+d<6.3;
const FASES_V=[{k:'sinal',rot:'Aguardando sinal',cor:'#B54708',ico:'fa-hourglass-start'},{k:'producao',rot:'Reservado · em produção',cor:'#7F56D9',ico:'fa-industry'},
  {k:'pagamento',rot:'Pronto · falta pagar',cor:'#DC6803',ico:'fa-hand-holding-dollar'},{k:'liberado',rot:'Pago · liberado para entrega',cor:'#1652D8',ico:'fa-truck-ramp-box'},
  {k:'entregue',rot:'Entregue',cor:'#067647',ico:'fa-circle-check'}];
const ORIG_AV={patio:'Pátio / estoque',desforma:'Na desforma',carregamento:'No carregamento',transporte:'No transporte / entrega',cliente:'Devolvida avariada pelo cliente',outra:'Outra'};
const AV_ESTOQUE=['patio','desforma','carregamento','transporte','outra'];
const TURNOS=['Dia inteiro','Manhã','Tarde','Noite'],CLIMAS=['Sol','Nublado','Chuva fraca','Chuva forte'];
const OCORR=['Nenhuma','Falta de material','Chuva parou a produção','Betoneira / equipamento quebrado','Falta de energia','Falta de água','Falta de pessoal','Outra'];
const FUNCOES=['Encarregado','Pedreiro','Armador','Operador de betoneira','Servente','Ajudante','Motorista'];
const FORMAS_PG=['Pix','Dinheiro','Transferência','Boleto','Cartão de débito','Cartão de crédito','Cheque'];

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
async function salvarCfg(mudar){const r=cfgRow(),c=r&&r.cfg?JSON.parse(JSON.stringify(r.cfg)):{};mudar(c);await gravar(r?{...r,cfg:c}:{tipo:'config',cfg:c,data_lancamento:todayDateTime()},r?r.rowid:null);}
// tipos do catálogo + os criados pela empresa
const tiposTodos=()=>CAT.TIPOS.concat(T('tipo_custom').map(r=>({k:'u'+r.rowid,nome:r.nome||'Tipo novo',g:r.g||'design',f:r.f||'manual',arm:r.arm||'nenhuma',tr:r.tr||'c25',cura:num(r.cura)||7,d:r.d||{},tam:r.tam||[],uso:r.uso||'',custom:true,reg:r})));
// peças da versão 1 (antes do catálogo): forma + medidas + ferro informados à mão — continuam valendo como estão
const FORMA_V1={retangular:'prisma',vazado:'bloco',cilindro:'tubo',tubo:'tubo',trapezio:'trapezio',manual:'manual'};
const tipoV1=f=>({k:'v1:'+f,nome:'Peça própria (cadastro antigo)',g:'design',f:CAT.FAM[f]?f:'manual',arm:'v1',tr:'c25',cura:7,d:{},tam:[],uso:'Cadastrada antes do catálogo: a armadura é a que foi informada no cadastro.'});
function dimsV1(p){const d=p.dims||{},g=k=>num(d[k]);
  switch(p.forma){case 'vazado':return {c:g('c'),l:g('l'),a:g('a'),vz:g('vazio')};case 'cilindro':return {di:0,esp:g('d')/2,comp:g('h')};
    case 'tubo':return {di:Math.max(0,g('de')-2*g('esp')),esp:g('esp'),comp:g('comp')};case 'manual':return {v:g('v'),area:g('as')};default:return {...d};}}
const pecaN=p=>p&&!p.tipo_k&&p.forma?{...p,tipo_k:'v1:'+(FORMA_V1[p.forma]||'manual'),dims:dimsV1(p)}:p;
const tipoK=k=>String(k||'').startsWith('v1:')?tipoV1(String(k).slice(3)):(tiposTodos().find(t=>t.k===k)||null);
const statusTipo=(k,c)=>((c||CFG()).tipos_status||{})[k]||'ativo';
const tipoDePeca=p=>tipoK(p&&p.tipo_k)||CAT.tipoDe('outra');
const grupoDe=k=>CAT.GRUPOS.find(g=>g.k===k)||{k,rot:k,ico:'fa-cube',cor:'#667085'};
// traços: os padrão do catálogo + os próprios
const tracos=()=>Object.entries(CAT.TR).map(([k,t])=>({...t,id:'p:'+k,padrao:true})).concat(T('traco').map(r=>({id:String(r.rowid),nome:r.nome||'Traço',ar:num(r.ar),po:num(r.po),br:num(r.br),ac:num(r.ac)||0.5,ad:num(r.ad),vz:num(r.vz),uso:r.uso||'',reg:r})));
const tracoDe=id=>{id=LEGADO_TR[id]||id;return tracos().find(t=>t.id===String(id))||tracos().find(t=>t.id==='p:c25');};
const tracoDaPeca=p=>tracoDe(p.traco||('p:'+tipoDePeca(p).tr));
const pecas=()=>T('peca').map(pecaN).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
const pecaDe=id=>pecaN(T('peca').find(p=>String(p.rowid)===String(id)))||null;
const nomePeca=id=>{const p=pecaDe(id);return p?p.nome:'(peça excluída)';};
const ordens=()=>T('ordem');
const vendas=()=>T('venda').map(v=>v.status==='pedido'?{...v,status:'reservado'}:v.status==='recebida'?{...v,status:'entregue'}:v);
const vendaDe=id=>vendas().find(v=>String(v.rowid)===String(id))||null;
async function gravar(o,rowid){
  try{await executar(()=>salvar(ABA,o,rowid||null));}
  catch(e){throw traduzir(e);}
}
// várias gravações com uma recarga só no fim
async function gravarVarios(ops){
  try{await executar(async()=>{for(const [o,id] of ops)await salvar(ABA,o,id||null);});}catch(e){throw traduzir(e);}
}
function traduzir(e){return /premoldados|pré-moldados|does not exist|schema cache|relation|could not find the table/i.test(String(e&&e.message))?new Error('A tabela da fábrica ainda não existe no banco: rode o passo 6 no Supabase (arquivo seguranca/passo-6-premoldados.sql).'):e;}
// antes de excluir: o que depende deste registro (se houver, a exclusão é bloqueada e a lista aparece)
function depsExcluir(reg){
  const id=String(reg.rowid),E=estoque(),d=[];
  if(reg.tipo==='peca'){const nP=T('producao').filter(r=>itensProd(r).some(it=>String(it.peca)===id)).length,nV=vendas().filter(v=>(v.itens||[]).some(it=>String(it.peca)===id)).length,nO=ordens().filter(o=>String(o.peca)===id).length,nA=T('avaria').filter(a=>String(a.peca)===id).length+T('ajuste').filter(a=>a.item==='peca:'+id).length;
    if(nP)d.push({ok:false,txt:`${nP} dia(s) de produção com esta peça`});if(nV)d.push({ok:false,txt:`${nV} venda(s) com esta peça`});if(nO)d.push({ok:false,txt:`${nO} ordem(ns) de produção`});if(nA)d.push({ok:false,txt:`${nA} avaria(s) ou acerto(s) de estoque`});
    if(d.length)d.push({ok:true,txt:'A peça tem histórico: em vez de excluir, edite (mude o nome ou o preço) — o histórico de custos e vendas continua certo.'});}
  if(reg.tipo==='producao'){const h=hoje0(),ls=lotes().filter(l=>String(l.r.rowid)===id);
    ls.forEach(l=>{const ne=ensaiosDe(l.lote).length;if(ne)d.push({ok:false,txt:`Lote ${l.lote} tem ${ne} ensaio(s) registrado(s)`});
      const p=pecaDe(l.peca),lib=addD(dt(l.data)||h,num(p&&p.cura!=null&&p.cura!==''?p.cura:tipoDePeca(p||{}).cura||7))<=h,x=E.P[l.peca]||{disp:0,res:0};
      if(lib&&x.disp-l.qtd<0)d.push({ok:false,txt:`${fe(nomePeca(l.peca))}: as ${nf(l.qtd,0)} peças deste dia já saíram em vendas — excluir deixaria o estoque negativo`});
      else if(lib&&x.disp-l.qtd<x.res)d.push({ok:false,txt:`${fe(nomePeca(l.peca))}: as peças deste dia estão reservadas para vendas`});});}
  if(reg.tipo==='compra'){const ei=estoqueInsumos(),x=ei[reg.insumo];if(x&&x.saldo-num(reg.qtd)<-1e-6)d.push({ok:false,txt:`${fe(insDe(reg.insumo).nome)}: esta compra já foi consumida pela produção (saldo ficaria ${nf(x.saldo-num(reg.qtd),2)} ${insDe(reg.insumo).un})`});}
  if(reg.tipo==='ajuste'&&num(reg.qtd)>0){const it=String(reg.item||'');if(it.startsWith('peca:')){const x=E.P[it.slice(5)]||{disp:0};if(x.disp-num(reg.qtd)<0)d.push({ok:false,txt:'As peças deste acerto já saíram do estoque'});}
    else{const x=estoqueInsumos()[it.slice(7)];if(x&&x.saldo-num(reg.qtd)<-1e-6)d.push({ok:false,txt:'O insumo deste acerto já foi consumido pela produção'});}}
  if(reg.tipo==='cliente'){const ab=vendas().filter(v=>String(v.cliente||'').trim().toLowerCase()===String(reg.nome||'').trim().toLowerCase()&&['aguardando_sinal','reservado'].includes(v.status)).length;if(ab)d.push({ok:false,txt:`${ab} venda(s) em aberto deste cliente`});}
  return d.some(x=>!x.ok)?d:null;
}
async function apagarReg(reg,rotulo,depois){
  if(GS.podeMexer&&!GS.podeMexer(reg))return toast(GS.MSG_DONO,'error');
  const dp=depsExcluir(reg);if(dp)return trava(`Não dá para excluir: ${rotulo}`,dp);
  confirmar('Excluir?',`<b>${fe(rotulo)}</b> será excluído de vez. Não tem como desfazer.`,'Sim, excluir',async()=>{await executar(()=>excluir(ABA,reg.rowid));toast('Excluído.','success');if(depois)depois();});
}
const proxNum=(tipo,campo)=>T(tipo).reduce((m,r)=>Math.max(m,parseInt(String(r[campo]||'').replace(/\D/g,''),10)||0),0)+1;
const proxCodigo=()=>'PM-'+String(proxNum('peca','codigo')).padStart(3,'0');

/* ═══════════════ ENGENHARIA ═══════════════ */
const armLigada=(p,t)=>t.arm!=='nenhuma'&&(p.armadura===true||(p.armadura!==false&&t.armPad!==false));
function armPeca(p){p=pecaN(p);const t=tipoDePeca(p);
  if(t.arm==='v1'){const o={tipo:'v1',barras:[],malha:null,cob:0,obs:'',kgExtra:0};if(!armLigada(p,t))return o;
    (p.barras||[]).forEach(b=>{const d=+b.d||0,q=num(b.q),l=num(b.l);if(d&&q&&l)o.barras.push({t:b.t==='e'?'e':'b',d,q,l,dob:'',txt:b.t==='e'?'estribos (informados no cadastro)':'barras (informadas no cadastro)'});});
    if(p.malha&&p.malha.usa){const g=geoPeca(p);o.malha={m2:num(p.malha.area)||g.face,camadas:Math.max(1,num(p.malha.camadas)||1),txt:'malha POP (informada no cadastro)'};}
    if(o.barras.length||o.malha)o.cob=1.5;return o;}
  return CAT.armadura(t,p.dims||{},armLigada(p,t));}
function geoPeca(p){p=pecaN(p);const t=tipoDePeca(p),g=CAT.geo(t,p.dims||{}),aj=num(p.ajuste);return aj>0&&aj!==1?{...g,V:g.V*aj,aj}:g;}
function traco1m3(t,c){
  const den=1/c.dens.cimento+(t.ar||0)/c.dens.areia+(t.po||0)/c.dens.po+(t.br||0)/c.dens.brita+(t.ac||0);
  const C=den>0?1000*(1-(+c.ar||0)/100)*(1-(+t.vz||0)/100)/den:0;
  return {cimento:C,areia:C*(t.ar||0),po:C*(t.po||0),brita:C*(t.br||0),agua:C*(t.ac||0),aditivo:C*(t.ad||0)/100};
}
function rateio(c){
  const m3=Math.max(0.1,num(c.prod_m3)),b=c.betoneira,v=c.vibrador,pr=c.precos;
  const lPorTr=Math.max(1,num(b.cap)*num(b.util)/100),kwh=num(b.kw)*num(b.min)/60*(1000/lPorTr)+num(v.kw)*num(v.min)/60;
  const fixos=(c.fixos||[]).reduce((s,x)=>s+num(x.valor),0);
  const o={mao:num(c.equipe.pessoas)*num(c.equipe.custo)/m3,betoneira:(num(b.valor)/Math.max(1,num(b.vida))+num(b.manut))/m3,energia:kwh*num(pr.energia),agua:num(c.cura_l)/1000*num(pr.agua),fixos:fixos/m3,kwh};
  o.total=o.mao+o.betoneira+o.energia+o.agua+o.fixos;return o;
}
function calc(p,n,c){p=pecaN(p);
  c=c||CFG();n=Math.max(0,+n||0)||1;
  const t=tipoDePeca(p),g=geoPeca(p),tr=tracoDaPeca(p),pc=c.perdas,pr=c.precos,arm=armPeca(p);
  const perdaC=p.perda!==''&&p.perda!=null&&!isNaN(+p.perda)?+p.perda:num(pc.concreto);
  const Vc=g.V*(1+perdaC/100)*n,k=traco1m3(tr,c);
  const kg={cimento:k.cimento*Vc,areia:k.areia*Vc,po:k.po*Vc,brita:k.brita*Vc,aditivo:k.aditivo*Vc},aguaL=k.agua*Vc;
  const porBitola={};let kg50=0,kg60=0;const fa=1+num(pc.aco)/100;
  (arm.barras||[]).forEach(b=>{const d=+b.d||0,q=num(b.q),l=num(b.l)/100;if(!q||!l)return;const m=q*l*n*fa,k2=m*(b.kgm||kgm(d));
    const chave=b.t==='t'?'treliça':String(d),x=porBitola[chave]=porBitola[chave]||{d,m:0,kg:0,trelica:b.t==='t'};x.m+=m;x.kg+=k2;if(b.t==='t'||ehCA60(d))kg60+=k2;else kg50+=k2;});
  Object.values(porBitola).forEach(x=>x.barras=Math.ceil(x.m/12-1e-9));
  if(arm.kgExtra){const k3=arm.kgExtra*n*fa;if(t.arm==='projeto')kg50+=k3;else kg60+=k3;}
  const malhaM2=arm.malha?arm.malha.m2*arm.malha.camadas*n*(1+num(pc.malha)/100):0;
  const arameKg=(kg50+kg60)*num(c.arame_pct)/100,desmL=g.sup*num(c.desm_lm2)*n;
  const est={cimento:kg.cimento/50,areia:kg.areia/(num(c.unit.areia)*1000||1450),po:kg.po/(num(c.unit.po)*1000||1550),brita:kg.brita/(num(c.unit.brita)*1000||1450),
    aco50:kg50,aco60:kg60,malha:malhaM2/(num(c.malha_m2)||6),arame:arameKg,aditivo:kg.aditivo,desmoldante:desmL};
  Object.keys(est).forEach(x=>{if(!(est[x]>1e-9))delete est[x];});
  const custoMat={};Object.entries(est).forEach(([x,q])=>custoMat[x]=q*num(pr[x]));custoMat.agua=aguaL/1000*num(pr.agua);
  const mat=Object.values(custoMat).reduce((s,v)=>s+v,0),ra=rateio(c),Vn=g.V*n;
  const custo={mat,mao:ra.mao*Vn,betoneira:ra.betoneira*Vn,energia:ra.energia*Vn,agua:ra.agua*Vn,fixos:ra.fixos*Vn};
  custo.total=custo.mat+custo.mao+custo.betoneira+custo.energia+custo.agua+custo.fixos;
  const un=custo.total/n,sug=un*(1+num(c.margem)/100)/Math.max(0.01,1-num(c.impostos)/100);
  const preco=num(p.preco),margem=preco>0?(preco*(1-num(c.impostos)/100)-un)/preco*100:null;
  const armado=kg50+kg60>0||malhaM2>0;
  return {t,g,tr,arm,n,V:g.V,Vt:Vn,Vc,peso:g.V*(armado?num(c.massa.armado):num(c.massa.simples)),kg,aguaL,est,porBitola,kg50,kg60,malhaM2,custoMat,custo,un,sug,preco,margem,kwh:ra.kwh*Vn,k};
}
// a "receita" do traço em linguagem de canteiro: por saco de cimento e por betonada, em latas de 18 litros
function receita(tr,c){
  c=c||CFG();const k=traco1m3(tr,c);if(!k.cimento)return null;const lata=num(c.lata)||18,meia=v=>Math.round(v*2)/2;
  const L=(x,un)=>50*x/(num(un)||1.45);
  const porSaco={areia:L(tr.ar||0,c.unit.areia),po:L(tr.po||0,c.unit.po),brita:L(tr.br||0,c.unit.brita),agua:50*(tr.ac||0),aditivo:50*(tr.ad||0)/100};
  const litrosPorSaco=50/k.cimento*1000,util=num(c.betoneira.cap)*num(c.betoneira.util)/100,sacosBet=Math.max(0.5,Math.floor(util/litrosPorSaco*2)/2);
  const latas={areia:meia(porSaco.areia/lata),po:meia(porSaco.po/lata),brita:meia(porSaco.brita/lata),agua:meia(porSaco.agua/lata)};
  return {k,lata,porSaco,latas,litrosPorSaco,sacosBet,seco:!!tr.seco};
}
const fracao=v=>{const i=Math.floor(v),f=v-i;return f>=0.5?(i?i+' e meia':'meia'):String(i||0);};

/* ═══════════════ ESTOQUE E VENDAS (situação calculada) ═══════════════ */
const itensProd=r=>Array.isArray(r.itens)&&r.itens.length?r.itens:(r.peca?[{peca:r.peca,ordem:r.ordem,qtd:r.qtd,refugo:r.refugo,consumo:r.consumo,custo_un:r.custo_un,custo_mat_un:r.custo_mat_un,m3:r.m3}]:[]);
// equipe do dia: lista de nomes (na versão 1 era um texto livre, ex.: "João e Pedro")
const eqLista=r=>Array.isArray(r.equipe)?r.equipe:(r.equipe?String(r.equipe).split(/,|\s+e\s+/).map(s=>s.trim()).filter(Boolean):[]);
const prodDaOrdem=id=>T('producao').reduce((s,r)=>s+itensProd(r).filter(it=>String(it.ordem||'')===String(id)).reduce((a,it)=>a+num(it.qtd),0),0);
const opIniciada=o=>o.status==='producao'||o.status==='concluida'||prodDaOrdem(o.rowid)>0;
const opsDaVenda=v=>ordens().filter(o=>String(o.venda||'')===String(v.rowid)&&o.status!=='cancelada');
function brutoVenda(v){return (v.itens||[]).reduce((s,it)=>s+num(it.qtd)*num(it.preco),0);}
function descontoVenda(v){return v.desconto_pct!=null&&v.desconto_pct!==''?r2(brutoVenda(v)*num(v.desconto_pct)/100):num(v.desconto);}
function totalVenda(v){return r2(brutoVenda(v)-descontoVenda(v)+num(v.frete));}
function pagoDe(v){return r2((v.pagamentos||[]).reduce((s,p)=>s+(p.tipo==='estorno'?-1:1)*num(p.valor),0)+(v.pagamentos?0:(v.status==='entregue'&&v.recebido_em?totalVenda(v):0)));}
function estoque(){
  const P={},h=hoje0(),g=id=>P[id]=P[id]||{prod:0,refugo:0,cura:0,lib:0,ent:0,dev:0,aj:0,av:0,res:0,emProd:0,custo:0,custoMat:0};
  T('producao').forEach(r=>itensProd(r).forEach(it=>{const p=pecaDe(it.peca),x=g(String(it.peca)),q=num(it.qtd);x.prod+=q;x.refugo+=num(it.refugo);x.custo+=q*num(it.custo_un);x.custoMat+=q*num(it.custo_mat_un);
    const lib=addD(dt(r.data)||h,num(p&&p.cura!=null&&p.cura!==''?p.cura:tipoDePeca(p||{}).cura||7));if(lib>h)x.cura+=q;else x.lib+=q;}));
  const vs=vendas();
  vs.forEach(v=>{if(v.status==='cancelada')return;(v.itens||[]).forEach(it=>{const x=g(String(it.peca)),q=num(it.qtd);if(v.status==='entregue'||v.status==='devolvida')x.ent+=q;else if(v.status==='reservado')x.res+=q;});
    (v.devolucoes||[]).forEach(dv=>(dv.itens||[]).forEach(it=>{if(it.destino==='estoque')g(String(it.peca)).dev+=num(it.qtd);}));});
  T('ajuste').forEach(a=>{if(String(a.item||'').startsWith('peca:'))g(a.item.slice(5)).aj+=num(a.qtd);});
  T('avaria').forEach(a=>{if(avariaTiraEstoque(a))g(String(a.peca)).av+=num(a.qtd);});
  ordens().forEach(o=>{if(o.status==='planejada'||o.status==='producao')g(String(o.peca)).emProd+=Math.max(0,num(o.qtd)-prodDaOrdem(o.rowid));});
  Object.entries(P).forEach(([id,x])=>{x.disp=x.lib-x.ent+x.dev+x.aj-x.av;x.livre=x.disp-x.res;const p=pecaDe(id);
    const cc=p?calc(p,1):null;x.custoUn=x.prod>0?x.custo/x.prod:(cc?cc.un:0);x.custoMatUn=x.prod>0&&x.custoMat>0?x.custoMat/x.prod:(cc?cc.custo.mat:0);});
  // reservas atendidas pela ordem de chegada (data do pedido): quem reservou antes recebe a peça pronta antes
  const saldo={};Object.entries(P).forEach(([id,x])=>saldo[id]=Math.max(0,x.disp));const aloc={};
  vs.filter(v=>v.status==='reservado').sort((a,b)=>String(a.data||'').localeCompare(String(b.data||''))||(num(a.numero)-num(b.numero))).forEach(v=>{
    aloc[v.rowid]={};(v.itens||[]).forEach((it,i)=>{const id=String(it.peca),q=num(it.qtd),a=Math.min(q,saldo[id]||0);aloc[v.rowid][i]=a;saldo[id]=(saldo[id]||0)-a;});});
  // saída média (últimos 60 dias) para o ponto de reposição
  const d60=addD(h,-60);vs.forEach(v=>{if((v.status==='entregue'||v.status==='devolvida')&&dt(v.entrega)&&dt(v.entrega)>=d60)(v.itens||[]).forEach(it=>{g(String(it.peca)).saida60=(g(String(it.peca)).saida60||0)+num(it.qtd);});});
  return {P,aloc};
}
function faseVenda(v,E){
  if(v.status==='cancelada'||v.status==='devolvida'||v.status==='entregue')return v.status;
  if(v.status==='aguardando_sinal')return 'sinal';
  const a=(E||estoque()).aloc[v.rowid]||{},pronto=(v.itens||[]).every((it,i)=>(a[i]||0)>=num(it.qtd));
  if(!pronto)return 'producao';return pagoDe(v)>=totalVenda(v)-0.009?'liberado':'pagamento';
}
// status de reposição de cada peça: crítico (pedido sem peça livre), produzir (abaixo do ponto de reposição), ok
function reposicao(p,x){
  x=x||{disp:0,livre:0,emProd:0,saida60:0};const t=tipoDePeca(p),cura=num(p.cura!=null&&p.cura!==''?p.cura:t.cura||7);
  const dia=(x.saida60||0)/60,cap=Math.max(1,num(p.formas||1)*num(p.ciclo||1)),prazo=cura+Math.ceil(Math.max(1,dia*cura)/cap);
  const ponto=Math.ceil(dia*prazo)+num(p.minimo),projetado=x.livre+x.emProd;
  const sug=Math.max(0,Math.ceil(ponto+dia*30-projetado));
  if(x.livre<0&&projetado<0)return {k:'critico',rot:'Crítico',cor:'err',ponto,sug:Math.max(sug,-projetado)};
  if(projetado<ponto||(num(p.minimo)>0&&projetado<num(p.minimo)))return {k:'produzir',rot:'Produzir',cor:'warn',ponto,sug:Math.max(1,sug)};
  return {k:'ok',rot:'OK',cor:'ok',ponto,sug:0};
}
function estoqueInsumos(){
  const c=CFG(),m={};INS.forEach(i=>m[i.k]={ent:0,cons:0,aj:0,valor:0});
  T('compra').forEach(r=>{const x=m[r.insumo];if(!x)return;x.ent+=num(r.qtd);x.valor+=num(r.valor);});
  T('producao').forEach(r=>itensProd(r).forEach(it=>Object.entries(it.consumo||{}).forEach(([k,q])=>{if(m[k])m[k].cons+=num(q);})));
  T('ajuste').forEach(a=>{if(String(a.item||'').startsWith('insumo:')){const x=m[a.item.slice(7)];if(x)x.aj+=num(a.qtd);}});
  const d30=addD(hoje0(),-30);
  INS.forEach(i=>{const x=m[i.k];x.saldo=x.ent-x.cons+x.aj;x.preco=x.ent>0&&x.valor>0?x.valor/x.ent:num(c.precos[i.k]);x.valorEst=Math.max(0,x.saldo)*x.preco;x.min=num((c.minimos||{})[i.k]);
    const c30=T('producao').filter(r=>{const d=dt(r.data);return d&&d>=d30;}).reduce((s,r)=>s+itensProd(r).reduce((a,it)=>a+num((it.consumo||{})[i.k]),0),0);x.dia=c30/30;x.duraDias=x.dia>0?Math.floor(Math.max(0,x.saldo)/x.dia):null;});
  return m;
}
function insumosUsados(){const s=new Set();const c=CFG();pecas().forEach(p=>{try{Object.keys(calc(p,1,c).est).forEach(k=>s.add(k));}catch(e){}});T('compra').forEach(r=>s.add(r.insumo));return s;}
function faltaInsumo(ei,us){return INS.filter(i=>us.has(i.k)&&(ei[i.k].saldo<0||(ei[i.k].min>0&&ei[i.k].saldo<ei[i.k].min)));}

/* ═══════════════ TELA, MENU E ABAS ═══════════════ */
const ABAS=[
  {k:'painel',rot:'Painel',ico:'fa-gauge-high'},{k:'pecas',rot:'Peças e catálogo',curto:'Peças e catálogo',ico:'fa-cubes'},{k:'planejamento',rot:'Planejamento',ico:'fa-clipboard-list'},
  {k:'producao',rot:'Diário de produção',curto:'Diário',ico:'fa-industry'},{k:'estoque',rot:'Estoque e avarias',curto:'Estoque',ico:'fa-warehouse'},{k:'vendas',rot:'Vendas',ico:'fa-truck-ramp-box'},
  {k:'caixa',rot:'Fluxo de caixa',curto:'Caixa',ico:'fa-sack-dollar'},{k:'relatorios',rot:'Relatórios',ico:'fa-chart-column'},{k:'parametros',rot:'Parâmetros',ico:'fa-sliders'}];
const PM={aba:'painel',mes:mesHoje(),busca:'',cat:'',grupo:'',pecasVista:'minhas',rel:{tipo:'producao',de:isoDe(addD(hoje0(),-30)),ate:hojeISO()},cxMes:mesHoje()};
let grafico=null;
const ativa=()=>!!document.getElementById('view-premoldados')?.classList.contains('active');
function estilo(){
  if(document.getElementById('pm-estilo'))return;
  const s=document.createElement('style');s.id='pm-estilo';
  s.textContent=`
#pm-app{display:flex;flex-direction:column;gap:16px;}
.pm-topo{position:sticky;top:-24px;z-index:6;margin:-24px -32px 0;padding:18px 32px 12px;background:var(--bg,#F5F5F7);transition:box-shadow .2s;}
.pm-topo.rolado{box-shadow:0 10px 24px -18px rgba(16,24,40,.45);}
.pm-topo-in{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #E4E9F2;border-radius:18px;padding:10px 12px 0 14px;box-shadow:0 1px 2px rgba(16,24,40,.04);}
.pm-marca{display:flex;align-items:center;gap:10px;flex:none;padding-bottom:10px;}
.pm-marca .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#1652D8,#2E90FA);color:#fff;font-size:16px;box-shadow:0 6px 14px -8px rgba(22,82,216,.9);}
.pm-marca b{display:block;font:800 14px Inter,sans-serif;color:var(--text-1);line-height:1.15;} .pm-marca small{display:block;font:600 11px Inter,sans-serif;color:#667085;}
.pm-nav{display:flex;align-items:flex-end;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0;}
.pm-nav::-webkit-scrollbar{display:none;}
.pm-grp{display:flex;align-items:flex-end;gap:2px;padding-left:10px;margin-left:6px;border-left:1px solid #EEF1F6;flex:none;position:relative;}
.pm-grp:first-child{border-left:0;margin-left:0;padding-left:0;}
.pm-grp>small{position:absolute;top:-2px;left:12px;font:800 9px Inter,sans-serif;letter-spacing:.08em;color:#98A2B3;text-transform:uppercase;}
.pm-grp:first-child>small{left:2px;}
.pm-tab{position:relative;display:flex;align-items:center;gap:7px;flex:none;border:0;background:transparent;padding:16px 11px 12px;font:600 13px Inter,sans-serif;color:#475467;cursor:pointer;white-space:nowrap;border-radius:10px 10px 0 0;transition:color .15s,background .15s;}
.pm-tab i{font-size:13px;color:#98A2B3;transition:color .15s;}
.pm-tab:hover{color:#1652D8;background:#F5F8FF;} .pm-tab:hover i{color:#1652D8;}
.pm-tab.on{color:#1652D8;} .pm-tab.on i{color:#1652D8;}
.pm-tab.on::after{content:'';position:absolute;left:10px;right:10px;bottom:0;height:3px;border-radius:3px 3px 0 0;background:#1652D8;}
.pm-tab .bd{min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#F04438;color:#fff;font:800 10px Inter,sans-serif;display:inline-grid;place-items:center;}
.pm-cfg{flex:none;width:38px;height:38px;margin-bottom:8px;border-radius:12px;border:1px solid #E4E9F2;background:#fff;color:#475467;cursor:pointer;display:grid;place-items:center;transition:all .15s;}
.pm-cfg:hover,.pm-cfg.on{background:#1652D8;color:#fff;border-color:#1652D8;}
.pm-faixa{height:1px;background:#E4E9F2;margin:0;border-left:1px solid #E4E9F2;border-right:1px solid #E4E9F2;}
.pm-topo-pe{height:12px;background:#fff;border:1px solid #E4E9F2;border-top:0;border-radius:0 0 18px 18px;margin-bottom:4px;}
@media (max-width:1240px){.pm-marca div{display:none;} .pm-tab{padding:16px 8px 12px;gap:6px;} .pm-grp{padding-left:6px;margin-left:4px;}}
@media (max-width:900px){.pm-topo{top:-16px;margin:-16px -16px 0;padding:12px 16px 10px;} .pm-marca div{display:none;} .pm-grp>small{display:none;} .pm-tab span.lb{display:none;} .pm-tab{padding:12px 10px;}}
.pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;}
.pm-card{background:#fff;border:1px solid #e8e8ed;border-left:4px solid var(--cor,#0071E3);border-radius:14px;padding:12px 14px;cursor:pointer;box-shadow:0 2px 6px rgba(20,20,60,.05);transition:transform .15s,box-shadow .15s;min-width:0;}
.pm-card:hover{transform:translateY(-2px);box-shadow:0 10px 22px -12px rgba(20,20,60,.35);}
.pm-card h4{margin:0;font-size:14px;color:var(--text-1);line-height:1.3;overflow-wrap:anywhere;}
.pm-card .pm-cod{font-size:11px;font-weight:800;color:#667085;letter-spacing:.03em;}
.pm-card .pm-dim{font-size:12px;color:#6e6e73;margin:3px 0 8px;}
.pm-card .pm-svgbox{background:#F8FAFC;border-radius:10px;margin:8px 0;padding:4px;}
.pm-svg{width:100%;height:auto;display:block;}
.pm-card.oculto{opacity:.55;} .pm-card.excluido{opacity:.4;border-style:dashed;}
.pm-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px;}
.pm-nums div{background:#F8FAFC;border-radius:9px;padding:6px 8px;min-width:0;}
.pm-nums small{display:block;font-size:10.5px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:.03em;}
.pm-nums b{display:block;font-size:13px;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pm-form{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;align-items:start;}
.pm-form .fin-linha{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));}
.pm-bloco{border:1px solid #E4E9F2;border-radius:14px;padding:12px 14px;margin-bottom:12px;background:#fff;min-width:0;}
.pm-bloco h5{margin:0 0 10px;font:800 12px Inter,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#344054;display:flex;align-items:center;gap:8px;}
.pm-bloco h5 i{color:#1652D8;}
.pm-res{position:sticky;top:0;background:#F8FAFC;border:1px solid #E4E9F2;border-radius:14px;padding:12px 14px;font-size:12.5px;min-width:0;}
.pm-res h5{margin:10px 0 6px;font:800 12px Inter,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#344054;}
.pm-res table,.pm-tab2,.pm-itens,.pm-res .pm-tab2{width:100%;min-width:0!important;border-collapse:collapse;font-size:12.5px;table-layout:auto;}
.pm-tab2{width:100%;border-collapse:collapse;font-size:12.5px;}
.pm-res td,.pm-res th,.pm-tab2 td,.pm-tab2 th{padding:6px 7px;border-bottom:1px solid #EEF1F6;text-align:left;vertical-align:top;overflow-wrap:anywhere;}
.pm-res th,.pm-tab2 th{font:800 10px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#667085;background:#F2F4F7;}
.pm-res td.n,.pm-res th.n,.pm-tab2 td.n,.pm-tab2 th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
.pm-res tr.t td,.pm-tab2 tr.t td{font-weight:800;border-top:2px solid var(--text-1);}
.pm-res small,.pm-tab2 small{display:block;color:#667085;font-size:11px;white-space:normal;}
.pm-tab2 tbody tr.pm-lin{cursor:pointer;} .pm-tab2 tbody tr.pm-lin:hover{background:#F8FAFF;}
.pm-big{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:10px 12px;margin:8px 0;border-radius:12px;background:#fff;border:1px solid #E4E9F2;flex-wrap:wrap;}
.pm-big b{font:800 20px Manrope,Inter,sans-serif;color:var(--text-1);} .pm-big span{color:#667085;font-size:12px;}
.pm-x{border:0;background:#FEF3F2;color:#B42318;border-radius:8px;width:30px;height:30px;cursor:pointer;flex:none;}
.pm-rolar{overflow-x:auto;max-width:100%;}
.pm-mini{font-size:12px;color:#667085;}
.pm-barra{height:7px;border-radius:99px;background:#EEF1F6;overflow:hidden;margin-top:6px;} .pm-barra i{display:block;height:100%;background:#1652D8;border-radius:99px;} .pm-barra.ok i{background:#12B76A;}
.pm-chart{height:270px;position:relative;}
.pm-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.pm-filtros input,.pm-filtros select{padding:9px 12px;border:1px solid #e8e8ed;border-radius:12px;font:13px Inter,sans-serif;background:#fff;max-width:100%;}
.pm-itens td{padding:4px;} .pm-itens input,.pm-itens select{width:100%;min-width:0;padding:7px 8px;border:1px solid var(--border);border-radius:9px;font:13px Inter,sans-serif;}
.pm-arml{list-style:none;margin:0;padding:0;display:grid;gap:6px;} .pm-arml li{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#344054;background:#fff;border:1px solid #EEF1F6;border-radius:10px;padding:7px 9px;}
.pm-arml li i{color:#D92D20;margin-top:2px;} .pm-arml li.m i{color:#7A2FE0;}
.pm-chips{display:flex;flex-wrap:wrap;gap:6px;} .pm-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #D0D5DD;border-radius:99px;padding:6px 11px;font:600 12.5px Inter,sans-serif;cursor:pointer;background:#fff;user-select:none;}
.pm-chip input{display:none;} .pm-chip.on{background:#EEF4FF;border-color:#1652D8;color:#1652D8;}
.pm-sub{display:flex;gap:6px;flex-wrap:wrap;}
.pm-sug{position:absolute;z-index:30;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #D0D5DD;border-radius:12px;box-shadow:0 12px 30px -12px rgba(16,24,40,.35);max-height:240px;overflow:auto;}
.pm-sug div{padding:8px 11px;font-size:12.5px;cursor:pointer;border-bottom:1px solid #F2F4F7;} .pm-sug div:hover{background:#EEF4FF;} .pm-sug small{display:block;color:#667085;}
.pm-tipos{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;max-height:62vh;overflow:auto;padding:2px;}
.pm-tipo{border:1px solid #E4E9F2;border-radius:12px;padding:8px 10px;cursor:pointer;background:#fff;transition:border-color .15s,box-shadow .15s;}
.pm-tipo:hover{border-color:#1652D8;box-shadow:0 6px 16px -10px rgba(22,82,216,.6);} .pm-tipo b{display:block;font-size:12.5px;line-height:1.3;} .pm-tipo small{display:block;font-size:11px;color:#667085;}
.pm-th{width:58px;height:44px;border-radius:9px;background:#F2F4F7;border:1px solid #E4E9F2;display:grid;place-items:center;overflow:hidden;cursor:pointer;padding:0;flex:none;}
.pm-th img{width:100%;height:100%;object-fit:cover;} .pm-th svg{width:100%;height:100%;}
.pm-svgbox img{width:100%;height:150px;object-fit:cover;border-radius:8px;display:block;}
.pm-pop{position:fixed;inset:0;z-index:10050;background:rgba(16,24,40,.5);display:grid;place-items:center;padding:16px;}
.pm-pop-box{background:#fff;border-radius:18px;max-width:1000px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px -20px rgba(16,24,40,.5);}
.pm-pop-cab{display:flex;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid #EEF1F6;flex-wrap:wrap;}
.pm-pop-cab b{font:800 15px Inter,sans-serif;margin-right:auto;}
.pm-pop-grid{overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;}
.pm-pk{position:relative;border:1px solid #E4E9F2;border-radius:12px;overflow:hidden;cursor:pointer;background:#fff;transition:border-color .15s,box-shadow .15s;}
.pm-pk:hover,.pm-pk.on{border-color:#1652D8;box-shadow:0 6px 16px -10px rgba(22,82,216,.6);}
.pm-pk .im{height:120px;background:#F8FAFC;display:grid;place-items:center;} .pm-pk .im img{width:100%;height:100%;object-fit:cover;} .pm-pk .im svg{width:100%;height:100%;}
.pm-pk .tx{padding:7px 9px;font-size:11.5px;color:#667085;} .pm-pk .tx b{display:block;font-size:12.5px;color:var(--text-1);line-height:1.25;}
.pm-pk .zb{position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:99px;border:0;background:rgba(255,255,255,.92);color:#344054;cursor:zoom-in;box-shadow:0 2px 6px rgba(0,0,0,.15);}
.pm-zoom{max-width:min(92vw,960px);max-height:86vh;border-radius:16px;background:#fff;padding:8px;} .pm-zoom img,.pm-zoom svg{max-width:100%;max-height:80vh;display:block;margin:auto;border-radius:10px;}
.pm-at{display:inline-flex;align-items:center;gap:6px;margin-top:3px;background:#ECFDF3;color:#067647;border:1px solid #ABEFC6;border-radius:99px;padding:2px 9px;font-weight:700;font-size:11px;white-space:nowrap;}
.pm-at button{border:0;background:#067647;color:#fff;border-radius:99px;padding:2px 9px;font:700 11px Inter,sans-serif;cursor:pointer;}
.pm-at.az{background:#EEF4FF;color:#1652D8;border-color:#C7D7FE;}
.pm-sem{display:grid;grid-template-columns:repeat(7,minmax(160px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px;}
.pm-dia{background:#F8FAFC;border:1px solid #E4E9F2;border-radius:14px;padding:8px;min-height:170px;min-width:0;}
.pm-dia.hoje{border-color:#1652D8;box-shadow:inset 0 0 0 1px #1652D8;}
.pm-dia h6{margin:0 0 6px;font:800 12px Inter,sans-serif;color:#344054;display:flex;justify-content:space-between;align-items:center;gap:6px;}
.pm-dia h6 small{font-weight:600;color:#667085;}
.pm-ent{background:#fff;border:1px solid #E4E9F2;border-left:4px solid var(--cor,#1652D8);border-radius:10px;padding:6px 8px;margin-bottom:6px;font-size:11.5px;cursor:pointer;line-height:1.35;}
.pm-ent b{font-size:12px;} .pm-ent:hover{box-shadow:0 6px 14px -10px rgba(16,24,40,.5);}
.pm-cam{font:800 10.5px Inter,sans-serif;color:#475467;text-transform:uppercase;letter-spacing:.04em;margin:6px 0 4px;display:flex;justify-content:space-between;gap:6px;}
.pm-cam.exc{color:#B42318;}
.pm-gchips{display:flex;gap:6px;flex-wrap:wrap;}
.pm-gchip{display:inline-flex;align-items:center;gap:7px;border:1px solid #E4E9F2;background:#fff;border-radius:99px;padding:7px 12px;font:600 12.5px Inter,sans-serif;color:#344054;cursor:pointer;transition:all .15s;}
.pm-gchip i{color:var(--cor);} .pm-gchip b{font:800 11px Inter,sans-serif;background:#F2F4F7;color:#475467;border-radius:99px;padding:1px 7px;}
.pm-gchip:hover{border-color:var(--cor);} .pm-gchip.on{background:var(--cor);border-color:var(--cor);color:#fff;} .pm-gchip.on i{color:#fff;} .pm-gchip.on b{background:rgba(255,255,255,.25);color:#fff;}
.pm-prod .pm-svgbox{margin:0 0 8px;background:linear-gradient(180deg,#F8FAFC 0%,#EEF2F7 100%);}
.pm-tams{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;} .pm-tams span{font:700 10.5px Inter,sans-serif;background:#EEF4FF;color:#1652D8;border-radius:6px;padding:2px 6px;} .pm-tams span.mais{background:#F2F4F7;color:#475467;}
.pm-info{display:flex;flex-wrap:wrap;gap:10px;font:600 11px Inter,sans-serif;color:#667085;border-top:1px solid #F2F4F7;padding-top:6px;} .pm-info i{margin-right:4px;color:#98A2B3;}
.pm-ponto td{vertical-align:middle;} .pm-ponto input[type=time]{min-width:92px;}
@media (max-width:900px){.pm-form{grid-template-columns:1fr;} .pm-res{position:static;}}
`;
  document.head.appendChild(s);
}
function montar(){
  if(!document.getElementById('view-premoldados')){
    const ref=document.getElementById('view-inicio');if(!ref)return false;
    const v=document.createElement('div');v.className='view';v.id='view-premoldados';v.innerHTML='<div class="cards-scroll"><div id="pm-app"></div></div>';
    ref.parentNode.appendChild(v);
  }
  if(!document.getElementById('nav-premoldados')){
    // um botão simples no menu, antes de "Configurações": abre direto o Painel; as telas ficam na faixa de abas
    const cats=[...document.querySelectorAll('.vx-cat')],conf=cats.find(li=>/Configura/.test((li.querySelector(':scope > .vx-cat-bt')||{}).textContent||''));
    const ul=(conf||cats[cats.length-1]||{}).parentNode;if(!ul)return false;
    const li=document.createElement('li');li.className='vx-cat vx-cat-link';li.id='nav-premoldados-li';
    li.innerHTML=`<button type="button" class="vx-cat-bt vx-alvo" id="nav-premoldados" style="display:none" onclick="UI.nav('pm-painel')"><i class="fas fa-cubes"></i>Pré-moldados</button>`;
    ul.insertBefore(li,conf||null);
  }
  return true;
}
if(Array.isArray(UI._MODULOS)&&!UI._MODULOS.some(m=>m[0]==='premoldados'))UI._MODULOS.push(['premoldados','Pré-moldados (fábrica)']);
estilo();montar();
function ajustarAcesso(){
  const s=typeof Auth!=='undefined'?Auth._session:null,bt=document.getElementById('nav-premoldados');if(!bt)return;
  let ok=false;
  if(s){const acessos=Array.isArray(s.acessos)?s.acessos:null;ok=UI._ehAdmin(s.perfil)||(UI.permNivel?UI.permNivel('premoldados')!=='nenhum':(!acessos||acessos.includes('premoldados')));}
  bt.style.display=ok?'':'none';
  if(ok&&Array.isArray(UI._allowedViews)&&!UI._allowedViews.includes('premoldados'))UI._allowedViews.push('premoldados');
  UI._navAjustar&&UI._navAjustar();
}
if(typeof Auth!=='undefined'&&typeof Auth._applySession==='function'){const ap=Auth._applySession;Auth._applySession=function(){const r=ap.apply(this,arguments);try{ajustarAcesso();}catch(e){console.error(e);}return r;};}
ajustarAcesso();
{const nav0=UI.nav;
  UI.nav=function(v){
    if(typeof v==='string'&&v.indexOf('pm-')===0){const a=v.slice(3);if(ABAS.some(x=>x.k===a))PM.aba=a;v='premoldados';}
    const r=nav0.call(this,v);
    if(v==='premoldados'&&ativa()){const ab=ABAS.find(x=>x.k===PM.aba);document.title='Pré-moldados · '+(ab?ab.rot:'');const t=document.getElementById('view-title');if(t)t.textContent='Pré-moldados';}
    return r;};}
{const re=App._renderEng;App._renderEng=function(v){if(v==='premoldados'){try{render();}catch(e){console.error(e);}return;}return re.apply(this,arguments);};}
{const ra=App.renderAll;App.renderAll=function(){const r=ra.apply(this,arguments);try{ajustarAcesso();if(ativa())render();}catch(e){console.error(e);}return r;};}

function irAba(a){PM.aba=a;UI.nav('pm-'+a);}
function badges(){
  try{const E=estoque(),vs=vendas(),h=hoje0(),ei=estoqueInsumos(),us=insumosUsados();
    const vend=vs.filter(v=>['sinal','pagamento','liberado'].includes(faseVenda(v,E))).length;
    const est=pecas().filter(p=>reposicao(p,E.P[String(p.rowid)]).k!=='ok').length+faltaInsumo(ei,us).length;
    const plan=ordens().filter(o=>(o.status==='planejada'||o.status==='producao')&&dt(o.fim)&&dt(o.fim)<h).length;
    return {vendas:vend,estoque:est,planejamento:plan};}catch(e){return {};}
}
function render(){
  const box=document.getElementById('pm-app');if(!box)return;
  if(!pode()){box.innerHTML='<div class="gf-vazio"><i class="fas fa-lock"></i><p>Sem acesso aos pré-moldados.</p></div>';return;}
  const ab=ABAS.find(x=>x.k===PM.aba)||ABAS[0],bd=badges();
  // cabeçalho da fábrica: abas agrupadas como a operação (produção → comercial → financeiro); parâmetros na engrenagem
  const tabB=a=>`<button type="button" class="pm-tab ${a.k===ab.k?'on':''}" data-pm-aba="${a.k}" role="tab" aria-selected="${a.k===ab.k}" title="${a.rot}"><i class="fas ${a.ico}"></i><span class="lb">${a.curto||a.rot}</span>${bd[a.k]?`<span class="bd">${bd[a.k]}</span>`:''}</button>`;
  const GRP=[['',['painel']],['Produção',['pecas','planejamento','producao']],['Comercial',['vendas','estoque']],['Financeiro',['caixa','relatorios']]];
  const nav=`<div class="pm-topo"><div class="pm-topo-in"><div class="pm-marca"><span class="ic"><i class="fas fa-cubes"></i></span><div><b>Fábrica de pré-moldados</b><small>Vixsul Empreendimentos</small></div></div>
    <nav class="pm-nav" role="tablist">${GRP.map(([g,ks])=>`<div class="pm-grp">${g?`<small>${g}</small>`:''}${ks.map(k=>tabB(ABAS.find(a=>a.k===k))).join('')}</div>`).join('')}</nav>
    <button type="button" class="pm-cfg ${ab.k==='parametros'?'on':''}" data-pm-aba="parametros" title="Parâmetros da fábrica"><i class="fas fa-sliders"></i></button></div></div>`;
  let corpo='';
  try{corpo=({painel:telaPainel,pecas:telaPecas,planejamento:telaPlanejamento,producao:telaProducao,estoque:telaEstoque,vendas:telaVendas,caixa:telaCaixa,relatorios:telaRelatorios,parametros:telaParametros}[ab.k]||telaPainel)();}
  catch(e){console.error(e);corpo=`<div class="gf-aviso err"><i class="fas fa-triangle-exclamation"></i><div>Erro ao montar esta aba: ${fe(e.message)}</div></div>`;}
  if(grafico){try{grafico.destroy();}catch(e){}grafico=null;}
  const rol=box.closest('.cards-scroll'),y=rol?rol.scrollTop:0;
  box.innerHTML=nav+corpo;if(rol)rol.scrollTop=y;
  const on=box.querySelector('.pm-tab.on');if(on&&on.scrollIntoView)try{on.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}
  if(ab.k==='painel')desenharGrafico();
  if(ab.k==='parametros'){box.querySelectorAll('[data-end]').forEach(ligarEndereco);ligarCidadesFrete(box);}
  pintarFotos(box);
  // sombra do cabeçalho só quando a tela rola (o conteúdo passa por baixo, sem aparecer pelas bordas)
  if(rol&&!rol._pmSc){rol._pmSc=1;rol.addEventListener('scroll',()=>{const t=document.querySelector('#pm-app .pm-topo');if(t)t.classList.toggle('rolado',rol.scrollTop>6);},{passive:true});}
  const tp=box.querySelector('.pm-topo');if(tp&&rol)tp.classList.toggle('rolado',rol.scrollTop>6);
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
  else if(t.matches('[data-pm-grupo]')){PM.grupo=t.value;render();}
  else if(t.matches('[data-pm-catsit]')){PM.catSit=t.value;render();}
  else if(t.matches('[data-pm-cxmes]')){PM.cxMes=t.value;render();}
  else if(t.matches('[data-pm-rel]')){PM.rel[t.dataset.pmRel]=t.value;render();}
}
function clique(ev){
  const a=ev.target.closest('[data-pm-aba]');if(a)return irAba(a.dataset.pmAba);
  const cx=ev.target.closest('[data-pm-cxsel]');if(cx){PM.cxMes=cx.dataset.pmCxsel;return render();}
  const b=ev.target.closest('[data-pm]');if(!b)return;const x=b.dataset.pm,id=b.dataset.id;
  const acoes={
    'nova-peca':()=>escolherTipo(t=>formPeca(null,{tipo_k:t.k})),'cat-grupo':()=>{PM.grupo=b.dataset.g;render();},'cat-pdf':()=>catalogoPDF(b.dataset.modo),'peca':()=>fichaPeca(pecaDe(id)),'vista':()=>{PM.pecasVista=b.dataset.v;render();},
    'tipo':()=>fichaTipo(tipoK(b.dataset.k)),'tipo-novo':()=>formTipo(null),'traco-novo':()=>formTraco(null),'traco':()=>formTraco(tracoDe(id)),
    'ordem-nova':()=>formOrdem(null),'ordem':()=>formOrdem(T('ordem').find(o=>String(o.rowid)===id)),'fichas-abertas':()=>imprimirFichas(ordens().filter(o=>o.status==='planejada'||o.status==='producao')),
    'prod-nova':()=>formProducao(null),'lote':()=>fichaLote(b.dataset.lote),'prod':()=>formProducao(T('producao').find(o=>String(o.rowid)===id)),
    'compra-nova':()=>formCompra(null,b.dataset.ins),'compra':()=>formCompra(T('compra').find(o=>String(o.rowid)===id)),
    'ajuste-novo':()=>formAjuste(null,b.dataset.item),'ajuste':()=>formAjuste(T('ajuste').find(o=>String(o.rowid)===id)),
    'avaria-nova':()=>formAvaria(null,b.dataset.peca),'avaria':()=>formAvaria(T('avaria').find(o=>String(o.rowid)===id)),
    'venda-nova':()=>formVenda(null),'venda':()=>fichaVenda(vendaDe(id)),
    'vvista':()=>{PM.vendasVista=b.dataset.v;PM.busca='';render();},'sem':()=>{const d=num(b.dataset.d);PM.semana=isoDe(d?addD(dt(PM.semana)||segunda(hoje0()),d):segunda(hoje0()));render();},
    'romaneio':()=>romaneio(b.dataset.d),'cli-novo':()=>formCliente(null),'cli':()=>formCliente(T('cliente').find(o=>String(o.rowid)===id)),
    'vend-add':()=>{const box=document.querySelector('#pm-app [data-vends]');if(!box)return;const v=box.querySelector('[data-vazio]');if(v)v.remove();box.insertAdjacentHTML('beforeend',PM._linVend({nome:'',pct:5}));},
    'vend-salvar':()=>salvarVendedores(),'com-pagar':()=>pagarComissao(b.dataset.nome),
    'custo-novo':()=>formCusto(null),'custo':()=>formCusto(T('custo').find(o=>String(o.rowid)===id)),
    'ir':()=>irAba(b.dataset.aba),'cfg-salvar':()=>salvarParametros(),'cfg-fixo-add':()=>addLinha('fixos'),'cfg-equipe-add':()=>addLinha('equipe'),'cfg-cid-add':()=>addLinha('cid'),'cfg-cam-add':()=>addLinha('cam'),'cfg-x':()=>{const d=b.closest('[data-lin]');if(d)d.remove();},
    'rel-excel':()=>relatorio(true,false),'rel-pdf':()=>relatorio(false,true),'compras-pdf':()=>imprimirNecessidade(),
    'gerar-op':()=>formOrdem(null,{peca:b.dataset.peca,qtd:b.dataset.qtd})};
  if(acoes[x])acoes[x]();
}

/* ═══════════════ PAINEL ═══════════════ */
function resumoMes(k){
  const noM=d=>!!d&&mesKey(d)===k,c=CFG(),E=estoque();
  const prod=T('producao').filter(r=>noM(dt(r.data))),its=prod.flatMap(itensProd);
  const pecasProd=its.reduce((s,it)=>s+num(it.qtd),0),refugo=its.reduce((s,it)=>s+num(it.refugo),0);
  const m3=its.reduce((s,it)=>{const p=pecaDe(it.peca);return s+(p?geoPeca(p).V*(num(it.qtd)+num(it.refugo)):0);},0);
  const matCons=its.reduce((s,it)=>s+num(it.custo_mat_un)*(num(it.qtd)+num(it.refugo)),0);
  const perdaRefugo=its.reduce((s,it)=>s+num(it.custo_un)*num(it.refugo),0);
  const av=T('avaria').filter(a=>noM(dt(a.data))),perdaAv=av.reduce((s,a)=>s+num(a.custo_un)*num(a.qtd),0);
  const vend=vendas().filter(v=>(v.status==='entregue'||v.status==='devolvida')&&noM(dt(v.entrega)));
  const estornosDev=vendas().reduce((s,v)=>s+(v.devolucoes||[]).filter(dv=>noM(dt(dv.data))).reduce((a,dv)=>a+num(dv.estorno),0),0);
  const receita=vend.reduce((s,v)=>s+totalVenda(v),0)-estornosDev;
  let cmv=0;const porPeca={};
  vend.forEach(v=>(v.itens||[]).forEach(it=>{const x=E.P[String(it.peca)],q=num(it.qtd);cmv+=q*(x?x.custoMatUn:0);const y=porPeca[it.peca]=porPeca[it.peca]||{q:0,v:0};y.q+=q;y.v+=q*num(it.preco);}));
  const impostos=receita*num(c.impostos)/100,mc=receita-impostos-cmv,perdas=perdaRefugo+perdaAv;
  const custos=T('custo').filter(x=>noM(dt(x.data))&&x.categoria!=='Comissões de vendedores').reduce((s,x)=>s+num(x.valor),0),comissoes=Object.values(comissoesMes(k)).reduce((s,x)=>s+x.com,0);
  const resultado=mc-perdas-comissoes-custos,custoM3=m3>0?(matCons+custos)/m3:null;
  const recebido=vendas().reduce((s,v)=>s+(v.pagamentos||[]).filter(p=>p.tipo!=='estorno'&&noM(dt(p.data))).reduce((a,p)=>a+num(p.valor),0),0);
  return {k,prod,its,pecasProd,refugo,m3,matCons,vend,receita,impostos,cmv,mc,perdas,perdaAv,perdaRefugo,custos,comissoes,resultado,custoM3,porPeca,recebido,av};
}
function alertas(){
  const out=[],h=hoje0(),ei=estoqueInsumos(),E=estoque(),us=insumosUsados(),c=CFG();
  faltaInsumo(ei,us).forEach(i=>{const x=ei[i.k];out.push(x.saldo<0
    ?{tom:'err',ico:'fa-box-open',t:`${i.nome}: estoque negativo (${nf(x.saldo,2)} ${i.un})`,s:'A produção consumiu mais do que entrou: lance a compra ou acerte o inventário.',go:'estoque'}
    :{tom:x.saldo<=0?'err':'warn',ico:'fa-box-open',t:`${i.nome}: ${nf(x.saldo,2)} ${i.un} em estoque`,s:`Abaixo do mínimo (${nf(x.min,2)} ${i.un}).${x.duraDias!=null?` No ritmo atual dura ${x.duraDias} dia(s).`:''}`,go:'estoque'});});
  ordens().filter(o=>(o.status==='planejada'||o.status==='producao')&&dt(o.fim)&&dt(o.fim)<h).forEach(o=>out.push({tom:'err',ico:'fa-clock',t:`OP nº ${o.numero} atrasada`,s:`${nomePeca(o.peca)} — ${nf(prodDaOrdem(o.rowid),0)} de ${nf(num(o.qtd),0)}; prazo era ${brDe(dt(o.fim))}.`,go:'planejamento'}));
  vendas().forEach(v=>{const f=faseVenda(v,E);
    if(f==='sinal'&&dt(v.data)&&dias(dt(v.data),h)>=7)out.push({tom:'warn',ico:'fa-hourglass-start',t:`Venda nº ${v.numero} sem sinal há ${dias(dt(v.data),h)} dias`,s:`${v.cliente||''}: a encomenda só reserva com ${nf(num(c.sinal),0)}% pago.`,go:'vendas'});
    if(f==='pagamento')out.push({tom:'warn',ico:'fa-hand-holding-dollar',t:`Venda nº ${v.numero} pronta — falta pagar ${R(totalVenda(v)-pagoDe(v))}`,s:`${v.cliente||''}: as peças estão prontas; a entrega só sai com o pagamento completo.`,go:'vendas'});
    if(f==='liberado')out.push({tom:'info',ico:'fa-truck-ramp-box',t:`Venda nº ${v.numero} liberada para entrega`,s:`${v.cliente||''} — paga e com as peças prontas.`,go:'vendas'});});
  pecas().forEach(p=>{const r=reposicao(p,E.P[String(p.rowid)]);if(r.k!=='ok')out.push({tom:r.k==='critico'?'err':'warn',ico:'fa-cubes',t:`${p.nome}: ${r.k==='critico'?'falta peça para pedidos':'hora de produzir'}`,s:`Sugestão: produzir ${nf(r.sug,0)} peça(s).`,go:'estoque'});});
  // ensaios dos corpos de prova e entregas do dia
  lotes().filter(l=>l.cp>0).forEach(l=>{const st=situacaoLote(l);if(st&&(st.k==='reprovado'||st.k==='atrasado'||st.k==='atencao'))out.push({tom:st.k==='atencao'?'warn':'err',ico:'fa-flask',t:`Lote ${l.lote}: ${st.rot.toLowerCase()}`,s:`${nomePeca(l.peca)} fabricado em ${brDe(dt(l.data))}.${st.k==='reprovado'?' Separe as peças do lote e avalie com o responsável técnico.':''}`,go:'producao'});});
  const hj=vendas().filter(v=>v.agenda&&v.agenda.data===isoDe(h)&&!['entregue','devolvida','cancelada'].includes(v.status));
  if(hj.length)out.push({tom:hj.some(v=>faseVenda(v,E)!=='liberado')?'warn':'info',ico:'fa-truck',t:`${hj.length} entrega(s) agendada(s) para hoje`,s:hj.some(v=>faseVenda(v,E)!=='liberado')?'Há pedido agendado que ainda não está pronto ou pago.':'Tudo liberado — imprima o romaneio em Vendas › Entregas.',go:'vendas'});
  return out;
}
function telaPainel(){
  const k=PM.mes,r=resumoMes(k),ra=resumoMes(mesDesloc(k,-1)),c=CFG(),E=estoque(),vs=vendas();
  const disp=Object.values(E.P).reduce((s,x)=>s+Math.max(0,x.disp),0),cura=Object.values(E.P).reduce((s,x)=>s+x.cura,0);
  const valEst=Object.values(E.P).reduce((s,x)=>s+Math.max(0,x.disp)*x.custoUn,0);
  const abertas=vs.filter(v=>['aguardando_sinal','reservado'].includes(v.status)),aRec=abertas.reduce((s,v)=>s+Math.max(0,totalVenda(v)-pagoDe(v)),0);
  const fases={};vs.forEach(v=>{const f=faseVenda(v,E);fases[f]=(fases[f]||0)+1;});
  const al=alertas(),top=Object.entries(r.porPeca).sort((a,b)=>b[1].v-a[1].v).slice(0,5);
  return cabG('Pré-moldados — painel da fábrica','Produção, vendas e resultado da fábrica de peças, à parte das obras. Os números do mês escolhido.',GS.selMes(k,'data-pm-mes',12,0))+
    (!pecas().length?`<div class="gf-aviso warn" style="border-color:#FEDF89;background:#FFFAEB"><i class="fas fa-circle-info"></i><div><b>Comece pelo catálogo.</b> Em <b>Peças e catálogo</b>, escolha os tipos que a fábrica faz (mourão, meio-fio, placa de muro, tubo, bloco, paver…) e cadastre os tamanhos — o sistema calcula materiais, armadura e custo. Depois confira os preços em <b>Parâmetros</b>.<div style="margin-top:8px"><button type="button" class="gf-bt pri mini" data-pm="nova-peca"><i class="fas fa-plus"></i> Cadastrar a primeira peça</button></div></div></div>`:'')+
    `<div class="gf-kpis">
      ${kpiG('','fa-industry','Produção no mês',`${nf(r.pecasProd,0)} peças`,`${nf(r.m3,2)} m³ de concreto${r.refugo?` · refugo ${nf(r.refugo/(r.pecasProd+r.refugo)*100,1)}%`:''}`,GS.delta(r.m3,ra.m3))}
      ${kpiG('verde','fa-truck-ramp-box','Vendas entregues',R(r.receita),`${r.vend.length} entrega(s) · recebido no mês ${R(r.recebido)}`,GS.delta(r.receita,ra.receita))}
      ${kpiG(r.mc>=0?'verde':'vermelho','fa-scale-balanced','Margem de contribuição',R(r.mc),r.receita?`${nf(r.mc/r.receita*100,1)}% da venda (menos impostos e materiais)`:'sem entregas no mês')}
      ${kpiG(r.resultado>=0?'verde':'vermelho','fa-sack-dollar','Resultado do mês',R(r.resultado),`margem − perdas − custos da fábrica`)}
      ${kpiG('roxo','fa-cubes','Peças prontas',`${nf(disp,0)} peças`,`${nf(cura,0)} em cura · ${R(valEst)} a custo`)}
      ${kpiG(aRec?'laranja':'','fa-hand-holding-dollar','A receber dos pedidos',R(aRec),`${fases.sinal||0} sem sinal · ${fases.pagamento||0} prontos sem pagamento · ${fases.liberado||0} liberados`)}
      ${kpiG(r.perdas?'vermelho':'verde','fa-heart-crack','Perdas e avarias',R(r.perdas),`refugo ${R(r.perdaRefugo)} · avarias ${R(r.perdaAv)}`)}
      ${kpiG('laranja','fa-calculator','Custo por m³',r.custoM3!=null?R(r.custoM3):'—',`real do mês · previsto ${R(rateio(c).total+custoMatM3())}`)}
    </div>
    <div class="gf-duas">
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Precisa da sua atenção</h3><p>Pedidos, estoque, prazos e insumos.</p></div></div>
        ${al.length?`<ul class="gf-alertas">${al.slice(0,12).map(a=>`<li class="gf-al ${a.tom}" data-pm="ir" data-aba="${a.go}"><span class="gf-al-ico"><i class="fas ${a.ico}"></i></span><div><b>${fe(a.t)}</b><span>${fe(a.s)}</span></div><i class="fas fa-chevron-right gf-al-seta"></i></li>`).join('')}</ul>`:'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Nada pedindo atenção agora.</p></div>'}</section>
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Produção × vendas</h3><p>Últimos 6 meses: concreto produzido (m³) e vendas entregues (R$).</p></div></div><div class="pm-chart"><canvas id="pm-graf"></canvas></div></section>
    </div>
    <div class="gf-duas">
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Mais vendidas no mês</h3><p>Por valor entregue.</p></div></div>
        ${top.length?`<table class="pm-tab2" data-sem-ordem><thead><tr><th>Peça</th><th class="n">Quant.</th><th class="n">Valor</th></tr></thead><tbody>${top.map(([id,x])=>`<tr><td>${fe(nomePeca(id))}</td><td class="n">${nf(x.q,0)}</td><td class="n">${R(x.v)}</td></tr>`).join('')}</tbody></table>`:'<div class="gf-vazio"><i class="fas fa-chart-simple"></i><p>Sem entregas neste mês.</p></div>'}</section>
      <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Resultado do mês</h3><p>${cap(mesNome(k))} — DRE simplificada da fábrica.</p></div></div>
        <table class="pm-tab2" data-sem-ordem><tbody>
          <tr><td>Vendas entregues (menos devoluções)</td><td class="n">${R(r.receita)}</td></tr>
          <tr><td>(−) Impostos sobre a venda (${nf(num(c.impostos),1)}%)</td><td class="n">${R(-r.impostos)}</td></tr>
          <tr><td>(−) Materiais das peças vendidas</td><td class="n">${R(-r.cmv)}</td></tr>
          <tr class="t"><td>= Margem de contribuição</td><td class="n">${R(r.mc)}</td></tr>
          <tr><td>(−) Perdas: refugo e avarias</td><td class="n">${R(-r.perdas)}</td></tr>
          ${r.comissoes?`<tr><td>(−) Comissões de vendas</td><td class="n">${R(-r.comissoes)}</td></tr>`:''}
          <tr><td>(−) Custos da fábrica lançados no mês<small>mão de obra, energia, água, aluguel, manutenção…</small></td><td class="n">${R(-r.custos)}</td></tr>
          <tr class="t"><td>= Resultado</td><td class="n" style="color:${r.resultado>=0?'#067647':'#B42318'}">${R(r.resultado)}</td></tr>
        </tbody></table></section>
    </div>`;
}
function custoMatM3(){const ps=pecas();if(!ps.length)return 0;const c=CFG();let v=0,s=0;ps.forEach(p=>{const x=calc(p,1,c);if(x.V>0){v+=x.V;s+=x.custo.mat;}});return v>0?s/v:0;}
function desenharGrafico(){
  const cv=document.getElementById('pm-graf');if(!cv||typeof Chart==='undefined')return;
  const ks=[];for(let i=5;i>=0;i--)ks.push(mesDesloc(PM.mes,-i));const rs=ks.map(k=>resumoMes(k));
  try{grafico=new Chart(cv.getContext('2d'),{type:'bar',data:{labels:ks.map(mesCurto),datasets:[
      {type:'bar',label:'Produção (m³)',data:rs.map(r=>r2(r.m3)),backgroundColor:'rgba(22,82,216,.75)',borderRadius:6,yAxisID:'y'},
      {type:'line',label:'Vendas (R$)',data:rs.map(r=>r2(r.receita)),borderColor:'#12B76A',backgroundColor:'#12B76A',tension:.3,yAxisID:'y1'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,title:{display:true,text:'m³'}},y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v>=10000?'R$ '+fmtN(v/1000,0)+' mil':'R$ '+fmtN(v,0)}}}}});}catch(e){console.error(e);}
}

/* ═══════════════ PEÇAS, CATÁLOGO DE TIPOS E TRAÇOS ═══════════════ */
function telaPecas(){
  const v=PM.pecasVista,sub=`<div class="pm-sub">${[['minhas','fa-cubes','Minhas peças'],['catalogo','fa-book-open','Catálogo de tipos'],['tracos','fa-fill-drip','Traços']].map(([k,ic,l])=>`<button type="button" class="gf-bt ${v===k?'pri':''}" data-pm="vista" data-v="${k}"><i class="fas ${ic}"></i> ${l}</button>`).join('')}</div>`;
  if(v==='catalogo')return telaCatalogo(sub);if(v==='tracos')return telaTracos(sub);
  const E=estoque(),q=String(PM.busca||'').toLowerCase(),c=CFG();
  const L=pecas().filter(p=>{const t=tipoDePeca(p);return (!PM.grupo||t.g===PM.grupo)&&(!q||[p.nome,p.codigo,t.nome].join(' ').toLowerCase().includes(q));});
  const cartao=p=>{const x=calc(p,1,c),e=E.P[String(p.rowid)]||{},mg=x.margem,rp=reposicao(p,e);
    return `<article class="pm-card" style="--cor:${grupoDe(x.t.g).cor}" data-pm="peca" data-id="${p.rowid}">
      <div class="vk-top"><div><span class="pm-cod">${fe(p.codigo||'')}</span><h4>${fe(p.nome)}</h4></div>${pill(rp.rot,rp.cor)}</div>
      <div class="pm-svgbox" data-th="${p.rowid}">${iluPeca(p)}</div>
      <div class="pm-dim">${fe(x.g.desc)} · ${nf(x.V,4)} m³ · ${nf(x.peso,1)} kg</div>
      <div class="pm-nums"><div><small>Custo</small><b>${R(x.un)}</b></div>${x.preco?`<div><small>Varejo</small><b>${R(x.preco)}</b></div><div><small>Margem</small><b>${nf(mg,1)}%</b></div>`
        :`<div><small>Sugerido</small><b style="color:#1652D8">${R(x.sug)}</b></div><div><small>Margem</small><b style="color:#98A2B3">sem preço</b></div>`}</div>
      <div class="vk-sub" style="margin:8px 0 0">${pill(`${nf(Math.max(0,e.disp||0),0)} prontas`,'ok','fa-check')}${e.cura?pill(`${nf(e.cura,0)} em cura`,'info','fa-hourglass-half'):''}${e.res?pill(`${nf(e.res,0)} reservadas`,'warn','fa-bookmark'):''}</div></article>`;};
  return cabG('Peças e catálogo','Cada peça da fábrica nasce de um tipo do catálogo: informe só as medidas — volume, peso, armadura, forma, traço, materiais e custo saem prontos e vão para a ficha de produção.',
      `<button type="button" class="gf-bt" data-pm="cat-pdf" data-modo="precos"><i class="fas fa-file-pdf"></i> Catálogo de preços (PDF)</button><button type="button" class="gf-bt pri" data-pm="nova-peca"><i class="fas fa-plus"></i> Nova peça</button>`)+sub+
    `<div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar peça (nome, código)…" value="${fe(PM.busca)}" style="min-width:240px">
      <select data-pm-grupo><option value="">Todos os grupos</option>${CAT.GRUPOS.map(g=>`<option value="${g.k}" ${g.k===PM.grupo?'selected':''}>${g.rot}</option>`).join('')}</select><span class="pm-mini">${L.length} peça(s)</span></div>
    ${L.length?`<div class="pm-grid">${L.map(cartao).join('')}</div>`:`<div class="gf-sec"><div class="gf-vazio"><i class="fas fa-cubes"></i><p>${pecas().length?'Nenhuma peça neste filtro.':'Nenhuma peça cadastrada ainda. Escolha um tipo do catálogo e informe as medidas.'}</p><button type="button" class="gf-bt pri" data-pm="nova-peca"><i class="fas fa-plus"></i> Nova peça</button></div></div>`}`;
}
function telaCatalogo(sub){
  const c=CFG(),q=String(PM.busca||'').toLowerCase(),todos=tiposTodos(),st0=PM.catSit||'';
  const L=todos.filter(t=>(!PM.grupo||t.g===PM.grupo)&&(!st0||statusTipo(t.k,c)===st0)&&(!q||[t.nome,t.uso,(t.tam||[]).map(x=>x[0]).join(' ')].join(' ').toLowerCase().includes(q)));
  const nAt=todos.filter(t=>statusTipo(t.k,c)==='ativo').length,nG=k=>todos.filter(t=>t.g===k).length;
  const card=t=>{const st=statusTipo(t.k,c),g=CAT.geo(t,t.d),tm=(t.tam||[]).map(x=>x[0]);
    return `<article class="pm-card pm-prod ${st}" style="--cor:${grupoDe(t.g).cor}" data-pm="tipo" data-k="${t.k}">
      <div class="pm-svgbox">${ilu(t,t.d)}</div>
      <div class="vk-top" style="margin-top:2px"><h4>${fe(t.nome)}</h4>${st==='ativo'?pill('trabalhamos','ok','fa-check'):st==='oculto'?pill('oculto','','fa-eye-slash'):pill('excluído','err','fa-ban')}</div>
      <div class="pm-mini" style="margin:2px 0 6px">${fe(t.uso||'')}</div>
      <div class="pm-tams">${tm.length?tm.slice(0,3).map(x=>`<span>${fe(x)}</span>`).join('')+(tm.length>3?`<span class="mais">+${tm.length-3}</span>`:''):`<span>${fe(g.desc)}</span>`}</div>
      <div class="pm-info"><span><i class="fas fa-layer-group"></i>${fe((CAT.TR[t.tr]||{}).fck||'')}</span><span><i class="fas fa-hourglass-half"></i>${t.cura} dias</span>${t.arm!=='nenhuma'?`<span><i class="fas fa-grip-lines"></i>armada</span>`:''}${t.norma?`<span><i class="fas fa-certificate"></i>${fe(t.norma.split(' ')[0]+' '+(t.norma.split(' ')[1]||''))}</span>`:''}</div></article>`;};
  const grupos=CAT.GRUPOS.filter(g=>L.some(t=>t.g===g.k));
  const chip=(k,rot,ico,cor,n)=>`<button type="button" class="pm-gchip ${PM.grupo===k?'on':''}" data-pm="cat-grupo" data-g="${k}" style="--cor:${cor}"><i class="fas ${ico}"></i>${rot}<b>${n}</b></button>`;
  return cabG('Catálogo de tipos',`${todos.length} tipos de pré-moldados, com desenho, medidas de mercado, traço, cura e armadura. Marque o que a fábrica trabalha — só esses aparecem ao cadastrar peças e no catálogo em PDF para o cliente.`,
      `<button type="button" class="gf-bt" data-pm="cat-pdf" data-modo="tipos"><i class="fas fa-file-pdf"></i> Catálogo em PDF</button><button type="button" class="gf-bt" data-pm="tipo-novo"><i class="fas fa-plus"></i> Novo tipo</button>`)+sub+
    `<div class="pm-gchips">${chip('','Todos','fa-border-all','#1652D8',todos.length)}${CAT.GRUPOS.map(g=>chip(g.k,g.rot.split(/[,(]/)[0].trim(),g.ico,g.cor,nG(g.k))).join('')}</div>
    <div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar tipo (nome, uso, tamanho)…" value="${fe(PM.busca)}" style="min-width:260px">
      <select data-pm-catsit><option value="">Todas as situações</option><option value="ativo" ${st0==='ativo'?'selected':''}>Só os que trabalhamos (${nAt})</option><option value="oculto" ${st0==='oculto'?'selected':''}>Ocultos</option><option value="excluido" ${st0==='excluido'?'selected':''}>Excluídos</option></select>
      <span class="pm-mini">${L.length} tipo(s) na tela</span></div>
    ${grupos.map(g=>`<section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas ${g.ico}" style="color:${g.cor}"></i> ${g.rot}</h3><p>${L.filter(t=>t.g===g.k).length} tipo(s)</p></div></div><div class="pm-grid">${L.filter(t=>t.g===g.k).map(card).join('')}</div></section>`).join('')||'<div class="gf-vazio"><p>Nenhum tipo neste filtro.</p></div>'}`;
}
// catálogo em PDF para o cliente: tipos que a fábrica trabalha (sem preço) ou as peças cadastradas com foto e preço
async function catalogoPDF(modo){
  const c=CFG();let itens;
  if(modo==='precos'){const ps=pecas();if(!ps.length)return toast('Cadastre as peças primeiro.','error');UI._showBusy('Montando o catálogo…');let fotos=[];try{fotos=await Promise.all(ps.map(p=>fotoUrl(p.rowid).catch(()=>'')));}finally{UI._hideBusy();}
    itens=ps.map((p,i)=>{const x=calc(p,1);return {g:x.t.g,img:fotos[i]?`<img src="${fotos[i]}" style="width:100%;height:170px;object-fit:cover;border-radius:8px;display:block">`:iluPeca(p,{w:380,h:210,cotas:true,detalhe:true}),tit:p.nome,cod:p.codigo,linhas:[x.g.desc+' · '+nf(x.peso,1)+' kg',x.t.uso],preco:x.preco||r2(x.sug),at:num(p.preco_atacado),atMin:num(p.atacado_min)};});}
  else{itens=tiposTodos().filter(t=>statusTipo(t.k,c)==='ativo').map(t=>({g:t.g,img:ilu(t,t.d,{w:380,h:210,cotas:true}),tit:t.nome,linhas:[(t.tam||[]).length?'Tamanhos: '+t.tam.map(x=>x[0]).join(' · '):CAT.geo(t,t.d).desc,t.uso,t.norma||'']}));if(!itens.length)return toast('Marque os tipos que a fábrica trabalha.','error');}
  const card=it=>`<div style="flex:1;min-width:0;border:1px solid #e5e5ea;border-radius:12px;padding:8px;background:#fff"><div style="background:#FAFAFB;border-radius:8px">${it.img}</div><div style="font-size:12.5px;font-weight:800;margin-top:5px">${fe(it.tit)}${it.cod?` <span style="color:#6e6e73;font-weight:600">· ${fe(it.cod)}</span>`:''}</div>${it.linhas.filter(Boolean).map(l=>`<div style="font-size:9.5px;color:#6e6e73;line-height:1.35">${fe(l)}</div>`).join('')}${it.preco!=null?`<div style="margin-top:5px;font-size:11.5px"><b style="color:#0071E3;font-size:13px">${R(it.preco)}</b> varejo${it.at?` · <b>${R(it.at)}</b> atacado${it.atMin?' (a partir de '+nf(it.atMin,0)+' pç)':''}`:''}</div>`:''}</div>`;
  const par=(a,b)=>`<div style="display:flex;gap:10px;margin-bottom:2px">${card(a)}${b?card(b):'<div style="flex:1"></div>'}</div>`,blocos=[];
  CAT.GRUPOS.forEach(g=>{const L=itens.filter(x=>x.g===g.k);for(let i=0;i<L.length;i+=2)blocos.push((i?'':`<div style="font-size:15px;font-weight:800;border-left:5px solid ${g.cor};padding:5px 10px;background:#F5F5F7;border-radius:8px;margin:4px 0 8px">${fe(g.rot)}</div>`)+par(L[i],L[i+1]));});
  App._relExportPaginado({titulo:modo==='precos'?'Catálogo de produtos e preços':'Catálogo de produtos',subLinhas:[`Fábrica de pré-moldados · ${new Date().toLocaleDateString('pt-BR')}`],blocosArr:blocos,
    posHtml:`<p style="font-size:10px;color:#6e6e73;margin-top:8px">${modo==='precos'?`Preços sujeitos a alteração. Encomendas reservadas com ${nf(num(c.sinal),0)}% de sinal; entrega com as peças curadas e o pagamento completo. `:''}Medidas em centímetros; desenhos ilustrativos. Consulte outras medidas sob encomenda.</p>`});
}
function fichaTipo(t){
  if(!t)return;const c=CFG(),st=statusTipo(t.k,c),arm=CAT.armadura(t,t.d,t.arm!=='nenhuma'&&t.armPad!==false),tr=tracoDe('p:'+t.tr);
  const mudar=v=>async()=>{await salvarCfg(cf=>{cf.tipos_status=cf.tipos_status||{};if(v==='ativo')delete cf.tipos_status[t.k];else cf.tipos_status[t.k]=v;});toast(v==='ativo'?'Tipo marcado como "trabalhamos".':v==='oculto'?'Tipo ocultado.':'Tipo excluído do catálogo da fábrica.','success');};
  const bts=[];
  if(st!=='ativo')bts.push({html:'<i class="fas fa-check"></i> Trabalhamos com este',acao:mudar('ativo')});
  if(st!=='oculto')bts.push({html:'<i class="fas fa-eye-slash"></i> Ocultar',acao:mudar('oculto')});
  if(st!=='excluido')bts.push({html:'<i class="fas fa-ban"></i> Excluir do catálogo',acao:async()=>{if(pecas().some(p=>p.tipo_k===t.k))throw new Error('Há peças cadastradas deste tipo: exclua-as antes ou apenas oculte o tipo.');await mudar('excluido')();}});
  if(t.custom)bts.push({html:'<i class="fas fa-pen"></i> Editar tipo',acao:async()=>{setTimeout(()=>formTipo(t),60);}});
  if(st==='ativo')bts.push({html:'<i class="fas fa-plus"></i> Cadastrar peça deste tipo',cls:'pri',acao:async()=>{setTimeout(()=>formPeca(null,{tipo_k:t.k}),60);}});
  janela(t.nome,`<div class="pm-form"><div><div style="background:#F8FAFC;border-radius:12px;padding:6px">${ilu(t,t.d,{cotas:true})}</div><div style="background:#fff;border:1px solid #EEF1F6;border-radius:12px;padding:4px;margin-top:8px">${CAT.desenho(t,t.d,arm)}</div>
      <p class="pm-mini" style="margin:8px 0 0">${fe(t.uso||'')}${t.norma?` · ${fe(t.norma)}`:''}</p></div>
    <div data-sem-ordem><table class="pm-tab2"><tbody><tr><td>Grupo</td><td>${fe(grupoDe(t.g).rot)}</td></tr><tr><td>Forma (família)</td><td>${fe((CAT.FAM[t.f]||{}).rot||t.f)}</td></tr>
      <tr><td>Armadura</td><td>${t.arm==='nenhuma'?'Sem armadura':fe(armTxt(t.arm))}${t.armPad===false?' <small>(começa desligada; liga na peça)</small>':''}</td></tr>
      <tr><td>Traço indicado</td><td>${fe(tr.nome)} <small>${fe(tr.fck||'')}</small></td></tr><tr><td>Cura até liberar</td><td>${t.cura} dias</td></tr>
      ${t.estr?'<tr><td colspan="2"><b style="color:#B42318">Peça estrutural:</b> a armadura é estimada — produzir só com projeto estrutural.</td></tr>':''}</tbody></table>
      ${t.tam.length?`<h5 style="margin:10px 0 6px;font:800 12px Inter">Tamanhos de mercado</h5><ul class="pm-arml">${t.tam.map(([r,d,peso])=>`<li><i class="fas fa-ruler" style="color:#1652D8"></i><span>${fe(r)}${peso?` <small>peso de referência ${nf(peso,1)} kg · calculado ${nf(CAT.geo(t,d).V*(t.arm!=='nenhuma'&&t.armPad!==false?2500:2300),1)} kg</small>`:''}</span></li>`).join('')}</ul>`:''}</div></div>`,bts,860);
}
const armTxt=a=>({linear:'Barras longitudinais + estribos (calculados pelas medidas)',malha:'Malha POP (tela soldada)',fios:'Fios longitudinais Ø 4,2 mm',gaiola:'Gaiola: espiras + barras retas (tubo armado)',trelica:'Treliça TR 8644',projeto:'Estimativa — conforme projeto estrutural',v1:'Armadura informada no cadastro antigo',nenhuma:'Sem armadura'}[a]||a);
function formTipo(t){
  const b=t&&t.reg?t.reg:{g:'design',f:'prisma',arm:'nenhuma',tr:'c25',cura:7,d:{}};
  const j=janela(t?'Editar tipo':'Novo tipo de peça',`<div class="fin-aviso"><div>Use para uma peça que não está no catálogo. A <b>forma</b> define as medidas pedidas, o volume e o desenho.</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld" style="grid-column:1/-1"><label>Nome <span class="obg">*</span></label><input data-k="nome" value="${fe(b.nome||'')}"></div>
    <div class="fin-fld"><label>Grupo</label><select data-k="g">${CAT.GRUPOS.map(g=>`<option value="${g.k}" ${g.k===b.g?'selected':''}>${g.rot}</option>`).join('')}</select></div>
    <div class="fin-fld"><label>Forma (família)</label><select data-k="f">${Object.entries(CAT.FAM).map(([k,f])=>`<option value="${k}" ${k===b.f?'selected':''}>${f.rot}</option>`).join('')}</select></div>
    <div class="fin-fld"><label>Armadura</label><select data-k="arm">${['nenhuma','linear','malha','fios','gaiola','trelica','projeto'].map(a=>`<option value="${a}" ${a===b.arm?'selected':''}>${armTxt(a)}</option>`).join('')}</select></div>
    <div class="fin-fld"><label>Traço indicado</label><select data-k="tr">${Object.entries(CAT.TR).map(([k,x])=>`<option value="${k}" ${k===b.tr?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
    <div class="fin-fld"><label>Dias de cura</label><input data-k="cura" inputmode="numeric" value="${fe(String(b.cura||7))}"></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Uso</label><input data-k="uso" value="${fe(b.uso||'')}"></div></div>`,
    [...(t&&t.reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{if(pecas().some(p=>p.tipo_k===t.k))throw new Error('Há peças deste tipo cadastradas.');setTimeout(()=>apagarReg(t.reg,t.nome),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar tipo',cls:'pri',acao:async jj=>{const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),o=t&&t.reg?{...t.reg}:{tipo:'tipo_custom',data_lancamento:todayDateTime()};
      ['nome','g','f','arm','tr','uso'].forEach(k=>o[k]=g(k));o.cura=num(g('cura'))||7;o.d=o.d||{};if(!o.nome)throw new Error('Dê um nome ao tipo.');await gravar(o,t&&t.reg?t.reg.rowid:null);toast('Tipo salvo no catálogo.','success');}}],600);
  return j;
}
function telaTracos(sub){
  const c=CFG();
  return cabG('Traços de concreto','Proporções em massa (cimento = 1), fator água/cimento e a "receita" em latas de 18 litros por saco de cimento — do jeito que se mede no canteiro.',`<button type="button" class="gf-bt" data-pm="traco-novo"><i class="fas fa-plus"></i> Novo traço</button>`)+sub+
    `<section class="gf-sec"><div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Traço</th><th>Por saco de cimento (latas de ${nf(num(c.lata)||18,0)} L)</th><th class="n">Cimento/m³</th><th class="n">Materiais/m³</th><th>Resistência</th></tr></thead><tbody>
    ${tracos().map(t=>{const rc=receita(t,c),k=rc?rc.k:traco1m3(t,c),cm=k.cimento/50*num(c.precos.cimento)+k.areia/(num(c.unit.areia)*1000)*num(c.precos.areia)+k.po/(num(c.unit.po)*1000)*num(c.precos.po)+k.brita/(num(c.unit.brita)*1000)*num(c.precos.brita)+k.agua/1000*num(c.precos.agua)+k.aditivo*num(c.precos.aditivo);
      return `<tr class="pm-lin" data-pm="traco" data-id="${t.id}"><td><b>${fe(t.nome)}</b>${t.padrao?'<small>padrão do sistema</small>':''}</td><td>${rc?receitaTxt(rc):'—'}</td><td class="n">${nf(k.cimento,0)} kg<small>${nf(k.cimento/50,1)} sacos</small></td><td class="n">${R(cm)}</td><td>${fe(t.fck||'')}</td></tr>`;}).join('')}
    </tbody></table></div></section>`;
}
const receitaTxt=(rc,mult)=>{mult=mult||1;const L=rc.latas,p=[];if(L.areia)p.push(`${fracao(L.areia*mult)} lata(s) de areia`);if(L.po)p.push(`${fracao(L.po*mult)} de pó de pedra`);if(L.brita)p.push(`${fracao(L.brita*mult)} de brita`);
  p.push(`${nf(rc.porSaco.agua*mult,0)} litros de água`);if(rc.porSaco.aditivo)p.push(`${nf(rc.porSaco.aditivo*mult*1000,0)} g de aditivo`);return `${mult===1?'1 saco':nf(mult,1).replace(',0','')+' sacos'} de cimento + ${p.join(' + ')}`;};
function formTraco(t){
  const padrao=t&&t.padrao,reg=t&&t.reg,c=CFG(),b=t||{nome:'',ar:2,po:0,br:3,ac:0.55,ad:0,uso:''};
  const fld=(k,l,ph)=>`<div class="fin-fld"><label>${l}</label><input data-k="${k}" inputmode="decimal" value="${fe(String(b[k]!=null?b[k]:'').replace('.',','))}" placeholder="${ph||'0'}" ${padrao?'readonly':''}></div>`;
  const prev=jj=>{const x={ar:num(jj.querySelector('[data-k="ar"]').value),po:num(jj.querySelector('[data-k="po"]').value),br:num(jj.querySelector('[data-k="br"]').value),ac:num(jj.querySelector('[data-k="ac"]').value),ad:num(jj.querySelector('[data-k="ad"]').value),vz:b.vz||0},rc=receita(x,c);
    return rc?`Por m³: <b>${nf(rc.k.cimento,0)} kg de cimento</b> (${nf(rc.k.cimento/50,1)} sacos). Na betoneira: <b>${receitaTxt(rc)}</b>.`:'Informe as proporções.';};
  const j=janela(padrao?`Traço padrão — ${b.nome}`:reg?'Editar traço':'Novo traço',`${padrao?'<div class="fin-aviso"><div>Traço padrão do sistema: para mudar, clique em <b>Copiar e ajustar</b>.</div></div>':''}
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld" style="grid-column:1/-1"><label>Nome <span class="obg">*</span></label><input data-k="nome" value="${fe(b.nome||'')}" ${padrao?'readonly':''}></div>
    ${fld('ar','Areia (partes por 1 de cimento)')}${fld('po','Pó de pedra (partes)')}${fld('br','Brita 0 / pedrisco (partes)')}${fld('ac','Fator água/cimento','0,55')}${fld('ad','Aditivo (% do cimento)')}
    <div class="fin-fld" style="grid-column:1/-1"><label>Uso indicado</label><input data-k="uso" value="${fe(b.uso||'')}" ${padrao?'readonly':''}></div></div>
    <div class="fin-aviso" style="margin-top:10px"><div data-tr-prev></div></div>`,
    padrao?[{html:'<i class="fas fa-copy"></i> Copiar e ajustar',cls:'pri',acao:async()=>{setTimeout(()=>formTraco({...b,id:'',padrao:false,reg:null,nome:b.nome+' (ajustado)'}),60);}}]
    :[...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{if(T('peca').some(p=>String(p.traco)===String(reg.rowid)))throw new Error('Há peças usando este traço: troque o traço delas antes.');setTimeout(()=>apagarReg(reg,reg.nome),60);}}]:[]),
      {html:'<i class="fas fa-floppy-disk"></i> Salvar traço',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),o=reg?{...reg}:{tipo:'traco',data_lancamento:todayDateTime()};
      o.nome=g('nome');if(!o.nome)throw new Error('Dê um nome ao traço.');['ar','po','br','ac','ad'].forEach(k=>o[k]=num(g(k)));o.uso=g('uso');if(b.vz)o.vz=b.vz;
      if(!(o.ac>0))throw new Error('Informe o fator água/cimento (ex.: 0,55).');await gravar(o,reg?reg.rowid:null);toast('Traço salvo.','success');}}],620);
  const at=()=>{const e=j.querySelector('[data-tr-prev]');if(e)e.innerHTML=prev(j);};
  j.querySelector('.fin-jan-corpo').addEventListener('input',at);at();
}
// escolher o tipo (do catálogo, só os que a fábrica trabalha) antes de cadastrar a peça
function escolherTipo(cb){
  const c=CFG(),ts=tiposTodos().filter(t=>statusTipo(t.k,c)==='ativo');
  const grade=(q,g)=>{const L=ts.filter(t=>(!g||t.g===g)&&(!q||t.nome.toLowerCase().includes(q.toLowerCase())));
    return L.length?L.map(t=>`<div class="pm-tipo" data-tk="${t.k}" style="border-left:4px solid ${grupoDe(t.g).cor}">${ilu(t,t.d,{grao:false})}<b>${fe(t.nome)}</b><small>${fe(grupoDe(t.g).rot)}</small></div>`).join(''):'<p class="pm-mini">Nenhum tipo. Ative tipos em Peças e catálogo › Catálogo de tipos.</p>';};
  const j=janela('Nova peça — escolha o tipo',`<div class="pm-filtros" style="margin-bottom:10px"><input type="search" data-tk-busca placeholder="Buscar tipo…" style="flex:1;min-width:180px">
    <select data-tk-grupo><option value="">Todos os grupos</option>${CAT.GRUPOS.map(g=>`<option value="${g.k}">${g.rot}</option>`).join('')}</select></div><div class="pm-tipos" data-tk-grade>${grade('','')}</div>`,[],980);
  const at=()=>{j.querySelector('[data-tk-grade]').innerHTML=grade(j.querySelector('[data-tk-busca]').value,j.querySelector('[data-tk-grupo]').value);};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);
  corpo.addEventListener('click',ev=>{const d=ev.target.closest('[data-tk]');if(!d)return;const t=tipoK(d.dataset.tk);document.getElementById('fin-ov').classList.remove('open');setTimeout(()=>cb(t),60);});
}
function fichaPeca(p){
  if(!p)return;const x=calc(p,1),e=estoque().P[String(p.rowid)]||{},rc=receita(x.tr);
  janela(`${p.codigo?p.codigo+' · ':''}${p.nome}`,`<div class="pm-form"><div><div style="background:#F8FAFC;border-radius:12px;padding:6px">${iluPeca(p,{cotas:true})}</div><div style="background:#fff;border:1px solid #EEF1F6;border-radius:12px;padding:4px;margin-top:8px">${CAT.desenho(x.t,p.dims||{},x.arm)}</div>
      <div class="pm-nums" style="grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0"><div><small>Prontas</small><b>${nf(Math.max(0,e.disp||0),0)}</b></div><div><small>Em cura</small><b>${nf(e.cura||0,0)}</b></div><div><small>Reservadas</small><b>${nf(e.res||0,0)}</b></div><div><small>Em produção</small><b>${nf(e.emProd||0,0)}</b></div></div>
      ${armHtml(x)}${rc?`<div class="fin-aviso" style="margin-top:8px"><div><b>Traço:</b> ${fe(x.tr.nome)} — ${receitaTxt(rc)}.</div></div>`:''}
      <div data-pm-foto style="margin-top:8px"></div></div>
    <div class="pm-res">${resumoHtml(p,1)}</div></div>`,
    [{html:'<i class="fas fa-print"></i> Ficha técnica',acao:async()=>{abrirQtdFicha(p);return false;}},
     {html:'<i class="fas fa-camera"></i> Foto da peça',acao:async()=>{fotoEnviar(p);return false;}},
     {html:'<i class="fas fa-copy"></i> Duplicar',acao:async()=>{setTimeout(()=>formPeca(p,{copia:true}),60);}},
     {html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(p,p.nome),60);}},
     {html:'<i class="fas fa-clipboard-list"></i> Planejar produção',acao:async()=>{setTimeout(()=>formOrdem(null,{peca:p.rowid}),60);}},
     {html:'<i class="fas fa-pen"></i> Editar',cls:'pri',acao:async()=>{setTimeout(()=>formPeca(p),60);}}],1000);
  fotoMostrar(p);
}
function armHtml(x){
  const A=x.arm,li=[];
  if(!A.barras.length&&!A.malha&&!A.kgExtra)return `<p class="pm-mini" style="margin:6px 0">${x.t.arm==='nenhuma'?'Peça sem armadura.':'Armadura desligada nesta peça.'}</p>`;
  A.barras.forEach(b=>{li.push(`<li><i class="fas fa-grip-lines"></i><span><b>${b.t==='t'?'Treliça':'Ø '+nf(b.d,1)+' mm '+(ehCA60(b.d)?'(CA-60)':'(CA-50)')}</b> — ${nf(b.q,0)} × ${b.t==='e'||b.t==='r'?nf(b.l,0)+' cm':nf(b.l/100,2)+' m'}: ${fe(b.txt||'')}${b.dob?` · dobrar ${fe(b.dob)}`:''}</span></li>`);});
  if(A.malha)li.push(`<li class="m"><i class="fas fa-border-all"></i><span><b>Malha POP</b> — ${nf(A.malha.m2,2)} m² por peça: ${fe(A.malha.txt)}</span></li>`);
  if(A.kgExtra)li.push(`<li><i class="fas fa-triangle-exclamation"></i><span>${fe(A.obs)}</span></li>`);
  else if(A.obs)li.push(`<li><i class="fas fa-triangle-exclamation"></i><span>${fe(A.obs)}</span></li>`);
  if(A.cob)li.push(`<li><i class="fas fa-arrows-left-right-to-line" style="color:#667085"></i><span>Cobrimento (espaçador): <b>${nf(A.cob,1)} cm</b></span></li>`);
  return `<h5 style="margin:6px 0;font:800 12px Inter;text-transform:uppercase;letter-spacing:.05em;color:#344054">Armadura (calculada pelas medidas)</h5><ul class="pm-arml">${li.join('')}</ul>`;
}
function resumoHtml(p,n){
  const x=calc(p,n),c=CFG(),un=n>1?` (${nf(n,0)} peças)`:'';
  const linhaIns=k=>{const q=x.est[k];if(!q)return '';const i=insDe(k);let det='';
    if(k==='cimento'||k==='areia'||k==='po'||k==='brita')det=`${nf(x.kg[k],1)} kg`;
    else if(k==='aco50'||k==='aco60')det=Object.values(x.porBitola).filter(b=>b.trelica?k==='aco60':(k==='aco60')===ehCA60(b.d)).map(b=>`${b.trelica?'treliça':'Ø '+nf(b.d,1)}: ${nf(b.m,1)} m · ${b.barras} barra(s) de 12 m`).join('<br>');
    else if(k==='malha')det=`${nf(x.malhaM2,2)} m²`;
    return `<tr><td>${fe(i.nome)}<small>${det}</small></td><td class="n">${nf(q,q<1?3:2)} ${i.un}</td><td class="n">${R(x.custoMat[k])}</td></tr>`;};
  return `<div data-sem-ordem><div class="pm-big"><span>Volume${un}</span><b>${nf(x.Vt,4)} m³</b><span>peso ${nf(x.peso*x.n,1)} kg</span></div>
    ${x.g.aj?`<p class="pm-mini" style="margin:-4px 0 6px"><i class="fas fa-scale-balanced"></i> Volume ajustado para bater com o peso do catálogo deste tamanho (furos, frisos e rebaixos): × ${nf(x.g.aj,2)}.</p>`:''}
    <h5>Materiais${un}</h5><table><thead><tr><th>Insumo</th><th class="n">Quant.</th><th class="n">Custo</th></tr></thead><tbody>
      ${INS.map(i=>linhaIns(i.k)).join('')}<tr><td>Água do traço<small>${nf(x.aguaL,1)} litros</small></td><td class="n">${nf(x.aguaL/1000,3)} m³</td><td class="n">${R(x.custoMat.agua)}</td></tr>
      <tr class="t"><td>Materiais</td><td></td><td class="n">${R(x.custo.mat)}</td></tr></tbody></table>
    <h5>Custo${un}</h5><table><tbody>
      <tr><td>Materiais</td><td class="n">${R(x.custo.mat)}</td></tr><tr><td>Mão de obra<small>rateio: ${R(rateio(c).mao)}/m³</small></td><td class="n">${R(x.custo.mao)}</td></tr>
      <tr><td>Betoneira (depreciação + manutenção)</td><td class="n">${R(x.custo.betoneira)}</td></tr><tr><td>Energia<small>${nf(x.kwh,2)} kWh</small></td><td class="n">${R(x.custo.energia)}</td></tr>
      <tr><td>Água de cura</td><td class="n">${R(x.custo.agua)}</td></tr><tr><td>Custos fixos rateados</td><td class="n">${R(x.custo.fixos)}</td></tr>
      <tr class="t"><td>Custo total${un}</td><td class="n">${R(x.custo.total)}</td></tr><tr><td><b>Custo por peça</b></td><td class="n"><b>${R(x.un)}</b></td></tr>
      <tr><td>Preço sugerido<small>margem ${nf(num(c.margem),0)}% + impostos ${nf(num(c.impostos),1)}%</small></td><td class="n">${R(x.sug)}</td></tr>
      ${x.preco?`<tr><td>Preço de varejo</td><td class="n">${R(x.preco)}</td></tr><tr><td>Margem sobre o preço</td><td class="n" style="color:${x.margem<0?'#B42318':x.margem<10?'#B54708':'#067647'}"><b>${nf(x.margem,1)}%</b></td></tr>`:''}
      ${num(p.preco_atacado)?`<tr><td>Preço de atacado<small>a partir de ${nf(num(p.atacado_min),0)} peças</small></td><td class="n">${R(num(p.preco_atacado))}</td></tr>`:''}
    </tbody></table></div>`;
}
function formPeca(reg,opts){
  opts=opts||{};const novo=!reg||opts.copia,c=CFG();
  const base=reg?JSON.parse(JSON.stringify(reg)):{tipo_k:opts.tipo_k,dims:{}};
  if(opts.copia){delete base.rowid;base.nome=(base.nome||'')+' (cópia)';}
  const t=tipoK(base.tipo_k)||CAT.tipoDe('outra');if(!reg&&!opts.copia){base.dims={...t.d};base.cura=t.cura;base.traco='p:'+t.tr;base.armadura=t.arm!=='nenhuma'&&t.armPad!==false;base.formas=1;base.ciclo=1;}
  if(novo)base.codigo=proxCodigo();
  const F=CAT.FAM[t.f]||CAT.FAM.manual;
  const dimsHtml=d=>F.campos.map(([k,l])=>`<div class="fin-fld"><label>${l}${t.f==='manual'?'':(k==='vz'?'':' (cm)')}</label><input data-dim="${k}" inputmode="decimal" data-sem-mascara="1" value="${d&&d[k]!=null&&d[k]!==''?fe(String(d[k]).replace('.',',')):''}" placeholder="0"></div>`).join('');
  const html=`<div class="pm-form"><div>
    <div class="pm-bloco"><h5><i class="fas fa-shapes"></i> Tipo: ${fe(t.nome)}</h5><p class="pm-mini" style="margin:-4px 0 8px">${fe(grupoDe(t.g).rot)} · forma ${fe(F.rot.toLowerCase())} · ${fe(t.uso||'')}</p>
      ${t.tam.length?`<div class="fin-fld"><label>Tamanho de mercado</label><select data-pmf="tam"><option value="">— medidas próprias —</option>${t.tam.map(([r],i)=>`<option value="${i}">${fe(r)}</option>`).join('')}</select></div>`:''}
      <div class="fin-linha" data-dims style="margin-top:8px">${dimsHtml(base.dims)}</div>
      ${t.arm!=='nenhuma'?`<label class="nfc-amb" style="margin-top:8px"><input type="checkbox" data-k="armadura" ${base.armadura!==false&&(base.armadura===true||t.armPad!==false)?'checked':''}><span><b>Esta peça leva armadura</b> — ${fe(armTxt(t.arm))}</span></label>`:''}</div>
    <div class="pm-bloco"><h5><i class="fas fa-tag"></i> Identificação e preço</h5><div class="fin-linha">
      <div class="fin-fld"><label>Código</label><input data-k="codigo" value="${fe(base.codigo||'')}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Nome da peça <span class="obg">*</span></label><input data-k="nome" value="${fe(base.nome||'')}" placeholder="${fe(t.nome)}"></div>
      <div class="fin-fld"><label>Preço de varejo (R$)</label><input data-k="preco" value="${base.preco?fe(String(base.preco)):''}" placeholder="vazio = sugerido"></div>
      <div class="fin-fld"><label>Preço de atacado (R$)</label><input data-k="preco_atacado" value="${base.preco_atacado?fe(String(base.preco_atacado)):''}"></div>
      <div class="fin-fld"><label>Atacado a partir de (peças)</label><input data-k="atacado_min" inputmode="numeric" value="${fe(String(base.atacado_min||''))}" placeholder="ex.: 100"></div><div class="fin-fld"><label>NCM (nota fiscal)</label><input data-k="ncm" value="${fe(base.ncm||'')}" placeholder="${CAT.ncmDe?CAT.ncmDe(t):''}"></div></div></div>
    <div class="pm-bloco"><h5><i class="fas fa-industry"></i> Produção</h5><div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Traço</label><select data-k="traco">${tracos().map(x=>`<option value="${x.id}" ${x.id===(LEGADO_TR[base.traco]||base.traco)?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Dias de cura até liberar</label><input data-k="cura" inputmode="numeric" value="${fe(String(base.cura!=null?base.cura:t.cura))}"></div>
      <div class="fin-fld"><label>Formas (moldes) disponíveis</label><input data-k="formas" inputmode="numeric" value="${fe(String(base.formas||1))}"></div>
      <div class="fin-fld"><label>Peças por forma por dia</label><input data-k="ciclo" inputmode="numeric" value="${fe(String(base.ciclo||1))}"></div>
      <div class="fin-fld"><label>Estoque mínimo (peças)</label><input data-k="minimo" inputmode="numeric" value="${fe(String(base.minimo||''))}" placeholder="0"></div>
      <div class="fin-fld"><label>Perda de concreto (%)</label><input data-k="perda" value="${base.perda!=null&&base.perda!==''?fe(String(base.perda)):''}" placeholder="padrão ${nf(num(c.perdas.concreto),0)}%"></div></div></div>
    <div class="fin-fld"><label>Observações</label><textarea data-k="obs" rows="2">${fe(base.obs||'')}</textarea></div></div>
  <div class="pm-res"><div data-pm-desenho style="background:#fff;border-radius:10px;margin-bottom:8px"></div><div data-pm-arm></div>
    <div class="fin-fld" style="margin:8px 0"><label>Calcular para quantas peças?</label><input data-pmf="lote" inputmode="numeric" value="1"></div><div data-pm-res></div></div></div>`;
  const j=janela(novo?'Nova peça':'Editar peça',html,[{html:`<i class="fas fa-floppy-disk"></i> ${novo?'Cadastrar peça':'Salvar'}`,cls:'pri',acao:async jj=>{
    if(!novo&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
    const o=lerPeca(jj,novo?{tipo:'peca',tipo_k:t.k,data_lancamento:todayDateTime()}:{...reg});
    if(!o.nome)o.nome=`${t.nome} ${CAT.geo(t,o.dims).desc}`;
    if(!(geoPeca(o).V>0))throw new Error('Informe as medidas: o volume da peça está zerado.');
    if(o.codigo&&T('peca').some(x=>x.codigo===o.codigo&&String(x.rowid)!==String(novo?'':reg.rowid)))throw new Error(`Já existe uma peça com o código ${o.codigo}.`);
    await gravar(o,novo?null:reg.rowid);toast(novo?'Peça cadastrada.':'Peça salva.','success');}}],1120);
  const corpo=j.querySelector('.fin-jan-corpo');
  // tamanho de mercado com peso de catálogo: o volume é ajustado para bater com o peso real da peça (furos, frisos, rebaixos)
  j._ajuste=num(base.ajuste)||'';
  const atualizar=()=>{const o=lerPeca(j,{tipo_k:t.k}),n=Math.max(1,num((j.querySelector('[data-pmf="lote"]')||{}).value)||1),ok=geoPeca(o).V>0,x=ok?calc(o,1):null;
    j.querySelector('[data-pm-desenho]').innerHTML=(ok?`<div style="background:#F8FAFC;border-radius:10px">${ilu(t,o.dims,{cotas:true})}</div>`:'')+CAT.desenho(t,o.dims,x?x.arm:{barras:[]});
    j.querySelector('[data-pm-arm]').innerHTML=x?armHtml(x):'';
    j.querySelector('[data-pm-res]').innerHTML=ok?resumoHtml(o,n):'<div class="gf-vazio"><i class="fas fa-ruler-combined"></i><p>Informe as medidas para ver os materiais e o custo.</p></div>';
    const nm=j.querySelector('[data-k="nome"]');if(nm&&!nm.value.trim())nm.placeholder=`${t.nome} ${CAT.geo(t,o.dims).desc}`;};
  corpo.addEventListener('input',ev=>{if(ev.target.matches('[data-dim]')){j._ajuste='';const s=j.querySelector('[data-pmf="tam"]');if(s)s.value='';}clearTimeout(j._pmT);j._pmT=setTimeout(atualizar,120);});
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-pmf="tam"]')){j._ajuste='';const tm=ev.target.value!==''?t.tam[+ev.target.value]:null;if(tm){j.querySelector('[data-dims]').innerHTML=dimsHtml(tm[1]);const nm=j.querySelector('[data-k="nome"]');if(nm&&(!nm.value.trim()||nm.dataset.auto))(nm.value=`${t.nome} ${tm[0]}`,nm.dataset.auto='1');
      if(tm[2]){const x=calc(lerPeca(j,{tipo_k:t.k}),1);if(x.peso>0){const k=Math.min(4,Math.max(0.25,tm[2]/x.peso));if(Math.abs(k-1)>0.03)j._ajuste=Math.round(k*1000)/1000;}}}}atualizar();});
  atualizar();
  return j;
}
function lerPeca(j,o){
  const v=k=>{const e=j.querySelector(`[data-k="${k}"]`);return e?(e.type==='checkbox'?e.checked:String(e.value||'').trim()):'';};
  ['codigo','nome','obs','ncm'].forEach(k=>o[k]=v(k));o.traco=v('traco')||o.traco;
  const ar=j.querySelector('[data-k="armadura"]');if(ar)o.armadura=ar.checked;
  o.preco=v('preco')?r2(num(v('preco'))):'';o.preco_atacado=v('preco_atacado')?r2(num(v('preco_atacado'))):'';o.atacado_min=v('atacado_min')?num(v('atacado_min')):'';
  o.cura=v('cura')!==''?num(v('cura')):o.cura;o.minimo=v('minimo')?num(v('minimo')):'';o.perda=v('perda')!==''?num(v('perda')):'';o.formas=Math.max(1,num(v('formas'))||1);o.ciclo=Math.max(1,num(v('ciclo'))||1);
  // medidas: vírgula ou ponto valem como decimal (0.096 m³ não vira 96)
  o.dims={};j.querySelectorAll('[data-dim]').forEach(e=>{const s=String(e.value).trim();if(s!==''){const n=parseFloat(s.replace(/\s/g,'').replace(',','.'));o.dims[e.dataset.dim]=isFinite(n)?n:0;}});
  if(j._ajuste!==undefined){if(j._ajuste)o.ajuste=j._ajuste;else delete o.ajuste;}
  return o;
}
/* fotos da peça (guardadas como anexo da fábrica, no Storage) */
const OB_FAB='__fabrica__';
async function lerFoto(f){
  // reduz para no máximo 1400 px antes de enviar (foto do celular chega com 3–8 MB)
  const url=await new Promise((ok,er)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=er;r.readAsDataURL(f);});
  const img=await new Promise((ok,er)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=er;i.src=url;});
  const k=Math.min(1,1400/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  const blob=await new Promise(ok=>cv.toBlob(ok,'image/jpeg',0.82));return new File([blob],(f.name||'foto').replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'});
}
function fotoEnviar(p){
  if(!GS.docs||!GS.docs.enviarArq)return toast('Envio de fotos indisponível.','error');
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.onchange=async()=>{const f=inp.files[0];if(!f)return;
    try{UI._showBusy('Enviando a foto…');const fx=await lerFoto(f);await GS.docs.enviarArq(OB_FAB,{aba:'pm_foto',peca:String(p.rowid)},fx);FOTOS.lista=null;delete FOTOS.url[String(p.rowid)];toast('Foto guardada.','success');fotoMostrar(p);}catch(e){toast(e.message||String(e),'error');}finally{UI._hideBusy();}};inp.click();
}
// fotos das peças: lista lida uma vez; cada foto baixada uma vez (fica guardada enquanto a tela está aberta)
const FOTOS={lista:null,url:{}};
function listaFotos(){if(!GS.docs||!GS.docs.listarArq)return Promise.resolve([]);if(!FOTOS.lista)FOTOS.lista=GS.docs.listarArq(OB_FAB,true).then(L=>(L||[]).filter(a=>a.aba==='pm_foto')).catch(()=>[]);return FOTOS.lista;}
function fotoUrl(pid){pid=String(pid||'');if(!pid)return Promise.resolve('');if(FOTOS.url[pid])return FOTOS.url[pid];
  return FOTOS.url[pid]=listaFotos().then(L=>{const a=L.filter(x=>String(x.peca)===pid).sort((x,y)=>String(y.enviado_em||'').localeCompare(String(x.enviado_em||'')))[0];if(!a)return '';
    return new Promise(ok=>google.script.run.withSuccessHandler(r=>{const ps=((r&&r.partes)||[]).slice().sort((x,y)=>x.ordem-y.ordem);ok(ps.length?`data:${a.mime||'image/jpeg'};base64,${ps.map(x=>x.conteudo).join('')}`:'');}).withFailureHandler(()=>ok('')).partesAnexo(a.uid));});}
// troca a ilustração pela foto real onde houver [data-th="id da peça"]
function pintarFotos(root){if(!root)return;root.querySelectorAll('[data-th]').forEach(el=>{const pid=el.dataset.th;if(!pid||el.dataset.thOk===pid)return;el.dataset.thOk=pid;
  fotoUrl(pid).then(u=>{if(u&&el.dataset.th===pid)el.innerHTML=`<img src="${u}" alt="Foto da peça">`;});});}
async function fotoMostrar(p){const box=document.querySelector('#fin-jan [data-pm-foto]');if(!box)return;const u=await fotoUrl(p.rowid);
  box.innerHTML=u?`<img src="${u}" alt="Foto da peça" style="width:100%;border-radius:12px;border:1px solid #E4E9F2">`:'';}
// ilustração 3D da peça (do catálogo, nas medidas dela)
const ilu=(t,d,o)=>CAT.ilustracao?CAT.ilustracao(t,d||{},o):CAT.desenho(t,d||{},{barras:[]});
const iluPeca=(p,o)=>p?ilu(tipoDePeca(p),p.dims,o):'';
const miniPeca=p=>iluPeca(p,{w:150,h:110,grao:false});
// janela de cima (não fecha a que está aberta): escolher a peça vendo a foto, ou ampliar uma foto
function sobre(html,ao){const d=document.createElement('div');d.className='pm-pop';d.innerHTML=html;document.body.appendChild(d);
  const fechar=()=>{d.remove();document.removeEventListener('keydown',esc,true);},esc=ev=>{if(ev.key==='Escape'){ev.stopPropagation();fechar();}};
  document.addEventListener('keydown',esc,true);d.addEventListener('click',ev=>{if(ev.target===d||ev.target.closest('[data-pop-x]'))return fechar();if(ao)ao(ev,fechar);});return {d,fechar};}
function ampliar(pid){const p=pecaDe(pid);if(!p)return;const o=sobre(`<div class="pm-zoom"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 6px 8px"><b style="font:800 14px Inter">${fe(p.codigo?p.codigo+' · ':'')}${fe(p.nome)}</b><button type="button" class="pm-x" data-pop-x><i class="fas fa-xmark"></i></button></div><div data-th="${p.rowid}">${iluPeca(p,{w:760,h:420,cotas:true})}</div></div>`);pintarFotos(o.d);}
function escolherPeca(atual,cb){
  const E=estoque(),L=pecas();
  const card=p=>{const x=E.P[String(p.rowid)]||{livre:0};return `<div class="pm-pk ${String(p.rowid)===String(atual)?'on':''}" data-pk="${p.rowid}" data-busca="${fe([p.nome,p.codigo].join(' ').toLowerCase())}"><div class="im" data-th="${p.rowid}">${miniPeca(p)}</div>
    <button type="button" class="zb" data-zoom="${p.rowid}" title="Ampliar"><i class="fas fa-magnifying-glass-plus"></i></button><div class="tx"><b>${fe(p.nome)}</b>${fe(p.codigo||'')} · ${nf(Math.max(0,x.livre),0)} livres</div></div>`;};
  const o=sobre(`<div class="pm-pop-box"><div class="pm-pop-cab"><b>Escolha a peça</b><input type="search" data-pk-busca placeholder="Buscar…" style="padding:8px 12px;border:1px solid #D0D5DD;border-radius:10px;font:13px Inter;min-width:200px"><button type="button" class="pm-x" data-pop-x><i class="fas fa-xmark"></i></button></div>
    <div class="pm-pop-grid">${L.map(card).join('')}</div></div>`,(ev,fechar)=>{const z=ev.target.closest('[data-zoom]');if(z)return ampliar(z.dataset.zoom);const c=ev.target.closest('[data-pk]');if(c){fechar();cb(c.dataset.pk);}});
  const bx=o.d.querySelector('[data-pk-busca]');bx.addEventListener('input',()=>{const q=bx.value.toLowerCase().trim();o.d.querySelectorAll('[data-pk]').forEach(c=>c.style.display=!q||c.dataset.busca.includes(q)?'':'none');});
  setTimeout(()=>bx.focus(),50);pintarFotos(o.d);
}
// miniatura clicável ao lado da lista de peças (abre a escolha com fotos)
const thumbBt=pid=>{const p=pecaDe(pid);return `<button type="button" class="pm-th" data-pmf="pick" data-th="${p?p.rowid:''}" title="Ver as peças com foto">${p?miniPeca(p):''}</button>`;};
function trocarThumb(tr,pid){const b=tr.querySelector('[data-pmf="pick"]');if(!b)return;const p=pecaDe(pid);b.dataset.th=p?p.rowid:'';delete b.dataset.thOk;b.innerHTML=p?miniPeca(p):'';pintarFotos(tr);}

/* ═══════════════ FICHA DE PRODUÇÃO (para quem confecciona — leitura fácil) ═══════════════ */
const icSaco=n=>`<svg width="34" height="42" viewBox="0 0 34 42"><rect x="2" y="4" width="30" height="36" rx="5" fill="#D0D5DD" stroke="#475467" stroke-width="2"/><text x="17" y="27" text-anchor="middle" font-size="10" font-weight="800" fill="#344054">50kg</text></svg>`;
const icLata=(cor,meia)=>`<svg width="30" height="38" viewBox="0 0 30 38"><path d="M4 8 L26 8 L23 36 L7 36 Z" fill="${meia?'#fff':cor}" stroke="#344054" stroke-width="2"/>${meia?`<path d="M5.6 22 L24.4 22 L23 36 L7 36 Z" fill="${cor}"/>`:''}<path d="M4 8 Q15 0 26 8" fill="none" stroke="#344054" stroke-width="2"/></svg>`;
const repetir=(n,f)=>{const i=Math.floor(n),m=n-i>=0.5;if(i>10)return `${f(false)}<b style="font-size:22px"> × ${fracao(n)}</b>`;let s='';for(let k=0;k<i;k++)s+=f(false);if(m)s+=f(true);return s||'—';};
// peças que pedem corpo de prova por lote (estruturais, drenagem, postes, tampas, lajes, barreiras)
function pedeCP(t){return !!t&&(!!t.estr||t.arm==='projeto'||['dren','estr'].includes(t.g)||/poste|cruzeta|tampa|tampao|grelha|laje|jersey|guarda/.test(String(t.k)));}
// a ficha sai no padrão das exportações do sistema (logo, título, rodapé com página) — em blocos, letra grande para a produção
const SEC=(n,tit)=>`<div style="display:flex;align-items:center;gap:10px;background:#F5F5F7;border-left:5px solid #0071E3;border-radius:8px;padding:7px 12px;margin:4px 0 8px"><span style="display:inline-grid;place-items:center;width:26px;height:26px;border-radius:99px;background:#0071E3;color:#fff;font:800 14px Arial">${n}</span><b style="font-size:16px;letter-spacing:.02em">${tit}</b></div>`;
function fichaHtml(p,qtd,op,quebra){p=pecaN(p);
  const c=CFG(),x=calc(p,qtd),rc=receita(x.tr,c),cura=num(p.cura!=null&&p.cura!==''?p.cura:x.t.cura),inicio=op&&dt(op.inicio)?dt(op.inicio):hoje0();
  const sacos=x.est.cimento||0,bet=rc?Math.max(1,Math.ceil(sacos/rc.sacosBet-1e-9)):0,porBet=rc&&qtd>0?qtd/bet:0,latasTot=k=>rc?rc.latas[k]*sacos:0,latasBet=k=>rc?rc.latas[k]*rc.sacosBet:0;
  const lin=(ic,rot,val,det)=>`<tr><td style="width:52px;text-align:center;border-bottom:1px solid #e5e5ea;padding:6px">${ic}</td><td style="border-bottom:1px solid #e5e5ea;padding:6px;font-size:15px"><b>${rot}</b>${det?`<div style="font-size:11px;color:#6e6e73">${det}</div>`:''}</td><td style="border-bottom:1px solid #e5e5ea;padding:6px;text-align:right;font-size:19px;font-weight:800;white-space:nowrap">${val}</td></tr>`;
  const mats=[];
  if(sacos)mats.push(lin(icSaco(),'Cimento',`${fracao(Math.ceil(sacos*2)/2)} sacos`,`${nf(x.kg.cimento,0)} kg`));
  if(x.est.areia)mats.push(lin(icLata('#F4C27A'),'Areia',`${nf(Math.ceil(latasTot('areia')),0)} latas`,`${nf(x.est.areia,2)} m³`));
  if(x.est.po)mats.push(lin(icLata('#C7CDD6'),'Pó de pedra',`${nf(Math.ceil(latasTot('po')),0)} latas`,`${nf(x.est.po,2)} m³`));
  if(x.est.brita)mats.push(lin(icLata('#98A2B3'),'Brita',`${nf(Math.ceil(latasTot('brita')),0)} latas`,`${nf(x.est.brita,2)} m³`));
  mats.push(lin(icLata('#84CAFF'),'Água',`${nf(x.aguaL,0)} litros`,`≈ ${nf(x.aguaL/(rc?rc.lata:18),0)} latas`));
  if(x.est.aditivo)mats.push(lin('<span style="font-size:22px">🧴</span>','Aditivo',`${nf(x.est.aditivo,2)} kg`,''));
  Object.values(x.porBitola).forEach(b=>mats.push(lin('<span style="font-size:26px;color:#D92D20">═</span>',b.trelica?'Treliça TR 8644':`Ferro Ø ${nf(b.d,1)} mm`,`${b.barras} barras de 12 m`,`${nf(b.kg,1)} kg`)));
  if(x.est.malha)mats.push(lin('<span style="font-size:24px;color:#7A2FE0">▦</span>','Malha POP',`${Math.ceil(x.est.malha)} painéis`,`${nf(x.malhaM2,1)} m² (painel 2 × 3 m)`));
  if(x.est.arame)mats.push(lin('<span style="font-size:22px">➰</span>','Arame recozido',`${nf(x.est.arame,1)} kg`,''));
  if(x.est.desmoldante)mats.push(lin('<span style="font-size:22px">🛢</span>','Desmoldante',`${nf(x.est.desmoldante,1)} litros`,''));
  const ferro=[];
  x.arm.barras.forEach(b=>{if(b.t==='e')ferro.push(`<b>Faça ${nf(b.q*qtd,0)} estribos</b> (${nf(b.q,0)} por peça) com ferro Ø ${nf(b.d,1)} mm: corte pedaços de <b>${nf(b.l,0)} cm</b> e dobre em retângulo${b.dob?` de <b>${fe(b.dob)}</b>`:''}.`);
    else if(b.t==='r')ferro.push(`<b>Faça ${nf(b.q*qtd,0)} anéis</b> (${nf(b.q,0)} por peça) com ferro Ø ${nf(b.d,1)} mm: corte pedaços de <b>${nf(b.l,0)} cm</b> e feche em ${fe(b.dob||'anel')}.`);
    else if(b.t==='t')ferro.push(`<b>Corte ${nf(b.q*qtd,0)} pedaços de treliça</b> com <b>${nf(b.l/100,2)} m</b>.`);
    else ferro.push(`<b>Corte ${nf(b.q*qtd,0)} pedaços</b> (${nf(b.q,0)} por peça) de ferro Ø ${nf(b.d,1)} mm com <b>${nf(b.l/100,2)} m</b>.`);});
  if(x.arm.malha)ferro.push(`<b>Malha POP:</b> corte pedaços do tamanho da peça (menos ${nf(x.arm.cob*2,0)} cm) — ${nf(x.arm.malha.m2,2)} m² por peça, ${x.arm.malha.camadas===2?'duas camadas':'uma camada'}.`);
  if(x.arm.cob)ferro.push(`Use <b>espaçador de ${nf(x.arm.cob,1)} cm</b> para o ferro não encostar na forma.`);
  if(x.arm.obs)ferro.push(`<span style="color:#B42318"><b>Atenção:</b> ${fe(x.arm.obs)}</span>`);
  const cp=pedeCP(x.t);
  const passos=[`Passe <b>desmoldante</b> em todas as formas antes de começar.`,x.arm.barras.length||x.arm.malha?`Coloque a <b>armadura</b> nas formas com os espaçadores.`:null,
    rc&&!rc.seco?`Na betoneira: ponha <b>metade da água</b>, depois a <b>brita</b>, o <b>cimento</b>, a <b>areia${x.tr.po?' e o pó de pedra':''}</b> e o <b>resto da água</b> aos poucos. Bata de <b>3 a 5 minutos</b>.`:`Concreto seco: misture bem os secos e coloque a água <b>aos poucos</b> até a massa ficar úmida, sem escorrer (apertada na mão, forma bola sem molhar a mão).`,
    cp?`<b>Molde 2 corpos de prova</b> (cilindros de 10 × 20 cm) com o concreto desta produção e anote o número do lote neles.`:null,
    `Encha a forma e <b>vibre ou bata</b> bem para tirar o ar (até parar de sair bolha).`,`Acerte a superfície e deixe na sombra.`,`Desforme no dia seguinte (mínimo 18 horas) com cuidado.`,
    `<b>Molhe as peças 3 vezes por dia durante 7 dias</b> (cura).`,`Peças liberadas para venda em <b>${cura} dias</b> — a partir de <b>${brDe(addD(inicio,cura))}</b>.`].filter(Boolean);
  const li=a=>`<ol style="font-size:15px;line-height:1.55;margin:2px 0 4px 22px;padding:0">${a.map(s=>`<li style="margin-bottom:3px">${s}</li>`).join('')}</ol>`;
  let n=0;const B=[];
  B.push(`<div ${quebra?'data-pdf-quebra="1"':''} style="display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid #e5e5ea;border-radius:12px;padding:12px 16px">
    <div style="min-width:0"><div style="font-size:10px;font-weight:800;letter-spacing:.1em;color:#0071E3">FICHA DE PRODUÇÃO${op?` · OP Nº ${fe(String(op.numero))}`:''}</div>
      <div style="font-size:22px;font-weight:800;margin:2px 0">${fe(p.nome)}</div><div style="font-size:12px;color:#6e6e73">${fe(p.codigo||'')}${p.codigo?' · ':''}${fe(x.g.desc)} · ${nf(x.peso,1)} kg cada · ${fe(x.tr.nome)}</div>
      <div style="font-size:12.5px;margin-top:6px;display:flex;flex-wrap:wrap;gap:14px">${op&&op.fim?`<span>Prazo: <b>${brDe(dt(op.fim))}</b></span>`:''}${op&&op.cliente?`<span>Para: <b>${fe(op.cliente)}</b></span>`:''}<span>Concreto total: <b>${nf(x.Vc,2)} m³</b></span>${rc?`<span>Betonadas: <b>${bet}</b></span>`:''}</div></div>
    <div style="text-align:center;border:3px solid #1d1d1f;border-radius:14px;padding:6px 18px;flex:none"><div style="font-size:10px;font-weight:800">FAZER</div><div style="font-size:42px;font-weight:800;line-height:1">${nf(qtd,0)}</div><div style="font-size:10px;font-weight:800">PEÇAS</div></div></div>`);
  B.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div style="border:1px solid #e5e5ea;border-radius:12px;background:#FAFAFB;padding:4px">${iluPeca(p,{cotas:true,w:380,h:230})}</div><div style="border:1px solid #e5e5ea;border-radius:12px;padding:4px">${CAT.desenho(x.t,p.dims||{},x.arm)}</div></div>`);
  B.push(SEC(++n,'SEPARE O MATERIAL')+`<table style="width:100%;border-collapse:collapse;table-layout:auto">${mats.join('')}</table>`);
  if(ferro.length)B.push(SEC(++n,'PREPARE O FERRO')+li(ferro));
  if(rc)B.push(SEC(++n,'RECEITA DO CONCRETO — CADA BETONADA')+`<div style="display:flex;flex-wrap:wrap;gap:10px 22px;align-items:flex-end;padding:10px;border:2px dashed #AEAEB2;border-radius:12px">
      <div style="display:flex;align-items:flex-end;gap:2px;flex-wrap:wrap">${repetir(rc.sacosBet,()=>icSaco())}<b style="font-size:16px;margin-left:6px">${fracao(rc.sacosBet)} saco${rc.sacosBet>1?'s':''} de cimento</b></div>
      ${rc.latas.areia?`<div style="display:flex;align-items:flex-end;gap:2px;flex-wrap:wrap">${repetir(latasBet('areia'),m=>icLata('#F4C27A',m))}<b style="font-size:16px;margin-left:6px">${fracao(latasBet('areia'))} lata${latasBet('areia')>1?'s':''} de areia</b></div>`:''}
      ${rc.latas.po?`<div style="display:flex;align-items:flex-end;gap:2px;flex-wrap:wrap">${repetir(latasBet('po'),m=>icLata('#C7CDD6',m))}<b style="font-size:16px;margin-left:6px">${fracao(latasBet('po'))} lata${latasBet('po')>1?'s':''} de pó de pedra</b></div>`:''}
      ${rc.latas.brita?`<div style="display:flex;align-items:flex-end;gap:2px;flex-wrap:wrap">${repetir(latasBet('brita'),m=>icLata('#98A2B3',m))}<b style="font-size:16px;margin-left:6px">${fracao(latasBet('brita'))} lata${latasBet('brita')>1?'s':''} de brita</b></div>`:''}
      <div style="display:flex;align-items:flex-end;gap:2px;flex-wrap:wrap">${repetir(Math.max(0.5,latasBet('agua')),m=>icLata('#84CAFF',m))}<b style="font-size:16px;margin-left:6px">${nf(rc.porSaco.agua*rc.sacosBet,0)} litros de água</b></div>
      ${rc.porSaco.aditivo?`<b style="font-size:16px">+ ${nf(rc.porSaco.aditivo*rc.sacosBet*1000,0)} g de aditivo</b>`:''}</div>
    <p style="font-size:14px;margin:8px 0 2px">Fazer <b>${bet} betonada${bet>1?'s':''}</b> no total${porBet?` · cada betonada rende cerca de <b>${nf(porBet,porBet<10?1:0)} peça${porBet>=2?'s':''}</b>`:''}. Lata = balde de ${nf(rc.lata,0)} litros. Areia molhada: use um pouco menos de água.</p>`);
  B.push(SEC(++n,'PASSO A PASSO')+li(passos));
  B.push(`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px 18px;font-size:13px;border-top:2px solid #1d1d1f;padding-top:10px;margin-top:4px">
    <span>Lote: ____________________</span><span>Responsável: ____________________</span><span>Início: ___/___ &nbsp;&nbsp; Fim: ___/___</span><span>Peças boas: _______ &nbsp; Quebradas: _______</span>${cp?'<span>Corpos de prova moldados: _______</span>':''}</div>`);
  return B;
}
// várias fichas num PDF só: cada ordem começa numa folha nova
function imprimirFichaDoc(fichas,titulo,sub){
  if(!fichas.length)return toast('Nada para imprimir.','error');
  const blocos=[];fichas.forEach((f,i)=>{const b=Array.isArray(f)?f.slice():[String(f)];if(i)b[0]=b[0].replace('<div ','<div data-pdf-quebra="1" ');blocos.push(...b);});
  App._relExportPaginado({titulo:titulo||'Ficha de produção',subLinhas:[sub||'Vixsul Empreendimentos · fábrica de pré-moldados'],blocosArr:blocos});
}
function abrirQtdFicha(p){
  janela('Ficha técnica — quantas peças?',`<div class="fin-fld"><label>Quantidade a produzir</label><input data-k="q" inputmode="numeric" value="10"></div><p class="pm-mini">A ficha sai com o desenho, o material, o ferro e a receita do concreto para essa quantidade — em letra grande, para a equipe da produção.</p>`,
    [{html:'<i class="fas fa-print"></i> Imprimir ficha',cls:'pri',acao:async j=>{const q=num(j.querySelector('[data-k="q"]').value);if(!(q>0))throw new Error('Informe a quantidade.');imprimirFichaDoc([fichaHtml(p,q,null)],'Ficha de produção',`${p.nome} · ${nf(q,0)} peças`);}}],420);
}
function imprimirFichas(L){
  const ok=L.filter(o=>pecaDe(o.peca));if(!ok.length)return toast('Nenhuma ordem aberta para imprimir.','error');
  imprimirFichaDoc(ok.map(o=>fichaHtml(pecaDe(o.peca),Math.max(1,num(o.qtd)-prodDaOrdem(o.rowid)),o)),ok.length>1?'Fichas de produção':`Ficha de produção — OP nº ${ok[0].numero}`,`${ok.length} ordem(ns) de produção`);
}

/* ═══════════════ PLANEJAMENTO (ordens de produção) ═══════════════ */
const COLS_OP=[{k:'planejada',rot:'Planejadas',cor:'#7F56D9',ico:'fa-clipboard-list'},{k:'producao',rot:'Em produção',cor:'#1652D8',ico:'fa-industry'},{k:'concluida',rot:'Concluídas',cor:'#067647',ico:'fa-circle-check'}];
function necessidade(){
  const c=CFG(),abertas=ordens().filter(o=>o.status==='planejada'||o.status==='producao'),ei=estoqueInsumos(),tot={};let m3=0,diasF=0;
  abertas.forEach(o=>{const p=pecaDe(o.peca);if(!p)return;const falta=Math.max(0,num(o.qtd)-prodDaOrdem(o.rowid));if(!falta)return;const x=calc(p,falta,c);m3+=x.Vt;Object.entries(x.est).forEach(([k,q])=>tot[k]=(tot[k]||0)+q);
    diasF=Math.max(diasF,Math.ceil(falta/Math.max(1,num(p.formas||1)*num(p.ciclo||1))));});
  const lin=INS.filter(i=>tot[i.k]).map(i=>{const comprar=Math.max(0,tot[i.k]-Math.max(0,ei[i.k].saldo));return {i,prec:tot[i.k],saldo:ei[i.k].saldo,comprar,custo:comprar*ei[i.k].preco};});
  const cap=num(c.prod_m3)/22;return {abertas,lin,m3,diasProd:cap>0?Math.ceil(m3/cap):null,diasF,custo:lin.reduce((s,x)=>s+x.custo,0)};
}
function telaPlanejamento(){
  const h=hoje0(),L=ordens().filter(o=>o.status!=='cancelada');
  const card=o=>{const p=pecaDe(o.peca),feito=prodDaOrdem(o.rowid),tot=num(o.qtd),pc=tot?Math.min(100,feito/tot*100):0,fim=dt(o.fim),atras=o.status!=='concluida'&&fim&&fim<h,v=o.venda?vendaDe(o.venda):null;
    return `<article class="vk-card" style="--cor:${(COLS_OP.find(c=>c.k===o.status)||COLS_OP[0]).cor}" data-pm="ordem" data-id="${o.rowid}" draggable="true" data-card="${o.rowid}">
      <div class="vk-top"><b>OP nº ${fe(String(o.numero||''))}</b>${atras?pill('atrasada','err','fa-clock'):fim?pill('até '+brDe(fim).slice(0,5),'info'):''}</div>
      <div class="vk-obra"><i class="fas fa-cube"></i>${fe(p?p.nome:'(peça excluída)')}</div>
      ${v?`<div class="vk-sub">${pill('venda nº '+v.numero,'warn','fa-cart-shopping')} ${fe(v.cliente||'')}</div>`:o.cliente?`<div class="vk-sub">para ${fe(o.cliente)}</div>`:''}
      <div class="vk-val"><span>${nf(feito,0)} de ${nf(tot,0)} peças</span><b>${nf(pc,0)}%</b></div><div class="pm-barra ${pc>=100?'ok':''}"><i style="width:${pc}%"></i></div></article>`;};
  const cols=COLS_OP.map(c=>{const itens=L.filter(o=>(o.status||'planejada')===c.k).sort((a,b)=>String(a.fim||'9').localeCompare(String(b.fim||'9')));return {c,itens,sub:`${itens.length} ordem(ns) · ${nf(itens.reduce((s,o)=>s+num(o.qtd),0),0)} peças`};});
  const nec=necessidade();
  setTimeout(()=>{const w=document.querySelector('#pm-app .vk-quadro');if(w&&!w._lig){w._lig=1;GS.ligarArraste(w,moverOrdem);}},0);
  return cabG('Planejamento da produção','Ordens de produção (OP): o que fazer, quanto e até quando. Cada ordem imprime a sua ficha de produção com o material, o ferro e a receita do concreto. Pedidos de venda sem peça pronta geram a ordem sozinhos.',
      `<button type="button" class="gf-bt" data-pm="fichas-abertas"><i class="fas fa-print"></i> Fichas das ordens abertas</button><button type="button" class="gf-bt pri" data-pm="ordem-nova"><i class="fas fa-plus"></i> Nova ordem de produção</button>`)+
    GS.colunasHtml(cols,card,{planejada:'Nenhuma ordem planejada',producao:'Nenhuma ordem em produção',concluida:'Ordens concluídas aparecem aqui'})+
    `<section class="gf-sec"><div class="gf-sec-cab"><div><h3>Materiais para as ordens abertas</h3><p>Falta produzir ${nf(nec.m3,2)} m³ de concreto${nec.diasProd!=null?` — cerca de ${nec.diasProd} dia(s) no ritmo previsto${nec.diasF?`, e ${nec.diasF} dia(s) pelas formas disponíveis`:''}`:''}.</p></div>
      ${nec.lin.length?'<button type="button" class="gf-bt mini" data-pm="compras-pdf"><i class="fas fa-print"></i> Lista de compras (PDF)</button>':''}</div>
      ${nec.lin.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Insumo</th><th class="n">Precisa</th><th class="n">Em estoque</th><th class="n">Comprar</th><th class="n">Custo estimado</th></tr></thead><tbody>
        ${nec.lin.map(x=>`<tr><td>${fe(x.i.nome)}</td><td class="n">${nf(x.prec,2)} ${x.i.un}</td><td class="n">${nf(x.saldo,2)} ${x.i.un}</td><td class="n" style="${x.comprar>0?'color:#B42318;font-weight:800':''}">${x.comprar>0?nf(x.comprar,2)+' '+x.i.un:'—'}</td><td class="n">${x.comprar>0?R(x.custo):'—'}</td></tr>`).join('')}
        <tr class="t"><td colspan="4">Total a comprar</td><td class="n">${R(nec.custo)}</td></tr></tbody></table></div>`:'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Nenhuma ordem aberta pedindo material.</p></div>'}</section>`;
}
/* ═══ TRAVAS DE FLUXO: o que cada mudança exige (mostra a lista com o que já está ok e o que falta) ═══ */
function trava(titulo,deps,ir){
  sobre(`<div class="pm-pop-box" style="max-width:560px"><div class="pm-pop-cab"><b><i class="fas fa-lock" style="color:#B42318"></i> ${fe(titulo)}</b><button type="button" class="pm-x" data-pop-x><i class="fas fa-xmark"></i></button></div>
    <div style="padding:14px 16px 16px"><p class="pm-mini" style="margin:0 0 8px">Não foi feito. Esta mudança depende de:</p><ul class="pm-arml">${deps.map(d=>`<li style="${d.ok?'':'background:#FEF3F2;border-color:#FECDCA'}"><i class="fas ${d.ok?'fa-circle-check':'fa-circle-xmark'}" style="color:${d.ok?'#067647':'#B42318'}"></i><span>${d.txt}</span></li>`).join('')}</ul>
    ${ir?`<div style="display:flex;justify-content:flex-end;margin-top:12px"><button type="button" class="gf-bt pri" data-pop-ir><i class="fas fa-arrow-right"></i> ${fe(ir.rot)}</button></div>`:''}</div></div>`,(ev,fechar)=>{if(ev.target.closest('[data-pop-ir]')){fechar();ir.f();}});
  return false;
}
// insumos que faltam para produzir uma lista de {peca, qtd} (soma boas + refugo); "devolve" = consumo já lançado que volta (edição)
function faltaInsumos(itens,devolve){
  const ei=estoqueInsumos(),tot={};itens.forEach(it=>{const p=pecaDe(it.peca);if(!p)return;const x=calc(p,num(it.qtd)+num(it.refugo));Object.entries(x.est).forEach(([k,q])=>tot[k]=(tot[k]||0)+q);});
  return INS.filter(i=>tot[i.k]>1e-6).map(i=>{const tem=ei[i.k].saldo+num((devolve||{})[i.k]);return {i,prec:tot[i.k],tem,falta:tot[i.k]-tem};});
}
const depsInsumos=L=>L.map(x=>({ok:x.falta<=1e-6,txt:`${fe(x.i.nome)}: precisa ${nf(x.prec,2)} ${x.i.un} — tem ${nf(Math.max(0,x.tem),2)} ${x.i.un}${x.falta>1e-6?` · <b>faltam ${nf(x.falta,2)} ${x.i.un}</b>`:''}`}));
// regras das ordens de produção ao mudar de coluna (ou de situação na ficha)
function depsOrdem(o,col){
  const feito=prodDaOrdem(o.rowid),tot=num(o.qtd),p=pecaDe(o.peca),d=[];
  if(col==='producao'&&o.status==='planejada'){const fl=faltaInsumos([{peca:o.peca,qtd:Math.max(0,tot-feito)}]);d.push({ok:!!p,txt:'Peça cadastrada'},...depsInsumos(fl));}
  if(col==='concluida')d.push({ok:feito>=tot,txt:`Produção registrada no Diário: ${nf(feito,0)} de ${nf(tot,0)} peças${feito<tot?` — <b>faltam ${nf(tot-feito,0)}</b>`:''}`});
  if(col==='planejada'&&o.status!=='planejada')d.push({ok:feito===0,txt:feito?`Nenhuma peça registrada nesta ordem (já tem ${nf(feito,0)} no Diário)`:'Nenhuma peça registrada nesta ordem'});
  if(col==='producao'&&o.status==='concluida')d.push({ok:feito<tot,txt:feito>=tot?'A ordem já está completa — para fazer mais, crie outra ordem':'Ainda faltam peças nesta ordem'});
  if(col==='cancelada')d.push({ok:feito===0,txt:feito?`Nenhuma peça produzida (já tem ${nf(feito,0)}) — conclua a ordem com o que foi feito`:'Nenhuma peça produzida'},{ok:!o.venda||!!(vendaDe(o.venda)&&vendaDe(o.venda).status==='cancelada'),txt:o.venda?'Ordem de uma venda: cancele ou edite pela venda':'Ordem sem venda ligada'});
  return d;
}
async function moverOrdem(id,col){
  const o=ordens().find(x=>String(x.rowid)===String(id));if(!o||!col||o.status===col)return;
  const d=depsOrdem(o,col);if(d.some(x=>!x.ok)){render();return trava(`OP nº ${o.numero}: não pode ir para "${(COLS_OP.find(c=>c.k===col)||{rot:col}).rot}"`,d,col==='concluida'?{rot:'Registrar a produção',f:()=>formProducao(null,{peca:o.peca,ordem:o.rowid})}:col==='producao'&&o.status==='planejada'?{rot:'Lançar entrada de insumo',f:()=>formCompra(null)}:null);}
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
  pre=pre||{};if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e catálogo).','error');
  const b=reg||{status:'planejada',inicio:hojeISO(),peca:pre.peca||pecas()[0].rowid,qtd:pre.qtd||''},feito=reg?prodDaOrdem(reg.rowid):0,vend=reg&&reg.venda?vendaDe(reg.venda):null;
  const j=janela(reg?`OP nº ${reg.numero}`:'Nova ordem de produção',`<div class="pm-form"><div><div class="fin-linha">
      <div class="fin-fld" style="grid-column:1/-1"><label>Peça <span class="obg">*</span></label><select data-k="peca" ${vend?'disabled':''}>${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(b.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade (peças) <span class="obg">*</span></label><input data-k="qtd" inputmode="numeric" value="${fe(String(b.qtd||''))}" ${vend?'readonly':''}></div>
      <div class="fin-fld"><label>Situação</label><select data-k="status">${COLS_OP.concat([{k:'cancelada',rot:'Cancelada'}]).map(c=>`<option value="${c.k}" ${c.k===b.status?'selected':''}>${c.rot.replace(/s$/,'')}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Início</label><input type="date" data-k="inicio" value="${fe(b.inicio||'')}"></div>
      <div class="fin-fld"><label>Prazo (terminar até)</label><input type="date" data-k="fim" value="${fe(b.fim||'')}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Para (cliente ou pedido)</label><input data-k="cliente" value="${fe(b.cliente||'')}" placeholder="Ex.: estoque" ${vend?'readonly':''}></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Observações</label><textarea data-k="obs" rows="2">${fe(b.obs||'')}</textarea></div></div>
      ${vend?`<div class="fin-aviso laranja" style="margin-top:8px"><div>Ordem ligada à <b>venda nº ${vend.numero}</b> (${fe(vend.cliente||'')}): a peça e a quantidade mudam pela venda.</div></div>`:''}
      ${reg?`<div class="fin-aviso" style="margin-top:8px"><div>Produzido nesta ordem: <b>${nf(feito,0)} de ${nf(num(reg.qtd),0)}</b> peças.</div></div>`:''}</div>
      <div class="pm-res"><div data-op-des></div><div data-op-prev></div></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{if(vend)throw new Error('Ordem de uma venda: cancele ou edite pela venda.');if(feito>0)throw new Error('Esta ordem já tem produção registrada.');setTimeout(()=>apagarReg(reg,`OP nº ${reg.numero}`),60);}},
      {html:'<i class="fas fa-industry"></i> Registrar produção',acao:async()=>{setTimeout(()=>formProducao(null,{peca:reg.peca,ordem:reg.rowid}),60);}},
      {html:'<i class="fas fa-print"></i> Ficha de produção',acao:async()=>{const p=pecaDe(reg.peca);if(p)imprimirFichaDoc([fichaHtml(p,Math.max(1,num(reg.qtd)-feito),reg)],'Ficha de produção — OP nº '+reg.numero,p.nome);return false;}}]:[]),
     {html:`<i class="fas fa-floppy-disk"></i> ${reg?'Salvar':'Criar e imprimir a ficha'}`,cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg)&&!vend)throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),o=reg?{...reg}:{tipo:'ordem',numero:proxNum('ordem','numero'),data_lancamento:todayDateTime()};
      if(!vend){o.peca=g('peca');o.qtd=num(g('qtd'));o.cliente=g('cliente');}o.status=g('status');
      if(reg&&o.status!==reg.status){const d=depsOrdem(reg,o.status);if(d.some(x=>!x.ok))return trava(`OP nº ${reg.numero}: não pode mudar para "${(COLS_OP.find(c=>c.k===o.status)||{rot:'Cancelada'}).rot}"`,d);}
      if(reg&&num(o.qtd)<prodDaOrdem(reg.rowid))return trava(`OP nº ${reg.numero}: quantidade menor do que já foi feito`,[{ok:false,txt:`A ordem já tem ${nf(prodDaOrdem(reg.rowid),0)} peças registradas no Diário — a quantidade não pode ser menor que isso`}]);
      if(!reg&&o.status!=='planejada')return trava('Ordem nova começa como Planejada',[{ok:false,txt:'Crie a ordem como Planejada e mude a situação depois, conforme a produção acontece'}]);o.inicio=g('inicio');o.fim=g('fim');o.obs=g('obs');
      if(!(num(o.qtd)>0))throw new Error('Informe a quantidade de peças.');if(o.fim&&o.inicio&&o.fim<o.inicio)throw new Error('O prazo não pode ser antes do início.');
      if(!reg){const p=pecaDe(o.peca);if(p)imprimirFichaDoc([fichaHtml(p,num(o.qtd),o)],'Ficha de produção — OP nº '+o.numero,p.nome);}
      await gravar(o,reg?reg.rowid:null);toast(reg?'Ordem salva.':`Ordem de produção nº ${o.numero} criada.`,'success');}}],900);
  const at=()=>{const p=pecaDe(j.querySelector('[data-k="peca"]').value),q=num(j.querySelector('[data-k="qtd"]').value),e=j.querySelector('[data-op-prev]'),d=j.querySelector('[data-op-des]');if(!e)return;
    if(!p){e.innerHTML='';return;}const x=calc(p,Math.max(1,q||1));d.innerHTML=CAT.desenho(x.t,p.dims||{},x.arm);
    if(!q){e.innerHTML='<p class="pm-mini">Informe a quantidade para ver o material.</p>';return;}const rc=receita(x.tr),sacos=x.est.cimento||0,bet=rc?Math.ceil(sacos/rc.sacosBet-1e-9):0,dd=Math.ceil(q/Math.max(1,num(p.formas||1)*num(p.ciclo||1)));
    e.innerHTML=`<div class="pm-big"><span>${nf(q,0)} peças</span><b>${nf(x.Vt,2)} m³</b><span>${bet} betonada(s) · ${dd} dia(s) pelas formas</span></div>${resumoHtml(p,q)}`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',()=>{clearTimeout(j._pmT);j._pmT=setTimeout(at,150);});corpo.addEventListener('change',at);at();
}

/* ═══════════════ LOTES: CORPOS DE PROVA, ENSAIOS, RASTREIO E ETIQUETAS ═══════════════
   Cada peça produzida num dia é um lote (L + aammdd + nº). Corpos de prova (CP) moldados no lote; ensaio de
   compressão aos 7 e 28 dias: resultado do exemplar = o maior dos CPs da mesma idade (NBR 5738/5739/12655);
   aos 28 dias tem de atingir o fck do traço; antes disso, a referência é a evolução típica (7 d ≈ 65%).
   Rastreio: as entregas consomem os lotes pela ordem de fabricação (o mais antigo sai primeiro). */
const ymd=d=>{d=d instanceof Date?d:dt(d);return d?String(d.getFullYear()).slice(2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'):'000000';};
const loteDe=(r,it,i)=>it.lote||`L${ymd(r.data)}-R${r.rowid}${i?'.'+(i+1):''}`;
function lotes(){const o=[];T('producao').forEach(r=>itensProd(r).forEach((it,i)=>o.push({lote:loteDe(r,it,i),r,it,i,peca:String(it.peca),data:r.data,qtd:num(it.qtd),refugo:num(it.refugo),cp:num(it.cp)})));
  return o.sort((a,b)=>String(a.data).localeCompare(String(b.data))||a.lote.localeCompare(b.lote));}
const loteInfo=cod=>lotes().find(l=>l.lote===cod)||null;
const ensaiosDe=cod=>T('ensaio').filter(e=>e.lote===cod).sort((a,b)=>num(a.idade)-num(b.idade)||String(a.data).localeCompare(String(b.data)));
const fckDe=tr=>{const m=String(tr&&tr.fck||'').match(/(\d+(?:[.,]\d+)?)/);return m?parseFloat(m[1].replace(',','.')):0;};
const FAT_IDADE={3:0.45,7:0.65,14:0.85,28:1,63:1};
function situacaoLote(l){
  if(!l||!l.cp)return null;const es=ensaiosDe(l.lote),h=hoje0(),f28=addD(dt(l.data)||h,28),e28=es.filter(e=>num(e.idade)>=28),ult=es[es.length-1];
  if(e28.length){const ok=e28.every(e=>e.situacao==='aprovado');return {k:ok?'aprovado':'reprovado',rot:ok?'Aprovado aos 28 dias':'Reprovado aos 28 dias',cor:ok?'ok':'err',es,f28};}
  if(ult&&ult.situacao==='abaixo')return {k:'atencao',rot:`Abaixo do esperado aos ${ult.idade} dias`,cor:'warn',es,f28};
  if(h>addD(f28,3))return {k:'atrasado',rot:'Ensaio de 28 dias atrasado',cor:'err',es,f28};
  return {k:'pendente',rot:`Ensaio de 28 dias em ${brDe(f28).slice(0,5)}`,cor:'info',es,f28};
}
function rastreio(){
  const porVenda={},porLote={},fila={};lotes().forEach(l=>(fila[l.peca]=fila[l.peca]||[]).push({lote:l.lote,resta:l.qtd}));
  vendas().filter(v=>(v.status==='entregue'||v.status==='devolvida')&&v.entrega).sort((a,b)=>String(a.entrega).localeCompare(String(b.entrega))||num(a.numero)-num(b.numero)).forEach(v=>
    (v.itens||[]).forEach(it=>{let q=num(it.qtd);for(const x of (fila[String(it.peca)]||[])){if(q<=0)break;if(x.resta<=0)continue;const u=Math.min(q,x.resta);x.resta-=u;q-=u;
      (porVenda[v.rowid]=porVenda[v.rowid]||[]).push({lote:x.lote,peca:it.peca,qtd:u});(porLote[x.lote]=porLote[x.lote]||[]).push({venda:v.rowid,numero:v.numero,cliente:v.cliente,data:v.entrega,qtd:u});}}));
  return {porVenda,porLote};
}
function fichaLote(cod){
  const l=loteInfo(cod);if(!l)return toast('Lote não encontrado.','error');const p=pecaDe(l.peca),t=tipoDePeca(p||{}),tr=p?tracoDaPeca(p):null,st=situacaoLote(l),es=ensaiosDe(cod),rs=(rastreio().porLote[cod]||[]);
  const lib=addD(dt(l.data)||hoje0(),num(p&&p.cura!=null&&p.cura!==''?p.cura:t.cura||7)),op=l.it.ordem?ordens().find(o=>String(o.rowid)===String(l.it.ordem)):null;
  janela(`Lote ${cod}`,`<div class="pm-form"><div><div data-th="${p?p.rowid:''}" class="pm-svgbox" style="background:#F8FAFC;border-radius:12px">${iluPeca(p)}</div>
      <table class="pm-tab2" data-sem-ordem style="margin-top:8px"><tbody><tr><td>Peça</td><td><b>${fe(p?p.nome:'(excluída)')}</b> <small>${fe(p&&p.codigo||'')}</small></td></tr>
      <tr><td>Fabricação</td><td>${fe(brDe(dt(l.data)))}${l.r.turno?' · '+fe(l.r.turno):''}</td></tr><tr><td>Quantidade</td><td>${nf(l.qtd,0)} boas${l.refugo?` · ${nf(l.refugo,0)} refugo`:''}</td></tr>
      <tr><td>Traço</td><td>${fe(tr?tr.nome:'')} <small>${fe(tr&&tr.fck||'')}</small></td></tr><tr><td>Liberação</td><td>${fe(brDe(lib))}</td></tr>
      ${op?`<tr><td>Ordem</td><td>OP nº ${fe(String(op.numero))}${op.cliente?' · '+fe(op.cliente):''}</td></tr>`:''}${eqLista(l.r).length?`<tr><td>Equipe</td><td>${fe(eqLista(l.r).join(', '))}</td></tr>`:''}</tbody></table></div>
    <div><div class="pm-bloco"><h5><i class="fas fa-flask"></i> Corpos de prova e ensaios</h5>
      ${l.cp?`<p class="pm-mini" style="margin:0 0 6px">${nf(l.cp,0)} corpo(s) de prova moldado(s). ${st?pill(st.rot,st.cor):''}</p>`:'<p class="pm-mini" style="margin:0 0 6px">Nenhum corpo de prova registrado neste lote.</p>'}
      ${es.length?`<table class="pm-tab2" data-sem-ordem><thead><tr><th>Idade</th><th>Data</th><th class="n">Resultado</th><th class="n">Esperado</th><th>Situação</th></tr></thead><tbody>${es.map(e=>`<tr class="pm-lin" data-ens="${e.rowid}"><td>${nf(num(e.idade),0)} dias</td><td>${fe(brDe(dt(e.data)))}</td><td class="n"><b>${nf(num(e.resultado),1)} MPa</b><small>${(e.valores||[]).map(v=>nf(v,1)).join(' · ')}</small></td><td class="n">${nf(num(e.esperado),1)} MPa</td><td>${pill(e.situacao==='aprovado'?'aprovado':e.situacao==='parcial'?'dentro do esperado':e.situacao==='abaixo'?'abaixo do esperado':'reprovado',e.situacao==='aprovado'||e.situacao==='parcial'?'ok':e.situacao==='abaixo'?'warn':'err')}</td></tr>`).join('')}</tbody></table>`:''}</div>
      <div class="pm-bloco"><h5><i class="fas fa-route"></i> Para quem foi (rastreio)</h5>
      ${rs.length?`<ul class="pm-arml">${rs.map(x=>`<li><i class="fas fa-truck" style="color:#1652D8"></i><span>${fe(brDe(dt(x.data)))} · venda nº ${fe(String(x.numero))} · <b>${fe(x.cliente||'')}</b> · ${nf(x.qtd,0)} peça(s)</span></li>`).join('')}</ul><p class="pm-mini" style="margin:6px 0 0">Estimado pela ordem de saída: o lote mais antigo sai primeiro.</p>`:'<p class="pm-mini" style="margin:0">Nenhuma entrega usou este lote ainda.</p>'}</div></div></div>`,
    [{html:'<i class="fas fa-qrcode"></i> Etiquetas',acao:async()=>{setTimeout(()=>formEtiquetas(cod),60);}},
     {html:'<i class="fas fa-flask"></i> Registrar ensaio',cls:'pri',acao:async()=>{setTimeout(()=>formEnsaio(cod,null),60);}}],900);
  const jb=document.querySelector('#fin-jan .fin-jan-corpo');if(jb){pintarFotos(jb);jb.addEventListener('click',ev=>{const r=ev.target.closest('[data-ens]');if(r){const e=T('ensaio').find(x=>String(x.rowid)===r.dataset.ens);document.getElementById('fin-ov').classList.remove('open');setTimeout(()=>formEnsaio(cod,e),60);}});}
}
function formEnsaio(cod,reg){
  const l=loteInfo(cod);if(!l)return toast('Lote não encontrado.','error');const p=pecaDe(l.peca),tr=p?tracoDaPeca(p):null,d0=dt(l.data)||hoje0();
  const ateHoje=d=>isoDe(d>hoje0()?hoje0():d),b=reg||{idade:28,data:ateHoje(addD(d0,28)),valores:Array(Math.max(1,Math.min(6,l.cp||2))).fill(''),fck:fckDe(tr)||'',laboratorio:''};
  const cpIn=(v,i)=>`<div class="fin-fld"><label>CP ${i+1} (MPa)</label><input data-cpv inputmode="decimal" data-sem-mascara="1" value="${v!==''&&v!=null?fe(String(v).replace('.',',')):''}" placeholder="0,0"></div>`;
  const j=janela(reg?`Ensaio do lote ${cod}`:`Registrar ensaio — lote ${cod}`,`<div class="fin-resumo">${fe(p?p.nome:'')} · fabricado em ${fe(brDe(d0))} · ${fe(tr?tr.nome:'')}</div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Idade do ensaio</label><select data-k="idade">${[3,7,14,28,63].map(x=>`<option value="${x}" ${x===num(b.idade)?'selected':''}>${x} dias</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Data do ensaio <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>fck exigido (MPa) <span class="obg">*</span></label><input data-k="fck" inputmode="decimal" data-sem-mascara="1" value="${b.fck!==''?fe(String(b.fck).replace('.',',')):''}"></div>
      <div class="fin-fld"><label>Laboratório</label><input data-k="laboratorio" value="${fe(b.laboratorio||'')}" placeholder="Ex.: próprio, laboratório da cidade"></div></div>
    <div class="fin-linha" data-cps style="margin-top:6px">${(b.valores||['']).map(cpIn).join('')}</div><button type="button" class="gf-bt mini" data-pmf="cp-add" style="margin-top:6px"><i class="fas fa-plus"></i> Corpo de prova</button>
    <div class="fin-fld" style="margin-top:8px"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}"></div><div class="fin-aviso" style="margin-top:8px"><div data-en-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Ensaio de ${reg.idade} dias do lote ${cod}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar ensaio',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const r=ler(jj);if(!r.data)throw new Error('Informe a data do ensaio.');if(r.data>hojeISO())throw new Error('A data do ensaio não pode ser no futuro: registre no dia em que o laboratório romper os corpos de prova.');if(!r.valores.length)throw new Error('Informe o resultado de ao menos um corpo de prova.');if(!(r.fck>0))throw new Error('Informe o fck exigido.');if(r.valores.some(x=>x>120)||r.fck>120)throw new Error('Resistência acima de 120 MPa: confira o valor (em MPa, não em kgf).');
      await gravar({...(reg||{tipo:'ensaio',data_lancamento:todayDateTime()}),lote:cod,peca:l.peca,data_moldagem:l.data,...r},reg?reg.rowid:null);
      toast(r.situacao==='reprovado'?'Ensaio registrado: lote REPROVADO — separe as peças e avalie com o responsável técnico.':'Ensaio registrado.',r.situacao==='reprovado'?'error':'success');}}],640);
  function ler(jj){const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),pf=s=>{const n=parseFloat(String(s).replace(',','.'));return isFinite(n)?n:0;};
    const idade=num(g('idade')),valores=[...jj.querySelectorAll('[data-cpv]')].map(e=>pf(e.value)).filter(v=>v>0),fck=pf(g('fck')),resultado=valores.length?Math.max(...valores):0,esperado=r2(fck*(FAT_IDADE[idade]||1));
    const situacao=resultado>=esperado-1e-9?(idade>=28?'aprovado':'parcial'):(idade>=28?'reprovado':'abaixo');return {idade,data:g('data'),valores,fck,resultado,esperado,situacao,laboratorio:g('laboratorio'),obs:g('obs')};}
  const at=()=>{const r=ler(j),e=j.querySelector('[data-en-prev]');if(!e)return;e.innerHTML=!r.valores.length?`Informe a resistência de cada corpo de prova. Aos ${r.idade} dias o esperado é <b>${nf(r.esperado,1)} MPa</b>${r.idade<28?` (${nf((FAT_IDADE[r.idade]||1)*100,0)}% do fck)`:''}.`
      :`Resultado do exemplar (o maior): <b>${nf(r.resultado,1)} MPa</b> · esperado ${nf(r.esperado,1)} MPa → <b style="color:${r.situacao==='aprovado'||r.situacao==='parcial'?'#067647':'#B42318'}">${r.situacao==='aprovado'?'APROVADO':r.situacao==='parcial'?'dentro do esperado':r.situacao==='abaixo'?'abaixo do esperado — acompanhe o de 28 dias':'REPROVADO'}</b>.`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-k="idade"]')&&!reg)j.querySelector('[data-k="data"]').value=ateHoje(addD(d0,num(ev.target.value)));at();});
  corpo.addEventListener('click',ev=>{if(ev.target.closest('[data-pmf="cp-add"]')){const box=j.querySelector('[data-cps]');box.insertAdjacentHTML('beforeend',cpIn('',box.children.length));}});at();
}
/* etiquetas com QR Code (texto sem acentos: qualquer celular lê, mesmo sem internet) */
let QRP=null;
function carregarQR(){if(window.qrcode)return Promise.resolve();if(QRP)return QRP;return QRP=new Promise((ok,er)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  s.onload=()=>ok();s.onerror=()=>{QRP=null;er(new Error('Não consegui carregar o gerador de QR Code. Confira a internet e tente de novo.'));};document.head.appendChild(s);});}
const ascii=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7E\n]/g,'');
function qrSvg(txt){const qr=window.qrcode(0,'M');qr.addData(ascii(txt));qr.make();const n=qr.getModuleCount();let d='';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))d+=`M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n+4} ${n+4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="width:100%;height:100%;display:block"><rect x="-2" y="-2" width="${n+4}" height="${n+4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;}
const ETQ={p:{rot:'Pequena — 63,5 × 38,1 mm (21 por folha A4, tipo Pimaco A4356 / 6180)',w:63.5,h:38.1,cols:3,rows:7,mt:15.15,ml:7.2,gx:2.54,gy:0,qr:27},
  g:{rot:'Grande — 99,1 × 67,7 mm (8 por folha A4, tipo Pimaco A4363 / 6183)',w:99.1,h:67.7,cols:2,rows:4,mt:13.1,ml:4.65,gx:2.5,gy:0,qr:44}};
function formEtiquetas(cod){
  const l=loteInfo(cod);if(!l)return toast('Lote não encontrado.','error');
  janela(`Etiquetas — lote ${cod}`,`<div class="fin-linha"><div class="fin-fld"><label>Quantidade de etiquetas</label><input data-k="q" inputmode="numeric" value="${Math.max(1,l.qtd)}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Modelo da folha</label><select data-k="m">${Object.entries(ETQ).map(([k,x])=>`<option value="${k}">${x.rot}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Começar na etiqueta nº</label><input data-k="ini" inputmode="numeric" value="1" title="Para aproveitar uma folha já usada"></div></div>
    <p class="pm-mini">Cada etiqueta leva o logo, a peça, o lote, as datas de fabricação e de liberação, o traço e um QR Code com esses dados — para garantia e rastreio. Imprima em folha adesiva A4 ou em papel comum e recorte.</p>`,
    [{html:'<i class="fas fa-print"></i> Imprimir etiquetas',cls:'pri',acao:async j=>{const q=Math.min(500,Math.max(1,num(j.querySelector('[data-k="q"]').value))),m=j.querySelector('[data-k="m"]').value,ini=Math.max(1,num(j.querySelector('[data-k="ini"]').value)||1);
      await imprimirEtiquetas(cod,q,m,ini);}}],620);
}
async function imprimirEtiquetas(cod,q,mk,ini){
  const l=loteInfo(cod),p=pecaDe(l.peca),t=tipoDePeca(p||{}),tr=p?tracoDaPeca(p):null,M=ETQ[mk]||ETQ.p,porFolha=M.cols*M.rows;
  const lib=addD(dt(l.data)||hoje0(),num(p&&p.cura!=null&&p.cura!==''?p.cura:t.cura||7));
  const w=window.open('','_blank');if(!w)return toast('Permita pop-ups deste site para imprimir as etiquetas.','error');
  w.document.write('<p style="font:14px Arial;padding:20px">Montando as etiquetas…</p>');
  try{await carregarQR();}catch(e){w.close();throw e;}
  const txt=`VIXSUL PRE-MOLDADOS\nPeca: ${p?(p.codigo?p.codigo+' ':'')+p.nome:''}\nLote: ${cod}\nFabricacao: ${brDe(dt(l.data))}\nLiberacao: ${brDe(lib)}\nTraco: ${tr?tr.nome:''}${tr&&tr.fck?' ('+tr.fck+')':''}\nVixsul Empreendimentos - CNPJ 64.518.375/0001-20`,qr=qrSvg(txt);
  const etq=`<div class="e"><div class="tx"><img src="${typeof PDF_LOGO_FULL_B64!=='undefined'?PDF_LOGO_FULL_B64:''}" class="lg" alt=""><b class="nm">${fe(p?p.nome:'')}</b><div class="ln" style="font-size:1.12em"><b>Lote ${fe(cod)}</b>${p&&p.codigo?' · '+fe(p.codigo):''}</div>
    <div class="ln">Fabricação: ${fe(brDe(dt(l.data)))}</div><div class="ln">Liberação: ${fe(brDe(lib))}</div><div class="ln">${fe(tr?tr.nome.split(' — ')[0]:'')}${tr&&tr.fck?' · '+fe(tr.fck):''}</div></div><div class="qr">${qr}</div></div>`;
  const tot=q+ini-1,folhas=Math.ceil(tot/porFolha);let h='';
  for(let f=0;f<folhas;f++){h+='<section class="fl">';for(let i=0;i<porFolha;i++){const k=f*porFolha+i;h+=k<ini-1||k>=tot?'<div class="e v"></div>':etq;}h+='</section>';}
  w.document.open();w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas ${fe(cod)}</title><style>
    @page{size:A4;margin:0;} *{box-sizing:border-box;} body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f;}
    .fl{width:210mm;height:297mm;padding:${M.mt}mm 0 0 ${M.ml}mm;display:grid;grid-template-columns:repeat(${M.cols},${M.w}mm);grid-auto-rows:${M.h}mm;column-gap:${M.gx}mm;row-gap:${M.gy}mm;page-break-after:always;}
    .fl:last-child{page-break-after:auto;}
    .e{display:flex;gap:2mm;align-items:center;padding:2.2mm 2.6mm;overflow:hidden;border:0.2mm dashed #d0d5dd;border-radius:2mm;} .e.v{border-color:transparent;}
    .tx{flex:1;min-width:0;font-size:${mk==='g'?9.5:7}pt;line-height:1.25;} .lg{height:${mk==='g'?9:5.5}mm;display:block;margin-bottom:1mm;}
    .nm{display:block;font-size:${mk==='g'?11:8}pt;line-height:1.15;margin-bottom:.6mm;max-height:2.4em;overflow:hidden;} .ln{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .qr{width:${M.qr}mm;height:${M.qr}mm;flex:none;} @media print{.e{border-color:transparent;}}
  </style></head><body>${h}<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);w.document.close();
}

/* ═══════════════ DIÁRIO DE PRODUÇÃO ═══════════════ */
// ponto: horas de cada pessoa no dia (saída − entrada − intervalo; virada da meia-noite conta)
const minDe=t=>{const [h,m]=String(t||'').split(':').map(Number);return isFinite(h)?h*60+(m||0):NaN;};
const horasDe=(e,s,i)=>{let a=minDe(e),b=minDe(s);if(!isFinite(a)||!isFinite(b))return 0;if(b<a)b+=1440;return Math.max(0,(b-a-num(i))/60);};
const pontoDe=r=>Array.isArray(r.ponto)&&r.ponto.length?r.ponto:eqLista(r).map(nome=>({nome}));
function telaProducao(){
  const k=PM.mes,L=T('producao').filter(r=>{const d=dt(r.data);return d&&mesKey(d)===k;}).sort((a,b)=>String(b.data).localeCompare(String(a.data))||(+b.rowid-+a.rowid));
  const h=hoje0(),its=L.flatMap(itensProd),tot=its.reduce((s,it)=>s+num(it.qtd),0),ref=its.reduce((s,it)=>s+num(it.refugo),0);
  const m3=its.reduce((s,it)=>{const p=pecaDe(it.peca);return s+(p?geoPeca(p).V*(num(it.qtd)+num(it.refugo)):0);},0),custo=its.reduce((s,it)=>s+num(it.custo_un)*num(it.qtd),0);
  const nDias=new Set(L.map(r=>r.data)).size,horas=L.reduce((s,r)=>s+pontoDe(r).reduce((a,x)=>a+num(x.horas),0),0);
  const lts=lotes(),comCP=lts.filter(l=>l.cp>0).map(l=>({l,st:situacaoLote(l)})),pend=comCP.filter(x=>x.st&&x.st.k!=='aprovado'),lim=addD(h,-45);
  const cpLista=comCP.filter(x=>x.st&&(x.st.k!=='aprovado'||dt(x.l.data)>=lim)).sort((a,b)=>String(b.l.data).localeCompare(String(a.l.data))).slice(0,30);
  const loteCel=(r,it,i)=>{const cod=loteDe(r,it,i),l=lts.find(x=>x.lote===cod),st=situacaoLote(l);return `<button type="button" class="gf-bt mini" data-pm="lote" data-lote="${fe(cod)}" title="Ensaios, rastreio e etiquetas"><i class="fas fa-tag"></i> ${fe(cod)}</button>${st?' '+pill(st.rot,st.cor,'fa-flask'):''}`;};
  return cabG('Diário de produção','O dia de produção: turno, clima, ponto da equipe, betonadas, ocorrências e as peças feitas. Cada peça do dia vira um lote (com ensaio dos corpos de prova, rastreio e etiqueta com QR Code). Cada registro baixa os insumos e põe as peças em cura.',
      `${GS.selMes(k,'data-pm-mes',12,0)}<button type="button" class="gf-bt pri" data-pm="prod-nova"><i class="fas fa-plus"></i> Registrar o dia</button>`)+
    `<div class="gf-kpis">${kpiG('','fa-cubes','Peças produzidas',nf(tot,0),`${nDias} dia(s) de produção no mês`)}${kpiG('','fa-fill-drip','Concreto',nf(m3,2)+' m³',nDias?`média ${nf(m3/nDias,2)} m³ por dia`:'—')}
      ${kpiG(ref&&ref/(tot+ref)>0.03?'vermelho':'verde','fa-heart-crack','Refugo',nf(ref,0)+' peças',tot+ref?`${nf(ref/(tot+ref)*100,1)}% da produção`:'—')}
      ${kpiG('roxo','fa-user-clock','Horas trabalhadas',nf(horas,1)+' h',horas?`${nf(tot/horas,1)} peças por hora · ${nf(m3/horas*1000,0)} L de concreto por hora`:'marque o ponto da equipe no registro do dia')}
      ${kpiG(pend.some(x=>x.st.cor==='err')?'vermelho':pend.length?'laranja':'verde','fa-flask','Ensaios pendentes',nf(pend.length,0),pend.some(x=>x.st.cor==='err')?'há lote atrasado ou reprovado':'corpos de prova aguardando ensaio')}
      ${kpiG('laranja','fa-money-bill-wave','Custo produzido',R(custo),tot?`média ${R(custo/tot)} por peça`:'—')}</div>
    ${cpLista.length?`<section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas fa-flask" style="color:#7A2FE0"></i> Corpos de prova e ensaios</h3><p>Rompimento aos 7 dias (opcional, esperado ≈ 65% do fck) e aos 28 dias (tem de atingir o fck do traço). Clique no lote para registrar o ensaio.</p></div></div>
      <div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Lote</th><th>Peça</th><th>Moldagem</th><th class="n">CPs</th><th>7 dias</th><th>28 dias</th><th>Situação</th></tr></thead><tbody>
      ${cpLista.map(({l,st})=>{const e7=st.es.filter(e=>num(e.idade)<28).slice(-1)[0],e28=st.es.filter(e=>num(e.idade)>=28).slice(-1)[0],d=dt(l.data);
        return `<tr class="pm-lin" data-pm="lote" data-lote="${fe(l.lote)}"><td><b>${fe(l.lote)}</b></td><td>${fe(nomePeca(l.peca))}</td><td>${fe(brDe(d))}</td><td class="n">${nf(l.cp,0)}</td>
          <td>${e7?`${nf(num(e7.resultado),1)} MPa`:`<small>${fe(brDe(addD(d,7)).slice(0,5))}</small>`}</td><td>${e28?`<b>${nf(num(e28.resultado),1)} MPa</b>`:`<small>${fe(brDe(addD(d,28)).slice(0,5))}</small>`}</td><td>${pill(st.rot,st.cor)}</td></tr>`;}).join('')}</tbody></table></div></section>`:''}
    <section class="gf-sec">${L.length?L.map(r=>{const d=dt(r.data),pt=pontoDe(r);return `<div style="border:1px solid #EEF1F6;border-radius:14px;padding:10px 12px;margin-bottom:10px">
        <div class="gf-dia-cab" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><i class="fas fa-calendar-day" style="color:#1652D8"></i><b>${fe(brDe(d))}</b><span>${cap(GS.SEMANA[d.getDay()])}${r.turno?' · '+fe(r.turno):''}${r.clima?' · '+fe(r.clima):''}${num(r.betonadas)?' · '+nf(num(r.betonadas),0)+' betonada(s)':''}</span>
          <button type="button" class="gf-bt mini" data-pm="prod" data-id="${r.rowid}" style="margin-left:auto"><i class="fas fa-pen"></i> Abrir o dia</button></div>
        <div class="vk-sub" style="margin:6px 0;display:flex;flex-wrap:wrap;gap:4px">${pt.map(x=>pill(`${fe(x.nome)}${x.entrada?` ${fe(x.entrada)}–${fe(x.saida||'')} (${nf(num(x.horas),1)} h)`:''}`,'info','fa-user-clock')).join('')}${r.ocorrencia&&r.ocorrencia!=='Nenhuma'?pill(fe(r.ocorrencia),'warn','fa-triangle-exclamation'):''}</div>
        <div class="pm-rolar"><table class="pm-tab2" data-sem-ordem><thead><tr><th></th><th>Peça</th><th>Lote</th><th class="n">Boas</th><th class="n">Refugo</th><th>Ordem</th><th>Cura</th><th class="n">Custo/peça</th></tr></thead><tbody>
        ${itensProd(r).map((it,i)=>{const p=pecaDe(it.peca),lib=addD(d,num(p&&p.cura!=null&&p.cura!==''?p.cura:tipoDePeca(p||{}).cura||7)),o=ordens().find(x=>String(x.rowid)===String(it.ordem||''));
          return `<tr><td style="width:64px"><span class="pm-th" data-th="${p?p.rowid:''}" style="cursor:default">${p?miniPeca(p):''}</span></td><td><b>${fe(p?p.nome:'(peça excluída)')}</b>${num(it.cp)?`<small>${nf(num(it.cp),0)} corpo(s) de prova</small>`:''}</td><td style="white-space:nowrap">${loteCel(r,it,i)}</td><td class="n">${nf(num(it.qtd),0)}</td><td class="n">${num(it.refugo)?nf(num(it.refugo),0):'—'}</td><td>${o?'OP nº '+fe(String(o.numero)):'—'}</td>
            <td>${lib>h?pill('em cura até '+brDe(lib).slice(0,5),'info','fa-hourglass-half'):pill('liberada','ok','fa-check')}</td><td class="n">${R(num(it.custo_un))}</td></tr>`;}).join('')}</tbody></table></div>
        ${r.obs?`<p class="pm-mini" style="margin:6px 0 0">${fe(r.obs)}</p>`:''}</div>`;}).join('')
      :'<div class="gf-vazio"><i class="fas fa-industry"></i><p>Nenhuma produção registrada neste mês.</p></div>'}</section>`;
}
function formProducao(reg,pre){
  pre=pre||{};if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e catálogo).','error');
  const c=CFG(),jor={entrada:'07:00',saida:'17:00',intervalo:60,...(c.jornada||{})},equipe=(c.equipe_lista||[]).filter(x=>x&&x.nome);
  const b=reg?{...reg,itens:itensProd(reg)}:{data:hojeISO(),turno:'Dia inteiro',clima:'Sol',ocorrencia:'Nenhuma',ponto:[],itens:[{peca:pre.peca||pecas()[0].rowid,ordem:pre.ordem||'',qtd:'',refugo:''}]};
  const pts=pontoDe(b),ptDe=n=>pts.find(x=>x.nome===n),avulsos=pts.filter(x=>!equipe.some(e=>e.nome===x.nome));
  const opsOrd=(pid,sel)=>`<option value="">— sem ordem (estoque) —</option>`+ordens().filter(o=>String(o.peca)===String(pid)&&(o.status==='planejada'||o.status==='producao'||String(o.rowid)===String(sel))).map(o=>`<option value="${o.rowid}" ${String(o.rowid)===String(sel)?'selected':''}>OP nº ${o.numero} — ${nf(prodDaOrdem(o.rowid),0)} de ${nf(num(o.qtd),0)}</option>`).join('');
  const cpPad=pid=>pedeCP(tipoDePeca(pecaDe(pid)||{}))?2:'';
  const linIt=it=>`<tr data-item ${it.lote?`data-lote="${fe(it.lote)}"`:''}><td style="width:66px">${thumbBt(it.peca)}</td><td><select data-i="peca">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(it.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select>${it.lote?`<small class="pm-mini">lote ${fe(it.lote)}</small>`:''}</td>
    <td><select data-i="ordem">${opsOrd(it.peca,it.ordem)}</select></td><td><input data-i="qtd" inputmode="numeric" value="${fe(String(it.qtd||''))}" placeholder="0"></td><td><input data-i="refugo" inputmode="numeric" value="${fe(String(it.refugo||''))}" placeholder="0"></td>
    <td><input data-i="cp" inputmode="numeric" data-sem-mascara="1" value="${fe(String(it.cp!=null&&it.cp!==''?it.cp:(it.lote?'':cpPad(it.peca))))}" placeholder="0" title="Corpos de prova moldados com o concreto desta peça"></td><td><button type="button" class="pm-x" data-pmf="it-x"><i class="fas fa-xmark"></i></button></td></tr>`;
  const linP=(x,avulso)=>{const pt=ptDe(x.nome)||{},on=avulso||!!ptDe(x.nome);return `<tr data-p ${avulso?'data-avulso="1"':''} data-nome="${fe(x.nome||'')}" data-funcao="${fe(x.funcao||'')}">
    <td style="width:34px">${avulso?'':`<input type="checkbox" data-pc ${on?'checked':''} style="width:18px;height:18px">`}</td><td>${avulso?`<input data-pn value="${fe(x.nome||'')}" placeholder="Nome (diarista, visitante)">`:`<b>${fe(x.nome)}</b><small class="pm-mini" style="display:block">${fe(x.funcao||'')}</small>`}</td>
    <td><input type="time" data-pe value="${fe(pt.entrada||jor.entrada)}"></td><td><input type="time" data-ps value="${fe(pt.saida||jor.saida)}"></td><td><input data-pi inputmode="numeric" data-sem-mascara="1" value="${fe(String(pt.intervalo!=null?pt.intervalo:jor.intervalo))}" style="max-width:80px"></td>
    <td data-ph style="white-space:nowrap;font-weight:700"></td><td>${avulso?'<button type="button" class="pm-x" data-pmf="p-x"><i class="fas fa-xmark"></i></button>':''}</td></tr>`;};
  const sel=(k,ops,v)=>`<select data-k="${k}">${ops.map(x=>`<option ${x===v?'selected':''}>${x}</option>`).join('')}</select>`;
  const j=janela(reg?'Editar o dia de produção':'Registrar o dia de produção',`<div class="fin-linha">
      <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}" max="${hojeISO()}"></div>
      <div class="fin-fld"><label>Turno</label>${sel('turno',TURNOS,b.turno||'Dia inteiro')}</div><div class="fin-fld"><label>Clima</label>${sel('clima',CLIMAS,b.clima||'Sol')}</div>
      <div class="fin-fld"><label>Betonadas feitas</label><input data-k="betonadas" inputmode="numeric" value="${fe(String(b.betonadas||''))}" placeholder="0"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Ocorrência</label>${sel('ocorrencia',OCORR,b.ocorrencia||'Nenhuma')}</div></div>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-user-clock"></i> Equipe presente — ponto do dia</h5>
      ${equipe.length?'':'<p class="pm-mini" style="margin:0 0 6px">Cadastre a equipe da fábrica em <b>Parâmetros › Equipe da fábrica</b> para marcar quem veio com um clique.</p>'}
      <div class="pm-rolar"><table class="pm-itens pm-ponto"><thead><tr><th></th><th>Pessoa</th><th>Entrada</th><th>Saída</th><th>Intervalo (min)</th><th>Horas</th><th></th></tr></thead><tbody data-ponto>${equipe.map(x=>linP(x,false)).join('')}${avulsos.map(x=>linP(x,true)).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><button type="button" class="gf-bt mini" data-pmf="p-add"><i class="fas fa-plus"></i> Pessoa avulsa</button><span class="pm-mini" data-p-tot></span></div></div>
    <div class="pm-bloco"><h5><i class="fas fa-cubes"></i> Peças produzidas</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th></th><th>Peça</th><th>Ordem de produção</th><th style="width:78px">Boas</th><th style="width:78px">Refugo</th><th style="width:70px" title="Corpos de prova">CPs</th><th></th></tr></thead><tbody data-itens>${(b.itens||[]).map(linIt).join('')}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="it-add" style="margin-top:6px"><i class="fas fa-plus"></i> Outra peça</button><p class="pm-mini" style="margin:6px 0 0">Cada peça do dia vira um lote. <b>CPs</b> = corpos de prova moldados (sugestão: 2 para tubos, postes, tampas, lajes e peças estruturais).</p></div>
    <div class="fin-fld"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}" placeholder="Ex.: forma 3 trincada, faltou brita à tarde"></div>
    <div class="fin-aviso" style="margin-top:8px"><div data-pr-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Produção de ${brDe(dt(reg.data))}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar o dia',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),o=reg?{...reg}:{tipo:'producao',data_lancamento:todayDateTime()};
      ['data','turno','clima','ocorrencia','obs'].forEach(k=>o[k]=g(k));o.betonadas=num(g('betonadas'));
      o.ponto=lerPonto(jj);o.equipe=o.ponto.map(x=>x.nome);
      if(!o.data)throw new Error('Informe a data.');if(o.data>hojeISO())throw new Error('A data não pode ser no futuro.');
      const its=lerItensProd(jj);if(!its.length)throw new Error('Informe ao menos uma peça com quantidade.');
      // não se produz sem material: o consumo do dia tem de caber no estoque de insumos (na edição, o consumo antigo volta)
      const devolve={};if(reg)itensProd(reg).forEach(it=>Object.entries(it.consumo||{}).forEach(([k,q])=>devolve[k]=(devolve[k]||0)+num(q)));
      const fl=faltaInsumos(its,devolve);
      if(fl.some(x=>x.falta>1e-6))return trava('Faltam insumos para registrar esta produção',depsInsumos(fl).concat([{ok:true,txt:'Lance as compras em <b>Estoque › Entrada de insumo</b>. Material que já estava no pátio antes do sistema: lance o estoque inicial em <b>Estoque › Acerto de inventário</b>.'}]));
      // ordem de produção: não passa da quantidade pedida
      const porOP={};its.forEach(it=>{if(it.ordem)porOP[it.ordem]=(porOP[it.ordem]||0)+it.qtd;});
      for(const [id,q] of Object.entries(porOP)){const op=ordens().find(z=>String(z.rowid)===String(id));if(!op)continue;const ja=prodDaOrdem(op.rowid)-(reg?itensProd(reg).filter(it=>String(it.ordem)===String(id)).reduce((s,it)=>s+num(it.qtd),0):0);
        if(ja+q>num(op.qtd))return trava(`OP nº ${op.numero}: passou da quantidade pedida`,[{ok:false,txt:`A ordem pede ${nf(num(op.qtd),0)} peças; já tem ${nf(ja,0)} registradas; este registro soma ${nf(q,0)} — <b>${nf(ja+q-num(op.qtd),0)} a mais</b>. Registre o excedente na mesma peça como "sem ordem (estoque)".`}]);}
      // lote de cada peça: o que já tinha fica; peça nova ganha o próximo número do dia
      const base='L'+ymd(o.data),usados=new Set(lotes().map(l=>l.lote));let seq=0;const prox=()=>{let c2;do{seq++;c2=`${base}-${String(seq).padStart(2,'0')}`;}while(usados.has(c2));usados.add(c2);return c2;};
      // retrato do dia: consumo (boas + refugo) e custo por peça
      o.itens=its.map(it=>{const p=pecaDe(it.peca),x=calc(p,it.qtd+it.refugo),u=calc(p,1),cons={};Object.entries(x.est).forEach(([k,q])=>cons[k]=Math.round(q*10000)/10000);
        return {...it,lote:it.lote||prox(),consumo:cons,custo_un:r2(u.un),custo_mat_un:r2(u.custo.mat),m3:Math.round(x.Vt*10000)/10000};});
      ['peca','ordem','qtd','refugo','consumo','custo_un','custo_mat_un','m3'].forEach(k=>delete o[k]);
      PM.mes=mesKey(dt(o.data));   // a lista do diário passa a mostrar o mês do dia registrado
      await gravar(o,reg?reg.rowid:null);
      const mud=[];new Set(o.itens.map(it=>it.ordem).filter(Boolean)).forEach(id=>{const op=ordens().find(z=>String(z.rowid)===String(id));if(!op)return;
        if(op.status!=='concluida'&&prodDaOrdem(op.rowid)>=num(op.qtd))mud.push([{...op,status:'concluida',concluida_em:o.data},op.rowid]);else if(op.status==='planejada')mud.push([{...op,status:'producao',inicio:op.inicio||o.data},op.rowid]);});
      if(mud.length)await gravarVarios(mud);
      toast(`Dia registrado: ${o.itens.length} lote(s) — ${o.itens.map(it=>it.lote).join(', ')}.`,'success');}}],1000);
  const atPonto=()=>{let t=0,n=0;j.querySelectorAll('[data-p]').forEach(tr=>{const on=tr.dataset.avulso?!!String((tr.querySelector('[data-pn]')||{}).value||'').trim():tr.querySelector('[data-pc]').checked;
      const hh=horasDe(tr.querySelector('[data-pe]').value,tr.querySelector('[data-ps]').value,tr.querySelector('[data-pi]').value);tr.querySelector('[data-ph]').textContent=on?nf(hh,1)+' h':'—';tr.style.opacity=on?1:0.55;if(on){t+=hh;n++;}});
    const e=j.querySelector('[data-p-tot]');if(e)e.textContent=n?`${n} presente(s) · ${nf(t,1)} horas no dia`:'';};
  const at=()=>{atPonto();const its=lerItensProd(j),e=j.querySelector('[data-pr-prev]');if(!e)return;if(!its.length){e.innerHTML='Informe as peças feitas para ver o que sai do estoque de insumos.';return;}
    const tot={};its.forEach(it=>{const x=calc(pecaDe(it.peca),it.qtd+it.refugo);Object.entries(x.est).forEach(([k,q])=>tot[k]=(tot[k]||0)+q);});const ei=estoqueInsumos();
    e.innerHTML='Sai do estoque: '+INS.filter(i=>tot[i.k]).map(i=>{const f=ei[i.k].saldo<tot[i.k];return `<span style="${f?'color:#B42318;font-weight:700':''}">${i.nome.split(' (')[0].toLowerCase()} ${nf(tot[i.k],2)} ${i.un}${f?' (estoque insuficiente)':''}</span>`;}).join(' · ')+'.';};
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('change',ev=>{const t=ev.target;if(t.matches('[data-i="peca"]')){const tr=t.closest('tr');tr.querySelector('[data-i="ordem"]').innerHTML=opsOrd(t.value,'');trocarThumb(tr,t.value);const cp=tr.querySelector('[data-i="cp"]');if(cp&&!cp.dataset.mexeu)cp.value=cpPad(t.value);}at();});
  corpo.addEventListener('input',ev=>{if(ev.target.matches('[data-i="cp"]'))ev.target.dataset.mexeu='1';clearTimeout(j._pmT);j._pmT=setTimeout(at,150);});
  corpo.addEventListener('click',ev=>{const b2=ev.target.closest('[data-pmf]');if(!b2)return;const f=b2.dataset.pmf;
    if(f==='pick'){const tr=b2.closest('tr'),s=tr.querySelector('[data-i="peca"]');return escolherPeca(s.value,pid=>{s.value=pid;s.dispatchEvent(new Event('change',{bubbles:true}));});}
    if(f==='it-add'){j.querySelector('[data-itens]').insertAdjacentHTML('beforeend',linIt({peca:pecas()[0].rowid,ordem:'',qtd:'',refugo:''}));pintarFotos(j);}
    else if(f==='it-x')b2.closest('tr').remove();else if(f==='p-add')j.querySelector('[data-ponto]').insertAdjacentHTML('beforeend',linP({nome:'',funcao:''},true));else if(f==='p-x')b2.closest('tr').remove();at();});
  pintarFotos(j);at();
}
function lerPonto(j){return [...j.querySelectorAll('[data-p]')].map(tr=>{const av=!!tr.dataset.avulso,nome=av?String((tr.querySelector('[data-pn]')||{}).value||'').trim():tr.dataset.nome;
  if(!nome||(!av&&!tr.querySelector('[data-pc]').checked))return null;const entrada=tr.querySelector('[data-pe]').value,saida=tr.querySelector('[data-ps]').value,intervalo=num(tr.querySelector('[data-pi]').value);
  return {nome,funcao:av?'Avulso':tr.dataset.funcao,entrada,saida,intervalo,horas:Math.round(horasDe(entrada,saida,intervalo)*100)/100};}).filter(Boolean);}
function lerItensProd(j){return [...j.querySelectorAll('[data-item]')].map(tr=>({peca:tr.querySelector('[data-i="peca"]').value,ordem:tr.querySelector('[data-i="ordem"]').value,qtd:num(tr.querySelector('[data-i="qtd"]').value),refugo:num(tr.querySelector('[data-i="refugo"]').value),cp:num((tr.querySelector('[data-i="cp"]')||{}).value),lote:tr.dataset.lote||''})).filter(it=>pecaDe(it.peca)&&(it.qtd>0||it.refugo>0));}

/* ═══════════════ ESTOQUE E AVARIAS ═══════════════ */
function telaEstoque(){
  const E=estoque(),ei=estoqueInsumos(),us=insumosUsados(),ps=pecas(),k=PM.mes;
  const valP=ps.reduce((s,p)=>{const x=E.P[String(p.rowid)];return s+(x?Math.max(0,x.disp)*x.custoUn:0);},0),valI=INS.reduce((s,i)=>s+ei[i.k].valorEst,0);
  const movs=T('compra').map(r=>({r,t:'compra',d:r.data})).concat(T('ajuste').map(r=>({r,t:'ajuste',d:r.data}))).sort((a,b)=>String(b.d).localeCompare(String(a.d))).slice(0,40);
  const avs=T('avaria').slice().sort((a,b)=>String(b.data).localeCompare(String(a.data))),avMes=avs.filter(a=>dt(a.data)&&mesKey(dt(a.data))===k);
  const perdaMes=avMes.reduce((s,a)=>s+num(a.custo_un)*num(a.qtd),0),porOrig={};avMes.forEach(a=>porOrig[a.origem]=(porOrig[a.origem]||0)+num(a.qtd));
  const nRep=ps.filter(p=>reposicao(p,E.P[String(p.rowid)]).k!=='ok').length;
  return cabG('Estoque e avarias','Peças em cura, prontas, reservadas e livres — com o aviso de quando produzir mais. Insumos: entradas das compras − consumo da produção ± acertos. Avarias: peças quebradas no pátio, no carregamento ou na entrega.',
      `<button type="button" class="gf-bt" data-pm="avaria-nova"><i class="fas fa-heart-crack"></i> Registrar avaria</button><button type="button" class="gf-bt" data-pm="ajuste-novo"><i class="fas fa-scale-balanced"></i> Acerto de inventário</button><button type="button" class="gf-bt pri" data-pm="compra-nova"><i class="fas fa-cart-plus"></i> Entrada de insumo</button>`)+
    `<div class="gf-kpis">${kpiG('roxo','fa-cubes','Peças prontas',nf(Object.values(E.P).reduce((s,x)=>s+Math.max(0,x.disp),0),0),`${R(valP)} a custo`)}${kpiG(nRep?'laranja':'verde','fa-clipboard-list','Hora de produzir',nf(nRep,0)+' peça(s)','abaixo do ponto de reposição')}
      ${kpiG('laranja','fa-boxes-stacked','Insumos em estoque',R(valI),'pelo preço médio das compras')}${(()=>{const n=faltaInsumo(ei,us).length;return kpiG(n?'vermelho':'verde','fa-box-open','Insumos em falta',nf(n,0),'dos usados pelas peças');})()}
      ${kpiG(perdaMes?'vermelho':'verde','fa-heart-crack','Avarias no mês',R(perdaMes),`${nf(avMes.reduce((s,a)=>s+num(a.qtd),0),0)} peça(s)`)}</div>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Peças</h3><p>Livre = pronta − reservada. <b>Produzir</b>: o livre + o que já está em produção não cobre a saída média até a próxima fornada (ponto de reposição) ou o mínimo.</p></div></div>
      ${ps.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Peça</th><th>Situação</th><th class="n">Em cura</th><th class="n">Prontas</th><th class="n">Reservadas</th><th class="n">Livres</th><th class="n">Em produção</th><th class="n">Ponto de reposição</th><th class="n">Valor</th><th></th></tr></thead><tbody>
        ${ps.map(p=>{const x=E.P[String(p.rowid)]||{cura:0,disp:0,res:0,livre:0,emProd:0,custoUn:calc(p,1).un},rp=reposicao(p,x);
          return `<tr><td><b>${fe(p.nome)}</b><small>${fe(p.codigo||'')}</small></td><td>${pill(rp.rot,rp.cor,rp.k==='ok'?'fa-check':'fa-triangle-exclamation')}</td><td class="n">${nf(x.cura,0)}</td><td class="n">${nf(x.disp,0)}</td><td class="n">${nf(x.res,0)}</td><td class="n" style="${x.livre<0?'color:#B42318;font-weight:800':''}">${nf(x.livre,0)}</td><td class="n">${nf(x.emProd,0)}</td><td class="n">${nf(rp.ponto,0)}</td><td class="n">${R(Math.max(0,x.disp)*x.custoUn)}</td>
            <td style="white-space:nowrap">${rp.k!=='ok'?`<button type="button" class="gf-bt mini pri" data-pm="gerar-op" data-peca="${p.rowid}" data-qtd="${rp.sug}"><i class="fas fa-clipboard-list"></i> Produzir ${nf(rp.sug,0)}</button>`:''}<button type="button" class="gf-bt mini" data-pm="avaria-nova" data-peca="${p.rowid}" title="Registrar avaria"><i class="fas fa-heart-crack"></i></button><button type="button" class="gf-bt mini" data-pm="ajuste-novo" data-item="peca:${p.rowid}" title="Acerto de inventário"><i class="fas fa-scale-balanced"></i></button></td></tr>`;}).join('')}</tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-cubes"></i><p>Cadastre as peças em Peças e catálogo.</p></div>'}</section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Avarias e perdas</h3><p>${cap(mesNome(k))}: ${Object.entries(porOrig).map(([o,q])=>`${ORIG_AV[o]||o} ${nf(q,0)}`).join(' · ')||'nenhuma avaria'}. As do pátio, desforma, carregamento e transporte saem do estoque.</p></div>${GS.selMes(k,'data-pm-mes',12,0)}</div>
      ${avs.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Data</th><th>Peça</th><th class="n">Quant.</th><th>Onde</th><th>Causa</th><th class="n">Perda</th></tr></thead><tbody>
        ${avs.slice(0,40).map(a=>`<tr class="pm-lin" data-pm="avaria" data-id="${a.rowid}"><td>${fe(brDe(dt(a.data)))}</td><td>${fe(nomePeca(a.peca))}</td><td class="n">${nf(num(a.qtd),0)}</td><td>${fe(ORIG_AV[a.origem]||a.origem||'')}${a.venda?`<small>venda nº ${fe(String((vendaDe(a.venda)||{}).numero||''))}</small>`:''}</td><td>${fe(a.causa||'')}</td><td class="n">${R(num(a.custo_un)*num(a.qtd))}</td></tr>`).join('')}</tbody></table></div>`
      :'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Nenhuma avaria registrada.</p></div>'}</section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Insumos</h3><p>Saldo, consumo médio dos últimos 30 dias e para quantos dias ainda dá.</p></div></div>
      <div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Insumo</th><th class="n">Entradas</th><th class="n">Consumo</th><th class="n">Acertos</th><th class="n">Saldo</th><th class="n">Mínimo</th><th class="n">Preço médio</th><th class="n">Dura</th><th></th></tr></thead><tbody>
      ${INS.map(i=>{const x=ei[i.k],baixo=us.has(i.k)&&x.min>0&&x.saldo<x.min;return `<tr><td><b>${fe(i.nome)}</b><small>${fe(i.unL)}</small></td><td class="n">${nf(x.ent,2)}</td><td class="n">${nf(x.cons,2)}</td><td class="n">${x.aj?nf(x.aj,2):'—'}</td>
        <td class="n" style="${baixo||x.saldo<0?'color:#B42318;font-weight:800':'font-weight:700'}">${nf(x.saldo,2)} ${i.un}</td><td class="n">${x.min?nf(x.min,2):'—'}</td><td class="n">${R(x.preco)}</td><td class="n">${x.duraDias!=null?x.duraDias+' dia(s)':'—'}</td>
        <td style="white-space:nowrap"><button type="button" class="gf-bt mini" data-pm="compra-nova" data-ins="${i.k}" title="Entrada (compra)"><i class="fas fa-cart-plus"></i></button><button type="button" class="gf-bt mini" data-pm="ajuste-novo" data-item="insumo:${i.k}" title="Acerto de inventário"><i class="fas fa-scale-balanced"></i></button></td></tr>`;}).join('')}
      </tbody></table></div></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Últimas entradas e acertos</h3><p>Clique para editar ou excluir.</p></div></div>
      ${movs.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Data</th><th>Movimento</th><th>Item</th><th class="n">Quantidade</th><th class="n">Valor</th><th>Pagamento</th></tr></thead><tbody>
        ${movs.map(({r,t})=>{if(t==='compra'){const i=insDe(r.insumo);return `<tr class="pm-lin" data-pm="compra" data-id="${r.rowid}"><td>${fe(brDe(dt(r.data)))}</td><td>${pill('compra','ok','fa-cart-plus')}</td><td>${fe(i.nome)}${r.fornecedor?`<small>${fe(r.fornecedor)}</small>`:''}</td><td class="n">${nf(num(r.qtd),2)} ${i.un}</td><td class="n">${R(num(r.valor))}</td><td>${r.pago_em?pill('pago '+brDe(dt(r.pago_em)).slice(0,5),'ok'):r.vencimento?pill('vence '+brDe(dt(r.vencimento)).slice(0,5),dt(r.vencimento)<hoje0()?'err':'warn'):'—'}</td></tr>`;}
          const pc=String(r.item||'').startsWith('peca:'),nm=pc?nomePeca(r.item.slice(5)):insDe(String(r.item).slice(7)).nome;return `<tr class="pm-lin" data-pm="ajuste" data-id="${r.rowid}"><td>${fe(brDe(dt(r.data)))}</td><td>${pill('acerto','info','fa-scale-balanced')}</td><td>${fe(nm)}<small>${fe(r.motivo||'')}</small></td><td class="n">${num(r.qtd)>0?'+':''}${nf(num(r.qtd),2)}</td><td class="n">—</td><td>—</td></tr>`;}).join('')}</tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-cart-flatbed"></i><p>Nenhuma compra lançada. Lance as entradas para o estoque e o custo médio ficarem certos.</p></div>'}</section>`;
}
// peça quebrada sai do estoque — menos quando foi numa entrega já feita (a peça já tinha saído com a venda)
const vendaEntregue=id=>{const v=id?vendaDe(id):null;return !!v&&(v.status==='entregue'||v.status==='devolvida');};
function avariaTiraEstoque(a){return AV_ESTOQUE.includes(a.origem)&&!vendaEntregue(a.venda);}
function formAvaria(reg,pecaPre,pre){
  if(!pecas().length)return toast('Cadastre as peças primeiro.','error');pre=pre||{};
  const b=reg||{data:hojeISO(),peca:pecaPre||pecas()[0].rowid,origem:pre.origem||'patio',qtd:'',venda:pre.venda||''};
  const j=janela(reg?'Editar avaria':'Registrar avaria (peça quebrada)',`<div class="fin-linha">
      <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}" max="${hojeISO()}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Peça <span class="obg">*</span></label><select data-k="peca">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(b.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade <span class="obg">*</span></label><input data-k="qtd" inputmode="numeric" value="${fe(String(b.qtd||''))}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Onde quebrou</label><select data-k="origem">${Object.entries(ORIG_AV).filter(([k])=>k!=='cliente'||b.origem==='cliente').map(([k,l])=>`<option value="${k}" ${k===b.origem?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Causa</label><input data-k="causa" value="${fe(b.causa||'')}" placeholder="Ex.: queda da empilhadeira, desforma antes da hora, estrada ruim"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Venda (se aconteceu numa entrega)</label><select data-k="venda"><option value="">—</option>${vendas().filter(v=>v.status!=='cancelada').slice(-60).reverse().map(v=>`<option value="${v.rowid}" ${String(v.rowid)===String(b.venda||'')?'selected':''}>Venda nº ${v.numero} — ${fe(v.cliente||'')}</option>`).join('')}</select></div>
      ${reg?'':`<label class="nfc-amb" data-av-repor hidden style="grid-column:1/-1"><input type="checkbox" data-k="repor" checked><span><b>Repor as peças ao cliente</b> — sai do estoque a mesma quantidade (peças novas no lugar das quebradas)</span></label>`}</div>
      <div class="fin-aviso" style="margin-top:8px"><div data-av-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,'Avaria'),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Registrar',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>String((jj.querySelector(`[data-k="${k}"]`)||{}).value||'').trim(),o=reg?{...reg}:{tipo:'avaria',data_lancamento:todayDateTime()};
      ['data','peca','origem','causa','venda'].forEach(k=>o[k]=g(k));o.qtd=num(g('qtd'));if(!o.data)throw new Error('Informe a data.');if(!(o.qtd>0))throw new Error('Informe a quantidade.');
      const E=estoque(),x=E.P[String(o.peca)]||{disp:0},v=o.venda?vendaDe(o.venda):null,repor=!reg&&vendaEntregue(o.venda)&&!!(jj.querySelector('[data-k="repor"]')||{}).checked;
      if(v&&dt(v.data)&&o.data<v.data)throw new Error('A data da avaria não pode ser antes do pedido.');
      // não quebra mais do que existe: no estoque (pátio/desforma/carregamento) ou na entrega (o que foi entregue dessa peça)
      if(avariaTiraEstoque(o)){const tem=x.disp+(reg&&avariaTiraEstoque(reg)&&String(reg.peca)===String(o.peca)?num(reg.qtd):0);
        if(o.qtd>tem)return trava('Avaria maior do que o estoque',[{ok:false,txt:`Há ${nf(Math.max(0,tem),0)} peça(s) de ${fe(nomePeca(o.peca))} prontas no pátio — a avaria não pode passar disso.`},{ok:true,txt:'Peça que quebrou ainda em cura: registre como refugo no dia de produção.'}]);}
      if(vendaEntregue(o.venda)){const ent=(v.itens||[]).filter(it=>String(it.peca)===String(o.peca)).reduce((s,it)=>s+num(it.qtd),0),ja=T('avaria').filter(a=>String(a.venda)===String(o.venda)&&String(a.peca)===String(o.peca)&&(!reg||String(a.rowid)!==String(reg.rowid))).reduce((s,a)=>s+num(a.qtd),0);
        if(o.qtd>ent-ja)return trava('Avaria maior do que foi entregue',[{ok:ent>0,txt:`A venda nº ${v.numero} entregou ${nf(ent,0)} peça(s) de ${fe(nomePeca(o.peca))}`},{ok:false,txt:`Já há ${nf(ja,0)} avariada(s) nessa entrega — dá para registrar no máximo ${nf(Math.max(0,ent-ja),0)}`}]);
        if(repor&&o.qtd>x.disp)return trava('Sem peças para repor',[{ok:false,txt:`Repor ${nf(o.qtd,0)} peça(s) exige estoque pronto — há ${nf(Math.max(0,x.disp),0)}. Desmarque "Repor" e reponha depois, quando houver peça.`}]);}
      o.custo_un=r2(x.custoUn||calc(pecaDe(o.peca),1).un);
      const ops=[[o,reg?reg.rowid:null]];if(repor)ops.push([{tipo:'ajuste',data:o.data,item:'peca:'+o.peca,qtd:-o.qtd,motivo:`reposição de avaria — venda nº ${v.numero}`,data_lancamento:todayDateTime()},null]);
      await gravarVarios(ops);toast(repor?'Avaria registrada e peças repostas ao cliente (saíram do estoque).':'Avaria registrada.','success');}}],640);
  const at=()=>{const p=pecaDe(j.querySelector('[data-k="peca"]').value),q=num(j.querySelector('[data-k="qtd"]').value),og=j.querySelector('[data-k="origem"]').value,vd=j.querySelector('[data-k="venda"]').value,x=estoque().P[String(p&&p.rowid)],cu=x?x.custoUn:(p?calc(p,1).un:0),ent=vendaEntregue(vd);
    const rp=j.querySelector('[data-av-repor]');if(rp)rp.hidden=!ent;
    j.querySelector('[data-av-prev]').innerHTML=q?`Perda de <b>${R(cu*q)}</b> (custo ${R(cu)} por peça).${ent?' A peça já tinha saído com a entrega: a perda entra no resultado sem baixar o estoque de novo.':AV_ESTOQUE.includes(og)?` As peças saem do estoque (há ${nf(Math.max(0,(x||{}).disp||0),0)} prontas).`:''}`:'Informe a quantidade.';};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
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
      const ops=[[o,reg?reg.rowid:null]];
      if(g('atualiza').checked){const r=cfgRow(),cf=r&&r.cfg?JSON.parse(JSON.stringify(r.cfg)):{};cf.precos=cf.precos||{};cf.precos[o.insumo]=Math.round(o.valor/o.qtd*100)/100;ops.push([r?{...r,cfg:cf}:{tipo:'config',cfg:cf,data_lancamento:todayDateTime()},r?r.rowid:null]);}
      await gravarVarios(ops);toast('Entrada lançada no estoque.','success');}}],620);
  const at=()=>{const i=insDe(j.querySelector('[data-k="insumo"]').value),q=num(j.querySelector('[data-k="qtd"]').value),v=num(j.querySelector('[data-k="valor"]').value);
    j.querySelector('[data-un]').textContent=`(${i.unL})`;j.querySelector('[data-cp-prev]').innerHTML=q>0&&v>0?`Preço: <b>${R(v/q)}</b> por ${i.unL} · nos parâmetros hoje: ${R(num(c.precos[i.k]))}.`:`Informe a quantidade em ${i.unL} e o valor total da nota.`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}
function formAjuste(reg,itemPre){
  const b=reg||{data:hojeISO(),item:itemPre||'insumo:cimento'},ei=estoqueInsumos(),E=estoque();
  const ops=`<optgroup label="Insumos">${INS.map(i=>`<option value="insumo:${i.k}" ${('insumo:'+i.k)===b.item?'selected':''}>${fe(i.nome)}</option>`).join('')}</optgroup><optgroup label="Peças">${pecas().map(p=>`<option value="peca:${p.rowid}" ${('peca:'+p.rowid)===b.item?'selected':''}>${fe(p.nome)}</option>`).join('')}</optgroup>`;
  const saldoDe=it=>it.startsWith('peca:')?((E.P[it.slice(5)]||{}).disp||0):((ei[it.slice(7)]||{}).saldo||0);
  const j=janela(reg?'Editar acerto de inventário':'Acerto de inventário',`<div class="fin-aviso"><div>Quando a contagem física não bate com o sistema: informe <b>quanto existe de verdade</b> — o sistema lança a diferença. Peça quebrada: use <b>Registrar avaria</b>.</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Item <span class="obg">*</span></label><select data-k="item">${ops}</select></div>
      <div class="fin-fld"><label>Saldo no sistema</label><input data-k="sist" readonly></div>
      <div class="fin-fld"><label>Contagem física <span class="obg">*</span></label><input data-k="fisico" inputmode="decimal" value="${reg?fe(String(r2(saldoDe(reg.item))).replace('.',',')):''}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Motivo</label><input data-k="motivo" value="${fe(b.motivo||'')}" placeholder="Ex.: inventário do mês, saco de cimento empedrado"></div></div>
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
    j.querySelector('[data-k="sist"]').value=nf(sist,2)+' '+un;j.querySelector('[data-aj-prev]').innerHTML=String(f).trim()===''?'Informe a contagem física.':`Diferença: <b>${num(f)-sist>0?'+':''}${nf(num(f)-sist,2)} ${un}</b>.`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}

/* ═══════════════ VENDAS ═══════════════ */
const VVISTAS=[['pedidos','fa-columns','Pedidos'],['entregas','fa-truck','Entregas'],['clientes','fa-address-book','Clientes'],['vendedores','fa-user-tie','Vendedores']];
function telaVendas(){
  const v=PM.vendasVista||'pedidos',sub=`<div class="pm-sub">${VVISTAS.map(([k,ic,l])=>`<button type="button" class="gf-bt ${v===k?'pri':''}" data-pm="vvista" data-v="${k}"><i class="fas ${ic}"></i> ${l}</button>`).join('')}</div>`;
  if(v==='entregas')return telaEntregas(sub);if(v==='clientes')return telaClientes(sub);if(v==='vendedores')return telaVendedores(sub);
  const E=estoque(),h=hoje0(),q=String(PM.busca||'').toLowerCase(),lim=addD(h,-60),c=CFG();
  const L=vendas().filter(v=>v.status!=='cancelada'&&(!q||[v.cliente,v.numero,(v.itens||[]).map(it=>nomePeca(it.peca)).join(' ')].join(' ').toLowerCase().includes(q)));
  const card=v=>{const f=faseVenda(v,E),tot=totalVenda(v),pago=pagoDe(v),pz=dt(v.prazo_entrega),ag=v.agenda&&dt(v.agenda.data),pc=tot?Math.min(100,pago/tot*100):0,a=E.aloc[v.rowid]||{};
    return `<article class="vk-card" style="--cor:${(FASES_V.find(x=>x.k===f)||FASES_V[4]).cor}" data-pm="venda" data-id="${v.rowid}" draggable="${f==='liberado'?'true':'false'}" data-card="${v.rowid}">
      <div class="vk-top"><b>Venda nº ${fe(String(v.numero||''))}</b>${pill(v.tipo_venda==='pronta'?'pronta entrega':'encomenda',v.tipo_venda==='pronta'?'ok':'info')}</div>
      <div class="vk-obra"><i class="fas fa-user"></i>${fe(v.cliente||'—')}${v.canal==='atacado'?' · atacado':''}</div>
      <ul class="vk-itens">${(v.itens||[]).slice(0,3).map((it,i)=>`<li><span>${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}${f==='producao'?` <small>(${nf(a[i]||0,0)} prontas)</small>`:''}</span><b>${R(num(it.qtd)*num(it.preco))}</b></li>`).join('')}${(v.itens||[]).length>3?`<li class="mais">+ ${(v.itens||[]).length-3} item(ns)</li>`:''}</ul>
      ${ag&&f!=='entregue'?`<div class="vk-sub">${pill('entrega agendada '+brDe(ag).slice(0,5)+(v.agenda.caminhao?' · '+fe(v.agenda.caminhao):''),'info','fa-truck')}</div>`:''}
      <div class="vk-val"><span>pago ${R(pago)}${pz&&!ag&&f!=='entregue'?' · prevista '+brDe(pz).slice(0,5):''}${v.status==='devolvida'?' · devolvida':''}</span><b>${R(tot)}</b></div><div class="pm-barra ${pc>=100?'ok':''}"><i style="width:${pc}%"></i></div></article>`;};
  const cols=FASES_V.map(fc=>{let itens=L.filter(v=>{const f=faseVenda(v,E);return f===fc.k||(fc.k==='entregue'&&f==='devolvida');});if(fc.k==='entregue')itens=itens.filter(v=>!dt(v.entrega)||dt(v.entrega)>=lim);
    itens.sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));return {c:fc,itens,total:itens.reduce((s,v)=>s+totalVenda(v),0)};});
  setTimeout(()=>{const w=document.querySelector('#pm-app .vk-quadro');if(w&&!w._lig){w._lig=1;GS.ligarArraste(w,moverVenda);}},0);
  return cabG('Vendas','Pronta entrega (peça pronta, pagamento completo) ou encomenda (reserva com '+nf(num(c.sinal),0)+'% de sinal; sem peça pronta, a ordem de produção sai sozinha). A entrega só sai pronta e paga. Devolução com estorno; avaria na entrega vira perda.',
      `<button type="button" class="gf-bt pri" data-pm="venda-nova"><i class="fas fa-plus"></i> Nova venda</button>`)+sub+
    `<div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar cliente, nº ou peça…" value="${fe(PM.busca)}" style="min-width:260px"><span class="pm-mini">Entregues: últimos 60 dias (as anteriores ficam nos Relatórios).</span></div>`+
    GS.colunasHtml(cols,card,{sinal:'Nenhuma encomenda esperando sinal',producao:'Nada em produção para venda',pagamento:'Nenhum pedido pronto esperando pagamento',liberado:'Nada liberado para entrega',entregue:'Entregas aparecem aqui'});
}
/* ── entregas: agenda da semana por caminhão ── */
const segunda=d=>{d=new Date(d);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;};
function pesoVenda(v){return (v.itens||[]).reduce((s,it)=>{const p=pecaDe(it.peca);return s+(p?calc(p,1).peso*num(it.qtd):0);},0);}
const PERIODOS=['Manhã','Tarde','Dia todo'];
function telaEntregas(sub){
  const c=CFG(),E=estoque(),h=hoje0(),ini=dt(PM.semana)||segunda(h),dias7=[...Array(7)].map((_,i)=>addD(ini,i)),cams=(c.caminhoes||[]).filter(x=>x&&x.nome);
  const vs=vendas().filter(v=>v.status!=='cancelada'),doDia=d=>vs.filter(v=>v.agenda&&v.agenda.data===isoDe(d));
  const semData=vs.filter(v=>['aguardando_sinal','reservado'].includes(v.status)&&!(v.agenda&&v.agenda.data)).sort((a,b)=>String(a.prazo_entrega||'9').localeCompare(String(b.prazo_entrega||'9')));
  const cartao=v=>{const f=faseVenda(v,E),fs=FASES_V.find(x=>x.k===f)||FASES_V[4],e=v.end||{};
    return `<div class="pm-ent" style="--cor:${fs.cor}" data-pm="venda" data-id="${v.rowid}"><b>Nº ${fe(String(v.numero))} · ${fe(v.cliente||'')}</b><div>${fe([e.bairro,e.cidade].filter(Boolean).join(' · ')||'sem endereço')}${v.agenda&&v.agenda.periodo?' · '+fe(v.agenda.periodo):''}</div>
      <div class="pm-mini">${(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}`).join(' · ')} · ${nf(pesoVenda(v),0)} kg</div><div style="margin-top:3px">${pill(f==='entregue'?'entregue':fs.rot,f==='liberado'||f==='entregue'?'ok':'warn')}</div></div>`;};
  const col=d=>{const L=doDia(d),grupos=[...cams.map(x=>x.nome),''].map(nm=>({nm,L:L.filter(v=>(v.agenda.caminhao||'')===nm)})).filter(g=>g.L.length);
    return `<div class="pm-dia ${isoDe(d)===isoDe(h)?'hoje':''}"><h6><span>${cap(GS.SEMANA[d.getDay()]).slice(0,3)} ${fe(brDe(d).slice(0,5))}</span>${L.length?`<button type="button" class="gf-bt mini" data-pm="romaneio" data-d="${isoDe(d)}" title="Romaneio do dia (PDF)"><i class="fas fa-print"></i></button>`:''}</h6>
      ${grupos.map(g=>{const cam=cams.find(x=>x.nome===g.nm),peso=g.L.reduce((s,v)=>s+pesoVenda(v),0),exc=cam&&num(cam.cap_kg)>0&&peso>num(cam.cap_kg);
        return `<div class="pm-cam ${exc?'exc':''}"><span><i class="fas fa-truck"></i> ${fe(g.nm||'Sem caminhão')}</span><span>${nf(peso,0)}${cam&&num(cam.cap_kg)?' / '+nf(num(cam.cap_kg),0):''} kg</span></div>${g.L.map(cartao).join('')}`;}).join('')||'<p class="pm-mini" style="margin:6px 2px">Nenhuma entrega.</p>'}</div>`;};
  return cabG('Entregas','Agenda da semana por caminhão: o que sai em cada dia, o peso da carga e o romaneio para o motorista. A entrega só sai com as peças prontas e o pedido pago.',
      `<button type="button" class="gf-bt" data-pm="sem" data-d="-7"><i class="fas fa-chevron-left"></i></button><button type="button" class="gf-bt" data-pm="sem" data-d="0">Esta semana</button><button type="button" class="gf-bt" data-pm="sem" data-d="7"><i class="fas fa-chevron-right"></i></button>`)+sub+
    (cams.length?'':'<div class="gf-aviso warn"><i class="fas fa-circle-info"></i><div>Cadastre os caminhões em <b>Parâmetros › Entregas e frete</b> para separar a carga de cada um.</div></div>')+
    `<section class="gf-sec"><div class="gf-sec-cab"><div><h3>Semana de ${fe(brDe(ini))} a ${fe(brDe(addD(ini,6)))}</h3><p>Clique num pedido para abrir; o botão de impressora gera o romaneio do dia.</p></div></div><div class="pm-sem">${dias7.map(col).join('')}</div></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Pedidos sem data de entrega</h3><p>Abra o pedido e use <b>Agendar entrega</b>.</p></div></div>
      ${semData.length?`<div class="pm-grid">${semData.map(cartao).join('')}</div>`:'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Todos os pedidos abertos têm data de entrega.</p></div>'}</section>`;
}
function formAgenda(v){
  const c=CFG(),cams=(c.caminhoes||[]).filter(x=>x&&x.nome),a=v.agenda||{},f=faseVenda(v);
  janela(`Agendar a entrega — venda nº ${v.numero}`,`<div class="fin-resumo">${fe(v.cliente||'')} · ${(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}`).join(' · ')} · ${nf(pesoVenda(v),0)} kg<br>${fe(endTxt(v.end)||'sem endereço de entrega')}</div>
    ${f!=='liberado'?`<div class="fin-aviso laranja" style="margin-top:8px"><div>Para sair nessa data, as peças precisam estar <b>prontas</b> e o pedido <b>pago</b> até lá (hoje: ${fe((FASES_V.find(x=>x.k===f)||{rot:f}).rot.toLowerCase())}).</div></div>`:''}
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(a.data||v.prazo_entrega||'')}"></div>
      <div class="fin-fld"><label>Período</label><select data-k="periodo">${PERIODOS.map(x=>`<option ${x===(a.periodo||'Manhã')?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Caminhão</label><select data-k="caminhao"><option value="">—</option>${cams.map(x=>`<option ${x.nome===a.caminhao?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Observação para o motorista</label><input data-k="obs" value="${fe(a.obs||'')}" placeholder="Ex.: descarregar no fundo do terreno, ligar antes"></div></div>`,
    [...(a.data?[{html:'<i class="fas fa-calendar-xmark"></i> Tirar da agenda',acao:async()=>{await gravar({...vendaBruta(v),agenda:null},v.rowid);toast('Entrega tirada da agenda.','success');}}]:[]),
     {html:'<i class="fas fa-calendar-check"></i> Agendar',cls:'pri',acao:async j=>{const g=k=>String(j.querySelector(`[data-k="${k}"]`).value||'').trim();if(!g('data'))throw new Error('Informe a data da entrega.');
      if(g('data')<hojeISO())throw new Error('A data não pode ser no passado.');
      // carga do caminhão no dia não pode passar da capacidade
      const cam=(c.caminhoes||[]).find(x=>x.nome===g('caminhao'));if(cam&&num(cam.cap_kg)>0){const outras=vendas().filter(x=>String(x.rowid)!==String(v.rowid)&&x.status!=='cancelada'&&x.agenda&&x.agenda.data===g('data')&&x.agenda.caminhao===cam.nome),pesoDia=outras.reduce((s,x)=>s+pesoVenda(x),0)+pesoVenda(v);
        if(pesoDia>num(cam.cap_kg))return trava(`${cam.nome}: carga passa da capacidade em ${brDe(dt(g('data')))}`,[{ok:true,txt:`Capacidade: ${nf(num(cam.cap_kg),0)} kg`},{ok:true,txt:`Já agendado no dia: ${nf(pesoDia-pesoVenda(v),0)} kg (${outras.length} entrega(s))`},{ok:false,txt:`Esta venda: ${nf(pesoVenda(v),0)} kg — total ${nf(pesoDia,0)} kg. Escolha outro dia, outro caminhão ou divida a entrega.`}]);}
      await gravar({...vendaBruta(v),agenda:{data:g('data'),periodo:g('periodo'),caminhao:g('caminhao'),obs:g('obs')},prazo_entrega:g('data')},v.rowid);toast(`Entrega agendada para ${brDe(dt(g('data')))}.`,'success');}}],620);
}
function romaneio(dia){
  const c=CFG(),L=vendas().filter(v=>v.status!=='cancelada'&&v.agenda&&v.agenda.data===dia),cams=[...new Set(L.map(v=>v.agenda.caminhao||''))];
  if(!L.length)return toast('Nenhuma entrega neste dia.','error');
  App._relExportPaginado({titulo:'Romaneio de entregas',subLinhas:[`${cap(GS.SEMANA[dt(dia).getDay()])}, ${brDe(dt(dia))}`,...cams.map(nm=>{const cam=(c.caminhoes||[]).find(x=>x.nome===nm);return `${nm||'Sem caminhão'}${cam&&cam.motorista?' · '+cam.motorista:''}: ${nf(L.filter(v=>(v.agenda.caminhao||'')===nm).reduce((s,v)=>s+pesoVenda(v),0),0)} kg`;})],
    theadHtml:'<tr><th style="width:9%">Nº</th><th style="width:30%">Cliente e endereço</th><th style="width:27%">Peças</th><th style="width:9%;text-align:right">Peso</th><th style="width:10%">Situação</th><th style="width:15%">Recebido por</th></tr>',
    rowsArr:L.sort((a,b)=>String(a.agenda.caminhao||'').localeCompare(String(b.agenda.caminhao||''))||String(a.agenda.periodo).localeCompare(String(b.agenda.periodo))).map(v=>{const f=faseVenda(v);
      return `<tr><td><b>${fe(String(v.numero))}</b><br>${fe(v.agenda.periodo||'')}<br><small>${fe(v.agenda.caminhao||'')}</small></td><td><b>${fe(v.cliente||'')}</b>${v.telefone?'<br>'+fe(v.telefone):''}<br>${fe(endTxt(v.end))}${v.agenda.obs?'<br><i>'+fe(v.agenda.obs)+'</i>':''}</td>
        <td>${(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}`).join('<br>')}</td><td style="text-align:right">${nf(pesoVenda(v),0)} kg</td><td>${f==='liberado'?'Liberado':f==='entregue'?'Entregue':'<b style="color:#B42318">NÃO LIBERADO</b>'}</td><td></td></tr>`;}),
    posHtml:'<p style="font-size:11px;margin-top:10px">Conferir as peças na carga e na descarga. Peça quebrada: anotar e avisar a fábrica (registrar como avaria no transporte).</p><p style="margin-top:28px;font-size:12px">______________________________ &nbsp; Motorista &nbsp;&nbsp;&nbsp;&nbsp; ______________________________ &nbsp; Conferente</p>'});
}
/* ── clientes (com tabela de preços própria) ── */
const cliDe=nome=>{const n=String(nome||'').trim().toLowerCase();return n?T('cliente').find(c=>String(c.nome||'').trim().toLowerCase()===n)||null:null;};
function telaClientes(sub){
  const q=String(PM.busca||'').toLowerCase(),vs=vendas().filter(v=>v.status==='entregue'||v.status==='devolvida');
  const L=T('cliente').filter(c=>!q||[c.nome,c.doc,c.telefone,(c.end||{}).cidade].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
  const tot=c=>{const m=vs.filter(v=>String(v.cliente||'').trim().toLowerCase()===String(c.nome||'').trim().toLowerCase());return {v:m.reduce((s,v)=>s+totalVenda(v),0),n:m.length,ult:m.map(v=>v.entrega).sort().slice(-1)[0]};};
  return cabG('Clientes','Cadastro dos clientes, com canal (varejo ou atacado), vendedor, desconto padrão e tabela de preços própria. Ao escolher o cliente na venda, tudo isso entra sozinho.',`<button type="button" class="gf-bt pri" data-pm="cli-novo"><i class="fas fa-plus"></i> Novo cliente</button>`)+sub+
    `<div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar nome, documento, telefone, cidade…" value="${fe(PM.busca)}" style="min-width:260px"><span class="pm-mini">${L.length} cliente(s) · clientes novos das vendas entram no cadastro sozinhos</span></div>
    <section class="gf-sec">${L.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Cliente</th><th>Contato</th><th>Cidade</th><th>Canal</th><th>Tabela própria</th><th>Vendedor</th><th class="n">Comprou</th><th>Última entrega</th></tr></thead><tbody>
      ${L.map(c=>{const t=tot(c);return `<tr class="pm-lin" data-pm="cli" data-id="${c.rowid}"><td><b>${fe(c.nome||'')}</b><small>${fe(c.doc||'')}</small></td><td>${fe(c.telefone||'')}</td><td>${fe([(c.end||{}).cidade,(c.end||{}).uf].filter(Boolean).join(' - '))}</td><td>${pill(c.canal==='atacado'?'atacado':'varejo',c.canal==='atacado'?'info':'')}</td>
        <td>${(c.precos||[]).length?pill(`${(c.precos||[]).length} preço(s)`,'ok','fa-tags'):'—'}${num(c.desconto_pct)?` <small>desconto ${nf(num(c.desconto_pct),1)}%</small>`:''}</td><td>${fe(c.vendedor||'—')}</td><td class="n">${R(t.v)}<small>${t.n} entrega(s)</small></td><td>${t.ult?fe(brDe(dt(t.ult))):'—'}</td></tr>`;}).join('')}</tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-address-book"></i><p>Nenhum cliente cadastrado.</p></div>'}</section>`;
}
function formCliente(reg){
  const c=CFG(),b=reg?JSON.parse(JSON.stringify(reg)):{canal:'varejo',end:{cidade:c.cidade||'',uf:c.uf||'BA'},precos:[]},e=b.end||{},vends=(c.vendedores||[]).filter(x=>x&&x.nome);
  const linP=x=>`<tr data-pr><td style="width:66px">${thumbBt(x.peca)}</td><td><select data-pp>${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(x.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></td><td><input data-pv data-mask="moeda" value="${x.preco?fe(R(num(x.preco))):''}" placeholder="R$ 0,00"></td><td class="pm-mini" data-pref></td><td><button type="button" class="pm-x" data-pmf="pr-x"><i class="fas fa-xmark"></i></button></td></tr>`;
  const j=janela(reg?`Cliente — ${b.nome}`:'Novo cliente',`<div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Nome / razão social <span class="obg">*</span></label><input data-k="nome" value="${fe(b.nome||'')}"></div>
      <div class="fin-fld"><label>CPF / CNPJ</label><input data-k="doc" value="${fe(b.doc||'')}"></div><div class="fin-fld"><label>Telefone / WhatsApp</label><input data-k="telefone" value="${fe(b.telefone||'')}"></div>
      <div class="fin-fld"><label>E-mail</label><input data-k="email" value="${fe(b.email||'')}"></div>
      <div class="fin-fld"><label>Canal</label><select data-k="canal"><option value="varejo" ${b.canal!=='atacado'?'selected':''}>Varejo</option><option value="atacado" ${b.canal==='atacado'?'selected':''}>Atacado</option></select></div>
      <div class="fin-fld"><label>Vendedor</label><select data-k="vendedor"><option value="">—</option>${vends.map(x=>`<option ${x.nome===b.vendedor?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Desconto padrão (%)</label><input data-k="desconto_pct" value="${num(b.desconto_pct)?fe(String(b.desconto_pct)):''}"></div>
      <div class="fin-fld"><label>CEP</label><input data-k="cep" value="${fe(e.cep||'')}"></div><div class="fin-fld" style="grid-column:span 2"><label>Endereço (rua)</label><input data-k="logradouro" value="${fe(e.logradouro||'')}" autocomplete="off" placeholder="digite a rua: o sistema sugere o endereço com o CEP"></div>
      <div class="fin-fld"><label>Número</label><input data-k="numero" value="${fe(e.numero||'')}"></div><div class="fin-fld"><label>Complemento</label><input data-k="complemento" value="${fe(e.complemento||'')}"></div>
      <div class="fin-fld"><label>Bairro</label><input data-k="bairro" value="${fe(e.bairro||'')}"></div><div class="fin-fld"><label>Cidade</label><input data-k="cidade" value="${fe(cidUF(e.cidade,e.uf))}" placeholder="Ex.: Itarantim, BA"></div><div class="fin-fld"><label>UF</label><input data-k="uf" value="${fe(e.uf||'')}" maxlength="2"></div></div>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-tags"></i> Tabela de preços deste cliente</h5><p class="pm-mini" style="margin:-4px 0 6px">Preço combinado com o cliente: vale no lugar do varejo/atacado quando ele compra.</p>
      <div class="pm-rolar"><table class="pm-itens"><thead><tr><th></th><th>Peça</th><th style="width:140px">Preço (R$)</th><th>Referência</th><th></th></tr></thead><tbody data-precos>${(b.precos||[]).map(linP).join('')}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="pr-add" style="margin-top:6px"><i class="fas fa-plus"></i> Preço</button></div>
    <div class="fin-fld"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}"></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,reg.nome),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar cliente',cls:'pri',acao:async jj=>{const g=k=>String((jj.querySelector(`[data-k="${k}"]`)||{}).value||'').trim(),o=reg?{...reg}:{tipo:'cliente',data_lancamento:todayDateTime()};
      ['nome','doc','telefone','email','canal','vendedor','obs'].forEach(k=>o[k]=g(k));o.desconto_pct=num(g('desconto_pct'));o.end={cep:g('cep'),logradouro:g('logradouro'),numero:g('numero'),complemento:g('complemento'),bairro:g('bairro'),cidade:g('cidade'),uf:g('uf').toUpperCase()};
      o.precos=[...jj.querySelectorAll('[data-pr]')].map(tr=>({peca:tr.querySelector('[data-pp]').value,preco:r2(num(tr.querySelector('[data-pv]').value))})).filter(x=>x.preco>0);
      if(!o.nome)throw new Error('Informe o nome do cliente.');const dup=cliDe(o.nome);if(dup&&(!reg||String(dup.rowid)!==String(reg.rowid)))throw new Error('Já existe um cliente com esse nome.');
      await gravar(o,reg?reg.rowid:null);toast('Cliente salvo.','success');}}],940);
  const at=()=>j.querySelectorAll('[data-pr]').forEach(tr=>{const p=pecaDe(tr.querySelector('[data-pp]').value);if(!p)return;const x=calc(p,1);tr.querySelector('[data-pref]').textContent=`varejo ${R(x.preco||x.sug)}${num(p.preco_atacado)?` · atacado ${R(num(p.preco_atacado))}`:''} · custo ${R(x.un)}`;});
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('click',ev=>{const b2=ev.target.closest('[data-pmf]');if(!b2)return;const f=b2.dataset.pmf;
    if(f==='pick'){const tr=b2.closest('tr'),s=tr.querySelector('[data-pp]');return escolherPeca(s.value,pid=>{s.value=pid;s.dispatchEvent(new Event('change',{bubbles:true}));});}
    if(f==='pr-add'){j.querySelector('[data-precos]').insertAdjacentHTML('beforeend',linP({peca:pecas()[0].rowid,preco:''}));pintarFotos(j);}else if(f==='pr-x')b2.closest('tr').remove();at();});
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-pp]'))trocarThumb(ev.target.closest('tr'),ev.target.value);at();});
  ligarEndereco(j);pintarFotos(j);at();
}
/* ── vendedores e comissões (sobre o valor das peças entregues, sem o frete, menos devoluções) ── */
function baseComissao(v){return Math.max(0,totalVenda(v)-num(v.frete)-(v.devolucoes||[]).reduce((s,d)=>s+num(d.estorno),0));}
function comissoesMes(k){
  const o={};vendas().filter(v=>(v.status==='entregue'||v.status==='devolvida')&&v.vendedor&&dt(v.entrega)&&mesKey(dt(v.entrega))===k).forEach(v=>{const x=o[v.vendedor]=o[v.vendedor]||{vendas:[],base:0,com:0,pago:0};
    const b=baseComissao(v);x.vendas.push(v);x.base+=b;x.com+=b*num(v.comissao_pct)/100;});
  T('custo').filter(c=>c.categoria==='Comissões de vendedores'&&c.mes_ref===k&&c.vendedor).forEach(c=>{const x=o[c.vendedor]=o[c.vendedor]||{vendas:[],base:0,com:0,pago:0};x.pago+=num(c.valor);});
  Object.values(o).forEach(x=>{x.com=r2(x.com);x.aPagar=r2(Math.max(0,x.com-x.pago));});return o;
}
function telaVendedores(sub){
  const c=CFG(),k=PM.mes,cm=comissoesMes(k),vends=c.vendedores||[];
  const linV=x=>`<div class="fin-linha" data-lin="vend" style="margin-bottom:6px;grid-template-columns:1fr 140px 170px 36px"><div class="fin-fld"><input data-vn value="${fe(x.nome||'')}" placeholder="Nome"></div><div class="fin-fld"><input data-vp value="${x.pct!=null&&x.pct!==''?fe(String(x.pct).replace('.',',')):''}" placeholder="Comissão %" data-sem-mascara="1" inputmode="decimal"></div><div class="fin-fld"><input data-vt value="${fe(x.telefone||'')}" placeholder="Telefone"></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
  PM._linVend=linV;
  const nomes=[...new Set(vends.map(x=>x.nome).filter(Boolean).concat(Object.keys(cm)))];
  return cabG('Vendedores e comissões','A comissão é calculada sobre o valor das peças entregues no mês (sem o frete e descontadas as devoluções), pelo percentual gravado em cada venda. Ao pagar, o valor sai no fluxo de caixa.',GS.selMes(k,'data-pm-mes',12,0))+sub+
    `<section class="gf-sec"><div class="gf-sec-cab"><div><h3>Comissões de ${fe(mesNome(k))}</h3><p>Clique em <b>Pagar</b> para lançar o pagamento no caixa da fábrica.</p></div></div>
      ${nomes.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Vendedor</th><th class="n">Entregas</th><th class="n">Base</th><th class="n">Comissão</th><th class="n">Pago</th><th class="n">A pagar</th><th></th></tr></thead><tbody>
      ${nomes.map(n=>{const x=cm[n]||{vendas:[],base:0,com:0,pago:0,aPagar:0};return `<tr><td><b>${fe(n)}</b><small>${fe(((vends.find(v=>v.nome===n)||{}).pct!=null?nf(num((vends.find(v=>v.nome===n)||{}).pct),1)+'% padrão':''))}</small></td><td class="n">${x.vendas.length}</td><td class="n">${R(x.base)}</td><td class="n">${R(x.com)}</td><td class="n">${R(x.pago)}</td><td class="n" style="${x.aPagar>0?'color:#B54708;font-weight:800':''}">${R(x.aPagar)}</td>
        <td>${x.aPagar>0?`<button type="button" class="gf-bt mini pri" data-pm="com-pagar" data-nome="${fe(n)}"><i class="fas fa-hand-holding-dollar"></i> Pagar</button>`:''}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="gf-vazio"><i class="fas fa-user-tie"></i><p>Cadastre os vendedores abaixo.</p></div>'}</section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Cadastro de vendedores</h3><p>Percentual padrão de comissão de cada um (pode ser mudado em cada venda).</p></div><button type="button" class="gf-bt mini" data-pm="vend-add"><i class="fas fa-plus"></i> Vendedor</button></div>
      <div data-vends>${vends.map(linV).join('')||'<p class="pm-mini" data-vazio>Ninguém cadastrado.</p>'}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="gf-bt pri" data-pm="vend-salvar"><i class="fas fa-floppy-disk"></i> Salvar vendedores</button></div></section>`;
}
async function salvarVendedores(){const box=document.querySelector('#pm-app [data-vends]');if(!box)return;
  const L=[...box.querySelectorAll('[data-lin="vend"]')].map(d=>({nome:d.querySelector('[data-vn]').value.trim(),pct:parseFloat(String(d.querySelector('[data-vp]').value).replace(',','.'))||0,telefone:d.querySelector('[data-vt]').value.trim()})).filter(x=>x.nome);
  try{await salvarCfg(c=>{c.vendedores=L;});toast('Vendedores salvos.','success');}catch(e){toast(e.message,'error');}}
function pagarComissao(nome){const k=PM.mes,x=comissoesMes(k)[nome];if(!x||!(x.aPagar>0))return;
  confirmar('Pagar comissão?',`Lançar o pagamento de <b>${R(x.aPagar)}</b> a <b>${fe(nome)}</b> (comissão de ${fe(mesNome(k))}) no caixa da fábrica, com data de hoje?`,'Sim, pagar',async()=>{
    await gravar({tipo:'custo',categoria:'Comissões de vendedores',vendedor:nome,mes_ref:k,valor:x.aPagar,descricao:`Comissão de ${nome} — ${mesNome(k)}`,data:hojeISO(),pago_em:hojeISO(),data_lancamento:todayDateTime()},null);toast('Comissão paga e lançada no caixa.','success');});}
// o que a venda precisa para estar em cada fase (sinal → produção → pagamento → liberada → entregue)
function depsVenda(v,E){
  E=E||estoque();const c=CFG(),tot=totalVenda(v),pago=pagoDe(v),a=E.aloc[v.rowid]||{},ped=(v.itens||[]).reduce((s,it)=>s+num(it.qtd),0),pr=(v.itens||[]).reduce((s,it,i)=>s+Math.min(num(it.qtd),a[i]||0),0),sin=r2(tot*num(c.sinal)/100);
  return [v.tipo_venda==='pronta'?{ok:pago>=tot-0.009,txt:`Pronta entrega: pagamento completo (${R(pago)} de ${R(tot)})`}:{ok:pago>=sin-0.009,txt:`Sinal de ${nf(num(c.sinal),0)}% pago para reservar: ${R(Math.min(pago,sin))} de ${R(sin)}`},
    {ok:v.status!=='aguardando_sinal'&&pr>=ped,txt:`Peças prontas (curadas) e reservadas: ${nf(v.status==='aguardando_sinal'?0:pr,0)} de ${nf(ped,0)}${pr<ped?' — a produção e a cura liberam o restante':''}`},
    {ok:pago>=tot-0.009,txt:`Pagamento completo: ${R(pago)} de ${R(tot)}${pago<tot-0.009?` — <b>faltam ${R(tot-pago)}</b>`:''}`}];
}
async function moverVenda(id,col){
  const v=vendaDe(id);if(!v)return;const f=faseVenda(v);
  if(col==='entregue'&&f==='liberado')return entregar(v);
  render();if(col==='entregue')return trava(`Venda nº ${v.numero}: ainda não pode ser entregue`,depsVenda(v),f==='pagamento'||f==='sinal'?{rot:'Registrar pagamento',f:()=>registrarPagamento(v)}:null);
  trava(`Venda nº ${v.numero}: o cartão muda de coluna sozinho`,[{ok:true,txt:'Aguardando sinal → Reservado: quando o sinal é pago (Registrar pagamento)'},{ok:true,txt:'Em produção → Pronto: quando as peças da venda terminam a cura'},{ok:true,txt:'Pronto → Liberado: quando o pagamento fica completo'},{ok:true,txt:'Liberado → Entregue: arraste para Entregue ou use o botão Entregar'}].concat(depsVenda(v)));
}
// ── endereço: CEP (ViaCEP) e sugestão pelo nome da rua (ViaCEP pela cidade, ou OpenStreetMap) ──
const CEPS={};
async function viaCep(cep){cep=String(cep||'').replace(/\D/g,'');if(cep.length!==8)return null;if(CEPS[cep]!==undefined)return CEPS[cep];
  try{const j=await(await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();return CEPS[cep]=j&&!j.erro?j:null;}catch(e){return null;}}
// cidade sempre no formato do IBGE "Itarantim, BA" (a UF sai da própria cidade)
const partesCid=(cidade,uf)=>{const s=String(cidade||'').trim(),m=s.match(/^(.*?)\s*[,-]\s*([A-Za-z]{2})\s*$/);return m?[m[1].trim(),m[2].toUpperCase()]:[s,String(uf||'').toUpperCase()];};
const cidUF=(c,uf)=>{const [n,u]=partesCid(c,uf);return n?(u?`${n}, ${u}`:n):'';};
async function sugerirEnderecos(rua,cidade,uf){
  rua=String(rua||'').trim();if(rua.length<3)return [];const out=[],[cid,u]=partesCid(cidade,uf);
  if(cid&&u){try{const L=await(await fetch(`https://viacep.com.br/ws/${encodeURIComponent(u)}/${encodeURIComponent(cid)}/${encodeURIComponent(rua)}/json/`)).json();
    (Array.isArray(L)?L:[]).slice(0,8).forEach(x=>out.push({logradouro:x.logradouro,bairro:x.bairro,cidade:`${x.localidade}, ${x.uf}`,uf:x.uf,cep:x.cep,txt:`${x.logradouro}${x.complemento?' ('+x.complemento+')':''}`,sub:`${x.bairro?x.bairro+' · ':''}${x.localidade}, ${x.uf} · CEP ${x.cep}`}));}catch(e){}}
  if(!out.length){try{const L=await(await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=6&q=${encodeURIComponent([rua,cid,u].filter(Boolean).join(', '))}`,{headers:{'Accept-Language':'pt-BR'}})).json();
    (Array.isArray(L)?L:[]).forEach(x=>{const a=x.address||{},c2=a.city||a.town||a.village||a.municipality||'',est=(a['ISO3166-2-lvl4']||'').replace('BR-','')||'';
      out.push({logradouro:a.road||rua,bairro:a.suburb||a.neighbourhood||'',cidade:cidUF(c2,est),uf:est,cep:(a.postcode||'').replace(/\D/g,'').replace(/^(\d{5})(\d{3})$/,'$1-$2'),txt:a.road||x.display_name.split(',')[0],sub:`${a.suburb||a.neighbourhood?((a.suburb||a.neighbourhood)+' · '):''}${cidUF(c2,est)}${a.postcode?' · CEP '+a.postcode:''}`});});}catch(e){}}
  return out;
}
// CEP → endereço; rua digitada → sugestões com o CEP; cidade → lista do IBGE com a UF (em qualquer formulário com data-k)
function ligarEndereco(j){
  const q=k=>j.querySelector(`[data-k="${k}"]`),set=(k,v)=>{const e=q(k);if(e&&v!=null&&v!=='')e.value=v;};
  const cep=q('cep'),rua=q('logradouro'),cid=q('cidade');
  if(cid){if(GS.cidade&&GS.cidade.ligar)GS.cidade.ligar(cid);const poeUF=()=>{const [,u]=partesCid(cid.value);if(u)set('uf',u);};cid.addEventListener('change',poeUF);cid.addEventListener('blur',()=>setTimeout(poeUF,250));}
  if(cep)cep.addEventListener('input',async()=>{const d=cep.value.replace(/\D/g,'');if(d.length===8){const x=await viaCep(d);if(x){set('logradouro',x.logradouro);set('bairro',x.bairro);set('cidade',`${x.localidade}, ${x.uf}`);set('uf',x.uf);const n=q('numero');if(n)n.focus();}else toast('CEP não encontrado.','error');}});
  if(!rua)return;
  const caixa=document.createElement('div');caixa.className='pm-sug';caixa.style.display='none';rua.parentNode.style.position='relative';rua.parentNode.appendChild(caixa);let t,ult=[];
  rua.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(async()=>{ult=await sugerirEnderecos(rua.value,(q('cidade')||{}).value,(q('uf')||{}).value);
    caixa.innerHTML=ult.length?ult.map((x,i)=>`<div data-sg="${i}"><b>${fe(x.txt)}</b><small>${fe(x.sub)}</small></div>`).join(''):'';caixa.style.display=ult.length?'':'none';},450);});
  caixa.addEventListener('mousedown',async ev=>{const d=ev.target.closest('[data-sg]');if(!d)return;ev.preventDefault();const x=ult[+d.dataset.sg];caixa.style.display='none';
    set('logradouro',x.logradouro);set('bairro',x.bairro);set('cidade',x.cidade);set('uf',x.uf);
    if(x.cep)set('cep',x.cep);else{const [c2,u2]=partesCid(x.cidade,x.uf);try{const L=await(await fetch(`https://viacep.com.br/ws/${encodeURIComponent(u2)}/${encodeURIComponent(c2)}/${encodeURIComponent(x.logradouro)}/json/`)).json();if(Array.isArray(L)&&L[0])set('cep',L[0].cep);}catch(e){}}
    const n=q('numero');if(n)n.focus();});
  rua.addEventListener('blur',()=>setTimeout(()=>caixa.style.display='none',200));
}
const endTxt=e=>e?[e.logradouro?(e.logradouro+(e.numero?', '+e.numero:'')+(e.complemento?' ('+e.complemento+')':'')):'',e.bairro,[e.cidade,/[,-]\s*[A-Za-z]{2}\s*$/.test(e.cidade||'')?'':e.uf].filter(Boolean).join(' - '),e.cep?'CEP '+e.cep:''].filter(Boolean).join(' · '):'';
// preço de cada peça: tabela do cliente > atacado (canal atacado) > varejo (ou o sugerido)
function precoPara(p,canal,cli){const tb=cli&&(cli.precos||[]).find(x=>String(x.peca)===String(p.rowid));if(tb&&num(tb.preco)>0)return {v:num(tb.preco),orig:'cliente'};
  const x=calc(p,1),at=num(p.preco_atacado);if(canal==='atacado'&&at)return {v:at,orig:'atacado'};return {v:x.preco||r2(x.sug),orig:x.preco?'varejo':'sugerido'};}
/* frete: tabela por cidade ou por km (distância pelo mapa aberto OpenStreetMap; sem rota, linha reta × 1,3) */
const normTx=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
// "Potiraguá, BA" (cidade do campo com sugestão do IBGE) e "Potiraguá" valem a mesma cidade
const cidN=s=>normTx(String(s||'').replace(/\s*[,-]\s*[A-Za-z]{2}\s*$/,''));
async function geocod(e){const q=[e.logradouro?(e.logradouro+(e.numero?', '+e.numero:'')):'',String(e.cidade||'').replace(/\s*[,-]\s*[A-Za-z]{2}\s*$/,''),e.uf,'Brasil'].filter(Boolean).join(', ');
  const r=await(await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`,{headers:{'Accept-Language':'pt-BR'}})).json();
  if(!r||!r[0]){if(e.logradouro)return geocod({cidade:e.cidade,uf:e.uf});throw new Error('Não achei no mapa: '+q);}return [+r[0].lat,+r[0].lon];}
async function distanciaKm(a,b){const A=await geocod(a),B=await geocod(b);
  try{const j=await(await fetch(`https://router.project-osrm.org/route/v1/driving/${A[1]},${A[0]};${B[1]},${B[0]}?overview=false`)).json();if(j&&j.routes&&j.routes[0])return {km:j.routes[0].distance/1000,rota:true};}catch(e){}
  const rad=Math.PI/180,dLa=(B[0]-A[0])*rad,dLo=(B[1]-A[1])*rad,h=Math.sin(dLa/2)**2+Math.cos(A[0]*rad)*Math.cos(B[0]*rad)*Math.sin(dLo/2)**2;return {km:2*6371*Math.asin(Math.sqrt(h))*1.3,rota:false};}
async function calcularFrete(end){
  const c=CFG(),F=c.frete||{},tab=(F.cidades||[]).find(x=>cidN(x.cidade)===cidN(end.cidade)&&(!x.uf||!end.uf||normTx(x.uf)===normTx(end.uf)));
  if(tab&&num(tab.valor)>0)return {valor:r2(num(tab.valor)),info:`tabela por cidade (${tab.cidade})`};
  if(!end.cidade)throw new Error('Informe a cidade do endereço de entrega.');if(!(num(F.rs_km)>0))throw new Error('Cadastre o valor por km (ou a tabela de cidades) em Parâmetros › Entregas e frete.');
  const o=F.origem&&F.origem.cidade?F.origem:{cidade:c.cidade,uf:c.uf};if(!o.cidade)throw new Error('Informe o endereço da fábrica em Parâmetros › Entregas e frete.');
  const {km,rota}=await distanciaKm(o,end),iv=F.ida_volta!==false,kmC=Math.max(num(F.km_min),km*(iv?2:1));
  return {valor:r2(kmC*num(F.rs_km)),km,info:`${nf(km,0)} km${rota?'':' (aprox.)'}${iv?` · ida e volta ${nf(km*2,0)} km`:''}${kmC>km*(iv?2:1)?` · mínimo ${nf(num(F.km_min),0)} km`:''} × ${R(num(F.rs_km))}/km`};
}
function formVenda(reg){
  if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e catálogo).','error');
  const c=CFG(),E=estoque(),b=reg?JSON.parse(JSON.stringify(reg)):{data:hojeISO(),tipo_venda:'encomenda',canal:'varejo',itens:[{peca:pecas()[0].rowid,qtd:'',preco:''}],end:{cidade:c.cidade||'',uf:c.uf||'BA'},nf:{quer:false}};
  const ops=reg?opsDaVenda(reg):[],iniciada=ops.some(opIniciada),travarItens=!!reg&&(iniciada||['entregue','devolvida','cancelada'].includes(reg.status)||(reg.status==='reservado'&&reg.tipo_venda==='pronta'&&pagoDe(reg)>0));
  const clientes=T('cliente'),vends=(c.vendedores||[]).filter(x=>x&&x.nome);
  const itemLin=it=>`<tr data-item><td style="width:66px">${thumbBt(it.peca)}</td><td><select data-i="peca" ${travarItens?'disabled':''}>${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(it.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></td>
    <td><input data-i="qtd" inputmode="numeric" value="${fe(String(it.qtd||''))}" placeholder="0" ${travarItens?'readonly':''}></td><td><input data-i="preco" data-mask="moeda" value="${it.preco!==''&&it.preco!=null?fe(R(num(it.preco))):''}" ${travarItens?'readonly':''}></td>
    <td data-i="disp" class="pm-mini" style="min-width:150px"></td><td class="n" data-i="tot" style="white-space:nowrap;text-align:right"></td><td>${travarItens?'':'<button type="button" class="pm-x" data-pmf="item-x"><i class="fas fa-xmark"></i></button>'}</td></tr>`;
  const e=b.end||{},sel=(k,ops2,v)=>`<select data-k="${k}">${ops2.map(([a,l])=>`<option value="${a}" ${a===v?'selected':''}>${l}</option>`).join('')}</select>`;
  const j=janela(reg?`Editar venda nº ${reg.numero}`:'Nova venda',`${travarItens&&reg?`<div class="fin-aviso laranja"><div>${iniciada?'A produção desta venda <b>já começou</b>: os itens não podem mais ser mudados (só contato, endereço, prazo e observações).':'Os itens desta venda não podem mais ser mudados.'}</div></div>`:''}
    <div class="fin-linha" style="margin-top:6px">
      <div class="fin-fld"><label>Tipo de venda</label>${sel('tipo_venda',[['encomenda','Encomenda (reserva com sinal)'],['pronta','Pronta entrega (peça pronta)']],b.tipo_venda||'encomenda')}</div>
      <div class="fin-fld"><label>Canal / tabela de preço</label>${sel('canal',[['varejo','Varejo'],['atacado','Atacado']],b.canal||'varejo')}</div>
      <div class="fin-fld"><label>Data do pedido <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Entrega prevista</label><input type="date" data-k="prazo_entrega" value="${fe(b.prazo_entrega||'')}"></div>
      <div class="fin-fld"><label>Vendedor</label><select data-k="vendedor"><option value="">— sem vendedor —</option>${vends.concat(b.vendedor&&!vends.some(x=>x.nome===b.vendedor)?[{nome:b.vendedor}]:[]).map(x=>`<option ${x.nome===b.vendedor?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Comissão (%)</label><input data-k="comissao_pct" value="${b.comissao_pct!=null&&b.comissao_pct!==''?fe(String(b.comissao_pct)):''}"></div></div>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-user"></i> Cliente</h5><div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Nome / razão social <span class="obg">*</span></label><input data-k="cliente" value="${fe(b.cliente||'')}" list="pm-clientes" placeholder="cliente do cadastro ou novo"></div>
      <div class="fin-fld"><label>CPF / CNPJ</label><input data-k="doc" value="${fe(b.doc||'')}"></div><div class="fin-fld"><label>Telefone / WhatsApp</label><input data-k="telefone" value="${fe(b.telefone||'')}"></div>
      <div class="fin-fld"><label>CEP</label><input data-k="cep" value="${fe(e.cep||'')}" placeholder="00000-000"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Endereço de entrega (rua)</label><input data-k="logradouro" value="${fe(e.logradouro||'')}" placeholder="digite a rua: o sistema sugere o endereço com o CEP" autocomplete="off"></div>
      <div class="fin-fld"><label>Número</label><input data-k="numero" value="${fe(e.numero||'')}"></div><div class="fin-fld"><label>Complemento</label><input data-k="complemento" value="${fe(e.complemento||'')}"></div>
      <div class="fin-fld"><label>Bairro</label><input data-k="bairro" value="${fe(e.bairro||'')}"></div><div class="fin-fld"><label>Cidade</label><input data-k="cidade" value="${fe(cidUF(e.cidade,e.uf))}" placeholder="Ex.: Itarantim, BA"></div><div class="fin-fld"><label>UF</label><input data-k="uf" value="${fe(e.uf||'')}" maxlength="2"></div></div>
      <p class="pm-mini" data-cli-info style="margin:6px 0 0"></p></div>
    <datalist id="pm-clientes">${clientes.map(x=>`<option value="${fe(x.nome)}">`).join('')}</datalist>
    <div class="pm-bloco"><h5><i class="fas fa-cubes"></i> Itens</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th></th><th>Peça</th><th style="width:80px">Quant.</th><th style="width:130px">Preço unit. (R$)</th><th>Estoque e preço</th><th style="width:100px;text-align:right">Total</th><th></th></tr></thead><tbody data-itens>${(b.itens||[]).map(itemLin).join('')}</tbody></table></div>
      ${travarItens?'':'<button type="button" class="gf-bt mini" data-pmf="item-add" style="margin-top:6px"><i class="fas fa-plus"></i> Item</button>'}</div>
    <div class="fin-linha"><div class="fin-fld"><label>Desconto (%)</label><input data-k="desconto_pct" value="${b.desconto_pct?fe(String(b.desconto_pct)):''}" ${travarItens?'readonly':''}></div><div class="fin-fld"><label>Desconto em reais</label><input data-k="desc_rs" readonly></div>
      <div class="fin-fld"><label>Frete (R$)</label><div style="display:flex;gap:6px"><input data-k="frete" value="${num(b.frete)?fe(R(num(b.frete))):''}" ${travarItens?'readonly':''} style="flex:1;min-width:0">${travarItens?'':'<button type="button" class="gf-bt mini" data-pmf="frete" title="Calcular pelo endereço"><i class="fas fa-route"></i> Calcular</button>'}</div><small class="pm-mini" data-frete-info>${fe(b.frete_info||'')}</small></div>
      <div class="fin-fld"><label>Cliente quer nota fiscal?</label><select data-k="nf_quer"><option value="nao" ${!(b.nf||{}).quer?'selected':''}>Não</option><option value="sim" ${(b.nf||{}).quer?'selected':''}>Sim</option></select></div>
      <div class="fin-fld" data-nf-num ${(b.nf||{}).quer?'':'hidden'}><label>Nº da nota fiscal</label><input data-k="nf_numero" value="${fe((b.nf||{}).numero||'')}" placeholder="preencher ao emitir"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}"></div></div>
    ${reg?'':`<div class="pm-bloco" data-pg><h5><i class="fas fa-hand-holding-dollar"></i> <span data-pg-tit>Sinal recebido agora</span></h5><div class="fin-linha">
      <div class="fin-fld"><label>Valor recebido (R$)</label><input data-k="pg_valor" placeholder="R$ 0,00"></div><div class="fin-fld"><label>Forma</label><select data-k="pg_forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <label class="nfc-amb" data-pg-levou hidden style="grid-column:1/-1"><input type="checkbox" data-k="levou"><span>O cliente já levou as peças agora (entrega no balcão)</span></label></div><p class="pm-mini" data-pg-dica style="margin:6px 0 0"></p></div>`}
    <div class="pm-big"><span>Total da venda</span><b data-v-tot>—</b><span data-v-est></span></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{if(pagoDe(reg)>0||ops.length)throw new Error('Venda com pagamento ou produção: use Cancelar venda (Administrador).');setTimeout(()=>apagarReg(reg,`Venda nº ${reg.numero}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar e ver o pedido',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg)&&!ehAdm())throw new Error(GS.MSG_DONO);
      const g=k=>String((jj.querySelector(`[data-k="${k}"]`)||{}).value||'').trim(),o=reg?{...reg}:{tipo:'venda',numero:proxNum('venda','numero'),pagamentos:[],data_lancamento:todayDateTime()};
      ['cliente','doc','telefone','data','prazo_entrega','obs','tipo_venda','canal','vendedor'].forEach(k=>o[k]=g(k));o.comissao_pct=o.vendedor?num(g('comissao_pct')):0;
      o.end={cep:g('cep'),logradouro:g('logradouro'),numero:g('numero'),complemento:g('complemento'),bairro:g('bairro'),cidade:g('cidade'),uf:g('uf').toUpperCase()};
      o.nf={quer:g('nf_quer')==='sim',numero:g('nf_numero')};
      if(!travarItens){o.itens=lerItens(jj);o.desconto_pct=num(g('desconto_pct'));o.frete=r2(num(g('frete')));o.frete_info=(jj.querySelector('[data-frete-info]')||{}).textContent||'';if(/^Calculando/.test(o.frete_info))throw new Error('Espere o cálculo do frete terminar.');delete o.desconto;}
      if(!o.cliente)throw new Error('Informe o cliente.');if(!o.data)throw new Error('Informe a data do pedido.');if(!(o.itens||[]).length)throw new Error('Inclua ao menos um item com quantidade.');
      if(o.desconto_pct<0||o.desconto_pct>=100)throw new Error('O desconto deve ficar entre 0% e 99%.');
      if(o.comissao_pct<0||o.comissao_pct>30)throw new Error('A comissão deve ficar entre 0% e 30%.');
      if((o.itens||[]).some(it=>!(it.preco>0)))throw new Error('Todo item precisa de preço.');
      if(!reg&&r2(num(g('pg_valor')))>r2(totalVenda(o))+0.009)return trava('Pagamento maior que a venda',[{ok:false,txt:`Valor recebido ${R(num(g('pg_valor')))} — a venda é de ${R(totalVenda(o))}. Troco não entra no sistema: informe só o valor da venda.`}]);
      o.total=totalVenda(o);const tot=o.total;
      if(!reg){const pv=r2(num(g('pg_valor')));if(pv>0)o.pagamentos=[{data:hojeISO(),valor:pv,forma:g('pg_forma'),tipo:o.tipo_venda==='pronta'?'pagamento':'sinal',por:eu()}];}
      const pago=pagoDe(o),sinalMin=r2(tot*num(c.sinal)/100);
      if(o.tipo_venda==='pronta'){
        const falta=(o.itens||[]).filter(it=>{const x=E.P[String(it.peca)]||{livre:0},minha=reg&&reg.status==='reservado'?(reg.itens||[]).filter(z=>String(z.peca)===String(it.peca)).reduce((s,z)=>s+num(z.qtd),0):0;return num(it.qtd)>x.livre+minha;});
        if(falta.length&&!travarItens)throw new Error(`Sem peça pronta livre para: ${falta.map(it=>nomePeca(it.peca)).join(', ')}. Mude para Encomenda (reserva com sinal).`);
        if(!reg&&pago<tot-0.009)throw new Error(`Pronta entrega precisa estar paga: informe o pagamento de ${R(tot)}.`);
        if(!reg)o.status=jj.querySelector('[data-k="levou"]')&&jj.querySelector('[data-k="levou"]').checked?'entregue':'reservado';
        if(o.status==='entregue'&&!o.entrega)o.entrega=hojeISO();
      }else if(!reg){o.status=pago>=sinalMin-0.009?'reservado':'aguardando_sinal';}
      const mud=[[o,reg?reg.rowid:null]];
      if(reg&&!travarItens&&ops.length){ops.forEach(op=>mud.push([{...op,status:'cancelada',obs:(op.obs?op.obs+' · ':'')+'refeita pela edição da venda'},op.rowid]));o.ops_geradas=false;}
      // cliente novo entra no cadastro sozinho
      if(!cliDe(o.cliente))mud.push([{tipo:'cliente',nome:o.cliente,doc:o.doc,telefone:o.telefone,canal:o.canal,vendedor:o.vendedor,end:o.end,precos:[],data_lancamento:todayDateTime()},null]);
      await gravarVarios(mud);
      let v=vendas().find(x=>num(x.numero)===num(o.numero)&&x.tipo==='venda');
      if(v&&v.status==='reservado'&&v.tipo_venda!=='pronta'&&!v.ops_geradas)await gerarProducaoVenda(v);
      v=vendas().find(x=>num(x.numero)===num(o.numero));
      toast(reg?'Venda salva.':`Venda nº ${o.numero} criada${o.status==='aguardando_sinal'?' — aguardando o sinal para reservar':o.status==='entregue'?' e entregue':''}.`,'success');
      if(v)setTimeout(()=>fichaVenda(v),120);}}],1040);
  const cliAtual=()=>cliDe((j.querySelector('[data-k="cliente"]')||{}).value),canalAtual=()=>(j.querySelector('[data-k="canal"]')||{}).value||'varejo';
  const atVis=()=>{const tp=j.querySelector('[data-k="tipo_venda"]').value,pg=j.querySelector('[data-pg]');if(pg){j.querySelector('[data-pg-tit]').textContent=tp==='pronta'?'Pagamento (pronta entrega: tem que estar pago)':`Sinal recebido agora (mínimo ${nf(num(c.sinal),0)}% para reservar)`;j.querySelector('[data-pg-levou]').hidden=tp!=='pronta';}
    j.querySelector('[data-nf-num]').hidden=j.querySelector('[data-k="nf_quer"]').value!=='sim';};
  const at=()=>{if(!j.isConnected||!j.querySelector('[data-v-tot]'))return;const its=lerItens(j),cli=cliAtual(),canal=canalAtual();
    j.querySelectorAll('[data-item]').forEach(tr=>{const p=pecaDe(tr.querySelector('[data-i="peca"]').value),q=num(tr.querySelector('[data-i="qtd"]').value),pr=num(tr.querySelector('[data-i="preco"]').value),x=E.P[String(p&&p.rowid)]||{livre:0,emProd:0};
      tr.querySelector('[data-i="tot"]').textContent=q?R(q*pr):'';if(!p)return;
      const base=precoPara(p,canal,cli),at2=num(p.preco_atacado),min=num(p.atacado_min);let h=`${nf(Math.max(0,x.livre),0)} livres${x.emProd?` · ${nf(x.emProd,0)} em produção`:''}`;
      if(base.orig==='cliente')h+=`<br><span class="pm-at az"><i class="fas fa-tags"></i> tabela do cliente</span>`;
      else if(at2&&Math.abs(pr-at2)<0.009)h+=`<br><span class="pm-at"><i class="fas fa-tags"></i> preço de atacado</span>`;
      else if(at2&&min&&q>=min)h+=`<br><span class="pm-at"><i class="fas fa-tags"></i> ${nf(q,0)} pç: pode usar atacado ${R(at2)} <button type="button" data-pmf="usar-at" data-v="${at2}">usar</button></span>`;
      else if(at2&&min)h+=`<br><small>atacado a partir de ${nf(min,0)} pç: ${R(at2)}</small>`;
      else if(at2)h+=`<br><small>atacado: ${R(at2)}</small>`;
      tr.querySelector('[data-i="disp"]').innerHTML=h;});
    const dp=num(j.querySelector('[data-k="desconto_pct"]').value),bruto=its.reduce((s,it)=>s+it.qtd*it.preco,0);j.querySelector('[data-k="desc_rs"]').value=R(bruto*dp/100);
    const tot=r2(bruto-r2(bruto*dp/100)+num(j.querySelector('[data-k="frete"]').value));j.querySelector('[data-v-tot]').textContent=R(tot);
    const falta=its.filter(it=>{const x=E.P[String(it.peca)]||{livre:0};const minha=reg&&reg.status==='reservado'?(reg.itens||[]).filter(z=>String(z.peca)===String(it.peca)).reduce((s,z)=>s+num(z.qtd),0):0;return it.qtd>x.livre+minha;});
    j.querySelector('[data-v-est]').innerHTML=falta.length?`<span style="color:#B54708"><i class="fas fa-industry"></i> sem peça livre: ${falta.map(it=>fe(nomePeca(it.peca))).join(', ')} — vira encomenda e a produção sai sozinha</span>`:'<span style="color:#067647"><i class="fas fa-check"></i> tudo pronto no estoque</span>';
    const dica=j.querySelector('[data-pg-dica]');if(dica){const tp=j.querySelector('[data-k="tipo_venda"]').value;dica.innerHTML=tp==='pronta'?`Valor a receber: <b>${R(tot)}</b>.`:`Sinal mínimo (${nf(num(c.sinal),0)}%): <b>${R(tot*num(c.sinal)/100)}</b>. Sem o sinal, o pedido fica "aguardando sinal" e não reserva peça nem gera produção.`;}
    const ci=j.querySelector('[data-cli-info]');if(ci)ci.innerHTML=cli?`<i class="fas fa-address-book"></i> Cliente do cadastro${cli.canal==='atacado'?' · atacado':''}${(cli.precos||[]).length?` · ${(cli.precos||[]).length} preço(s) próprio(s)`:''}${num(cli.desconto_pct)?` · desconto padrão ${nf(num(cli.desconto_pct),1)}%`:''}`:(j.querySelector('[data-k="cliente"]').value.trim()?'<i class="fas fa-user-plus"></i> Cliente novo: entra no cadastro ao salvar.':'');};
  const reprecificar=tr0=>{if(travarItens)return;const cli=cliAtual(),canal=canalAtual();j.querySelectorAll('[data-item]').forEach(tr=>{if(tr0&&tr!==tr0)return;const p=pecaDe(tr.querySelector('[data-i="peca"]').value);if(p)tr.querySelector('[data-i="preco"]').value=R(precoPara(p,canal,cli).v);});};
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('input',ev=>{if(ev.target.matches('[data-k="frete"]')){const fi=j.querySelector('[data-frete-info]');if(fi)fi.textContent='';}clearTimeout(j._pmT);j._pmT=setTimeout(at,100);});
  corpo.addEventListener('change',ev=>{const t=ev.target;
    if(t.matches('[data-i="peca"]')){const tr=t.closest('tr');trocarThumb(tr,t.value);reprecificar(tr);}
    if(t.matches('[data-k="canal"]'))reprecificar(null);
    if(t.matches('[data-k="vendedor"]')){const vd=vends.find(x=>x.nome===t.value),ce=j.querySelector('[data-k="comissao_pct"]');if(ce)ce.value=vd&&vd.pct!=null?nf(num(vd.pct),2):'';}
    if(t.matches('[data-k="cliente"]')){const cl=cliDe(t.value);if(cl){const s=(k,v)=>{const e2=j.querySelector(`[data-k="${k}"]`);if(e2&&v!=null&&v!==''&&!e2.value)e2.value=v;};s('doc',cl.doc);s('telefone',cl.telefone);const en=cl.end||{};['cep','logradouro','numero','complemento','bairro','cidade','uf'].forEach(k=>s(k,en[k]));
      if(cl.canal)j.querySelector('[data-k="canal"]').value=cl.canal;if(cl.vendedor&&!j.querySelector('[data-k="vendedor"]').value){j.querySelector('[data-k="vendedor"]').value=cl.vendedor;const vd=vends.find(x=>x.nome===cl.vendedor),ce=j.querySelector('[data-k="comissao_pct"]');if(vd&&ce)ce.value=nf(num(vd.pct),2);}
      if(num(cl.desconto_pct)&&!j.querySelector('[data-k="desconto_pct"]').value)j.querySelector('[data-k="desconto_pct"]').value=nf(num(cl.desconto_pct),2);reprecificar(null);}}
    atVis();at();});
  corpo.addEventListener('click',async ev=>{const b2=ev.target.closest('[data-pmf]');if(!b2)return;const f=b2.dataset.pmf;
    if(f==='pick'){if(travarItens)return ampliar(b2.dataset.th);const tr=b2.closest('tr'),s=tr.querySelector('[data-i="peca"]');return escolherPeca(s.value,pid=>{s.value=pid;s.dispatchEvent(new Event('change',{bubbles:true}));});}
    if(f==='usar-at'){const tr=b2.closest('tr');tr.querySelector('[data-i="preco"]').value=R(num(b2.dataset.v));}
    if(f==='frete'){const gv=k=>String(j.querySelector(`[data-k="${k}"]`).value||'').trim(),fi=j.querySelector('[data-frete-info]');b2.disabled=true;fi.textContent='Calculando a distância…';
      try{const r=await calcularFrete({logradouro:gv('logradouro'),numero:gv('numero'),bairro:gv('bairro'),cidade:gv('cidade'),uf:gv('uf')});if(!fi.isConnected)return;j.querySelector('[data-k="frete"]').value=R(r.valor);fi.textContent=r.info;}catch(e2){fi.textContent='';if(fi.isConnected)toast(e2.message||String(e2),'error');}finally{b2.disabled=false;}}
    if(f==='item-add'){const p0=pecas()[0];j.querySelector('[data-itens]').insertAdjacentHTML('beforeend',itemLin({peca:p0.rowid,qtd:'',preco:precoPara(p0,canalAtual(),cliAtual()).v}));pintarFotos(j);}
    else if(f==='item-x')b2.closest('tr').remove();at();});
  if(!reg)j.querySelectorAll('[data-item]').forEach(tr=>{const p=pecaDe(tr.querySelector('[data-i="peca"]').value);const pr=tr.querySelector('[data-i="preco"]');if(p&&!pr.value)pr.value=R(precoPara(p,'varejo',null).v);});
  ligarEndereco(j);pintarFotos(j);atVis();at();
}
function lerItens(j){return [...j.querySelectorAll('[data-item]')].map(tr=>({peca:tr.querySelector('[data-i="peca"]').value,qtd:num(tr.querySelector('[data-i="qtd"]').value),preco:r2(num(tr.querySelector('[data-i="preco"]').value))})).filter(it=>it.qtd>0);}
// produção do que falta para a venda reservada (uma vez só: a venda fica marcada)
async function gerarProducaoVenda(v){
  const E=estoque(),a=E.aloc[v.rowid]||{},mud=[];let n=proxNum('ordem','numero');
  (v.itens||[]).forEach((it,i)=>{const falta=num(it.qtd)-(a[i]||0);if(falta<=0)return;const p=pecaDe(it.peca),cura=num(p&&p.cura!=null&&p.cura!==''?p.cura:7);
    const pz=dt(v.prazo_entrega),fim=pz?isoDe(addD(pz,-cura)):'';mud.push([{tipo:'ordem',numero:n++,peca:it.peca,qtd:falta,status:'planejada',inicio:hojeISO(),fim:fim&&fim>=hojeISO()?fim:'',venda:String(v.rowid),cliente:`Venda nº ${v.numero} — ${v.cliente||''}`,data_lancamento:todayDateTime()},null]);});
  mud.push([{...vendaBruta(v),ops_geradas:true},v.rowid]);
  await gravarVarios(mud);
  const nOps=mud.length-1;if(nOps)toast(`${nOps} ordem(ns) de produção criada(s) para a venda nº ${v.numero}.`,'success');
}
const vendaBruta=v=>{const r=T('venda').find(x=>String(x.rowid)===String(v.rowid))||v;return {...r};};
function fichaVenda(v){
  if(!v)return;const E=estoque(),f=faseVenda(v,E),tot=totalVenda(v),pago=pagoDe(v),c=CFG(),ops=opsDaVenda(v),iniciada=ops.some(opIniciada),a=E.aloc[v.rowid]||{};
  const bts=[];
  bts.push({html:`<i class="fas fa-print"></i> ${f==='entregue'||pago>=tot-0.009?'Comprovante':'Imprimir pedido'}`,acao:async()=>{imprimirVenda(v);return false;}});
  if(v.status!=='cancelada'&&((v.nf||{}).quer||f==='entregue'))bts.push({html:'<i class="fas fa-file-invoice"></i> Anexar nota fiscal',acao:async()=>{anexarNota(v);return false;}});
  if(['sinal','producao','pagamento','liberado'].includes(f)&&pago<tot-0.009)bts.push({html:'<i class="fas fa-hand-holding-dollar"></i> Registrar pagamento',acao:async()=>{setTimeout(()=>registrarPagamento(v),60);}});
  // cancelar: só o Administrador e só enquanto a produção da venda não começou
  if(['sinal','producao','pagamento','liberado'].includes(f)&&ehAdm()&&!iniciada)bts.push({html:'<i class="fas fa-ban"></i> Cancelar venda',acao:async()=>{setTimeout(()=>cancelarVenda(v),60);}});
  if(f==='entregue')bts.push({html:'<i class="fas fa-rotate-left"></i> Devolução / estorno',acao:async()=>{setTimeout(()=>devolver(v),60);}});
  if(f==='entregue')bts.push({html:'<i class="fas fa-heart-crack"></i> Avaria na entrega',acao:async()=>{setTimeout(()=>formAvaria(null,(v.itens||[])[0]&&v.itens[0].peca,{venda:v.rowid,origem:'transporte'}),60);}});
  if(!['entregue','devolvida','cancelada'].includes(v.status))bts.push({html:'<i class="fas fa-calendar-days"></i> Agendar entrega',acao:async()=>{setTimeout(()=>formAgenda(v),60);}});
  if(!['entregue','devolvida','cancelada'].includes(v.status))bts.push({html:'<i class="fas fa-pen"></i> Editar',acao:async()=>{setTimeout(()=>formVenda(v),60);}});
  if(f==='liberado')bts.push({html:'<i class="fas fa-truck"></i> Entregar',cls:'pri',acao:async()=>{setTimeout(()=>entregar(v),60);}});
  const lts=(f==='entregue'||v.status==='devolvida')?(rastreio().porVenda[v.rowid]||[]):[];
  const extra=`${v.agenda&&v.agenda.data&&f!=='entregue'?`<p class="pm-mini" style="margin:8px 0 0"><i class="fas fa-calendar-check"></i> Entrega agendada: <b>${fe(brDe(dt(v.agenda.data)))}</b>${v.agenda.periodo?' · '+fe(v.agenda.periodo):''}${v.agenda.caminhao?' · '+fe(v.agenda.caminhao):''}${v.agenda.obs?' · '+fe(v.agenda.obs):''}</p>`:''}
    ${v.vendedor?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-user-tie"></i> Vendedor: ${fe(v.vendedor)}${num(v.comissao_pct)?` · comissão ${nf(num(v.comissao_pct),1)}% = ${R(baseComissao(v)*num(v.comissao_pct)/100)}`:''}</p>`:''}
    ${v.frete_info?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-route"></i> Frete: ${fe(v.frete_info)}</p>`:''}
    ${lts.length?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-tag"></i> Lotes entregues (pela ordem de saída): ${lts.map(x=>`${fe(x.lote)} (${nf(x.qtd,0)} × ${fe(nomePeca(x.peca))})`).join(' · ')}</p>`:''}`;
  const pend=f==='sinal'?`Falta o sinal de <b>${R(Math.max(0,tot*num(c.sinal)/100-pago))}</b> (${nf(num(c.sinal),0)}%) para reservar as peças e começar a produção.`:f==='producao'?`Peças em produção: ${ops.length?ops.map(o=>`OP nº ${o.numero} (${nf(prodDaOrdem(o.rowid),0)}/${nf(num(o.qtd),0)})`).join(', '):'aguardando peça pronta do estoque'}.`:f==='pagamento'?`Peças prontas. Falta receber <b>${R(tot-pago)}</b> para liberar a entrega.`:f==='liberado'?'Pago e com as peças prontas: <b>pode entregar</b>.':'';
  janela(`Venda nº ${v.numero}`,`<div class="fin-resumo"><b>${fe(v.cliente||'')}</b>${v.telefone?' · '+fe(v.telefone):''}${v.doc?' · '+fe(v.doc):''} · ${v.tipo_venda==='pronta'?'pronta entrega':'encomenda'} · ${v.canal==='atacado'?'atacado':'varejo'}<br>${fe((FASES_V.find(x=>x.k===f)||{rot:v.status}).rot)}${v.data?' · pedido em '+brDe(dt(v.data)):''}${v.prazo_entrega?' · entrega prevista '+brDe(dt(v.prazo_entrega)):''}${v.entrega?' · entregue em '+brDe(dt(v.entrega)):''}</div>
    ${pend?`<div class="fin-aviso ${f==='liberado'?'':'laranja'}" style="margin-top:8px"><div>${pend}</div></div>`:''}
    <table class="pm-tab2" data-sem-ordem style="margin-top:8px"><thead><tr><th>Peça</th><th class="n">Quant.</th><th class="n">Prontas</th><th class="n">Preço</th><th class="n">Total</th></tr></thead><tbody>
    ${(v.itens||[]).map((it,i)=>`<tr><td>${fe(nomePeca(it.peca))}</td><td class="n">${nf(num(it.qtd),0)}</td><td class="n">${v.status==='reservado'?nf(a[i]||0,0):'—'}</td><td class="n">${R(num(it.preco))}</td><td class="n">${R(num(it.qtd)*num(it.preco))}</td></tr>`).join('')}
    ${descontoVenda(v)?`<tr><td colspan="4">Desconto${v.desconto_pct?' ('+nf(num(v.desconto_pct),1)+'%)':''}</td><td class="n">${R(-descontoVenda(v))}</td></tr>`:''}${num(v.frete)?`<tr><td colspan="4">Frete</td><td class="n">${R(num(v.frete))}</td></tr>`:''}
    <tr class="t"><td colspan="4">Total</td><td class="n">${R(tot)}</td></tr><tr><td colspan="4">Pago</td><td class="n" style="color:#067647">${R(pago)}</td></tr><tr><td colspan="4"><b>Saldo</b></td><td class="n"><b>${R(Math.max(0,tot-pago))}</b></td></tr></tbody></table>
    ${(v.pagamentos||[]).length?`<h5 style="margin:10px 0 4px;font:800 12px Inter">Pagamentos</h5><ul class="pm-arml">${(v.pagamentos||[]).map(p=>`<li${p.tipo==='estorno'?' style="background:#FEF3F2"':''}><i class="fas ${p.tipo==='estorno'?'fa-rotate-left':'fa-circle-dollar-to-slot'}" style="color:${p.tipo==='estorno'?'#B42318':'#067647'}"></i><span>${fe(brDe(dt(p.data)))} · <b>${p.tipo==='estorno'?'estorno −':''}${R(num(p.valor))}</b> · ${fe(p.forma||'')} · ${fe(p.tipo||'')}${p.obs?' · '+fe(p.obs):''}</span></li>`).join('')}</ul>`:''}
    ${endTxt(v.end)?`<p class="pm-mini" style="margin:8px 0 0"><i class="fas fa-location-dot"></i> ${fe(endTxt(v.end))}</p>`:''}${(v.nf||{}).quer?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-file-invoice"></i> Cliente quer nota fiscal${(v.nf||{}).numero?' — NF nº '+fe(v.nf.numero):' (ainda sem número)'}.</p>`:''}${v.obs?`<p class="pm-mini" style="margin:4px 0 0">${fe(v.obs)}</p>`:''}${extra}<div data-nf-arqs style="margin-top:6px"></div>`,bts,820);
  // arquivos da nota fiscal anexada (XML / PDF)
  arquivosNota(v).then(L=>{const box=document.querySelector('#fin-jan [data-nf-arqs]');if(!box||!L.length)return;
    box.innerHTML=`<div class="pm-at az" style="white-space:normal"><i class="fas fa-file-invoice"></i> Nota fiscal${(v.nf||{}).numero?' nº '+fe(v.nf.numero):''}: ${L.map((a,i)=>`<a href="#" data-nfa="${i}" style="color:#1652D8;font-weight:800">${a.doc==='xml'?'XML':'PDF'}</a>`).join(' · ')}</div>`;
    box.addEventListener('click',ev=>{const a=ev.target.closest('[data-nfa]');if(!a)return;ev.preventDefault();GS.docs.baixarArq(L[+a.dataset.nfa],true);});});
}
function registrarPagamento(v){
  const c=CFG(),tot=totalVenda(v),pago=pagoDe(v),sinalFalta=r2(Math.max(0,tot*num(c.sinal)/100-pago)),saldo=r2(tot-pago);
  janela(`Pagamento — venda nº ${v.numero}`,`<div class="fin-resumo">Total ${R(tot)} · pago ${R(pago)} · <b>saldo ${R(saldo)}</b>${v.status==='aguardando_sinal'?`<br>Sinal mínimo para reservar: <b>${R(sinalFalta)}</b>`:''}</div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Valor (R$) <span class="obg">*</span></label><input data-k="valor" data-mask="moeda" value="${fe(R(v.status==='aguardando_sinal'?sinalFalta:saldo))}"></div>
    <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${hojeISO()}" max="${hojeISO()}"></div>
    <div class="fin-fld"><label>Forma</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Observação</label><input data-k="obs"></div></div>`,
    [{html:'<i class="fas fa-circle-check"></i> Confirmar pagamento',cls:'pri',acao:async j=>{const g=k=>j.querySelector(`[data-k="${k}"]`).value,val=r2(num(g('valor')));
      if(!(val>0))throw new Error('Informe o valor.');if(val>saldo+0.009)throw new Error(`O valor passa do saldo (${R(saldo)}).`);if(!g('data'))throw new Error('Informe a data.');
      const o=vendaBruta(v);o.pagamentos=(o.pagamentos||[]).concat([{data:g('data'),valor:val,forma:g('forma'),tipo:o.status==='aguardando_sinal'?'sinal':'pagamento',obs:g('obs'),por:eu()}]);
      let reservou=false;if(o.status==='aguardando_sinal'&&pagoDe(o)>=r2(tot*num(c.sinal)/100)-0.009){o.status='reservado';reservou=true;}
      await gravar(o,v.rowid);toast(reservou?'Sinal recebido: peças reservadas.':'Pagamento registrado.','success');
      if(reservou){const v2=vendaDe(v.rowid);if(v2&&!v2.ops_geradas)await gerarProducaoVenda(v2);}
      const v3=vendaDe(v.rowid);if(v3)setTimeout(()=>fichaVenda(v3),120);}}],560);
}
function entregar(v){
  const f=faseVenda(v);if(f!=='liberado')return toast(f==='pagamento'?'Falta o pagamento completo para entregar.':'As peças ainda não estão todas prontas.','error');
  janela(`Entregar a venda nº ${v.numero}`,`<div class="fin-resumo">${fe(v.cliente||'')} · ${(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}`).join(' · ')}</div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data da entrega <span class="obg">*</span></label><input type="date" data-k="entrega" value="${hojeISO()}" max="${hojeISO()}"></div>
    ${(v.nf||{}).quer?`<div class="fin-fld"><label>Nº da nota fiscal</label><input data-k="nf" value="${fe((v.nf||{}).numero||'')}"></div>`:''}
    <div class="fin-fld"><label>Caminhão</label><select data-k="caminhao"><option value="">—</option>${(CFG().caminhoes||[]).filter(x=>x&&x.nome).map(x=>`<option ${v.agenda&&v.agenda.caminhao===x.nome?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Quem recebeu</label><input data-k="recebedor" placeholder="nome de quem recebeu as peças"></div></div>
    <p class="pm-mini">Peça quebrada no caminho: registre depois em <b>Avaria na entrega</b>.</p>`,
    [{html:'<i class="fas fa-truck"></i> Confirmar entrega',cls:'pri',acao:async j=>{const e=j.querySelector('[data-k="entrega"]').value;if(!e)throw new Error('Informe a data da entrega.');
      if(v.data&&e<v.data)throw new Error('A entrega não pode ser antes da data do pedido.');
      const o=vendaBruta(v);o.status='entregue';o.entrega=e;o.caminhao=j.querySelector('[data-k="caminhao"]').value;o.recebedor=j.querySelector('[data-k="recebedor"]').value.trim();if(j.querySelector('[data-k="nf"]'))o.nf={...(o.nf||{}),numero:j.querySelector('[data-k="nf"]').value.trim()};
      await gravar(o,v.rowid);toast(`Venda nº ${v.numero} entregue: peças baixadas do estoque.`,'success');}}],560);
}
function cancelarVenda(v){
  const pago=pagoDe(v),ops=opsDaVenda(v);
  janela(`Cancelar a venda nº ${v.numero}`,`<div class="fin-aviso laranja"><div>A venda fica <b>cancelada</b>, as peças voltam a ficar livres${ops.length?` e ${ops.length} ordem(ns) de produção (não iniciadas) são canceladas`:''}.</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Estorno ao cliente (R$)</label><input data-k="estorno" data-mask="moeda" value="${fe(R(pago))}"></div><div class="fin-fld"><label>Forma do estorno</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Motivo <span class="obg">*</span></label><input data-k="motivo" placeholder="Ex.: cliente desistiu"></div></div>`,
    [{html:'<i class="fas fa-ban"></i> Cancelar a venda',cls:'pri',acao:async j=>{if(!ehAdm())throw new Error('Só o Administrador pode cancelar.');const g=k=>j.querySelector(`[data-k="${k}"]`).value.trim(),est=r2(num(g('estorno')));
      if(!g('motivo'))throw new Error('Informe o motivo.');if(est>pago+0.009)throw new Error(`O estorno não pode passar do que foi pago (${R(pago)}).`);
      const o=vendaBruta(v);o.status='cancelada';o.cancelada_em=hojeISO();o.motivo_cancelamento=g('motivo');if(est>0)o.pagamentos=(o.pagamentos||[]).concat([{data:hojeISO(),valor:est,forma:g('forma'),tipo:'estorno',obs:'cancelamento: '+g('motivo'),por:eu()}]);
      await gravarVarios([[o,v.rowid]].concat(ops.map(op=>[{...op,status:'cancelada',obs:(op.obs?op.obs+' · ':'')+'venda cancelada'},op.rowid])));toast('Venda cancelada.','success');}}],560);
}
function devolver(v){
  const ja={};(v.devolucoes||[]).forEach(dv=>(dv.itens||[]).forEach(it=>ja[it.peca]=(ja[it.peca]||0)+num(it.qtd)));
  const lin=(v.itens||[]).map((it,i)=>{const max=num(it.qtd)-(ja[it.peca]||0);return `<tr data-dv="${i}"><td>${fe(nomePeca(it.peca))}<small>máx. ${nf(max,0)}</small></td><td><input data-d="qtd" inputmode="numeric" placeholder="0" data-max="${max}"></td><td><select data-d="destino"><option value="estoque">Volta ao estoque (peça boa)</option><option value="avaria">Avariada (perda)</option></select></td></tr>`;}).join('');
  const j=janela(`Devolução — venda nº ${v.numero}`,`<p class="pm-mini">Informe o que o cliente devolveu. Peça boa volta ao estoque; peça avariada entra nas perdas. O estorno sai do caixa.</p>
    <div class="pm-rolar"><table class="pm-itens"><thead><tr><th>Peça</th><th style="width:90px">Devolvidas</th><th>Destino</th></tr></thead><tbody>${lin}</tbody></table></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Estorno ao cliente (R$)</label><input data-k="estorno" data-mask="moeda"></div><div class="fin-fld"><label>Forma</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Motivo <span class="obg">*</span></label><input data-k="motivo"></div></div>`,
    [{html:'<i class="fas fa-rotate-left"></i> Registrar devolução',cls:'pri',acao:async jj=>{
      const its=[...jj.querySelectorAll('[data-dv]')].map(tr=>{const it=v.itens[+tr.dataset.dv],q=num(tr.querySelector('[data-d="qtd"]').value),max=num(tr.querySelector('[data-d="qtd"]').dataset.max);if(q>max)throw new Error(`${nomePeca(it.peca)}: máximo ${max}.`);return {peca:it.peca,qtd:q,destino:tr.querySelector('[data-d="destino"]').value,preco:num(it.preco)};}).filter(x=>x.qtd>0);
      if(!its.length)throw new Error('Informe as peças devolvidas.');const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),est=r2(num(g('estorno')));if(!g('motivo'))throw new Error('Informe o motivo.');
      // estorno nunca maior que o valor das peças devolvidas, nem que o pago
      const valDev=r2(its.reduce((s,x)=>s+x.qtd*x.preco,0)*(1-num(v.desconto_pct)/100)),pg=pagoDe(v);
      if(est>valDev+0.009||est>pg+0.009)return trava('Estorno maior do que pode',[{ok:est<=valDev+0.009,txt:`Valor das peças devolvidas (com o desconto da venda): ${R(valDev)}`},{ok:est<=pg+0.009,txt:`Valor pago pelo cliente até agora: ${R(pg)}`},{ok:false,txt:`Estorno informado: ${R(est)} — no máximo ${R(Math.min(valDev,pg))}`}]);
      const o=vendaBruta(v),dv={data:hojeISO(),itens:its,estorno:est,motivo:g('motivo'),por:eu()};o.devolucoes=(o.devolucoes||[]).concat([dv]);if(est>0)o.pagamentos=(o.pagamentos||[]).concat([{data:hojeISO(),valor:est,forma:g('forma'),tipo:'estorno',obs:'devolução: '+g('motivo'),por:eu()}]);
      const totDev={};o.devolucoes.forEach(d=>d.itens.forEach(it=>totDev[it.peca]=(totDev[it.peca]||0)+num(it.qtd)));if((o.itens||[]).every(it=>(totDev[it.peca]||0)>=num(it.qtd)))o.status='devolvida';
      const E=estoque(),mud=[[o,v.rowid]];its.filter(x=>x.destino==='avaria').forEach(x=>{const e=E.P[String(x.peca)];mud.push([{tipo:'avaria',data:hojeISO(),peca:x.peca,qtd:x.qtd,origem:'cliente',causa:'devolução: '+g('motivo'),venda:String(v.rowid),custo_un:r2(e?e.custoUn:0),data_lancamento:todayDateTime()},null]);});
      await gravarVarios(mud);toast('Devolução registrada.','success');}}],720);
  const at=()=>{const tot=[...j.querySelectorAll('[data-dv]')].reduce((s,tr)=>s+num(tr.querySelector('[data-d="qtd"]').value)*num(v.itens[+tr.dataset.dv].preco),0)*(1-num(v.desconto_pct)/100);const e=j.querySelector('[data-k="estorno"]');if(e&&!e.dataset.mexeu)e.value=R(tot);};
  j.querySelector('.fin-jan-corpo').addEventListener('input',ev=>{if(ev.target.matches('[data-k="estorno"]'))ev.target.dataset.mexeu='1';else at();});
}
/* ── documento da venda (pedido / comprovante) com a marca da empresa, e a nota fiscal anexada ──
   A NF-e de produto só vale emitida pela SEFAZ (com Inscrição Estadual). Até o sistema emitir sozinho, a nota emitida
   no emissor do contador/SEFAZ é anexada aqui (XML e PDF): o número e a chave entram sozinhos e saem no comprovante. */
const empresaDados=()=>{try{return GS.docs&&GS.docs.empresa?GS.docs.empresa():{};}catch(e){return {};}};
function imprimirVenda(v){
  const tot=totalVenda(v),pago=pagoDe(v),c=CFG(),fis=c.fiscal||{},em=empresaDados(),cli=cliDe(v.cliente)||{},f=faseVenda(v),comp=f==='entregue'||pago>=tot-0.009;
  const lts=(rastreio().porVenda[v.rowid]||[]),nfx=v.nf||{};
  const caixa=(tit,linhas)=>`<div style="flex:1;min-width:0;border:1px solid #e5e5ea;border-radius:10px;padding:8px 10px"><div style="font-size:8.5px;font-weight:800;letter-spacing:.08em;color:#0071E3;margin-bottom:3px">${tit}</div>${linhas.filter(Boolean).map(l=>`<div style="font-size:10.5px;line-height:1.45">${l}</div>`).join('')}</div>`;
  const pre=`<div style="display:flex;gap:10px;margin-bottom:10px">${caixa('EMITENTE',[`<b>${fe(em.razao||'Vixsul Empreendimentos')}</b>`,`CNPJ ${fe(em.cnpj||'')}${fis.ie?' · IE '+fe(fis.ie):''}`,fe(em.endereco||''),[em.telefone,em.email].filter(Boolean).map(fe).join(' · ')])}
    ${caixa('CLIENTE',[`<b>${fe(v.cliente||'')}</b>`,v.doc?'CPF/CNPJ '+fe(v.doc):'',fe(endTxt(v.end)),fe(v.telefone||cli.telefone||'')])}</div>
    <div style="display:flex;gap:10px;margin-bottom:10px">${caixa('PEDIDO',[`Nº <b>${fe(String(v.numero))}</b> · ${fe(brDe(dt(v.data)))}`,`${v.tipo_venda==='pronta'?'Pronta entrega':'Encomenda'} · ${v.canal==='atacado'?'atacado':'varejo'}${v.vendedor?' · vendedor '+fe(v.vendedor):''}`])}
    ${caixa('ENTREGA',[v.entrega?`Entregue em <b>${fe(brDe(dt(v.entrega)))}</b>${v.recebedor?' — recebido por '+fe(v.recebedor):''}`:v.agenda&&v.agenda.data?`Agendada para <b>${fe(brDe(dt(v.agenda.data)))}</b> (${fe(v.agenda.periodo||'')})`:v.prazo_entrega?`Prevista para ${fe(brDe(dt(v.prazo_entrega)))}`:'A combinar',v.frete_info?'Frete: '+fe(v.frete_info):''])}
    ${caixa('NOTA FISCAL',[nfx.numero?`NF-e nº <b>${fe(nfx.numero)}</b>${nfx.serie?' série '+fe(nfx.serie):''}`:nfx.quer?'Será emitida (NF-e)':'Não solicitada',nfx.chave?`<span style="font-size:8.5px;letter-spacing:.02em">Chave ${fe(nfx.chave.replace(/(\d{4})(?=\d)/g,'$1 '))}</span>`:''])}</div>`;
  const rows=(v.itens||[]).map(it=>{const p=pecaDe(it.peca),t=tipoDePeca(p||{}),ncm=(p&&p.ncm)||CAT.ncmDe(t);
    return `<tr><td>${fe(p&&p.codigo||'')}</td><td>${fe(nomePeca(it.peca))}<br><small style="color:#6e6e73">${fe(p?geoPeca(p).desc:'')}${lts.filter(x=>String(x.peca)===String(it.peca)).length?' · lote '+lts.filter(x=>String(x.peca)===String(it.peca)).map(x=>fe(x.lote)).join(', '):''}</small></td><td>${fe(ncm)}</td><td style="text-align:right">${nf(num(it.qtd),0)} pç</td><td style="text-align:right">${R(num(it.preco))}</td><td style="text-align:right">${R(num(it.qtd)*num(it.preco))}</td></tr>`;});
  const pags=(v.pagamentos||[]).map(p=>`${fe(brDe(dt(p.data)))} · ${p.tipo==='estorno'?'estorno −':''}${R(num(p.valor))} · ${fe(p.forma||'')}`).join('<br>');
  App._relExportPaginado({titulo:`${comp?'Comprovante de venda':'Pedido de venda'} nº ${v.numero}`,subLinhas:[`${fe(v.cliente||'')} · ${fe(brDe(dt(v.data)))}`],preHtml:pre,
    theadHtml:'<tr><th style="width:9%">Código</th><th style="width:43%">Peça</th><th style="width:12%">NCM</th><th style="width:10%;text-align:right">Quant.</th><th style="width:12%;text-align:right">Unitário</th><th style="width:14%;text-align:right">Total</th></tr>',rowsArr:rows,
    posHtml:`<div style="display:flex;gap:12px;margin-top:10px;align-items:flex-start"><div style="flex:1;font-size:10.5px;line-height:1.5">${pags?`<b>Pagamentos</b><br>${pags}`:''}${v.obs?`<br><b>Observações:</b> ${fe(v.obs)}`:''}${fis.obs?`<br>${fe(fis.obs)}`:''}</div>
      <table style="width:42%;font-size:11px">${[['Peças',R(brutoVenda(v))],descontoVenda(v)?[`Desconto${v.desconto_pct?' ('+nf(num(v.desconto_pct),1)+'%)':''}`,R(-descontoVenda(v))]:null,num(v.frete)?['Frete',R(num(v.frete))]:null,['<b>Total</b>',`<b>${R(tot)}</b>`],['Pago',R(pago)],['<b>Saldo</b>',`<b>${R(Math.max(0,tot-pago))}</b>`]].filter(Boolean).map(([a,b])=>`<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`).join('')}</table></div>
      <p style="font-size:9.5px;color:#6e6e73;margin-top:10px">${comp?'Comprovante de venda — documento sem valor fiscal.':'Pedido de venda — encomendas são reservadas com '+nf(num(c.sinal),0)+'% de sinal; a entrega sai com as peças prontas (cura de 7 a 28 dias conforme a peça) e o pagamento completo.'} ${nfx.numero?'A nota fiscal (NF-e nº '+fe(nfx.numero)+') acompanha este documento.':'A nota fiscal, quando pedida, é emitida à parte (NF-e).'}</p>
      <div style="display:flex;justify-content:space-between;gap:30px;margin-top:34px;font-size:11px"><div style="flex:1;border-top:1px solid #1d1d1f;padding-top:4px;text-align:center">${fe(v.cliente||'Cliente')}</div><div style="flex:1;border-top:1px solid #1d1d1f;padding-top:4px;text-align:center">${fe(em.razao||'Vixsul Empreendimentos')}</div></div>`});
}
// nota fiscal emitida fora (XML/PDF): anexa à venda e lê número, série e chave do XML
function lerXmlNfe(txt){const tag=t=>{const m=txt.match(new RegExp(`<${t}>([^<]+)</${t}>`));return m?m[1].trim():'';};const ch=(txt.match(/Id="NFe(\d{44})"/)||[])[1]||tag('chNFe');
  return {numero:tag('nNF'),serie:tag('serie'),chave:ch||'',valor:num(tag('vNF')),emissao:(tag('dhEmi')||tag('dEmi')).slice(0,10),dest:tag('xNome')};}
function anexarNota(v){
  if(!GS.docs||!GS.docs.enviarArq)return toast('Envio de arquivos indisponível.','error');
  const inp=document.createElement('input');inp.type='file';inp.accept='.xml,.pdf,application/pdf,text/xml';inp.multiple=true;inp.onchange=async()=>{const fs=[...inp.files];if(!fs.length)return;
    try{UI._showBusy('Guardando a nota…');let info=null;
      for(const f of fs){const ehXml=/xml/i.test(f.type)||/\.xml$/i.test(f.name);if(ehXml){info=lerXmlNfe(await f.text());if(!info.numero)throw new Error(`"${f.name}" não parece um XML de NF-e (sem número da nota).`);}
        await GS.docs.enviarArq(OB_FAB,{aba:'pm_nf',venda:String(v.rowid),doc:ehXml?'xml':'pdf'},f);}
      const o=vendaBruta(v);o.nf={...(o.nf||{}),quer:true,...(info?{numero:info.numero,serie:info.serie,chave:info.chave,emissao:info.emissao,valor:info.valor}:{})};
      if(info&&info.valor&&Math.abs(info.valor-totalVenda(v))>0.05)toast(`Atenção: a nota é de ${R(info.valor)} e a venda de ${R(totalVenda(v))}.`,'error');
      await gravar(o,v.rowid);toast(info?`Nota nº ${info.numero} anexada à venda.`:'Arquivo da nota anexado.','success');}catch(e){toast(e.message||String(e),'error');}finally{UI._hideBusy();}};inp.click();
}
async function arquivosNota(v){if(!GS.docs||!GS.docs.listarArq)return [];try{return (await GS.docs.listarArq(OB_FAB,true)).filter(a=>a.aba==='pm_nf'&&String(a.venda)===String(v.rowid));}catch(e){return [];}}

/* ═══════════════ FLUXO DE CAIXA ═══════════════ */
const CAT_CUSTO=['Mão de obra (salários e encargos)','Energia elétrica','Água','Betoneira / equipamentos','Aluguel','Manutenção de formas','Combustível / frete','Comissões de vendedores','Impostos','Outros'];
function caixaMes(k){
  const noM=d=>!!d&&mesKey(d)===k,o={entR:0,entP:0,saiR:0,saiP:0,mov:[]};
  vendas().forEach(v=>{if(v.status==='cancelada'&&!(v.pagamentos||[]).length)return;
    (v.pagamentos||[]).forEach(p=>{if(!noM(dt(p.data)))return;const val=num(p.valor);if(p.tipo==='estorno'){o.saiR+=val;o.mov.push({d:p.data,t:`Estorno — venda nº ${v.numero} · ${v.cliente||''}`,v:-val,real:true,tipo:'venda',id:v.rowid});}
      else{o.entR+=val;o.mov.push({d:p.data,t:`${p.tipo==='sinal'?'Sinal':'Pagamento'} — venda nº ${v.numero} · ${v.cliente||''}`,v:val,real:true,tipo:'venda',id:v.rowid});}});
    if(['aguardando_sinal','reservado'].includes(v.status)){const saldo=totalVenda(v)-pagoDe(v),d=dt(v.prazo_entrega)||addD(dt(v.data)||hoje0(),30);if(saldo>0.009&&noM(d)){o.entP+=saldo;o.mov.push({d:isoDe(d),t:`A receber — venda nº ${v.numero} · ${v.cliente||''}`,v:saldo,real:false,tipo:'venda',id:v.rowid});}}});
  const saida=(r,rot,tipo)=>{const v=num(r.valor);if(r.pago_em){if(noM(dt(r.pago_em))){o.saiR+=v;o.mov.push({d:r.pago_em,t:rot,v:-v,real:true,tipo,id:r.rowid});}}
    else{const d=dt(r.vencimento)||dt(r.data);if(noM(d)){o.saiP+=v;o.mov.push({d:isoDe(d),t:rot+' (a pagar)',v:-v,real:false,tipo,id:r.rowid});}}};
  T('compra').forEach(r=>saida(r,`Compra — ${insDe(r.insumo).nome}${r.fornecedor?' · '+r.fornecedor:''}`,'compra'));
  T('custo').forEach(r=>saida(r,`${r.categoria||'Custo'}${r.descricao?' — '+r.descricao:''}`,'custo'));
  o.mov.sort((a,b)=>String(a.d).localeCompare(String(b.d)));o.saldo=o.entR+o.entP-o.saiR-o.saiP;return o;
}
function telaCaixa(){
  const c=CFG(),ks=[];for(let i=-5;i<=5;i++)ks.push(mesDesloc(mesHoje(),i));
  let acum=num(c.saldo_inicial);const ini=c.saldo_data?mesKey(dt(c.saldo_data)||hoje0()):null;
  {const ms=new Set();vendas().forEach(v=>{(v.pagamentos||[]).forEach(p=>{const x=dt(p.data);if(x)ms.add(mesKey(x));});[v.prazo_entrega,v.data].forEach(d=>{const x=dt(d);if(x)ms.add(mesKey(x));});});
    T('compra').concat(T('custo')).forEach(r=>[r.pago_em,r.vencimento,r.data].forEach(d=>{const x=dt(d);if(x)ms.add(mesKey(x));}));
    [...ms].filter(k=>k<ks[0]&&(!ini||k>=ini)).sort().forEach(k=>{acum+=caixaMes(k).saldo;});}
  const rows=ks.map(k=>{const x=caixaMes(k);if(!ini||k>=ini)acum+=x.saldo;return {k,x,acum};}),sel=caixaMes(PM.cxMes);
  return cabG('Fluxo de caixa da fábrica','Entradas: sinais e pagamentos das vendas (e o saldo a receber dos pedidos). Saídas: compras de insumos, custos da fábrica e estornos. Realizado nos meses que passaram, previsto daqui para frente.',
      `<button type="button" class="gf-bt" data-pm="compra-nova"><i class="fas fa-cart-plus"></i> Compra de insumo</button><button type="button" class="gf-bt pri" data-pm="custo-novo"><i class="fas fa-plus"></i> Custo da fábrica</button>`)+
    `<section class="gf-sec"><div class="pm-rolar"><table class="pm-tab2" data-sem-ordem><thead><tr><th>Mês</th><th class="n">Entrou</th><th class="n">A receber</th><th class="n">Saiu</th><th class="n">A pagar</th><th class="n">Saldo do mês</th><th class="n">Saldo acumulado</th></tr></thead><tbody>
      ${rows.map(({k,x,acum})=>`<tr class="pm-lin" data-pm-cxsel="${k}" style="${k===PM.cxMes?'background:#EEF4FF':''}"><td><b>${cap(mesNome(k))}</b>${k===mesHoje()?' <small>mês atual</small>':''}</td><td class="n">${x.entR?R(x.entR):'—'}</td><td class="n">${x.entP?R(x.entP):'—'}</td><td class="n">${x.saiR?R(-x.saiR):'—'}</td><td class="n">${x.saiP?R(-x.saiP):'—'}</td><td class="n" style="color:${x.saldo<0?'#B42318':'#067647'};font-weight:700">${R(x.saldo)}</td><td class="n" style="font-weight:800;color:${acum<0?'#B42318':'var(--text-1)'}">${R(acum)}</td></tr>`).join('')}
    </tbody></table></div><p class="pm-mini" style="margin:8px 0 0">Saldo inicial: ${R(num(c.saldo_inicial))}${c.saldo_data?' em '+brDe(dt(c.saldo_data)):''} (em Parâmetros). Clique num mês para ver os lançamentos.</p></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Lançamentos de ${mesNome(PM.cxMes)}</h3><p>Clique para abrir.</p></div><label class="gf-mes"><i class="fas fa-calendar"></i><select data-pm-cxmes>${ks.map(k=>`<option value="${k}" ${k===PM.cxMes?'selected':''}>${cap(mesNome(k))}</option>`).join('')}</select></label></div>
      ${sel.mov.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Data</th><th>Lançamento</th><th></th><th class="n">Valor</th></tr></thead><tbody>${sel.mov.map(m=>`<tr class="pm-lin" data-pm="${m.tipo}" data-id="${m.id}"><td>${fe(brDe(dt(m.d)))}</td><td>${fe(m.t)}</td><td>${m.real?pill('realizado','ok'):pill('previsto','info')}</td><td class="n" style="color:${m.v<0?'#B42318':'#067647'};font-weight:700">${R(m.v)}</td></tr>`).join('')}</tbody></table></div>`
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
      if(!(o.valor>0))throw new Error('Informe o valor.');if(!o.data)throw new Error('Informe a competência.');await gravar(o,reg?reg.rowid:null);toast('Custo lançado.','success');}}],600);
}

/* ═══════════════ RELATÓRIOS ═══════════════ */
const RELS={producao:'Produção por período',vendas:'Vendas por período',consumo:'Consumo de materiais',estoque:'Posição do estoque',avarias:'Avarias e perdas',ensaios:'Ensaios dos corpos de prova',ponto:'Ponto da equipe',comissoes:'Comissões de vendedores',entregas:'Entregas e frete',resultado:'Resultado mês a mês (DRE)'};
function dadosRel(){
  const {tipo,de,ate}=PM.rel,dD=dt(de),dA=dt(ate),dentro=s=>{const d=dt(s);return !!d&&(!dD||d>=dD)&&(!dA||d<=dA);};
  if(tipo==='producao'){const L=T('producao').filter(r=>dentro(r.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data))).flatMap(r=>itensProd(r).map(it=>({r,it})));
    const cab=[{l:'Data'},{l:'Peça'},{l:'Boas',d:1},{l:'Refugo',d:1},{l:'m³',d:1},{l:'Custo/peça',d:1},{l:'Custo total',d:1},{l:'Equipe'}];
    const lin=L.map(({r,it})=>[brDe(dt(r.data)),nomePeca(it.peca),nf(num(it.qtd),0),nf(num(it.refugo),0),nf(num(it.m3),3),R(num(it.custo_un)),R(num(it.custo_un)*num(it.qtd)),eqLista(r).join(', ')]);
    return {cab,lin,tot:['Total','',nf(L.reduce((s,x)=>s+num(x.it.qtd),0),0),nf(L.reduce((s,x)=>s+num(x.it.refugo),0),0),nf(L.reduce((s,x)=>s+num(x.it.m3),0),3),'',R(L.reduce((s,x)=>s+num(x.it.custo_un)*num(x.it.qtd),0)),'']};}
  if(tipo==='vendas'){const L=vendas().filter(v=>v.status!=='cancelada'&&dentro(v.entrega||v.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    const SIT={aguardando_sinal:'Aguardando sinal',reservado:'Reservado',entregue:'Entregue',devolvida:'Devolvida'};
    const cab=[{l:'Nº'},{l:'Data'},{l:'Cliente'},{l:'Tipo'},{l:'Itens'},{l:'Situação'},{l:'Total',d:1},{l:'Pago',d:1}];
    const lin=L.map(v=>[String(v.numero),brDe(dt(v.data)),v.cliente||'',`${v.tipo_venda==='pronta'?'pronta':'encomenda'} · ${v.canal||'varejo'}`,(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${nomePeca(it.peca)}`).join('; '),SIT[v.status]||v.status,R(totalVenda(v)),R(pagoDe(v))]);
    return {cab,lin,tot:['Total','','','','','',R(L.reduce((s,v)=>s+totalVenda(v),0)),R(L.reduce((s,v)=>s+pagoDe(v),0))]};}
  if(tipo==='consumo'){const tot={};T('producao').filter(r=>dentro(r.data)).forEach(r=>itensProd(r).forEach(it=>Object.entries(it.consumo||{}).forEach(([k,q])=>tot[k]=(tot[k]||0)+num(q))));const ei=estoqueInsumos();
    const cab=[{l:'Insumo'},{l:'Unidade'},{l:'Consumido',d:1},{l:'Custo estimado',d:1}];const lin=INS.filter(i=>tot[i.k]).map(i=>[i.nome,i.unL,nf(tot[i.k],3),R(tot[i.k]*ei[i.k].preco)]);
    return {cab,lin,tot:['Total','','',R(INS.filter(i=>tot[i.k]).reduce((s,i)=>s+tot[i.k]*ei[i.k].preco,0))]};}
  if(tipo==='estoque'){const E=estoque(),ei=estoqueInsumos();const cab=[{l:'Tipo'},{l:'Item'},{l:'Situação'},{l:'Em cura',d:1},{l:'Pronto / saldo',d:1},{l:'Reservado',d:1},{l:'Valor',d:1}];
    const lin=pecas().map(p=>{const x=E.P[String(p.rowid)]||{cura:0,disp:0,res:0,custoUn:0};return ['Peça',p.nome,reposicao(p,x).rot,nf(x.cura,0),nf(x.disp,0),nf(x.res,0),R(Math.max(0,x.disp)*x.custoUn)];})
      .concat(INS.map(i=>['Insumo',i.nome,'','',nf(ei[i.k].saldo,2)+' '+i.un,'',R(ei[i.k].valorEst)]));return {cab,lin,tot:null};}
  if(tipo==='avarias'){const L=T('avaria').filter(a=>dentro(a.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));const ref=T('producao').filter(r=>dentro(r.data)).flatMap(r=>itensProd(r).filter(it=>num(it.refugo)>0).map(it=>({data:r.data,peca:it.peca,qtd:it.refugo,origem:'refugo',causa:'refugo na produção',custo_un:it.custo_un})));
    const tudo=L.concat(ref).sort((a,b)=>String(a.data).localeCompare(String(b.data)));const cab=[{l:'Data'},{l:'Peça'},{l:'Quant.',d:1},{l:'Onde'},{l:'Causa'},{l:'Perda',d:1}];
    return {cab,lin:tudo.map(a=>[brDe(dt(a.data)),nomePeca(a.peca),nf(num(a.qtd),0),a.origem==='refugo'?'Produção (refugo)':(ORIG_AV[a.origem]||a.origem),a.causa||'',R(num(a.custo_un)*num(a.qtd))]),tot:['Total','',nf(tudo.reduce((s,a)=>s+num(a.qtd),0),0),'','',R(tudo.reduce((s,a)=>s+num(a.custo_un)*num(a.qtd),0))]};}
  if(tipo==='ensaios'){const L=T('ensaio').filter(e=>dentro(e.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    const cab=[{l:'Data'},{l:'Lote'},{l:'Peça'},{l:'Idade'},{l:'CPs (MPa)'},{l:'Resultado',d:1},{l:'Exigido',d:1},{l:'Situação'},{l:'Laboratório'}];
    return {cab,lin:L.map(e=>[brDe(dt(e.data)),e.lote,nomePeca(e.peca),nf(num(e.idade),0)+' dias',(e.valores||[]).map(v=>nf(v,1)).join(' · '),nf(num(e.resultado),1),nf(num(e.esperado),1),{aprovado:'Aprovado',parcial:'Dentro do esperado',abaixo:'Abaixo do esperado',reprovado:'Reprovado'}[e.situacao]||e.situacao||'',e.laboratorio||'']),tot:null};}
  if(tipo==='ponto'){const L=T('producao').filter(r=>dentro(r.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data))).flatMap(r=>pontoDe(r).map(x=>({r,x})));
    const cab=[{l:'Data'},{l:'Pessoa'},{l:'Função'},{l:'Entrada'},{l:'Saída'},{l:'Intervalo (min)',d:1},{l:'Horas',d:1}],porP={};L.forEach(({x})=>porP[x.nome]=(porP[x.nome]||0)+num(x.horas));
    return {cab,lin:L.map(({r,x})=>[brDe(dt(r.data)),x.nome,x.funcao||'',x.entrada||'',x.saida||'',x.intervalo!=null?nf(num(x.intervalo),0):'',nf(num(x.horas),2)]).concat(Object.entries(porP).sort().map(([n,hh])=>['Total',n,'','','','',nf(hh,2)])),
      tot:['Total geral','','','','','',nf(L.reduce((s,{x})=>s+num(x.horas),0),2)]};}
  if(tipo==='comissoes'){const L=vendas().filter(v=>(v.status==='entregue'||v.status==='devolvida')&&v.vendedor&&dentro(v.entrega)).sort((a,b)=>String(a.entrega).localeCompare(String(b.entrega)));
    const cab=[{l:'Entrega'},{l:'Venda'},{l:'Cliente'},{l:'Vendedor'},{l:'Base',d:1},{l:'%',d:1},{l:'Comissão',d:1}];
    return {cab,lin:L.map(v=>[brDe(dt(v.entrega)),String(v.numero),v.cliente||'',v.vendedor,R(baseComissao(v)),nf(num(v.comissao_pct),1),R(baseComissao(v)*num(v.comissao_pct)/100)]),
      tot:['Total','','','',R(L.reduce((s,v)=>s+baseComissao(v),0)),'',R(L.reduce((s,v)=>s+baseComissao(v)*num(v.comissao_pct)/100,0))]};}
  if(tipo==='entregas'){const L=vendas().filter(v=>v.status!=='cancelada'&&dentro(v.entrega||(v.agenda&&v.agenda.data))).sort((a,b)=>String(a.entrega||a.agenda.data).localeCompare(String(b.entrega||b.agenda.data)));
    const cab=[{l:'Data'},{l:'Venda'},{l:'Cliente'},{l:'Cidade'},{l:'Caminhão'},{l:'Peso (kg)',d:1},{l:'Frete',d:1},{l:'Situação'}];
    return {cab,lin:L.map(v=>[brDe(dt(v.entrega||v.agenda.data)),String(v.numero),v.cliente||'',[(v.end||{}).cidade,(v.end||{}).uf].filter(Boolean).join(' - '),v.caminhao||(v.agenda||{}).caminhao||'',nf(pesoVenda(v),0),R(num(v.frete)),v.status==='entregue'||v.status==='devolvida'?'Entregue':'Agendada']),
      tot:['Total','','','','',nf(L.reduce((s,v)=>s+pesoVenda(v),0),0),R(L.reduce((s,v)=>s+num(v.frete),0)),'']};}
  const ks=[];let k=mesKey(dD||hoje0());const kf=mesKey(dA||hoje0());for(let i=0;i<36&&k<=kf;i++){ks.push(k);k=mesDesloc(k,1);}
  const cab=[{l:'Mês'},{l:'Receita',d:1},{l:'Impostos',d:1},{l:'Materiais vendidos',d:1},{l:'Margem de contribuição',d:1},{l:'Perdas',d:1},{l:'Comissões',d:1},{l:'Custos da fábrica',d:1},{l:'Resultado',d:1},{l:'Produção (m³)',d:1}];
  const rs=ks.map(resumoMes);const lin=rs.map(r=>[cap(mesNome(r.k)),R(r.receita),R(-r.impostos),R(-r.cmv),R(r.mc),R(-r.perdas),R(-r.comissoes),R(-r.custos),R(r.resultado),nf(r.m3,2)]);
  const s=f=>rs.reduce((a,r)=>a+f(r),0);return {cab,lin,tot:['Total',R(s(r=>r.receita)),R(-s(r=>r.impostos)),R(-s(r=>r.cmv)),R(s(r=>r.mc)),R(-s(r=>r.perdas)),R(-s(r=>r.comissoes)),R(-s(r=>r.custos)),R(s(r=>r.resultado)),nf(s(r=>r.m3),2)]};
}
function telaRelatorios(){
  const d=dadosRel(),r=PM.rel;
  return cabG('Relatórios da fábrica','Escolha o relatório e o período. Dá para baixar em Excel ou imprimir/salvar em PDF.',`<button type="button" class="gf-bt" data-pm="rel-excel"><i class="fas fa-file-excel"></i> Excel</button><button type="button" class="gf-bt pri" data-pm="rel-pdf"><i class="fas fa-file-pdf"></i> PDF</button>`)+
    `<div class="pm-filtros"><select data-pm-rel="tipo">${Object.entries(RELS).map(([k,l])=>`<option value="${k}" ${k===r.tipo?'selected':''}>${l}</option>`).join('')}</select>
      ${r.tipo==='estoque'?'<span class="pm-mini">posição de hoje</span>':`<label class="pm-mini">de <input type="date" data-pm-rel="de" value="${fe(r.de)}"></label><label class="pm-mini">até <input type="date" data-pm-rel="ate" value="${fe(r.ate)}"></label>`}</div>
    <section class="gf-sec">${d.lin.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr>${d.cab.map(c=>`<th class="${c.d?'n':''}">${c.l}</th>`).join('')}</tr></thead><tbody>${d.lin.map(l=>`<tr>${l.map((v,i)=>`<td class="${d.cab[i].d?'n':''}">${fe(v)}</td>`).join('')}</tr>`).join('')}${d.tot?`<tr class="t">${d.tot.map((v,i)=>`<td class="${d.cab[i].d?'n':''}">${fe(v)}</td>`).join('')}</tr>`:''}</tbody></table></div>`:'<div class="gf-vazio"><i class="fas fa-chart-column"></i><p>Nada neste período.</p></div>'}</section>`;
}
function relatorio(excel,pdf){
  const d=dadosRel(),r=PM.rel,tit=RELS[r.tipo]+(r.tipo==='estoque'?'':` — ${brDe(dt(r.de))} a ${brDe(dt(r.ate))}`);
  if(!d.lin.length)return toast('Nada para exportar neste período.','error');const linhas=d.tot?d.lin.concat([d.tot]):d.lin;
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
  const linFixo=x=>`<div class="fin-linha" data-lin="fixos" style="margin-bottom:6px;grid-template-columns:1fr 160px 36px"><div class="fin-fld"><input data-fx="nome" value="${fe(x.nome||'')}" placeholder="Descrição"></div><div class="fin-fld"><input data-fx="valor" data-mask="moeda" value="${x.valor!=null&&x.valor!==''?fe(R(num(x.valor))):''}" placeholder="R$ 0,00"></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
  const linEq=x=>`<div class="fin-linha" data-lin="equipe" style="margin-bottom:6px;grid-template-columns:1fr 190px 36px"><div class="fin-fld"><input data-eqn value="${fe(x.nome||'')}" placeholder="Nome"></div><div class="fin-fld"><select data-eqf>${FUNCOES.map(fn=>`<option ${fn===x.funcao?'selected':''}>${fn}</option>`).join('')}</select></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
  const fr={origem:{},cidades:[],...(c.frete||{})},fis=c.fiscal||{};fr.origem=fr.origem||{};
  const linCid=x=>`<div class="fin-linha" data-lin="cid" style="margin-bottom:6px;grid-template-columns:1fr 70px 150px 36px"><div class="fin-fld"><input data-cn value="${fe(cidUF(x.cidade,x.uf))}" placeholder="Cidade (ex.: Potiraguá, BA)" autocomplete="off"></div><div class="fin-fld"><input data-cu value="${fe(x.uf||'')}" placeholder="UF" maxlength="2" readonly tabindex="-1" style="background:#F8FAFC"></div><div class="fin-fld"><input data-cv data-mask="moeda" value="${x.valor?fe(R(num(x.valor))):''}" placeholder="R$ 0,00"></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
  const linCam=x=>`<div class="fin-linha" data-lin="cam" style="margin-bottom:6px;grid-template-columns:1fr 130px 1fr 36px"><div class="fin-fld"><input data-kn value="${fe(x.nome||'')}" placeholder="Ex.: Munck ABC-1234"></div><div class="fin-fld"><input data-kc inputmode="numeric" data-sem-mascara="1" value="${x.cap_kg?fe(String(x.cap_kg)):''}" placeholder="Carga (kg)"></div><div class="fin-fld"><input data-km value="${fe(x.motorista||'')}" placeholder="Motorista"></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
  PM._linFixo=linFixo;PM._linEq=linEq;PM._linCid=linCid;PM._linCam=linCam;
  return cabG('Parâmetros e preços','A base de todos os cálculos: preço dos insumos, características dos materiais, equipe, betoneira, custos rateados por m³ e as regras de venda.',`<button type="button" class="gf-bt pri" data-pm="cfg-salvar"><i class="fas fa-floppy-disk"></i> Salvar parâmetros</button>`)+
    `<div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Preços dos insumos</h3><p>Atualizados também pelas compras (Estoque › Entrada de insumo).</p></div></div><div class="fin-linha">
       ${mo('precos.cimento','Cimento — saco de 50 kg',pr.cimento)}${mo('precos.areia','Areia — m³',pr.areia)}${mo('precos.po','Pó de pedra — m³',pr.po)}${mo('precos.brita','Brita 0 — m³',pr.brita)}
       ${mo('precos.aco50','Aço CA-50 — kg',pr.aco50)}${mo('precos.aco60','Aço CA-60 — kg',pr.aco60)}${mo('precos.malha','Malha POP — painel 2 × 3 m',pr.malha)}${mo('precos.arame','Arame recozido — kg',pr.arame)}
       ${mo('precos.aditivo','Aditivo — kg',pr.aditivo)}${mo('precos.desmoldante','Desmoldante — litro',pr.desmoldante)}${mo('precos.agua','Água — m³',pr.agua)}${mo('precos.energia','Energia — kWh',pr.energia)}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Rateio previsto por m³</h3><p>Quanto cada m³ de concreto carrega de mão de obra, equipamento, energia, água e custos fixos.</p></div></div>
       <table class="pm-tab2" data-sem-ordem><tbody><tr><td>Mão de obra</td><td class="n">${R(ra.mao)}</td></tr><tr><td>Betoneira (depreciação + manutenção)</td><td class="n">${R(ra.betoneira)}</td></tr><tr><td>Energia (${nf(ra.kwh,2)} kWh/m³)</td><td class="n">${R(ra.energia)}</td></tr><tr><td>Água de cura</td><td class="n">${R(ra.agua)}</td></tr><tr><td>Custos fixos</td><td class="n">${R(ra.fixos)}</td></tr><tr class="t"><td>Total por m³ (sem materiais)</td><td class="n">${R(ra.total)}</td></tr></tbody></table>
       <div class="fin-linha" style="margin-top:12px">${f('prod_m3','Produção prevista por mês (m³)',c.prod_m3,'inputmode="decimal"')}${f('equipe.pessoas','Pessoas na produção',c.equipe.pessoas,'inputmode="numeric"')}${mo('equipe.custo','Custo mensal por pessoa (com encargos)',c.equipe.custo)}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Equipe da fábrica</h3><p>Aparece no diário de produção para marcar quem esteve presente.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-equipe-add"><i class="fas fa-plus"></i> Pessoa</button></div>
       <div data-equipe>${(c.equipe_lista||[]).map(linEq).join('')||'<p class="pm-mini" data-vazio>Ninguém cadastrado.</p>'}</div>
       <p class="pm-mini" style="margin:10px 0 4px"><b>Jornada padrão</b> (já vem preenchida no ponto do diário):</p><div class="fin-linha">
       <div class="fin-fld"><label>Entrada</label><input type="time" data-cfg="jornada.entrada" value="${fe((c.jornada||{}).entrada||'07:00')}"></div><div class="fin-fld"><label>Saída</label><input type="time" data-cfg="jornada.saida" value="${fe((c.jornada||{}).saida||'17:00')}"></div>
       ${f('jornada.intervalo','Intervalo (minutos)',(c.jornada||{}).intervalo!=null?c.jornada.intervalo:60,'inputmode="numeric" data-sem-mascara="1"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Vendas e endereços</h3><p>Regras de venda e a cidade padrão para sugerir endereços.</p></div></div><div class="fin-linha" data-end>
       ${f('sinal','Sinal mínimo para reservar encomenda (%)',c.sinal)}${f('impostos','Impostos sobre a venda (%)',c.impostos)}${f('margem','Margem desejada (%)',c.margem)}
       ${f('cidade','Cidade padrão dos clientes',cidUF(c.cidade,c.uf),'data-k="cidade" placeholder="Ex.: Itarantim, BA"')}${f('uf','UF padrão',c.uf,'maxlength="2" data-k="uf"')}${f('lata','Lata usada na produção (litros)',c.lata,'inputmode="numeric"')}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Entregas e frete</h3><p>Frete por km (distância pelo mapa até o endereço do cliente) ou valor fixo por cidade — a tabela de cidades vale primeiro.</p></div></div><div class="fin-linha" data-end>
       ${f('frete.origem.cep','CEP da fábrica',fr.origem.cep||'','data-k="cep"')}${f('frete.origem.logradouro','Endereço da fábrica (rua)',fr.origem.logradouro||'','data-k="logradouro" autocomplete="off" placeholder="digite a rua: o sistema sugere"')}${f('frete.origem.numero','Número',fr.origem.numero||'','data-k="numero"')}
       ${f('frete.origem.bairro','Bairro',fr.origem.bairro||'','data-k="bairro"')}${f('frete.origem.cidade','Cidade da fábrica',cidUF(fr.origem.cidade||c.cidade||'',fr.origem.uf||c.uf||''),'data-k="cidade" placeholder="Ex.: Itarantim, BA"')}${f('frete.origem.uf','UF',fr.origem.uf||c.uf||'','maxlength="2" data-k="uf"')}
       ${mo('frete.rs_km','Valor por km rodado',fr.rs_km)}${f('frete.km_min','Km mínimo cobrado',fr.km_min,'inputmode="numeric" data-sem-mascara="1"')}
       <label class="nfc-amb" style="grid-column:1/-1"><input type="checkbox" data-cfg-ck="frete.ida_volta" ${fr.ida_volta!==false?'checked':''}><span>Cobrar ida e volta (o caminhão volta vazio)</span></label></div>
       <p class="pm-mini" style="margin:10px 0 4px"><b>Valor fixo por cidade</b></p><div data-cids>${(fr.cidades||[]).map(linCid).join('')}</div><button type="button" class="gf-bt mini" data-pm="cfg-cid-add"><i class="fas fa-plus"></i> Cidade</button></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Caminhões</h3><p>Para a agenda de entregas: a carga de cada dia é conferida com a capacidade.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-cam-add"><i class="fas fa-plus"></i> Caminhão</button></div>
       <div data-cams>${(c.caminhoes||[]).map(linCam).join('')||'<p class="pm-mini" data-vazio>Nenhum caminhão cadastrado.</p>'}</div></section></div>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Nota fiscal das vendas de peças</h3><p>Venda de peça é venda de <b>produto</b>: a nota é a NF-e, autorizada pela SEFAZ-BA (não é a nota de serviço da prefeitura).</p></div></div>
      <div class="fin-aviso" style="margin-bottom:10px"><div>Para o sistema emitir a NF-e sozinho são necessários: <b>Inscrição Estadual</b> da empresa na SEFAZ-BA, o <b>certificado A1</b> (o mesmo já usado nas assinaturas) e a confirmação do contador sobre o regime e o CFOP.
        Enquanto isso, emita a nota no emissor do contador (ou a NFA-e, nota avulsa da SEFAZ-BA) e use <b>Anexar nota fiscal</b> na venda: o número e a chave entram sozinhos no comprovante. O NCM de cada peça já sai preenchido pelo tipo (pode mudar no cadastro da peça).</div></div>
      <div class="fin-linha">${f('fiscal.ie','Inscrição Estadual (IE)',fis.ie||'','placeholder="ainda não tem"')}${f('fiscal.regime','Regime tributário',fis.regime||'Simples Nacional')}${f('fiscal.cfop_dentro','CFOP — venda na Bahia',fis.cfop_dentro||'5101','inputmode="numeric"')}${f('fiscal.cfop_fora','CFOP — venda para outro estado',fis.cfop_fora||'6101','inputmode="numeric"')}
        <div class="fin-fld" style="grid-column:1/-1"><label>Observação no comprovante de venda</label><input data-cfg="fiscal.obs" value="${fe(fis.obs||'')}" placeholder="Ex.: garantia de 5 anos contra defeito de fabricação"></div></div></section>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Betoneira e vibrador</h3><p>Energia por m³ = potência × tempo das traçadas; depreciação pela vida útil.</p></div></div><div class="fin-linha">
       ${f('betoneira.cap','Capacidade da betoneira (litros)',c.betoneira.cap,'inputmode="numeric"')}${f('betoneira.util','Aproveitamento por traçada (%)',c.betoneira.util)}${f('betoneira.kw','Potência da betoneira (kW)',c.betoneira.kw,'inputmode="decimal"')}${f('betoneira.min','Minutos por traçada',c.betoneira.min,'inputmode="decimal"')}
       ${mo('betoneira.valor','Valor da betoneira',c.betoneira.valor)}${f('betoneira.vida','Vida útil (meses)',c.betoneira.vida,'inputmode="numeric"')}${mo('betoneira.manut','Manutenção por mês',c.betoneira.manut)}
       ${f('vibrador.kw','Potência do vibrador (kW)',c.vibrador.kw,'inputmode="decimal"')}${f('vibrador.min','Minutos de vibração por m³',c.vibrador.min,'inputmode="decimal"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Custos fixos mensais (rateados)</h3><p>Aluguel, manutenção de formas, EPIs… divididos pela produção prevista.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-fixo-add"><i class="fas fa-plus"></i> Custo fixo</button></div>
       <div data-fixos>${(c.fixos||[]).map(linFixo).join('')}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Materiais e perdas</h3><p>Massas específicas (traço), unitárias (compra em m³ e latas), perdas e consumos.</p></div></div><div class="fin-linha">
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
// tabela de frete por cidade: lista do IBGE em cada linha, UF preenchida sozinha
function ligarCidadesFrete(box){box.querySelectorAll('[data-cn]').forEach(inp=>{if(inp.dataset.pmCid)return;inp.dataset.pmCid='1';if(GS.cidade&&GS.cidade.ligar)GS.cidade.ligar(inp);
  const poe=()=>{const u=partesCid(inp.value)[1],e=inp.closest('[data-lin]').querySelector('[data-cu]');if(e&&u)e.value=u;};inp.addEventListener('change',poe);inp.addEventListener('blur',()=>setTimeout(poe,250));});}
function addLinha(qual){const box=document.querySelector(`#pm-app [data-${{fixos:'fixos',equipe:'equipe',cid:'cids',cam:'cams'}[qual]}]`);if(!box)return;const v=box.querySelector('[data-vazio]');if(v)v.remove();
  box.insertAdjacentHTML('beforeend',qual==='fixos'?PM._linFixo({nome:'',valor:''}):qual==='cid'?PM._linCid({cidade:'',uf:''}):qual==='cam'?PM._linCam({}):PM._linEq({nome:'',funcao:FUNCOES[1]}));if(qual==='cid')ligarCidadesFrete(box);}
async function salvarParametros(){
  const box=document.getElementById('pm-app'),c=JSON.parse(JSON.stringify(CFG()));
  box.querySelectorAll('[data-cfg]').forEach(e=>{const path=e.dataset.cfg.split('.'),txt=['cidade','uf','saldo_data','jornada.entrada','jornada.saida'].includes(e.dataset.cfg)||e.dataset.cfg.startsWith('frete.origem.')||e.dataset.cfg.startsWith('fiscal.'),v=txt?String(e.value||'').trim():(e.dataset.cfg==='jornada.intervalo'||e.dataset.cfg==='frete.km_min'?(parseFloat(String(e.value).replace(',','.'))||0):num(e.value));let o=c;for(let i=0;i<path.length-1;i++){o[path[i]]=o[path[i]]||{};o=o[path[i]];}o[path[path.length-1]]=e.dataset.cfg==='uf'?String(v).toUpperCase():v;});
  c.fixos=[...box.querySelectorAll('[data-lin="fixos"]')].map(d=>({nome:d.querySelector('[data-fx="nome"]').value.trim(),valor:r2(num(d.querySelector('[data-fx="valor"]').value))})).filter(x=>x.nome||x.valor);
  c.equipe_lista=[...box.querySelectorAll('[data-lin="equipe"]')].map(d=>({nome:d.querySelector('[data-eqn]').value.trim(),funcao:d.querySelector('[data-eqf]').value})).filter(x=>x.nome);
  c.frete=c.frete||{};const ck=box.querySelector('[data-cfg-ck="frete.ida_volta"]');if(ck)c.frete.ida_volta=ck.checked;if(c.frete.origem&&c.frete.origem.uf)c.frete.origem.uf=String(c.frete.origem.uf).toUpperCase();
  c.frete.cidades=[...box.querySelectorAll('[data-lin="cid"]')].map(d=>({cidade:cidUF(d.querySelector('[data-cn]').value),uf:partesCid(d.querySelector('[data-cn]').value)[1]||d.querySelector('[data-cu]').value.trim().toUpperCase(),valor:r2(num(d.querySelector('[data-cv]').value))})).filter(x=>x.cidade&&x.valor>0);
  c.caminhoes=[...box.querySelectorAll('[data-lin="cam"]')].map(d=>({nome:d.querySelector('[data-kn]').value.trim(),cap_kg:parseFloat(String(d.querySelector('[data-kc]').value).replace(',','.'))||0,motorista:d.querySelector('[data-km]').value.trim()})).filter(x=>x.nome);
  if(!(num(c.prod_m3)>0))return toast('Informe a produção prevista por mês (m³): é a base do rateio.','error');
  if(!(num(c.sinal)>=0&&num(c.sinal)<=100))return toast('O sinal deve ficar entre 0% e 100%.','error');
  const r=cfgRow();
  try{await gravar(r?{...r,cfg:{...((r&&r.cfg)||{}),...c}}:{tipo:'config',cfg:c,data_lancamento:todayDateTime()},r?r.rowid:null);toast('Parâmetros salvos: os custos das peças foram recalculados.','success');}catch(e){toast(e.message,'error',false);}
}

window.PM_FABRICA={depsVenda,depsOrdem,faltaInsumos,lerXmlNfe,catalogoPDF,imprimirVenda,depsExcluir,lotes,rastreio,comissoesMes,precoPara,calcularFrete,situacaoLote,pesoVenda,romaneio,imprimirEtiquetas,escolherPeca,calc,receita,traco1m3,rateio,estoque,estoqueInsumos,CFG,render,irAba,resumoMes,necessidade,caixaMes,faseVenda,totalVenda,pagoDe,reposicao,fichaHtml,tiposTodos,armPeca};
})();
