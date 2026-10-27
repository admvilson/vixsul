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
  {k:'pagamento',rot:'Pronto · falta receber',cor:'#DC6803',ico:'fa-hand-holding-dollar'},{k:'liberado',rot:'Pago · liberado para entrega',cor:'#1652D8',ico:'fa-truck-ramp-box'},
  {k:'entregue',rot:'Entregue',cor:'#067647',ico:'fa-circle-check'},{k:'cancelada',rot:'Cancelados · devolvidos',cor:'#B42318',ico:'fa-ban'}];
// pedido encerrado sem venda: cancelado (antes ou depois da entrega) ou devolvido por inteiro
const encerrada=v=>v.status==='cancelada'||v.status==='devolvida';
const rotFase=(v,f)=>v.status==='devolvida'?'Devolvida pelo cliente (pedido encerrado)':v.status==='cancelada'?'Cancelada (pedido encerrado)':(FASES_V.find(x=>x.k===f)||{rot:f}).rot;
const dataFim=v=>v.cancelada_em||((v.devolucoes||[]).slice(-1)[0]||{}).data||v.entrega||v.data;
const motivoFim=v=>v.motivo_cancelamento||((v.devolucoes||[]).slice(-1)[0]||{}).motivo||'';
// o que voltou do cliente: peças boas (estoque) e avariadas (perda)
function devolvidoDe(v){const r={estoque:0,avaria:0,estorno:0};(v.devolucoes||[]).forEach(d=>{(d.itens||[]).forEach(it=>r[it.destino==='avaria'?'avaria':'estoque']+=num(it.qtd));});
  (v.pagamentos||[]).forEach(p=>{if(p.tipo==='estorno')r.estorno+=num(p.valor);});return r;}
const ORIG_AV={patio:'Pátio / estoque',desforma:'Na desforma',carregamento:'No carregamento',transporte:'No transporte / entrega',cliente:'Devolvida avariada pelo cliente',outra:'Outra'};
const AV_ESTOQUE=['patio','desforma','carregamento','transporte','outra'];
const CLIMAS=['Sol','Parcialmente nublado','Nublado','Chuva fraca','Chuva forte'];
const CLI_ICO={Sol:'fa-sun','Parcialmente nublado':'fa-cloud-sun',Nublado:'fa-cloud','Chuva fraca':'fa-cloud-rain','Chuva forte':'fa-cloud-showers-heavy'};
// clima do dia: manhã e tarde (registros antigos tinham um clima só)
const climaDe=r=>({manha:r.clima_manha||r.clima||'',tarde:r.clima_tarde||r.clima||''});
/* ── fechamento do dia (como o fechamento do caixa): fechado, só o Administrador reabre; às 19h o dia aberto fecha sozinho ── */
const HORA_FECHA=19;
const diaFechado=r=>!!(r&&r.fechado&&r.fechado.em);
// já passou da hora de fechar? (dia anterior a hoje, ou hoje a partir das 19h)
const passouHora=d=>{const hj=hojeISO();return !!d&&(d<hj||(d===hj&&new Date().getHours()>=HORA_FECHA));};
const MESES_PT=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const SEM_PT=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
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
// fechamento do mês: lançamento com data até cfg.fechado_ate não entra, não muda e não sai (só o Administrador reabre)
const DATA_DO={producao:'data',compra:'data',ajuste:'data',avaria:'data',custo:'data',ensaio:'data'};
function travaMes(o,orig){
  const f=CFG().fechado_ate;if(!f||!o)return null;const msg=d=>`O período até ${brDe(dt(f))} está fechado (lançamento com data ${brDe(dt(d))}). Para corrigir, o Administrador reabre em Parâmetros › Fechamento do mês.`;
  const k=DATA_DO[o.tipo];if(k){const d1=o[k],d0=orig&&orig[k];if(d1&&d1<=f)return msg(d1);if(d0&&d0<=f)return msg(d0);return null;}
  if(o.tipo==='venda'){const np=(o.pagamentos||[]).slice(((orig&&orig.pagamentos)||[]).length).find(p=>p.data&&p.data<=f);if(np)return msg(np.data);
    if(o.entrega&&o.entrega!==(orig&&orig.entrega)&&o.entrega<=f)return msg(o.entrega);
    const nd=(o.devolucoes||[]).slice(((orig&&orig.devolucoes)||[]).length).find(d=>d.data&&d.data<=f);if(nd)return msg(nd.data);}
  return null;
}
const origDe=id=>id?linhas().find(r=>String(r.rowid)===String(id))||null:null;
// dia de produção fechado: não muda mais; só o Administrador reabre (tirando o fechamento)
function travaDia(o,orig){if(!o||o.tipo!=='producao'||!orig||!diaFechado(orig))return null;
  if(diaFechado(o))return `O diário de ${brDe(dt(orig.data))} está fechado: não pode ser alterado. Só o Administrador reabre.`;
  return ehAdm()?null:'Só o Administrador reabre um dia fechado.';}
async function gravar(o,rowid){
  const tm=travaMes(o,origDe(rowid))||travaDia(o,origDe(rowid));if(tm)throw new Error(tm);
  try{await executar(()=>salvar(ABA,o,rowid||null));}
  catch(e){throw traduzir(e);}
}
// várias gravações com uma recarga só no fim
async function gravarVarios(ops){
  for(const [o,id] of ops){const tm=travaMes(o,origDe(id))||travaDia(o,origDe(id));if(tm)throw new Error(tm);}
  try{await executar(async()=>{for(const [o,id] of ops)await salvar(ABA,o,id||null);});}catch(e){throw traduzir(e);}
}
function traduzir(e){return /premoldados|pré-moldados|does not exist|schema cache|relation|could not find the table/i.test(String(e&&e.message))?new Error('A tabela da fábrica ainda não existe no banco: rode o passo 6 no Supabase (arquivo seguranca/passo-6-premoldados.sql).'):e;}
// antes de excluir: o que depende deste registro (se houver, a exclusão é bloqueada e a lista aparece)
function depsExcluir(reg){
  const id=String(reg.rowid),E=estoque(),d=[];
  if(reg.tipo==='peca'){const nP=T('producao').filter(r=>itensProd(r).some(it=>String(it.peca)===id)).length,vs=vendas().filter(v=>(v.itens||[]).some(it=>String(it.peca)===id)),os=ordens().filter(o=>String(o.peca)===id),nA=T('avaria').filter(a=>String(a.peca)===id).length+T('ajuste').filter(a=>a.item==='peca:'+id).length;
    const stV=v=>encerrada(v)?(v.status==='devolvida'?'devolvida':'cancelada'):v.status==='entregue'?'entregue':'em aberto',stO=o=>{const f=prodDaOrdem(o.rowid);return o.status==='cancelada'?'cancelada':opSolta(o)?'solta, '+(f?nf(f,0)+' feitas':'sem produção'):o.status==='concluida'?'concluída':f?nf(f,0)+' feitas':'sem produção';};
    if(nP)d.push({ok:false,txt:`${nP} dia(s) de produção com esta peça`});
    if(vs.length)d.push({ok:false,txt:`${vs.length} venda(s) com esta peça: ${vs.slice(0,8).map(v=>`nº ${fe(String(v.numero))} (${stV(v)})`).join(', ')}${vs.length>8?'…':''}${vs.every(encerrada)?' — vendas encerradas o Administrador pode excluir na ficha da venda':''}`});
    if(os.length)d.push({ok:false,txt:`${os.length} ordem(ns) de produção: ${os.slice(0,8).map(o=>`OP nº ${fe(String(o.numero))} (${stO(o)})`).join(', ')}${os.length>8?'…':''}`});
    if(nA)d.push({ok:false,txt:`${nA} avaria(s) ou acerto(s) de estoque`});
    if(d.length)d.push({ok:true,txt:cascataPeca(id)?'Esse histórico é só de vendas encerradas e ordens sem produção: o Administrador pode excluir tudo junto no botão abaixo.':'A peça tem histórico: em vez de excluir, edite (mude o nome ou o preço) — o histórico de custos e vendas continua certo.'});}
  if(reg.tipo==='producao'&&diaFechado(reg))d.push({ok:false,txt:`O diário de ${fe(brDe(dt(reg.data)))} está fechado — o Administrador reabre o dia antes de excluir`});
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
  const dp=depsExcluir(reg);if(dp){const cas=reg.tipo==='peca'?cascataPeca(reg.rowid):null;return trava(`Não dá para excluir: ${rotulo}`,dp,cas?{rot:'Excluir a peça e esse histórico',f:()=>excluirPecaCascata(reg,cas)}:null);}
  const tm=travaMes(reg,reg);if(tm)return trava(`Não dá para excluir: ${rotulo}`,[{ok:false,txt:tm}]);
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
// a ordem só trabalha para a venda em aberto; venda entregue, cancelada, devolvida (ou excluída) deixa a ordem "solta"
const vendaAberta=v=>!!v&&(v.status==='aguardando_sinal'||v.status==='reservado');
const opSolta=o=>!!o.venda&&(o.status==='planejada'||o.status==='producao')&&!vendaAberta(vendaDe(o.venda));
// fecha as ordens abertas de uma venda que saiu do fluxo: sem produção → cancelada; com produção → a ordem fica para o estoque
const soltarOPs=(v,porque,manter)=>fecharOPs(ordens().filter(o=>String(o.venda||'')===String(v.rowid)&&(o.status==='planejada'||o.status==='producao')),`venda nº ${v.numero}`,porque,manter);
function fecharOPs(lista,nm,porque,manter){const h=hojeISO();
  return lista.map(o=>{const feito=prodDaOrdem(o.rowid);
    return [!feito?{...o,status:'cancelada',obs:(o.obs?o.obs+' · ':'')+`${nm} ${porque}: a ordem não precisou ser feita`}
      :manter?{...o,venda:'',cliente:`Estoque (${nm} ${porque})`,obs:(o.obs?o.obs+' · ':'')+`${nm} ${porque}: a produção continua para o estoque`}
      :{...o,venda:'',cliente:`Estoque (${nm} ${porque})`,qtd:feito,status:'concluida',concluida_em:o.concluida_em||h,obs:(o.obs?o.obs+' · ':'')+`${nm} ${porque}: a produção feita fica no estoque`},o.rowid];});}
// andamento de uma OP: peças feitas, em cura (até quando) e o que falta fazer
function andamentoOP(o){const h=hoje0();let feito=0,cura=0,ate=null;
  T('producao').forEach(r=>itensProd(r).forEach(it=>{if(String(it.ordem||'')!==String(o.rowid))return;const q=num(it.qtd),p=pecaDe(it.peca);feito+=q;
    const lib=addD(dt(r.data)||h,num(p&&p.cura!=null&&p.cura!==''?p.cura:tipoDePeca(p||{}).cura||7));if(lib>h){cura+=q;if(!ate||lib>ate)ate=lib;}}));
  return {feito,cura,ate,falta:o.status==='planejada'||o.status==='producao'?Math.max(0,num(o.qtd)-feito):0};}
// peças reservadas que não estão prontas, nem em cura, nem numa ordem aberta: precisam de ordem de produção.
// A peça pronta vai para o pedido mais antigo; a falta fica com os pedidos mais novos.
function pendenciasProducao(E){
  E=E||estoque();const fg={},out=[];Object.entries(E.P).forEach(([id,x])=>{const f=Math.ceil(-(x.livre+x.cura+x.emProd)-1e-9);if(f>0&&pecaDe(id))fg[id]=f;});
  vendas().filter(v=>v.status==='reservado').sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))||num(b.numero)-num(a.numero)).forEach(v=>{
    const a=E.aloc[v.rowid]||{},its=[];(v.itens||[]).forEach((it,i)=>{const id=String(it.peca),q=Math.min(Math.max(0,num(it.qtd)-(a[i]||0)),fg[id]||0);if(q>0){its.push({peca:id,qtd:q});fg[id]-=q;}});
    if(its.length)out.push({v,its});});
  return out;}
async function mandarProducao(lista){
  let n=proxNum('ordem','numero');const mud=[];
  lista.forEach(({v,its})=>its.forEach(it=>{const p=pecaDe(it.peca),cura=num(p&&p.cura!=null&&p.cura!==''?p.cura:7),pz=dt(v.prazo_entrega),fim=pz?isoDe(addD(pz,-cura)):'';
    mud.push([{tipo:'ordem',numero:n++,peca:it.peca,qtd:it.qtd,status:'planejada',inicio:hojeISO(),fim:fim&&fim>=hojeISO()?fim:'',venda:String(v.rowid),cliente:`Venda nº ${v.numero} — ${v.cliente||''}`,data_lancamento:todayDateTime()},null]);}));
  if(!mud.length)return toast('Nada a mandar para a produção: tudo já está pronto, em cura ou numa ordem.','success');
  await gravarVarios(mud);toast(`${mud.length} ordem(ns) de produção criada(s) — já aparecem no Planejamento.`,'success');}
function brutoVenda(v){return (v.itens||[]).reduce((s,it)=>s+num(it.qtd)*num(it.preco),0);}
function descontoVenda(v){return v.desconto_pct!=null&&v.desconto_pct!==''?r2(brutoVenda(v)*num(v.desconto_pct)/100):num(v.desconto);}
function totalVenda(v){return r2(brutoVenda(v)-descontoVenda(v)+num(v.frete));}
function pagoDe(v){return r2((v.pagamentos||[]).reduce((s,p)=>s+(p.tipo==='estorno'?-1:1)*num(p.valor),0)+(v.pagamentos?0:(v.status==='entregue'&&v.recebido_em?totalVenda(v):0)));}
function estoque(){
  const P={},h=hoje0(),g=id=>P[id]=P[id]||{prod:0,refugo:0,cura:0,lib:0,bloq:0,ent:0,dev:0,aj:0,av:0,res:0,emProd:0,custo:0,custoMat:0};
  const reprov=new Set(T('ensaio').filter(e=>num(e.idade)>=28&&e.situacao==='reprovado').map(e=>e.lote));
  T('producao').forEach(r=>itensProd(r).forEach((it,i)=>{const p=pecaDe(it.peca),x=g(String(it.peca)),q=num(it.qtd);x.prod+=q;x.refugo+=num(it.refugo);x.custo+=q*num(it.custo_un);x.custoMat+=q*num(it.custo_mat_un);
    const lib=addD(dt(r.data)||h,num(p&&p.cura!=null&&p.cura!==''?p.cura:tipoDePeca(p||{}).cura||7));
    // lote reprovado no ensaio: bloqueado (não fica pronto para vender)
    if(reprov.size&&reprov.has(loteDe(r,it,i)))x.bloq+=q;else if(lib>h)x.cura+=q;else x.lib+=q;}));
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
  {k:'painel',rot:'Painel',ico:'fa-gauge-high'},{k:'pecas',rot:'Peças e catálogo',curto:'Peças',ico:'fa-cubes'},{k:'planejamento',rot:'Planejamento',ico:'fa-clipboard-list'},
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
.pm-topo{position:sticky;top:-24px;z-index:6;margin:-24px -32px 0;padding:18px 32px 12px;background:var(--bg,#F5F5F7);}
.pm-nav{display:flex;align-items:center;gap:2px;padding:6px 8px;background:#fff;border:1px solid #E4E9F2;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.04);overflow-x:auto;scrollbar-width:none;transition:box-shadow .2s;}
.pm-nav::-webkit-scrollbar{display:none;}
.pm-topo.rolado .pm-nav{box-shadow:0 10px 24px -16px rgba(16,24,40,.4);}
.pm-tab{position:relative;flex:1 1 0;min-width:max-content;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid transparent;background:transparent;padding:6px 12px 6px 6px;border-radius:11px;font:600 13px Inter,sans-serif;color:#475467;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,border-color .15s;}
.pm-tab .ic{position:relative;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:#F2F4F7;color:#667085;font-size:12.5px;flex:none;transition:background .15s,color .15s;}
.pm-tab:hover{background:#F8FAFC;color:#1D2939;} .pm-tab:hover .ic{background:#E8EEF8;color:#1652D8;}
.pm-tab.on{background:#EEF4FF;border-color:#D1E0FF;color:#1652D8;font-weight:700;}
.pm-tab.on .ic{background:#1652D8;color:#fff;}
.pm-tab .bd{position:absolute;top:-6px;right:-7px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:#F04438;color:#fff;font:800 9.5px Inter,sans-serif;display:grid;place-items:center;border:2px solid #fff;}
.pm-tab .lc{display:none;}
.pm-sep{flex:none;width:1px;height:22px;background:#EAECF0;margin:0 6px;}
.pm-av{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:99px;background:linear-gradient(135deg,#DBE7FF,#EEF4FF);color:#1652D8;font:800 11px Inter,sans-serif;border:2px solid #fff;box-shadow:0 0 0 1px #D1E0FF;flex:none;}
.pm-dia2{background:#fff;border:1px solid #E4E9F2;border-radius:16px;padding:12px 14px;box-shadow:0 1px 2px rgba(16,24,40,.04);}
.pm-dia2-cab{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px;}
.pm-dia2-dt{width:58px;height:58px;border-radius:14px;background:linear-gradient(135deg,#1652D8,#2E90FA);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;box-shadow:0 8px 16px -10px rgba(22,82,216,.9);}
.pm-dia2-dt b{font:800 22px Manrope,Inter,sans-serif;line-height:1;} .pm-dia2-dt span{font:700 10px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;opacity:.9;}
/* data do dia em forma de folhinha de calendário: mês na faixa, dia grande, dia da semana embaixo */
.pm-cal{width:64px;flex:none;border-radius:14px;overflow:hidden;background:#fff;border:1px solid #D9E2F1;box-shadow:0 6px 14px -8px rgba(22,82,216,.45);text-align:center;}
.pm-cal .m{display:block;background:linear-gradient(135deg,#1652D8,#2E90FA);color:#fff;font:800 10px Inter,sans-serif;letter-spacing:.14em;padding:4px 0 3px;}
.pm-cal .d{display:block;font:800 26px/1 Manrope,Inter,sans-serif;color:#101828;padding:7px 0 2px;}
.pm-cal .s{display:block;font:600 10.5px Inter,sans-serif;color:#667085;padding:0 0 7px;}
.pm-cal.fech{border-color:#E4E7EC;box-shadow:none;} .pm-cal.fech .m{background:linear-gradient(135deg,#475467,#98A2B3);} .pm-cal.fech .d{color:#475467;}
/* calendário para escolher o dia do diário: o mês aparece no título (só sinaliza; quem troca é o seletor do diário) */
.pm-cl .pm-pop-cab{padding:14px 16px 12px;}
.pm-cl-tit{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:800 15.5px Manrope,Inter,sans-serif;color:#101828;}
.pm-cl-chip{display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#1652D8,#2E90FA);color:#fff;border-radius:10px;padding:6px 12px;font:800 13px Inter,sans-serif;letter-spacing:.01em;box-shadow:0 6px 14px -8px rgba(22,82,216,.9);}
.pm-cl-chip i{font-size:12px;opacity:.9;}
.pm-cl-sem,.pm-cl-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;padding:0 18px;}
.pm-cl-sem{padding-top:14px;}
.pm-cl-sem span{font:700 10.5px Inter,sans-serif;color:#475467;text-transform:uppercase;text-align:center;letter-spacing:.06em;padding-bottom:2px;}
.pm-cl-sem span.fs{color:#98A2B3;}
.pm-cl-grid{padding:8px 18px 16px;}
.pm-cd{position:relative;height:62px;border:1px solid #EAECF0;border-radius:12px;background:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:7px 8px 6px;cursor:pointer;color:#101828;text-align:left;font-family:Inter,sans-serif;transition:background .12s,border-color .12s,box-shadow .12s,transform .12s;}
.pm-cd b{font:800 15px/1 Manrope,Inter,sans-serif;}
.pm-cd small{font:600 9.5px/1.15 Inter,sans-serif;color:#667085;max-height:22px;overflow:hidden;}
.pm-cd.livre:hover{border-color:#1652D8;background:#F5F8FF;box-shadow:0 8px 16px -10px rgba(22,82,216,.8);transform:translateY(-1px);}
.pm-cd.vz{border:0;background:transparent;cursor:default;}
.pm-cd.fds{background:#F2F4F7;border-color:#E4E7EC;} .pm-cd.fds b{color:#475467;}
.pm-cd.fer{background:#FFF5F4;border-color:#FECDCA;} .pm-cd.fer b,.pm-cd.fer small{color:#B42318;}
.pm-cd.reg{background:#ECFDF3;border-color:#ABEFC6;cursor:not-allowed;} .pm-cd.reg b{color:#067647;} .pm-cd.reg small{color:#079455;}
.pm-cd.reg i{position:absolute;top:7px;right:7px;font-size:12px;color:#12B76A;}
.pm-cd.fut,.pm-cd.enc{opacity:.38;cursor:not-allowed;}
.pm-cd.hoje{border-color:#1652D8;box-shadow:inset 0 0 0 1px #1652D8;} .pm-cd.hoje small{color:#1652D8;font-weight:800;}
.pm-cl-leg{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 14px;padding:11px 18px 14px;border-top:1px solid #F2F4F7;font-size:11.5px;color:#475467;}
.pm-cl-leg>div{display:flex;flex-wrap:wrap;gap:6px 14px;}
.pm-cl-leg span::before{content:'';display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px;background:var(--c);border:1px solid var(--b);}
.pm-cl-leg em{font-style:normal;color:#667085;white-space:nowrap;} .pm-cl-leg em b{color:#101828;}
@media (max-width:560px){.pm-cd{height:50px;padding:6px;} .pm-cd small{display:none;} .pm-cl-sem,.pm-cl-grid{gap:4px;padding-left:10px;padding-right:10px;}}
.pm-dia2-tit{display:flex;align-items:center;gap:8px;flex-wrap:wrap;} .pm-dia2-tit>b{font:800 15px Manrope,Inter,sans-serif;color:#101828;}
.pm-dia2.fech{background:#FCFCFD;}
.pm-st-dia{display:inline-flex;align-items:center;gap:5px;font:700 11px Inter,sans-serif;border-radius:99px;padding:3px 9px;}
.pm-st-dia.ab{background:#ECFDF3;color:#067647;} .pm-st-dia.fe{background:#F2F4F7;color:#475467;}
.pm-pt.pend{border-color:#FDB022;background:#FFFAEB;} .pm-pt.pend [data-pst]{border-color:#F79009;}
.pm-dia2-meta{flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px;} .pm-dia2-meta>div.pm-pills{display:flex;flex-wrap:wrap;gap:4px;}
.pm-dia2-num{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#667085;} .pm-dia2-num b{color:var(--text-1);font-size:14px;}
.pm-dia2-bt{display:flex;gap:6px;flex:none;}
.pm-dia2-eq{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:0 0 8px;padding:6px 8px;background:#F8FAFC;border-radius:10px;} .pm-dia2-eq .pm-av{margin-right:-8px;} .pm-dia2-eq .pm-mini{margin:0 8px 0 14px;}
.pm-pt-cab{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;} .pm-pt-acoes{display:flex;gap:6px;flex-wrap:wrap;}
.pm-pt-tot{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#667085;margin-bottom:8px;} .pm-pt-tot b{color:var(--text-1);} .pm-pt-tot .x b{color:#B54708;} .pm-pt-tot .a b{color:#B42318;}
.pm-pts{display:flex;flex-direction:column;gap:6px;}
.pm-pt{display:grid;grid-template-columns:34px minmax(150px,1.4fr) 120px repeat(3,minmax(80px,.8fr)) minmax(110px,1fr) 32px;gap:8px;align-items:center;border:1px solid #EEF1F6;border-radius:12px;padding:6px 8px;background:#fff;transition:opacity .15s,background .15s;}
.pm-pt.off{background:#FAFAFB;} .pm-pt.off .pm-pt-h{opacity:.35;}
.pm-pt-nm b{display:block;font-size:13px;} .pm-pt-nm small{display:block;font-size:11px;color:#667085;} .pm-pt-nm input,.pm-pt-nm select{width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:8px;font:12.5px Inter,sans-serif;margin-bottom:3px;}
.pm-pt-st,.pm-pt-h input{width:100%;padding:6px 7px;border:1px solid var(--border);border-radius:8px;font:12.5px Inter,sans-serif;background:#fff;}
.pm-pt-h{display:flex;flex-direction:column;gap:1px;} .pm-pt-h small{font:700 9.5px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#98A2B3;}
.pm-pt-r{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:12.5px;} .pm-pt-r .x{font:700 10.5px Inter,sans-serif;background:#FFFAEB;color:#B54708;border-radius:6px;padding:1px 5px;} .pm-pt-r .a{font:700 10.5px Inter,sans-serif;background:#FEF3F2;color:#B42318;border-radius:6px;padding:1px 5px;}
@media (max-width:900px){.pm-pt{grid-template-columns:34px 1fr 110px;} .pm-pt-h,.pm-pt-r{grid-column:span 1;}}
.pm-ltiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;} .pm-ltile{background:#F8FAFC;border:1px solid #EEF1F6;border-radius:12px;padding:8px 10px;min-width:0;}
.pm-ltile i{color:#1652D8;font-size:13px;} .pm-ltile small{display:block;font:700 10px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#667085;margin-top:3px;} .pm-ltile b{display:block;font:800 15px Inter,sans-serif;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .pm-ltile span{display:block;font-size:11px;color:#667085;}
.pm-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;} .pm-fotos figure{position:relative;margin:0;border-radius:10px;overflow:hidden;border:1px solid #E4E9F2;aspect-ratio:4/3;background:#F2F4F7;} .pm-fotos img{width:100%;height:100%;object-fit:cover;display:block;}
.pm-fx{position:absolute;top:5px;right:5px;width:26px;height:26px;border-radius:8px;border:0;background:rgba(255,255,255,.92);color:#B42318;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.18);} .pm-fprin{position:absolute;left:5px;bottom:5px;font:800 10px Inter,sans-serif;background:#1652D8;color:#fff;border-radius:6px;padding:1px 6px;}
.pm-arqs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;background:#EEF4FF;border:1px solid #D1E0FF;border-radius:10px;padding:6px 8px;} .pm-arqs>b{color:#1652D8;margin-right:4px;}
.pm-arq{display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #D1E0FF;border-radius:8px;padding:2px 4px 2px 8px;} .pm-arq a{color:#1652D8;font-weight:700;text-decoration:none;} .pm-arq button{border:0;background:#FEF3F2;color:#B42318;border-radius:6px;width:20px;height:20px;cursor:pointer;}
.fin-aviso.vermelho{background:#FEF3F2;border-color:#FECDCA;color:#7A271A;}
#fin-jan .pm-itens td>small{display:block;margin-top:2px;font-size:11px;line-height:1.25;white-space:normal;color:#667085;}
.pm-guia{margin-top:10px;border:1px solid #D1E0FF;background:#F5F8FF;border-radius:12px;padding:8px 12px;font-size:12.5px;line-height:1.5;color:#344054;} .pm-guia summary{cursor:pointer;font-weight:700;color:#1652D8;} .pm-guia ol{margin:8px 0 2px 18px;padding:0;} .pm-guia li{margin-bottom:5px;}
.pm-conv{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:#475467;background:#F8FAFC;border-radius:10px;padding:6px 10px;} .pm-conv input{width:90px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;} .pm-conv b{color:#1652D8;font-size:14px;}
.pm-seg{display:flex;gap:4px;background:#F2F4F7;border-radius:10px;padding:3px;} .pm-seg button{flex:1;border:0;background:transparent;border-radius:8px;padding:8px 10px;font:600 13px Inter,system-ui,sans-serif;color:#475467;cursor:pointer;} .pm-seg button.on{background:#fff;color:#1652D8;box-shadow:0 1px 3px rgba(16,24,40,.12);}
#pm-app .vk-card.vk-fim{background:#FFFBFA;} #pm-app .vk-card.vk-fim .vk-itens li span{text-decoration:line-through;text-decoration-color:rgba(180,35,24,.35);}
#pm-app .vk-motivo{background:#FEF3F2;border-radius:8px;padding:5px 8px;color:#7A271A;font-size:11.5px;line-height:1.4;}
#pm-app .vk-quadro{overflow-x:auto;padding-bottom:6px;grid-template-columns:repeat(var(--n),minmax(196px,1fr))!important;gap:10px;}
#pm-app .vk-top{flex-wrap:wrap;gap:4px 6px;} #pm-app .vk-top b{white-space:nowrap;}
@media (max-width:1560px){.pm-tab .lb{display:none;} .pm-tab .lc{display:inline;} .pm-tab{padding:7px 10px 7px 7px;gap:8px;}}
@media (max-width:1180px){.pm-tab{padding:6px 8px 6px 6px;gap:6px;font-size:12.5px;} .pm-tab .ic{width:26px;height:26px;border-radius:8px;font-size:12px;} .pm-sep{margin:0;} .pm-nav{gap:2px;padding:5px;}}
@media (max-width:980px){.pm-tab .lc{display:none;} .pm-tab{padding:6px;}}
@media (max-width:900px){.pm-topo{top:-16px;margin:-16px -16px 0;padding:12px 16px 10px;} .pm-tab{flex:none;}}
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
  // faixa de abas: na ordem da operação, com divisória entre os blocos (produção · comercial · financeiro · parâmetros)
  const tabB=a=>`<button type="button" class="pm-tab ${a.k===ab.k?'on':''}" data-pm-aba="${a.k}" role="tab" aria-selected="${a.k===ab.k}" title="${a.rot}"><span class="ic"><i class="fas ${a.ico}"></i>${bd[a.k]?`<span class="bd">${bd[a.k]}</span>`:''}</span><span class="lb">${a.rot}</span><span class="lc">${a.curto||a.rot}</span></button>`;
  const GRP=[['painel'],['pecas','planejamento','producao'],['estoque','vendas'],['caixa','relatorios'],['parametros']];
  const nav=`<div class="pm-topo"><nav class="pm-nav" role="tablist">${GRP.map(ks=>ks.map(k=>tabB(ABAS.find(a=>a.k===k))).join('')).join('<span class="pm-sep" aria-hidden="true"></span>')}</nav></div>`;
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
    // registrar o dia: primeiro o calendário (dia já registrado não dá para escolher)
    'prod-nova':()=>escolherDiaProducao(),
    'lote':()=>fichaLote(b.dataset.lote),'dvista':()=>{PM.dVista=b.dataset.v;render();},'lfiltro':()=>{PM.lFiltro=b.dataset.v;render();},
    'prod-copiar':()=>{const hj=T('producao').find(r=>r.data===hojeISO());if(hj)return trava('O dia de hoje já foi registrado',[{ok:false,txt:'Cada dia tem um diário só. Abra o dia de hoje para alterar.'}],{rot:'Abrir o dia de hoje',f:()=>formProducao(hj)});formProducao(null,{copiar:T('producao').find(o=>String(o.rowid)===id)});},
    'prod':()=>formProducao(T('producao').find(o=>String(o.rowid)===id)),
    'dia-fechar':()=>confirmarFecharDia(T('producao').find(o=>String(o.rowid)===id)),'dia-reabrir':()=>reabrirDia(T('producao').find(o=>String(o.rowid)===id)),
    'compra-nova':()=>formCompra(null,b.dataset.ins),'compra':()=>formCompra(T('compra').find(o=>String(o.rowid)===id)),
    'ajuste-novo':()=>formAjuste(null,b.dataset.item),'ajuste':()=>formAjuste(T('ajuste').find(o=>String(o.rowid)===id)),
    'avaria-nova':()=>formAvaria(null,b.dataset.peca),'avaria':()=>formAvaria(T('avaria').find(o=>String(o.rowid)===id)),
    'venda-nova':()=>formVenda(null),'venda':()=>fichaVenda(vendaDe(id)),
    'arrumar-soltas':()=>{const L=ordens().filter(opSolta);if(!L.length)return toast('Nenhuma ordem solta.','success');
      const st=v=>v?(v.status==='entregue'?'já entregue':v.status==='devolvida'?'devolvida':'cancelada'):'excluída';
      confirmar('Arrumar as ordens soltas?',`<ul style="margin:0 0 0 18px">${L.map(o=>{const v=vendaDe(o.venda),f=prodDaOrdem(o.rowid);return `<li>OP nº ${fe(String(o.numero))} — ${v?'venda nº '+v.numero:'venda'} ${st(v)}: ${f?`${nf(f,0)} peça(s) feita(s), <b>segue para o estoque</b>`:'<b>será cancelada</b> (nada produzido)'}</li>`;}).join('')}</ul>`,'Sim, arrumar',async()=>{
        const mud=[];L.forEach(o=>{const v=vendaDe(o.venda);mud.push(...fecharOPs([o],v?`venda nº ${v.numero}`:'venda excluída',st(v),true));});await gravarVarios(mud);toast(`${mud.length} ordem(ns) arrumada(s).`,'success');});},
    'mandar-prod':()=>{const L=pendenciasProducao();if(!L.length)return toast('Nada a mandar para a produção.','success');
      confirmar('Mandar para a produção?',`Criar ordem de produção para:<ul style="margin:8px 0 0 18px">${L.map(x=>`<li>Venda nº ${fe(String(x.v.numero))} (${fe(x.v.cliente||'')}): ${x.its.map(it=>`${nf(it.qtd,0)} × ${fe(nomePeca(it.peca))}`).join(', ')}</li>`).join('')}</ul>`,'Sim, criar as ordens',async()=>{await mandarProducao(L);});},
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
  const estornosDev=vendas().reduce((s,v)=>s+(v.devolucoes||[]).filter(dv=>noM(dt(dv.data))).reduce((a,dv)=>a+num(dv.estorno),0)+(v.pagamentos||[]).filter(p=>p.tipo==='estorno'&&/^abatimento/.test(p.obs||'')&&noM(dt(p.data))).reduce((a,p)=>a+num(p.valor),0),0);
  const receita=vend.reduce((s,v)=>s+totalVenda(v),0)-estornosDev;
  let cmv=0;const porPeca={};
  vend.forEach(v=>(v.itens||[]).forEach(it=>{const x=E.P[String(it.peca)],q=num(it.qtd);cmv+=q*(x?x.custoMatUn:0);const y=porPeca[it.peca]=porPeca[it.peca]||{q:0,v:0};y.q+=q;y.v+=q*num(it.preco);}));
  const impostos=receita*num(c.impostos)/100,mc=receita-impostos-cmv,perdaInv=T('ajuste').filter(a=>noM(dt(a.data))&&String(a.item||'').startsWith('peca:')&&num(a.qtd)<0).reduce((s,a)=>{const x=E.P[a.item.slice(5)];return s+(-num(a.qtd))*(x?x.custoUn:0);},0),perdas=perdaRefugo+perdaAv+perdaInv;
  const custos=T('custo').filter(x=>noM(dt(x.data))&&x.categoria!=='Comissões de vendedores').reduce((s,x)=>s+num(x.valor),0),comissoes=Object.values(comissoesMes(k)).reduce((s,x)=>s+x.com,0);
  const resultado=mc-perdas-comissoes-custos,custoM3=m3>0?(matCons+custos)/m3:null;
  const recebido=vendas().reduce((s,v)=>s+(v.pagamentos||[]).filter(p=>p.tipo!=='estorno'&&noM(dt(p.data))).reduce((a,p)=>a+num(p.valor),0),0);
  return {k,prod,its,pecasProd,refugo,m3,matCons,vend,receita,impostos,cmv,mc,perdas,perdaAv,perdaRefugo,perdaInv,custos,comissoes,resultado,custoM3,porPeca,recebido,av};
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
      ${kpiG(r.perdas?'vermelho':'verde','fa-heart-crack','Perdas e avarias',R(r.perdas),`refugo ${R(r.perdaRefugo)} · avarias ${R(r.perdaAv)}${r.perdaInv?' · inventário '+R(r.perdaInv):''}`)}
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
          <tr><td>(−) Perdas: refugo, avarias e inventário<small>peça quebrada ou que sumiu é perda: não volta ao estoque</small></td><td class="n">${R(-r.perdas)}</td></tr>
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
    <div class="fin-fld"><label>Dias de cura</label><input data-k="cura" inputmode="numeric" data-num="int" value="${fe(String(b.cura||7))}"></div>
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
  const fld=(k,l,ph)=>`<div class="fin-fld"><label>${l}</label><input data-k="${k}" inputmode="decimal" data-num="dec" value="${fe(String(b[k]!=null?b[k]:'').replace('.',','))}" placeholder="${ph||'0'}" ${padrao?'readonly':''}></div>`;
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
    <p class="pm-mini" style="margin:-4px 0 6px"><i class="fas fa-pallet"></i> ${(()=>{const ml=modoLote(p);return ml.modo==="unidade"?"Lote por unidade: cada peça recebe o seu número":`Lote por palete: ${nf(ml.pp,0)} peças por palete (≈ ${nf(ml.pp*x.peso/1000,2)} t)`;})()}</p>
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
  const dimsHtml=d=>F.campos.map(([k,l])=>`<div class="fin-fld"><label>${l}${t.f==='manual'?'':(k==='vz'?'':' (cm)')}</label><input data-dim="${k}" inputmode="decimal" data-num="dec" data-sem-mascara="1" value="${d&&d[k]!=null&&d[k]!==''?fe(String(d[k]).replace('.',',')):''}" placeholder="0"></div>`).join('');
  const html=`<div class="pm-form"><div>
    <div class="pm-bloco"><h5><i class="fas fa-shapes"></i> Tipo: ${fe(t.nome)}</h5><p class="pm-mini" style="margin:-4px 0 8px">${fe(grupoDe(t.g).rot)} · forma ${fe(F.rot.toLowerCase())} · ${fe(t.uso||'')}</p>
      ${t.tam.length?`<div class="fin-fld"><label>Tamanho de mercado</label><select data-pmf="tam"><option value="">— medidas próprias —</option>${t.tam.map(([r],i)=>`<option value="${i}">${fe(r)}</option>`).join('')}</select></div>`:''}
      <div class="fin-linha" data-dims style="margin-top:8px">${dimsHtml(base.dims)}</div>
      ${t.arm!=='nenhuma'?`<label class="nfc-amb" style="margin-top:8px"><input type="checkbox" data-k="armadura" ${base.armadura!==false&&(base.armadura===true||t.armPad!==false)?'checked':''}><span><b>Esta peça leva armadura</b> — ${fe(armTxt(t.arm))}</span></label>`:''}</div>
    <div class="pm-bloco"><h5><i class="fas fa-tag"></i> Identificação e preço</h5><div class="fin-linha">
      <div class="fin-fld"><label>Código</label><input data-k="codigo" value="${fe(base.codigo||'')}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Nome da peça <small style="font-weight:500;text-transform:none;color:#667085">(vazio = nome automático)</small></label><input data-k="nome" value="${fe(base.nome||'')}" placeholder="${fe(t.nome)}"></div>
      <div class="fin-fld"><label>Preço de varejo (R$)</label><input data-k="preco" value="${base.preco?fe(String(base.preco)):''}" placeholder="vazio = sugerido"></div>
      <div class="fin-fld"><label>Preço de atacado (R$)</label><input data-k="preco_atacado" value="${base.preco_atacado?fe(String(base.preco_atacado)):''}"></div>
      <div class="fin-fld"><label>Atacado a partir de (peças)</label><input data-k="atacado_min" inputmode="numeric" data-num="int" value="${fe(String(base.atacado_min||''))}" placeholder="ex.: 100"></div><div class="fin-fld"><label>NCM (nota fiscal)</label><input data-k="ncm" value="${fe(base.ncm||'')}" placeholder="${CAT.ncmDe?CAT.ncmDe(t):''}"></div></div></div>
    <div class="pm-bloco"><h5><i class="fas fa-industry"></i> Produção</h5><div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Traço</label><select data-k="traco">${tracos().map(x=>`<option value="${x.id}" ${x.id===(LEGADO_TR[base.traco]||base.traco)?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Dias de cura até liberar</label><input data-k="cura" inputmode="numeric" data-num="int" value="${fe(String(base.cura!=null?base.cura:t.cura))}"></div>
      <div class="fin-fld"><label>Formas (moldes) disponíveis</label><input data-k="formas" inputmode="numeric" data-num="int" value="${fe(String(base.formas||1))}"></div>
      <div class="fin-fld"><label>Peças por forma por dia</label><input data-k="ciclo" inputmode="numeric" data-num="int" value="${fe(String(base.ciclo||1))}"></div>
      <div class="fin-fld"><label>Estoque mínimo (peças)</label><input data-k="minimo" inputmode="numeric" data-num="int" value="${fe(String(base.minimo||''))}" placeholder="0"></div><div class="fin-fld"><label>Controle de lote</label><select data-k="lote_modo"><option value="" ${!base.lote_modo?'selected':''}>Automático (pelo peso)</option><option value="palete" ${base.lote_modo==='palete'?'selected':''}>Por palete</option><option value="unidade" ${base.lote_modo==='unidade'?'selected':''}>Por unidade (cada peça numerada)</option></select></div><div class="fin-fld"><label>Peças por palete</label><input data-k="pecas_palete" inputmode="numeric" data-num="int" data-sem-mascara="1" value="${fe(String(base.pecas_palete||''))}" placeholder="automático"></div>
      <div class="fin-fld"><label>Perda de concreto (%)</label><input data-k="perda" value="${base.perda!=null&&base.perda!==''?fe(String(base.perda)):''}" placeholder="padrão ${nf(num(c.perdas.concreto),0)}%"></div></div></div>
    <div class="fin-fld"><label>Observações</label><textarea data-k="obs" rows="2">${fe(base.obs||'')}</textarea></div></div>
  <div class="pm-res"><div data-pm-desenho style="background:#fff;border-radius:10px;margin-bottom:8px"></div><div data-pm-arm></div>
    <div class="fin-fld" style="margin:8px 0"><label>Calcular para quantas peças?</label><input data-pmf="lote" inputmode="numeric" data-num="int" value="1"></div><div data-pm-res></div></div></div>`;
  const j=janela(novo?'Nova peça':'Editar peça',html,[{html:`<i class="fas fa-floppy-disk"></i> ${novo?'Cadastrar peça':'Salvar'}`,cls:'pri',acao:async jj=>{
    if(!novo&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
    const o=lerPeca(jj,novo?{tipo:'peca',tipo_k:t.k,data_lancamento:todayDateTime()}:{...reg});
    // peça com produção ou venda: as medidas não mudam (mudaria o que já está no estoque e nos lotes) — outro tamanho = Duplicar
    if(!novo){const id=String(reg.rowid),hist=T('producao').some(r=>itensProd(r).some(it=>String(it.peca)===id))||vendas().some(v=>(v.itens||[]).some(it=>String(it.peca)===id)),ks=new Set([...Object.keys(reg.dims||{}),...Object.keys(o.dims||{})]),mudou=[...ks].some(k=>Math.abs(num((reg.dims||{})[k])-num((o.dims||{})[k]))>1e-9);
      if(hist&&mudou)return trava('Medidas travadas: a peça já tem produção ou venda',[{ok:false,txt:'Mudar as medidas mudaria as peças que já estão no estoque, nos lotes e nas vendas.'},{ok:true,txt:'Para outro tamanho, abra a peça e use <b>Duplicar</b>: a cópia nasce com as medidas que você quiser. Preço, traço e estoque mínimo podem ser mudados aqui.'}]);}
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
  o.cura=v('cura')!==''?num(v('cura')):o.cura;o.minimo=v('minimo')?num(v('minimo')):'';o.perda=v('perda')!==''?num(v('perda')):'';o.formas=Math.max(1,num(v('formas'))||1);o.ciclo=Math.max(1,num(v('ciclo'))||1);o.lote_modo=v('lote_modo');o.pecas_palete=v('pecas_palete')?Math.max(1,Math.round(num(v('pecas_palete')))):'';
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
// anexos da fábrica: excluir (quem enviou ou o Administrador), confirmar sem fechar a janela aberta
const excluirAnexoFab=a=>new Promise((ok,er)=>google.script.run.withSuccessHandler(ok).withFailureHandler(e=>er(e instanceof Error?e:new Error(String((e&&e.message)||e)))).excluirAnexo(a.uid,a.rowid));
const podeApagarArq=a=>ehAdm()||String(a.enviado_por||'')===eu();
function perguntar(titulo,msg,rotOk,fn){sobre(`<div class="pm-pop-box" style="max-width:440px"><div class="pm-pop-cab"><b>${fe(titulo)}</b><button type="button" class="pm-x" data-pop-x><i class="fas fa-xmark"></i></button></div>
  <div style="padding:14px 16px"><p style="margin:0 0 14px;font-size:13.5px;line-height:1.5">${msg}</p><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="gf-bt" data-pop-x>Voltar</button><button type="button" class="gf-bt pri" data-pop-ok style="background:#D92D20;border-color:#D92D20">${fe(rotOk)}</button></div></div></div>`,
  async(ev,fechar)=>{if(ev.target.closest('[data-pop-ok]')){fechar();try{await fn();}catch(e){toast(e.message||String(e),'error');}}});}
const URLS_ARQ={};function dataUrlDe(a){if(!URLS_ARQ[a.uid])URLS_ARQ[a.uid]=new Promise(ok=>google.script.run.withSuccessHandler(r=>{const ps=((r&&r.partes)||[]).slice().sort((x,y)=>x.ordem-y.ordem);ok(ps.length?`data:${a.mime||'image/jpeg'};base64,${ps.map(x=>x.conteudo).join('')}`:'');}).withFailureHandler(()=>ok('')).partesAnexo(a.uid));return URLS_ARQ[a.uid];}
async function fotoMostrar(p){const box=document.querySelector('#fin-jan [data-pm-foto]');if(!box)return;
  const L=(await listaFotos()).filter(x=>String(x.peca)===String(p.rowid)).sort((x,y)=>String(y.enviado_em||'').localeCompare(String(x.enviado_em||'')));
  if(!L.length){box.innerHTML='';return;}
  box.innerHTML=`<div class="pm-fotos">${L.map((a,i)=>`<figure data-fi="${i}"><img alt="Foto da peça">${i===0?'<span class="pm-fprin">principal</span>':''}${podeApagarArq(a)?`<button type="button" class="pm-fx" data-fdel="${i}" title="Excluir esta foto"><i class="fas fa-trash"></i></button>`:''}</figure>`).join('')}</div>`;
  L.forEach((a,i)=>dataUrlDe(a).then(u=>{const im=box.querySelector(`[data-fi="${i}"] img`);if(im&&u)im.src=u;}));
  box.onclick=ev=>{const b=ev.target.closest('[data-fdel]');if(!b)return;const a=L[+b.dataset.fdel];
    perguntar('Excluir a foto?','A foto sai da peça de vez. A mais recente que ficar passa a ser a principal.','Excluir foto',async()=>{UI._showBusy('Excluindo…');try{await excluirAnexoFab(a);}finally{UI._hideBusy();}FOTOS.lista=null;delete FOTOS.url[String(p.rowid)];toast('Foto excluída.','success');fotoMostrar(p);});};}
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
  janela('Ficha técnica — quantas peças?',`<div class="fin-fld"><label>Quantidade a produzir</label><input data-k="q" inputmode="numeric" data-num="int" value="10"></div><p class="pm-mini">A ficha sai com o desenho, o material, o ferro e a receita do concreto para essa quantidade — em letra grande, para a equipe da produção.</p>`,
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
      ${opSolta(o)?`<div class="vk-sub">${pill(v?`venda nº ${v.numero} ${v.status==='entregue'?'já entregue':v.status==='devolvida'?'devolvida':'cancelada'} · ordem solta`:'venda excluída · ordem solta','err','fa-link-slash')}</div>`
        :v?`<div class="vk-sub">${pill('venda nº '+v.numero,'warn','fa-cart-shopping')} ${fe(v.cliente||'')}</div>`:o.cliente?`<div class="vk-sub">para ${fe(o.cliente)}</div>`:''}
      <div class="vk-val"><span>${nf(feito,0)} de ${nf(tot,0)} peças</span><b>${nf(pc,0)}%</b></div><div class="pm-barra ${pc>=100?'ok':''}"><i style="width:${pc}%"></i></div></article>`;};
  const cols=COLS_OP.map(c=>{const itens=L.filter(o=>(o.status||'planejada')===c.k).sort((a,b)=>String(a.fim||'9').localeCompare(String(b.fim||'9')));return {c,itens,sub:`${itens.length} ordem(ns) · ${nf(itens.reduce((s,o)=>s+num(o.qtd),0),0)} peças`};});
  const nec=necessidade(),pen=pendenciasProducao(),espera=vendas().filter(v=>v.status==='aguardando_sinal'),soltas=ordens().filter(opSolta);
  setTimeout(()=>{const w=document.querySelector('#pm-app .vk-quadro');if(w&&!w._lig){w._lig=1;GS.ligarArraste(w,moverOrdem);}},0);
  return cabG('Planejamento da produção','Ordens de produção (OP): o que fazer, quanto e até quando. Cada ordem imprime a sua ficha de produção com o material, o ferro e a receita do concreto. Pedidos de venda sem peça pronta geram a ordem sozinhos.',
      `<button type="button" class="gf-bt" data-pm="fichas-abertas"><i class="fas fa-print"></i> Fichas das ordens abertas</button><button type="button" class="gf-bt pri" data-pm="ordem-nova"><i class="fas fa-plus"></i> Nova ordem de produção</button>`)+
    (soltas.length?`<div class="fin-aviso vermelho" style="margin:0 0 10px"><div><i class="fas fa-link-slash"></i> <b>${soltas.length} ordem(ns) solta(s)</b> — a venda já foi entregue, cancelada ou devolvida: ${soltas.map(o=>`OP nº ${fe(String(o.numero))}`).join(', ')}. Sem produção, a ordem é cancelada; com produção, segue para o estoque. <button type="button" class="gf-bt mini pri" data-pm="arrumar-soltas" style="margin-left:6px"><i class="fas fa-wand-magic-sparkles"></i> Arrumar agora</button></div></div>`:'')+
    (pen.length?`<div class="fin-aviso laranja" style="margin:0 0 10px"><div><b>Vendas com peça reservada sem ordem:</b> ${pen.map(x=>`venda nº ${fe(String(x.v.numero))} (${x.its.map(it=>`${nf(it.qtd,0)} × ${fe(nomePeca(it.peca))}`).join(', ')})`).join(' · ')}. <button type="button" class="gf-bt mini pri" data-pm="mandar-prod" style="margin-left:6px"><i class="fas fa-industry"></i> Criar as ordens</button></div></div>`:'')+
    (espera.length?`<div class="fin-aviso" style="margin:0 0 10px"><div><i class="fas fa-hourglass-start"></i> <b>${espera.length} pedido(s) aguardando o sinal</b> — ainda não produzir: ${espera.slice(0,6).map(v=>`venda nº ${fe(String(v.numero))} (${(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}`).join(', ')})`).join(' · ')}${espera.length>6?' …':''}. A ordem sai sozinha quando o sinal for pago.</div></div>`:'')+
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
  if(col==='cancelada'){const v=o.venda?vendaDe(o.venda):null;d.push({ok:feito===0,txt:feito?`Nenhuma peça produzida (já tem ${nf(feito,0)}) — conclua a ordem com o que foi feito`:'Nenhuma peça produzida'},
    {ok:!vendaAberta(v),txt:!o.venda?'Ordem sem venda ligada':vendaAberta(v)?`Ordem da venda nº ${v.numero}, que está em aberto: cancele ou edite pela venda`:`A venda ${v?'nº '+v.numero+' já está '+(v.status==='entregue'?'entregue':v.status==='devolvida'?'devolvida':'cancelada'):'ligada foi excluída'}: a ordem ficou solta e pode ser cancelada`});}
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
  const b=reg||{status:'planejada',inicio:hojeISO(),peca:pre.peca||pecas()[0].rowid,qtd:pre.qtd||''},feito=reg?prodDaOrdem(reg.rowid):0,v0=reg&&reg.venda?vendaDe(reg.venda):null;
  // só trava pela venda enquanto ela está em aberto; venda entregue/cancelada/devolvida (ou excluída) deixa a ordem solta
  const vend=vendaAberta(v0)?v0:null,solta=!!(reg&&reg.venda&&!vend);
  const j=janela(reg?`OP nº ${reg.numero}`:'Nova ordem de produção',`<div class="pm-form"><div><div class="fin-linha">
      <div class="fin-fld" style="grid-column:1/-1"><label>Peça <span class="obg">*</span></label><select data-k="peca" ${vend?'disabled':''}>${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(b.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade (peças) <span class="obg">*</span></label><input data-k="qtd" inputmode="numeric" data-num="int" value="${fe(String(b.qtd||''))}" ${vend?'readonly':''}></div>
      <div class="fin-fld"><label>Situação</label><select data-k="status">${COLS_OP.concat([{k:'cancelada',rot:'Cancelada'}]).map(c=>`<option value="${c.k}" ${c.k===b.status?'selected':''}>${c.rot.replace(/s$/,'')}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Início</label><input type="date" data-k="inicio" value="${fe(b.inicio||'')}"></div>
      <div class="fin-fld"><label>Prazo (terminar até)</label><input type="date" data-k="fim" value="${fe(b.fim||'')}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Para (cliente ou pedido)</label><input data-k="cliente" value="${fe(b.cliente||'')}" placeholder="Ex.: estoque" ${vend?'readonly':''}></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Observações</label><textarea data-k="obs" rows="2">${fe(b.obs||'')}</textarea></div></div>
      ${vend?`<div class="fin-aviso laranja" style="margin-top:8px"><div>Ordem ligada à <b>venda nº ${vend.numero}</b> (${fe(vend.cliente||'')}): a peça e a quantidade mudam pela venda.</div></div>`:''}
      ${solta&&['planejada','producao'].includes(reg.status)?`<div class="fin-aviso vermelho" style="margin-top:8px"><div><b>Ordem solta:</b> ${v0?`a venda nº ${v0.numero} (${fe(v0.cliente||'')}) já está ${v0.status==='entregue'?'entregue':v0.status==='devolvida'?'devolvida':'cancelada'}`:'a venda ligada foi excluída'} e não precisa mais desta ordem. ${feito?'Conclua com o que foi feito (as peças ficam no estoque) ou mude o "Para" para estoque.':'Pode <b>excluir</b> ou mudar a situação para <b>Cancelada</b>.'}</div></div>`:''}
      ${reg?`<div class="fin-aviso" style="margin-top:8px"><div>Produzido nesta ordem: <b>${nf(feito,0)} de ${nf(num(reg.qtd),0)}</b> peças.</div></div>`:''}</div>
      <div class="pm-res"><div data-op-des></div><div data-op-prev></div></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{if(vend)throw new Error(`Ordem da venda nº ${vend.numero}, que está em aberto: cancele ou edite pela venda.`);if(feito>0)throw new Error('Esta ordem já tem produção registrada: conclua com o que foi feito.');setTimeout(()=>apagarReg(reg,`OP nº ${reg.numero}`),60);}},
      {html:'<i class="fas fa-industry"></i> Registrar produção',acao:async()=>{setTimeout(()=>formProducao(null,{peca:reg.peca,ordem:reg.rowid}),60);}},
      {html:'<i class="fas fa-print"></i> Ficha de produção',acao:async()=>{const p=pecaDe(reg.peca);if(p)imprimirFichaDoc([fichaHtml(p,Math.max(1,num(reg.qtd)-feito),reg)],'Ficha de produção — OP nº '+reg.numero,p.nome);return false;}}]:[]),
     {html:`<i class="fas fa-floppy-disk"></i> ${reg?'Salvar':'Criar e imprimir a ficha'}`,cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg)&&!vend&&!solta)throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`).value.trim(),o=reg?{...reg}:{tipo:'ordem',numero:proxNum('ordem','numero'),data_lancamento:todayDateTime()};
      if(!vend){o.peca=g('peca');o.qtd=num(g('qtd'));o.cliente=g('cliente');}o.status=g('status');
      if(solta){o.venda_origem=reg.venda;o.venda='';}   // a ordem solta passa a ser do estoque (a venda de origem fica anotada)
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
// lote reprovado no ensaio de 28 dias: as peças ficam bloqueadas (não entram no estoque pronto nem nas vendas)
const loteBloqueado=cod=>T('ensaio').some(e=>e.lote===cod&&num(e.idade)>=28&&e.situacao==='reprovado');
// situação de liberação do lote: em cura → curado (falta o ensaio) → liberado; ou bloqueado (ensaio reprovado)
function liberacaoLote(l){
  if(!l)return null;const p=pecaDe(l.peca),t=tipoDePeca(p||{}),h=hoje0(),d=dt(l.data)||h,lib=addD(d,num(p&&p.cura!=null&&p.cura!==''?p.cura:t.cura||7)),falta=Math.max(0,Math.ceil((lib-h)/864e5));
  const base={lib,falta,cura:Math.round((lib-d)/864e5)};
  if(lib>h)return {...base,k:'cura',rot:`Em cura — libera em ${brDe(lib)} (falta${falta>1?'m':''} ${falta} dia${falta>1?'s':''})`,curto:`em cura · ${falta} dia(s)`,cor:'info',ico:'fa-hourglass-half'};
  if(loteBloqueado(l.lote))return {...base,k:'bloq',rot:'BLOQUEADO — ensaio de 28 dias reprovado: não vender; avalie com o responsável técnico',curto:'bloqueado · ensaio reprovado',cor:'err',ico:'fa-ban'};
  const st=situacaoLote(l);
  if(!st)return {...base,k:'ok',rot:'Liberado — cura completa (lote sem corpo de prova)',curto:'liberado',cor:'ok',ico:'fa-circle-check'};
  const ult=st.es[st.es.length-1];
  if(st.k==='aprovado')return {...base,k:'ok',rot:'100% liberado — cura completa e ensaio de 28 dias aprovado',curto:'100% liberado',cor:'ok',ico:'fa-circle-check'};
  if(ult&&ult.situacao==='parcial')return {...base,k:'ok',rot:`Liberado — cura completa e ensaio de ${nf(num(ult.idade),0)} dias dentro do esperado (o de 28 dias confirma em ${brDe(st.f28)})`,curto:`liberado · ensaio ${nf(num(ult.idade),0)}d ok`,cor:'ok',ico:'fa-circle-check'};
  if(ult&&ult.situacao==='abaixo')return {...base,k:'ens',rot:`Curado — ATENÇÃO: ensaio de ${nf(num(ult.idade),0)} dias abaixo do esperado; aguarde o de 28 dias (${brDe(st.f28)})`,curto:'curado · ensaio abaixo',cor:'warn',ico:'fa-triangle-exclamation'};
  return {...base,k:'ens',rot:`Curado — falta o ensaio dos corpos de prova (${nf(l.cp,0)} CP)`,curto:'curado · falta o ensaio',cor:'warn',ico:'fa-flask'};
}
// controle do lote: peça pequena por palete (N peças por palete, ~1,2 t); peça grande por unidade (cada peça com o seu número)
function modoLote(p){const t=tipoDePeca(p||{}),peso=p?calc(p,1).peso:0,ppAuto=Math.max(1,Math.floor(1200/Math.max(0.1,peso)));
  if(p&&p.lote_modo==='unidade')return {modo:'unidade',pp:1,auto:false};if(p&&p.lote_modo==='palete')return {modo:'palete',pp:Math.max(1,num(p.pecas_palete)||ppAuto),auto:false};
  if(peso>=100||t.estr||(['tubo','aduela','pote','caixa','manual','canaleta'].includes(t.f)&&peso>=40))return {modo:'unidade',pp:1,auto:true};
  return {modo:'palete',pp:ppAuto,auto:true};}
function subLotes(l){const p=pecaDe(l.peca),m=l.it&&l.it.lmodo?{modo:l.it.lmodo,pp:Math.max(1,num(l.it.lpp)||1)}:modoLote(p),q=Math.max(0,Math.round(l.qtd)),o=[];
  if(m.modo==='unidade'){for(let i=1;i<=q;i++)o.push({cod:`${l.lote}-U${String(i).padStart(3,'0')}`,qtd:1,i,n:q,modo:'unidade'});}
  else if(q>0){const n=Math.ceil(q/m.pp);for(let i=1;i<=n;i++)o.push({cod:`${l.lote}-P${String(i).padStart(2,'0')}`,qtd:i<n?m.pp:q-m.pp*(n-1),i,n,modo:'palete',pp:m.pp});}
  return o;}
const resumoSub=l=>{const s=subLotes(l);if(!s.length)return '';return s[0].modo==='unidade'?`${s.length} unidade(s)`:`${s.length} palete(s) de até ${nf(s[0].pp,0)} peças`;};
// rastreio por palete / unidade: as entregas consomem pela ordem de fabricação (o mais antigo sai primeiro)
function rastreio(){
  const porVenda={},porLote={},porSub={},fila={};
  lotes().forEach(l=>subLotes(l).forEach(s=>(fila[l.peca]=fila[l.peca]||[]).push({lote:l.lote,cod:s.cod,resta:s.qtd})));
  vendas().filter(v=>(v.status==='entregue'||v.status==='devolvida')&&v.entrega).sort((a,b)=>String(a.entrega).localeCompare(String(b.entrega))||num(a.numero)-num(b.numero)).forEach(v=>
    (v.itens||[]).forEach(it=>{let q=num(it.qtd);for(const x of (fila[String(it.peca)]||[])){if(q<=0)break;if(x.resta<=0)continue;const u=Math.min(q,x.resta);x.resta-=u;q-=u;const r={venda:v.rowid,numero:v.numero,cliente:v.cliente,data:v.entrega,qtd:u};
      (porVenda[v.rowid]=porVenda[v.rowid]||[]).push({lote:x.lote,cod:x.cod,peca:it.peca,qtd:u});(porLote[x.lote]=porLote[x.lote]||[]).push({...r,cod:x.cod});(porSub[x.cod]=porSub[x.cod]||[]).push(r);}}));
  return {porVenda,porLote,porSub};
}
function fichaLote(cod,subDestaque){
  const l=loteInfo(cod);if(!l)return toast('Lote não encontrado.','error');const p=pecaDe(l.peca),t=tipoDePeca(p||{}),tr=p?tracoDaPeca(p):null,st=situacaoLote(l),es=ensaiosDe(cod),RS=rastreio(),subs=subLotes(l),h=hoje0(),lb=liberacaoLote(l);
  const lib=addD(dt(l.data)||h,num(p&&p.cura!=null&&p.cura!==''?p.cura:t.cura||7)),liberado=lb.k==='ok',op=l.it.ordem?ordens().find(o=>String(o.rowid)===String(l.it.ordem)):null;
  const x=p?calc(p,1):null,peso=x?x.peso:0,unid=subs.length&&subs[0].modo==='unidade',ent=subs.reduce((a,s)=>a+(RS.porSub[s.cod]||[]).reduce((b,c)=>b+c.qtd,0),0);
  const tile=(ic,rot,val,sub)=>`<div class="pm-ltile"><i class="fas ${ic}"></i><small>${rot}</small><b>${val}</b>${sub?`<span>${sub}</span>`:''}</div>`;
  const sit=s=>{const r=RS.porSub[s.cod]||[],e=r.reduce((a,b)=>a+b.qtd,0);return e>=s.qtd?pill('entregue — '+r.map(z=>fe(z.cliente||'')+' '+brDe(dt(z.data)).slice(0,5)).join(', '),'ok','fa-truck'):e>0?pill(`${nf(e,0)} entregue(s) · ${nf(s.qtd-e,0)} no pátio`,'warn'):pill('no pátio · '+(lb.k==='ok'?'liberado':lb.k==='bloq'?'bloqueado':lb.k==='ens'?'falta o ensaio':'em cura'),lb.k==='ok'?'ok':lb.k==='bloq'?'err':lb.k==='ens'?'warn':'info','fa-warehouse');};
  const cons=Object.entries(l.it.consumo||{}).filter(([,q])=>num(q)>0).map(([k,q])=>`${fe(insDe(k).nome.split(' (')[0])} ${nf(num(q),2)} ${insDe(k).un}`).join(' · ');
  const corLb=lb.k==='ok'?'background:#ECFDF3;border-color:#ABEFC6;color:#05603A':lb.k==='bloq'?'background:#FEF3F2;border-color:#FECDCA;color:#912018':lb.k==='ens'?'background:#FFFAEB;border-color:#FEDF89;color:#93370D':'background:#EFF8FF;border-color:#B2DDFF;color:#175CD3';
  janela(`Lote ${cod}`,`<div class="fin-aviso" style="margin:0 0 12px;${corLb}"><div style="display:flex;align-items:center;gap:10px"><i class="fas ${lb.ico}" style="font-size:20px"></i><div><b style="font-size:14.5px">${fe(lb.rot)}</b><br><small>Fabricado em ${fe(brDe(dt(l.data)))} · ${nf(lb.cura,0)} dias de cura${l.cp?` · ${nf(l.cp,0)} corpo(s) de prova`:' · sem corpo de prova'}</small></div></div></div>
    <div class="pm-form"><div><div data-th="${p?p.rowid:''}" class="pm-svgbox" style="background:#F8FAFC;border-radius:12px;min-height:150px">${iluPeca(p)}</div>
      <table class="pm-tab2" data-sem-ordem style="margin-top:8px"><tbody><tr><td>Peça</td><td><b>${fe(p?p.nome:'(excluída)')}</b> <small>${fe(p&&p.codigo||'')}</small></td></tr>
      <tr><td>Fabricação</td><td>${fe(brDe(dt(l.data)))}${(c2=>[c2.manha?' · manhã '+fe(c2.manha.toLowerCase()):'',c2.tarde?' · tarde '+fe(c2.tarde.toLowerCase()):''].join(''))(climaDe(l.r))}</td></tr>
      <tr><td>Traço</td><td>${fe(tr?tr.nome:'')} <small>${fe(tr&&tr.fck||'')}</small></td></tr>${op?`<tr><td>Ordem</td><td>OP nº ${fe(String(op.numero))}${op.cliente?' · '+fe(op.cliente):''}</td></tr>`:''}
      ${eqLista(l.r).length?`<tr><td>Equipe</td><td>${fe(eqLista(l.r).join(', '))}</td></tr>`:''}${cons?`<tr><td>Material usado</td><td><small style="font-size:12px;color:#344054">${cons}</small></td></tr>`:''}</tbody></table></div>
    <div><div class="pm-ltiles">${tile('fa-cubes','Quantidade',`${nf(l.qtd,0)} peças`,l.refugo?`${nf(l.refugo,0)} refugo`:'sem refugo')}${tile(unid?'fa-hashtag':'fa-pallet','Controle',unid?`${subs.length} unidades`:`${subs.length} palete(s)`,unid?'cada peça tem o seu número':`até ${nf(subs[0]?subs[0].pp:0,0)} peças por palete`)}
      ${tile('fa-weight-hanging','Peso do lote',`${nf(peso*l.qtd/1000,2)} t`,`${nf(peso,1)} kg por peça`)}${tile(lb.ico,'Liberação',fe(brDe(lib)),fe(lb.curto))}
      ${tile('fa-flask','Ensaio',st?fe(st.rot):'sem corpo de prova',l.cp?`${nf(l.cp,0)} CP(s)`:'')}${tile('fa-truck','Entregue',`${nf(ent,0)} de ${nf(l.qtd,0)}`,`${nf(l.qtd-ent,0)} no pátio`)}</div>
      <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas ${unid?'fa-hashtag':'fa-pallet'}"></i> ${unid?'Unidades':'Paletes'}</h5><div class="pm-rolar" style="max-height:240px;overflow:auto"><table class="pm-tab2" data-sem-ordem><thead><tr><th>Código</th><th class="n">Peças</th><th>Situação</th><th></th></tr></thead><tbody>
        ${subs.map(s=>`<tr data-sub="${fe(s.cod)}" ${s.cod===subDestaque?'style="background:#FFFAEB;outline:2px solid #FDB022"':''}><td><b>${fe(s.cod)}</b><small>${s.modo==='unidade'?`unidade ${s.i} de ${s.n}`:`palete ${s.i} de ${s.n}`}</small></td><td class="n">${nf(s.qtd,0)}</td><td>${sit(s)}</td><td><button type="button" class="gf-bt mini" data-etq-sub="${fe(s.cod)}" title="Etiqueta só deste ${unid?'item':'palete'}"><i class="fas fa-qrcode"></i></button></td></tr>`).join('')||'<tr><td colspan="4" class="pm-mini">Sem peças boas neste lote.</td></tr>'}</tbody></table></div></div>
      <div class="pm-bloco"><h5><i class="fas fa-flask"></i> Corpos de prova e ensaios</h5>${l.cp?'':'<p class="pm-mini" style="margin:0">Nenhum corpo de prova registrado neste lote.</p>'}
      ${es.length?`<table class="pm-tab2" data-sem-ordem><thead><tr><th>Idade</th><th>Data</th><th class="n">Resultado</th><th class="n">Esperado</th><th>Situação</th></tr></thead><tbody>${es.map(e=>`<tr class="pm-lin" data-ens="${e.rowid}"><td>${nf(num(e.idade),0)} dias</td><td>${fe(brDe(dt(e.data)))}</td><td class="n"><b>${nf(num(e.resultado),1)} MPa</b><small>${(e.valores||[]).map(v=>nf(v,1)).join(' · ')}</small></td><td class="n">${nf(num(e.esperado),1)} MPa</td><td>${pill(e.situacao==='aprovado'?'aprovado':e.situacao==='parcial'?'dentro do esperado':e.situacao==='abaixo'?'abaixo do esperado':'reprovado',e.situacao==='aprovado'||e.situacao==='parcial'?'ok':e.situacao==='abaixo'?'warn':'err')}</td></tr>${e.metodo||e.tipo_cp||e.responsavel?`<tr class="pm-lin" data-ens="${e.rowid}"><td colspan="5" style="padding-top:0"><small style="font-size:11.5px;color:#475467;white-space:normal"><i class="fas fa-clipboard-check"></i> ${[e.tipo_cp,e.laboratorio?'laboratório: '+e.laboratorio:'',e.responsavel?'por '+e.responsavel:''].filter(Boolean).map(fe).join(' · ')}${e.metodo?`<br>${fe(e.metodo)}`:''}</small></td></tr>`:''}`).join('')}</tbody></table>`:''}</div></div></div>`,
    [{html:'<i class="fas fa-qrcode"></i> Etiquetas',acao:async()=>{setTimeout(()=>formEtiquetas(cod),60);}},
     ...(l.cp?[{html:'<i class="fas fa-flask"></i> Registrar ensaio',cls:'pri',acao:async()=>{setTimeout(()=>formEnsaio(cod,null),60);}}]:[])],1000);
  const jb=document.querySelector('#fin-jan .fin-jan-corpo');if(jb&&subDestaque){const rs=[...jb.querySelectorAll('[data-sub]')].find(x=>x.dataset.sub===subDestaque);if(rs)setTimeout(()=>rs.scrollIntoView({block:'center'}),250);}
  if(jb){pintarFotos(jb);jb.addEventListener('click',ev=>{const r=ev.target.closest('[data-ens]');if(r){const e=T('ensaio').find(x=>String(x.rowid)===r.dataset.ens);document.getElementById('fin-ov').classList.remove('open');return setTimeout(()=>formEnsaio(cod,e),60);}
    const b=ev.target.closest('[data-etq-sub]');if(b)imprimirEtiquetas(cod,{so:[b.dataset.etqSub],mk:unid?'g':'g',ini:1,copias:1}).catch(e=>toast(e.message,'error'));});}
}
/* ensaio de compressão dos corpos de prova: o procedimento padrão (NBR 5738 moldagem e cura; NBR 5739 ruptura) */
const TIPOS_CP=[['Cilíndrico 10 × 20 cm',7853.98],['Cilíndrico 15 × 30 cm',17671.46],['Testemunho extraído da peça',7853.98]];
const PROC_PADRAO='Corpos de prova cilíndricos 10 × 20 cm moldados com o concreto do lote no dia da produção (NBR 5738): 2 camadas com 12 golpes de haste cada, topo rasado e identificado com o número do lote. Cura inicial de 24 h na forma, na sombra e protegidos do vento; depois desmoldados e mantidos em cura úmida (tanque com água) até a data do ensaio. Topos retificados ou capeados. Ruptura à compressão em prensa calibrada, carregamento contínuo de 0,45 MPa por segundo até romper (NBR 5739). Resistência de cada CP = carga de ruptura ÷ área da seção (CP 10 × 20: MPa = kN × 0,1273). Resultado do exemplar = o maior valor entre os CPs da mesma idade.';
const GUIA_ENSAIO=`<details class="pm-guia"><summary><i class="fas fa-book-open"></i> Como fazer o ensaio — passo a passo</summary><ol>
  <li><b>Moldar no dia da produção</b> — pegue o concreto da betonada da peça e encha os moldes cilíndricos (10 × 20 cm, untados com desmoldante) em 2 camadas, com 12 golpes de haste em cada; rase o topo e escreva o número do lote. Molde 2 corpos de prova (CPs) para cada idade (7 e 28 dias).</li>
  <li><b>Cura</b> — deixe 24 h na forma, na sombra e protegido do vento; desmolde e guarde na água (tanque) ou em câmara úmida até o dia do ensaio.</li>
  <li><b>Preparar</b> — no dia, tire da água, retifique ou capeie os topos (planos e paralelos) e confira o diâmetro.</li>
  <li><b>Romper</b> — prensa calibrada, CP no centro, carga subindo devagar e sem parar (0,45 MPa por segundo) até romper; anote a carga máxima em kN.</li>
  <li><b>Calcular</b> — MPa = carga ÷ área. CP 10 × 20: MPa = kN × 0,1273 · CP 15 × 30: MPa = kN × 0,0566 (use o conversor).</li>
  <li><b>Avaliar</b> — vale o maior resultado da mesma idade. Aos 7 dias espera-se cerca de 65% do fck; aos 28 dias tem que atingir o fck do traço. Abaixo disso: separe as peças do lote e chame o responsável técnico.</li>
  <li><b>Registrar</b> — informe aqui a data, cada CP em MPa, como foi feito, quem fez e o laboratório; laboratório de fora: guarde o laudo.</li></ol></details>`;
function formEnsaio(cod,reg){
  const l=loteInfo(cod);if(!l)return toast('Lote não encontrado.','error');const p=pecaDe(l.peca),tr=p?tracoDaPeca(p):null,d0=dt(l.data)||hoje0();
  const ateHoje=d=>isoDe(d>hoje0()?hoje0():d),b=reg||{idade:28,data:ateHoje(addD(d0,28)),valores:Array(Math.max(1,Math.min(6,l.cp||2))).fill(''),fck:fckDe(tr)||'',laboratorio:'',tipo_cp:TIPOS_CP[0][0],responsavel:'',metodo:''};
  const cpIn=(v,i)=>`<div class="fin-fld"><label>CP ${i+1} (MPa)</label><input data-cpv inputmode="decimal" data-num="dec" data-sem-mascara="1" value="${v!==''&&v!=null?fe(String(v).replace('.',',')):''}" placeholder="0,0"></div>`;
  const j=janela(reg?`Ensaio do lote ${cod}`:`Registrar ensaio — lote ${cod}`,`<div class="fin-resumo">${fe(p?p.nome:'')} · fabricado em ${fe(brDe(d0))} · ${fe(tr?tr.nome:'')}</div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Idade do ensaio</label><select data-k="idade">${[3,7,14,28,63].map(x=>`<option value="${x}" ${x===num(b.idade)?'selected':''}>${x} dias</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Data do ensaio <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>fck exigido (MPa) <span class="obg">*</span></label><input data-k="fck" inputmode="decimal" data-num="dec" data-sem-mascara="1" value="${b.fck!==''?fe(String(b.fck).replace('.',',')):''}"></div>
      <div class="fin-fld"><label>Laboratório</label><input data-k="laboratorio" value="${fe(b.laboratorio||'')}" placeholder="Ex.: próprio, laboratório da cidade"></div>
      <div class="fin-fld"><label>Tipo de corpo de prova <span class="obg">*</span></label><select data-k="tipo_cp">${TIPOS_CP.map(([t])=>`<option ${t===(b.tipo_cp||TIPOS_CP[0][0])?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quem fez o ensaio <span class="obg">*</span></label><input data-k="responsavel" value="${fe(b.responsavel||'')}" placeholder="nome do responsável"></div></div>
    <div class="fin-linha" data-cps style="margin-top:6px">${(b.valores||['']).map(cpIn).join('')}</div><button type="button" class="gf-bt mini" data-pmf="cp-add" style="margin-top:6px"><i class="fas fa-plus"></i> Corpo de prova</button>
    <div class="pm-conv"><i class="fas fa-calculator"></i> A prensa mostra em kN? <input data-kn inputmode="decimal" data-num="dec" placeholder="carga"> kN = <b data-kn-r>—</b> MPa <small data-kn-t></small></div>
    <div class="fin-fld" style="margin-top:8px"><label>Como o ensaio foi feito <span class="obg">*</span></label><textarea data-k="metodo" rows="3" placeholder="Moldagem, cura, preparo dos topos, prensa e velocidade de carga, como calculou">${fe(b.metodo||'')}</textarea><button type="button" class="gf-bt mini" data-pmf="proc" style="margin-top:6px;align-self:flex-start"><i class="fas fa-wand-magic-sparkles"></i> Usar o procedimento padrão</button></div>
    ${GUIA_ENSAIO}
    <div class="fin-fld" style="margin-top:8px"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}"></div><div class="fin-aviso" style="margin-top:8px"><div data-en-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Ensaio de ${reg.idade} dias do lote ${cod}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar ensaio',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const r=ler(jj);if(!r.data)throw new Error('Informe a data do ensaio.');if(!r.responsavel)throw new Error('Informe quem fez o ensaio.');if(r.metodo.length<20)throw new Error('Descreva como o ensaio foi feito (ou use o procedimento padrão).');
      if(!l.cp)return trava('Lote sem corpo de prova',[{ok:false,txt:`O lote ${cod} não tem corpos de prova registrados. Abra o dia de produção e informe quantos CPs foram moldados (coluna CPs).`}]);
      const minD=isoDe(addD(dt(l.data)||hoje0(),Math.max(0,r.idade-1)));if(r.data<minD)return trava(`Ensaio de ${r.idade} dias antes da hora`,[{ok:false,txt:`O lote foi moldado em ${brDe(dt(l.data))}: o ensaio de ${r.idade} dias só pode ser a partir de ${brDe(dt(minD))}.`}]);
      if(r.valores.length>num(l.cp))return trava('Mais resultados do que corpos de prova',[{ok:false,txt:`O lote tem ${nf(num(l.cp),0)} CP(s) moldado(s) e foram informados ${r.valores.length} resultados.`}]);if(r.data>hojeISO())throw new Error('A data do ensaio não pode ser no futuro: registre no dia em que o laboratório romper os corpos de prova.');if(!r.valores.length)throw new Error('Informe o resultado de ao menos um corpo de prova.');if(!(r.fck>0))throw new Error('Informe o fck exigido.');if(r.valores.some(x=>x>120)||r.fck>120)throw new Error('Resistência acima de 120 MPa: confira o valor (em MPa, não em kgf).');
      await gravar({...(reg||{tipo:'ensaio',data_lancamento:todayDateTime()}),lote:cod,peca:l.peca,data_moldagem:l.data,...r,por:eu()},reg?reg.rowid:null);
      toast(r.situacao==='reprovado'?'Ensaio registrado: lote REPROVADO — separe as peças e avalie com o responsável técnico.':'Ensaio registrado.',r.situacao==='reprovado'?'error':'success');}}],640);
  function ler(jj){const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),pf=s=>{const n=parseFloat(String(s).replace(',','.'));return isFinite(n)?n:0;};
    const idade=num(g('idade')),valores=[...jj.querySelectorAll('[data-cpv]')].map(e=>pf(e.value)).filter(v=>v>0),fck=pf(g('fck')),resultado=valores.length?Math.max(...valores):0,esperado=r2(fck*(FAT_IDADE[idade]||1));
    const situacao=resultado>=esperado-1e-9?(idade>=28?'aprovado':'parcial'):(idade>=28?'reprovado':'abaixo');return {idade,data:g('data'),valores,fck,resultado,esperado,situacao,laboratorio:g('laboratorio'),obs:g('obs'),tipo_cp:g('tipo_cp'),responsavel:g('responsavel'),metodo:g('metodo')};}
  const at=()=>{const r=ler(j),e=j.querySelector('[data-en-prev]');if(!e)return;e.innerHTML=!r.valores.length?`Informe a resistência de cada corpo de prova. Aos ${r.idade} dias o esperado é <b>${nf(r.esperado,1)} MPa</b>${r.idade<28?` (${nf((FAT_IDADE[r.idade]||1)*100,0)}% do fck)`:''}.`
      :`Resultado do exemplar (o maior): <b>${nf(r.resultado,1)} MPa</b> · esperado ${nf(r.esperado,1)} MPa → <b style="color:${r.situacao==='aprovado'||r.situacao==='parcial'?'#067647':'#B42318'}">${r.situacao==='aprovado'?'APROVADO':r.situacao==='parcial'?'dentro do esperado':r.situacao==='abaixo'?'abaixo do esperado — acompanhe o de 28 dias':'REPROVADO'}</b>.`;};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-k="idade"]')&&!reg)j.querySelector('[data-k="data"]').value=ateHoje(addD(d0,num(ev.target.value)));at();});
  corpo.addEventListener('click',ev=>{if(ev.target.closest('[data-pmf="cp-add"]')){const box=j.querySelector('[data-cps]');box.insertAdjacentHTML('beforeend',cpIn('',box.children.length));}
    if(ev.target.closest('[data-pmf="proc"]')){ev.preventDefault();const m=j.querySelector('[data-k="metodo"]');const tp=j.querySelector('[data-k="tipo_cp"]').value;m.value=tp===TIPOS_CP[0][0]?PROC_PADRAO:PROC_PADRAO.replace('cilíndricos 10 × 20 cm','do tipo '+tp.toLowerCase()).replace(' (CP 10 × 20: MPa = kN × 0,1273)','');m.dispatchEvent(new Event('input',{bubbles:true}));}});
  // conversor: carga da prensa (kN) → resistência (MPa) pela área do corpo de prova
  const conv=()=>{const kn=num(j.querySelector('[data-kn]').value),tp=j.querySelector('[data-k="tipo_cp"]').value,a=(TIPOS_CP.find(x=>x[0]===tp)||TIPOS_CP[0])[1];j.querySelector('[data-kn-r]').textContent=kn>0?nf(kn*1000/a,1):'—';j.querySelector('[data-kn-t]').textContent=`(${tp.toLowerCase()}: área ${nf(a,0)} mm²)`;};
  corpo.addEventListener('input',conv);corpo.addEventListener('change',conv);conv();at();
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
  const l=loteInfo(cod);if(!l)return toast('Lote não encontrado.','error');const subs=subLotes(l),unid=subs.length&&subs[0].modo==='unidade';
  if(!subs.length)return toast('Este lote não tem peças boas para etiquetar.','error');
  janela(`Etiquetas — lote ${cod}`,`<div class="fin-aviso"><div>${unid?`Uma etiqueta para <b>cada peça</b> (${subs.length} unidades, numeradas).`:`Uma etiqueta para <b>cada palete</b> (${subs.length} palete(s), com a quantidade de peças de cada um).`}</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Cópias por ${unid?'peça':'palete'}</label><select data-k="cop">${[1,2,4].map(n=>`<option value="${n}" ${n===(unid?1:2)?'selected':''}>${n}${n===2&&!unid?' (uma de cada lado)':''}</option>`).join('')}</select></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Modelo da folha</label><select data-k="m">${Object.entries(ETQ).map(([k,x])=>`<option value="${k}" ${k===(unid?'p':'g')?'selected':''}>${x.rot}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Começar na etiqueta nº</label><input data-k="ini" inputmode="numeric" data-num="int" value="1" title="Para aproveitar uma folha já usada"></div></div>
    <p class="pm-mini">Cada etiqueta leva o logo, a peça, o lote e o ${unid?'número da unidade':'número do palete e a quantidade'}, as datas de fabricação e liberação, o traço e um QR Code com esses dados.</p>`,
    [{html:'<i class="fas fa-print"></i> Imprimir etiquetas',cls:'pri',acao:async j=>{await imprimirEtiquetas(cod,{copias:num(j.querySelector('[data-k="cop"]').value)||1,mk:j.querySelector('[data-k="m"]').value,ini:Math.max(1,num(j.querySelector('[data-k="ini"]').value)||1)});}}],620);
}
async function imprimirEtiquetas(cod,op){
  op=op||{};const l=loteInfo(cod),p=pecaDe(l.peca),t=tipoDePeca(p||{}),tr=p?tracoDaPeca(p):null,M=ETQ[op.mk]||ETQ.p,porFolha=M.cols*M.rows;
  let subs=subLotes(l);if(op.so)subs=subs.filter(s=>op.so.includes(s.cod));const cop=Math.max(1,op.copias||1),ini=Math.max(1,op.ini||1);
  if(!subs.length)throw new Error('Nada para etiquetar.');if(subs.length*cop>600)throw new Error('Mais de 600 etiquetas: imprima por partes (escolha o palete/unidade na ficha do lote).');
  const lib=addD(dt(l.data)||hoje0(),num(p&&p.cura!=null&&p.cura!==''?p.cura:t.cura||7));
  const w=window.open('','_blank');if(!w)throw new Error('Permita pop-ups deste site para imprimir as etiquetas.');
  w.document.write('<p style="font:14px Arial;padding:20px">Montando as etiquetas…</p>');
  try{await carregarQR();}catch(e){w.close();throw e;}
  const logo=typeof PDF_LOGO_FULL_B64!=='undefined'?PDF_LOGO_FULL_B64:'',um=[];
  subs.forEach(s=>{const id=s.modo==='unidade'?`Unidade ${s.i}/${s.n}`:`Palete ${s.i}/${s.n} — ${nf(s.qtd,0)} peças`;
    // o QR Code abre o sistema direto na ficha do lote (com a situação de cura e ensaio do dia em que for lido)
    const txt=`${location.origin}/?lote=${encodeURIComponent(cod)}&p=${encodeURIComponent(s.cod)}`;
    const e=`<div class="e"><div class="tx"><img src="${logo}" class="lg" alt=""><b class="nm">${fe(p?p.nome:'')}</b><div class="cd">${fe(s.cod)}</div><div class="ln"><b>${fe(id)}</b></div>
      <div class="ln">Fab. ${fe(brDe(dt(l.data)))} · Lib. ${fe(brDe(lib))}</div><div class="ln">${fe(tr?tr.nome.split(' — ')[0]:'')}${tr&&tr.fck?' · '+fe(tr.fck):''}</div><div class="ln sc">Leia o QR: situação da cura</div></div><div class="qr">${qrSvg(txt)}</div></div>`;
    for(let c=0;c<cop;c++)um.push(e);});
  const tot=um.length+ini-1,folhas=Math.ceil(tot/porFolha);let h='';
  for(let f=0;f<folhas;f++){h+='<section class="fl">';for(let i=0;i<porFolha;i++){const k=f*porFolha+i;h+=k<ini-1||k>=tot?'<div class="e v"></div>':um[k-ini+1];}h+='</section>';}
  w.document.open();w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas ${fe(cod)}</title><style>
    @page{size:A4;margin:0;} *{box-sizing:border-box;} body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f;}
    .fl{width:210mm;height:297mm;padding:${M.mt}mm 0 0 ${M.ml}mm;display:grid;grid-template-columns:repeat(${M.cols},${M.w}mm);grid-auto-rows:${M.h}mm;column-gap:${M.gx}mm;row-gap:${M.gy}mm;page-break-after:always;}
    .fl:last-child{page-break-after:auto;}
    .e{display:flex;gap:2mm;align-items:center;padding:2.2mm 2.6mm;overflow:hidden;border:0.2mm dashed #d0d5dd;border-radius:2mm;} .e.v{border-color:transparent;}
    .tx{flex:1;min-width:0;font-size:${op.mk==='g'?9:6.6}pt;line-height:1.22;} .lg{height:${op.mk==='g'?8:5}mm;display:block;margin-bottom:.8mm;}
    .nm{display:block;font-size:${op.mk==='g'?10.5:7.6}pt;line-height:1.15;max-height:2.3em;overflow:hidden;} .cd{font-size:${op.mk==='g'?12:8.4}pt;font-weight:800;letter-spacing:.02em;margin:.6mm 0;}
    .ln{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .ln.sc{color:#667085;font-style:italic;} .qr{width:${M.qr}mm;height:${M.qr}mm;flex:none;} @media print{.e{border-color:transparent;}}
  </style></head><body>${h}<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);w.document.close();
}

/* ═══════════════ DIÁRIO DE PRODUÇÃO ═══════════════ */
// ponto: horas de cada pessoa no dia (saída − entrada − intervalo; virada da meia-noite conta)
const minDe=t=>{const [h,m]=String(t||'').split(':').map(Number);return isFinite(h)?h*60+(m||0):NaN;};
const horasDe=(e,s,i)=>{let a=minDe(e),b=minDe(s);if(!isFinite(a)||!isFinite(b))return 0;if(b<a)b+=1440;return Math.max(0,(b-a-num(i))/60);};
const SIT_PT={presente:['Presente','ok'],falta:['Falta','err'],atestado:['Atestado','warn'],folga:['Folga','']};
const jornada=()=>{const j={entrada:'07:00',saida:'17:00',intervalo:60,...(CFG().jornada||{})};j.horas=horasDe(j.entrada,j.saida,j.intervalo);return j;};
// registro do ponto do dia (versões antigas: só a lista de nomes = presentes)
const pontoDe=r=>(Array.isArray(r.ponto)&&r.ponto.length?r.ponto:eqLista(r).map(nome=>({nome}))).map(x=>({...x,status:x.status||'presente'}));
const presentes=r=>pontoDe(r).filter(x=>x.status==='presente');
const iniciais=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');
function pontoMes(k){const jr=jornada(),P={};
  T('producao').filter(r=>{const d=dt(r.data);return d&&mesKey(d)===k;}).forEach(r=>pontoDe(r).forEach(x=>{const y=P[x.nome]=P[x.nome]||{nome:x.nome,funcao:x.funcao||'',dias:0,horas:0,extras:0,atrasos:0,falta:0,atestado:0,folga:0};
    if(x.status==='presente'){y.dias++;const hh=num(x.horas)||horasDe(x.entrada,x.saida,x.intervalo);y.horas+=hh;y.extras+=Math.max(0,hh-jr.horas);if(x.entrada&&minDe(x.entrada)>minDe(jr.entrada)+10)y.atrasos++;}else y[x.status]=(y[x.status]||0)+1;}));
  return Object.values(P).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));}
// lista com várias linhas: a opção já escolhida numa linha fica bloqueada (cinza) nas outras — o item não se repete
function semRepetir(box,sel){if(!box)return;const ss=[...box.querySelectorAll(sel)],usados=new Set(ss.map(s=>s.value).filter(Boolean));
  ss.forEach(s=>[...s.options].forEach(o=>{o.disabled=!!o.value&&o.value!==s.value&&usados.has(o.value);}));}
// próxima opção livre (para a linha nova)
const livreDe=(box,sel,todas)=>{const u=new Set([...box.querySelectorAll(sel)].map(s=>s.value));return todas.find(v=>!u.has(String(v)));};
const repetido=L=>{const v=new Set();for(const x of L){if(v.has(String(x)))return x;v.add(String(x));}return null;};
/* ── feriados: nacionais, da Bahia (2 de julho), os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) e os da cidade (Parâmetros) ── */
const pascoaDe=a=>{const b=a%19,c=Math.floor(a/100),d=a%100,e=Math.floor(c/4),f=c%4,g=Math.floor((c+8)/25),h=Math.floor((c-g+1)/3),i=(19*b+c-e-h+15)%30,k=Math.floor(d/4),l=d%4,m=(32+2*f+2*k-i-l)%7,n=Math.floor((b+11*i+22*m)/451),x=i+m-7*n+114;return new Date(a,Math.floor(x/31)-1,x%31+1);};
function feriadosDe(a){const m={};
  [['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['07-02','Independência da Bahia'],['09-07','Independência do Brasil'],['10-12','N. Sra. Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal']].forEach(([d,n])=>m[`${a}-${d}`]=n);
  const p=pascoaDe(a);[[-48,'Carnaval'],[-47,'Carnaval'],[-2,'Sexta-feira Santa'],[60,'Corpus Christi']].forEach(([k,n])=>m[isoDe(addD(p,k))]=n);
  // da cidade: uma linha por feriado, "dd/mm Nome" (Parâmetros › Feriados da cidade)
  String(CFG().feriados_cidade||'').split(/\n+/).forEach(l=>{const x=l.match(/^\s*(\d{1,2})\/(\d{1,2})\s*[-–:]?\s*(.*)$/);if(x)m[`${a}-${x[2].padStart(2,'0')}-${x[1].padStart(2,'0')}`]=x[3].trim()||'Feriado da cidade';});
  return m;}
/* calendário para escolher o dia do diário: dia já registrado não dá para escolher; sábado, domingo e feriado aparecem marcados */
// o mês vem do seletor do diário (no calendário ele só aparece, para sinalizar)
function escolherDiaProducao(aoEscolher,kIni){
  const adm=ehAdm(),hj=hojeISO(),kHoje=hj.slice(0,7);let k=kIni||PM.mes||kHoje;if(k>kHoje)k=kHoje;
  const [y0,m0]=k.split('-').map(Number),rotMes=`${MESES_PT[m0-1].replace(/^./,c=>c.toUpperCase())} de ${y0}`;
  const p=sobre(`<div class="pm-pop-box pm-cl" style="max-width:580px"><div class="pm-pop-cab"><b class="pm-cl-tit"><span class="pm-cl-chip"><i class="fas fa-calendar"></i> ${fe(rotMes)}</span>Qual dia vai registrar?</b><button type="button" class="pm-x" data-pop-x><i class="fas fa-xmark"></i></button></div><div data-cl></div></div>`,
    (ev,fechar)=>{const b=ev.target.closest('[data-dia]');if(b&&!b.disabled){fechar();(aoEscolher||(iso=>formProducao(null,{data:iso})))(b.dataset.dia);}});
  function pintar(){
    const [y,m]=k.split('-').map(Number),ini=new Date(y,m-1,1),nd=new Date(y,m,0).getDate(),fer=feriadosDe(y),reg=new Map(T('producao').filter(r=>String(r.data||'').startsWith(k)).map(r=>[r.data,r]));
    let cel='';for(let i=0;i<ini.getDay();i++)cel+='<span class="pm-cd vz"></span>';let livres=0;
    for(let d=1;d<=nd;d++){const iso=`${k}-${String(d).padStart(2,'0')}`,dw=new Date(y,m-1,d).getDay(),r=reg.get(iso),fr=fer[iso],fut=iso>hj,enc=!adm&&!r&&passouHora(iso),fds=dw===0||dw===6;
      const st=r?'reg':fut?'fut':enc?'enc':'livre';if(st==='livre')livres++;
      const tit=r?`Já registrado${diaFechado(r)?' e fechado':''}: abra o dia na lista do diário para ver ou alterar`:fut?'Este dia ainda não chegou':enc?'Encerrado às 19h: só o Administrador registra este dia':'Registrar este dia';
      cel+=`<button type="button" class="pm-cd ${st}${fds?' fds':''}${fr?' fer':''}${iso===hj?' hoje':''}" data-dia="${iso}" ${st!=='livre'?'disabled':''} title="${fe(tit+(fr?' · Feriado: '+fr:fds?' · '+(dw===0?'Domingo':'Sábado'):''))}"><b>${d}</b>${r?'<i class="fas fa-circle-check"></i>':''}<small>${fr?fe(fr):r?'registrado':iso===hj?'hoje':''}</small></button>`;}
    const nReg=reg.size;
    p.d.querySelector('[data-cl]').innerHTML=`<div class="pm-cl-sem">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((x,i)=>`<span class="${i===0||i===6?'fs':''}">${x}</span>`).join('')}</div><div class="pm-cl-grid">${cel}</div>
      <div class="pm-cl-leg"><div><span style="--c:#ECFDF3;--b:#ABEFC6">Registrado</span><span style="--c:#F2F4F7;--b:#E4E7EC">Sábado e domingo</span><span style="--c:#FEF3F2;--b:#FECDCA">Feriado</span><span style="--c:#fff;--b:#1652D8">Hoje</span></div>
        <em><b>${nReg}</b> registrado${nReg===1?'':'s'} · <b>${livres}</b> livre${livres===1?'':'s'}</em></div>
      ${adm?'':'<p class="pm-mini" style="margin:-6px 18px 12px">Dia apagado: ainda não chegou ou já encerrou às 19h (só o Administrador registra).</p>'}
      ${livres?'':`<p class="pm-mini" style="margin:0 18px 14px">Nenhum dia livre neste mês para você registrar. Para outro mês, troque o mês no diário.</p>`}`;}
  pintar();return p;}
// pergunta com "Sim, …" e "Não" (janela por cima, sem fechar a que está aberta) — devolve true/false
function simNao(titulo,msg,rotSim,icone){return new Promise(ok=>{let r=false;const p=sobre(`<div class="pm-pop-box" style="max-width:460px"><div class="pm-pop-cab"><b>${icone?`<i class="fas ${icone}" style="color:#1652D8"></i> `:''}${fe(titulo)}</b><button type="button" class="pm-x" data-pop-x><i class="fas fa-xmark"></i></button></div>
  <div style="padding:14px 16px 16px"><div style="font-size:13.5px;line-height:1.55;margin:0 0 16px">${msg}</div><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="gf-bt" data-pop-x>Não</button><button type="button" class="gf-bt pri" data-pop-ok>${fe(rotSim)}</button></div></div></div>`,
  (ev,fechar)=>{if(ev.target.closest('[data-pop-ok]')){r=true;fechar();}});
  new MutationObserver((m,obs)=>{if(!p.d.isConnected){obs.disconnect();ok(r);}}).observe(document.body,{childList:true});});}
const msgFechar=r=>`O diário de <b>${fe(brDe(dt(r.data)))}</b> não poderá mais ser alterado (equipe, ponto, peças e lotes ficam como estão). <b>Só o Administrador pode reabrir.</b><br><br>Deseja realmente fechar o dia?`;
async function fecharDia(r,auto){
  const o={...r,fechado:{em:todayDateTime(),por:auto?'Fechamento automático (19h)':eu(),auto:!!auto},aberto_ate:''};await gravar(o,r.rowid);}
async function confirmarFecharDia(r){if(!r)return;if(diaFechado(r))return toast('Este dia já está fechado.','success');
  if(!(await simNao(`Fechar o dia ${brDe(dt(r.data))}?`,msgFechar(r),'Sim, fechar','fa-lock')))return;
  try{await fecharDia(r,false);toast(`Dia ${brDe(dt(r.data))} fechado.`,'success');}catch(e){toast(e.message||String(e),'error');}}
async function reabrirDia(r){if(!r)return;if(!ehAdm())return toast('Só o Administrador reabre um dia fechado.','error');
  if(!(await simNao(`Reabrir o dia ${brDe(dt(r.data))}?`,`O diário volta a poder ser alterado. Ele fica aberto por <b>1 hora</b> e depois fecha sozinho de novo (ou feche antes, em <b>Fechar o dia</b>).`,'Sim, reabrir','fa-lock-open')))return;
  const ate=new Date(Date.now()+3600e3);
  try{await gravar({...r,fechado:null,reaberto:{em:todayDateTime(),por:eu()},aberto_ate:ate.toISOString()},r.rowid);toast(`Dia ${brDe(dt(r.data))} reaberto até ${String(ate.getHours()).padStart(2,'0')}:${String(ate.getMinutes()).padStart(2,'0')}.`,'success');}catch(e){toast(e.message||String(e),'error');}}
/* às 19h o diário aberto fecha sozinho. Quem estiver com o sistema aberto vê o aviso; os dias que ficaram abertos
   (ninguém estava conectado às 19h) fecham na próxima vez que alguém abrir o sistema. O Administrador que reabre ganha 1 hora. */
const nivelFab=()=>{const s=(typeof Auth!=='undefined'&&Auth._session)||null;if(!s)return 'nenhum';if(UI._ehAdmin&&UI._ehAdmin(s.perfil))return 'excluir';return UI.permNivel?UI.permNivel('premoldados'):'nenhum';};
const lerSess=k=>{try{return sessionStorage.getItem(k);}catch(e){return null;}},gravarSess=(k,v)=>{try{sessionStorage.setItem(k,v);}catch(e){}};
let fechandoDias=false;
async function fecharDiasVencidos(){
  if(fechandoDias||!(App&&App.state&&App.state.data))return;const nv=nivelFab();if(nv==='nenhum')return;
  const agora=new Date(),fMes=CFG().fechado_ate,hj=hojeISO();
  const L=T('producao').filter(r=>r.data&&!diaFechado(r)&&passouHora(r.data)&&!(fMes&&r.data<=fMes)&&!(r.aberto_ate&&new Date(r.aberto_ate)>agora));
  const fechei=[];
  if(L.length&&nv!=='ver'){fechandoDias=true;try{for(const r of L){try{await fecharDia(r,true);fechei.push(r.data);}catch(e){}}}finally{fechandoDias=false;}}
  // aviso: às 19h (uma vez por dia neste navegador, para quem tem o diário de hoje) ou quando este computador fechou dias que tinham ficado abertos
  const k='pm-aviso19-'+hj,hojeReg=T('producao').some(r=>r.data===hj),dias=[...new Set(fechei)].sort();
  if(agora.getHours()>=HORA_FECHA&&hojeReg&&!lerSess(k)){gravarSess(k,'1');avisoFechamento(dias.includes(hj)?dias:[hj].concat(dias));}
  else if(dias.length)avisoFechamento(dias);
}
function avisoFechamento(dias){
  document.querySelectorAll('.pm-aviso19').forEach(x=>x.remove());const hj=hojeISO(),soHoje=dias.length===1&&dias[0]===hj;
  const d=document.createElement('div');d.className='pm-pop pm-aviso19';
  d.innerHTML=`<div class="pm-pop-box" style="max-width:440px;text-align:center"><div style="padding:22px 22px 18px"><div style="width:54px;height:54px;border-radius:16px;margin:0 auto 12px;display:grid;place-items:center;background:linear-gradient(135deg,#1652D8,#2E90FA);color:#fff;font-size:22px;box-shadow:0 10px 20px -10px rgba(22,82,216,.9)"><i class="fas fa-lock"></i></div>
    <b style="font:800 17px Manrope,Inter,sans-serif;display:block;margin-bottom:6px">Diário de produção fechado</b>
    <p style="margin:0 0 16px;font-size:13.5px;line-height:1.55;color:#475467">${soHoje?`O dia de hoje (<b>${fe(brDe(dt(hj)))}</b>) foi fechado às <b>19h</b>.`:`Foram fechados os dias: <b>${dias.map(x=>fe(brDe(dt(x)))).join(', ')}</b>.`} Para alterar, peça ao Administrador para reabrir o dia.</p>
    <button type="button" class="gf-bt pri" data-pop-x style="min-width:140px;justify-content:center">Entendi</button></div></div>`;
  document.body.appendChild(d);d.addEventListener('click',ev=>{if(ev.target.closest('[data-pop-x]'))d.remove();});
  if(document.querySelector('#pm-app'))try{render();}catch(e){}
}
setInterval(()=>{fecharDiasVencidos().catch(()=>{});},30000);setTimeout(()=>{fecharDiasVencidos().catch(()=>{});},6000);
/* QR Code da etiqueta (…/?lote=CÓDIGO&p=PALETE): guarda o pedido (sobrevive ao login) e, quando o sistema carrega,
   abre a ficha do lote com a situação de cura e do ensaio. */
(function(){
  try{const u=new URLSearchParams(location.search),q=u.get('lote');if(q){gravarSess('pm-abrir-lote',JSON.stringify({lote:q,sub:u.get('p')||''}));history.replaceState(null,'',location.pathname+location.hash);}}catch(e){}
  let n=0;const t=setInterval(()=>{n++;let pd=null;try{pd=JSON.parse(lerSess('pm-abrir-lote')||'null');}catch(e){}if(!pd||n>900){clearInterval(t);return;}
    if(!(typeof App!=='undefined'&&App.state&&App.state.data)||nivelFab()==='nenhum')return;
    clearInterval(t);try{sessionStorage.removeItem('pm-abrir-lote');}catch(e){}
    try{UI.nav('pm-producao');PM.dVista='lotes';render();}catch(e){}
    setTimeout(()=>{if(loteInfo(pd.lote))fichaLote(pd.lote,pd.sub);else toast(`Lote ${pd.lote} não encontrado.`,'error');},600);},1000);
})();
function telaProducao(){
  const k=PM.mes,vista=PM.dVista||'dias',L=T('producao').filter(r=>{const d=dt(r.data);return d&&mesKey(d)===k;}).sort((a,b)=>String(b.data).localeCompare(String(a.data))||(+b.rowid-+a.rowid));
  const h=hoje0(),its=L.flatMap(itensProd),tot=its.reduce((s,it)=>s+num(it.qtd),0),ref=its.reduce((s,it)=>s+num(it.refugo),0),jr=jornada();
  const m3=its.reduce((s,it)=>{const p=pecaDe(it.peca);return s+(p?geoPeca(p).V*(num(it.qtd)+num(it.refugo)):0);},0),custo=its.reduce((s,it)=>s+num(it.custo_un)*num(it.qtd),0);
  const nDias=new Set(L.map(r=>r.data)).size,pm=pontoMes(k),horas=pm.reduce((s,x)=>s+x.horas,0),faltas=pm.reduce((s,x)=>s+x.falta,0);
  const lts=lotes(),comCP=lts.filter(l=>l.cp>0).map(l=>({l,st:situacaoLote(l)})),pend=comCP.filter(x=>x.st&&x.st.k!=='aprovado'),lim=addD(h,-45);
  const sub=`<div class="pm-sub">${[['dias','fa-calendar-days','Dias de produção'],['lotes','fa-tags','Lotes e cura'],['ponto','fa-user-clock','Ponto do mês'],['ensaios','fa-flask',`Ensaios${pend.length?` (${pend.length})`:''}`]].map(([v,ic,l])=>`<button type="button" class="gf-bt ${vista===v?'pri':''}" data-pm="dvista" data-v="${v}"><i class="fas ${ic}"></i> ${l}</button>`).join('')}</div>`;
  // o mês escolhido aqui vale para a lista e para o calendário do "Registrar o dia"
  const cab=cabG('Diário de produção','O dia da fábrica: equipe e ponto, betonadas, clima, ocorrências e as peças feitas. Cada peça do dia vira um lote (por palete ou por unidade), baixa os insumos e entra em cura.',
      `${GS.selMes(k,'data-pm-mes',12,0)}<button type="button" class="gf-bt pri" data-pm="prod-nova"><i class="fas fa-plus"></i> Registrar o dia</button>`)+
    `<div class="gf-kpis">${kpiG('','fa-cubes','Peças produzidas',nf(tot,0),`${nDias} dia(s) de produção no mês`)}${kpiG('','fa-fill-drip','Concreto',nf(m3,2)+' m³',nDias?`média ${nf(m3/nDias,2)} m³ por dia`:'—')}
      ${kpiG(ref&&ref/(tot+ref)>0.03?'vermelho':'verde','fa-heart-crack','Refugo',nf(ref,0)+' peças',tot+ref?`${nf(ref/(tot+ref)*100,1)}% da produção`:'—')}
      ${kpiG('roxo','fa-user-clock','Horas trabalhadas',nf(horas,1)+' h',horas?`${nf(tot/horas,1)} peças por hora · ${faltas} falta(s) no mês`:'marque o ponto no registro do dia')}
      ${kpiG(pend.some(x=>x.st.cor==='err')?'vermelho':pend.length?'laranja':'verde','fa-flask','Ensaios pendentes',nf(pend.length,0),pend.some(x=>x.st.cor==='err')?'há lote atrasado ou reprovado':'corpos de prova aguardando ensaio')}
      ${kpiG('laranja','fa-money-bill-wave','Custo produzido',R(custo),tot?`média ${R(custo/tot)} por peça`:'—')}</div>`+sub;
  if(vista==='ponto')return cab+`<section class="gf-sec"><div class="gf-sec-cab"><div><h3>Ponto da equipe — ${fe(mesNome(k))}</h3><p>Jornada padrão ${fe(jr.entrada)} às ${fe(jr.saida)} (${nf(jr.horas,1)} h). Hora extra = o que passa da jornada; atraso = entrada mais de 10 minutos depois.</p></div></div>
    ${pm.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Pessoa</th><th class="n">Dias trabalhados</th><th class="n">Horas</th><th class="n">Horas extras</th><th class="n">Atrasos</th><th class="n">Faltas</th><th class="n">Atestados</th><th class="n">Folgas</th></tr></thead><tbody>
      ${pm.map(x=>`<tr><td><span class="pm-av">${fe(iniciais(x.nome))}</span> <b>${fe(x.nome)}</b><small>${fe(x.funcao)}</small></td><td class="n">${x.dias}</td><td class="n">${nf(x.horas,1)} h</td><td class="n" style="${x.extras>0.01?'color:#B54708;font-weight:700':''}">${nf(x.extras,1)} h</td><td class="n">${x.atrasos||'—'}</td><td class="n" style="${x.falta?'color:#B42318;font-weight:700':''}">${x.falta||'—'}</td><td class="n">${x.atestado||'—'}</td><td class="n">${x.folga||'—'}</td></tr>`).join('')}
      <tr class="t"><td>Total</td><td class="n">${pm.reduce((s,x)=>s+x.dias,0)}</td><td class="n">${nf(horas,1)} h</td><td class="n">${nf(pm.reduce((s,x)=>s+x.extras,0),1)} h</td><td class="n">${pm.reduce((s,x)=>s+x.atrasos,0)}</td><td class="n">${faltas}</td><td class="n">${pm.reduce((s,x)=>s+x.atestado,0)}</td><td class="n">${pm.reduce((s,x)=>s+x.folga,0)}</td></tr></tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-user-clock"></i><p>Nenhum ponto marcado neste mês.</p></div>'}</section>`;
  // lotes e cura: o que já curou e está liberado (com o ensaio), o que ainda está em cura e o que está bloqueado
  if(vista==='lotes'){const RS=rastreio(),fl=PM.lFiltro||'todos',lim2=addD(h,-120);
    const LL=lts.map(l=>{const lb=liberacaoLote(l),ent=(RS.porLote[l.lote]||[]).reduce((s,x)=>s+x.qtd,0);return {l,lb,patio:Math.max(0,l.qtd-ent)};}).filter(x=>x.l.qtd>0&&(x.patio>0||dt(x.l.data)>=lim2)).sort((a,b)=>String(b.l.data).localeCompare(String(a.l.data)));
    const cnt=k=>LL.filter(x=>x.lb.k===k).length,FL=[['todos','Todos',LL.length],['cura','Em cura',cnt('cura')],['ens','Curados · falta ensaio',cnt('ens')],['ok','Liberados',cnt('ok')],['bloq','Bloqueados',cnt('bloq')]],V=fl==='todos'?LL:LL.filter(x=>x.lb.k===fl);
    return cab+`<section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas fa-tags" style="color:#1652D8"></i> Lotes e cura</h3><p><b>Liberado</b> = a cura terminou e o ensaio (quando o lote tem corpo de prova) está dentro do esperado: pode vender e entregar. <b>100% liberado</b> = ensaio de 28 dias aprovado. Lote reprovado fica <b>bloqueado</b> e sai do estoque pronto. Escaneie o QR Code da etiqueta com o celular para abrir a ficha do lote.</p></div></div>
      <div class="pm-sub" style="margin:0 0 10px">${FL.map(([k,l,n])=>`<button type="button" class="gf-bt mini ${fl===k?'pri':''}" data-pm="lfiltro" data-v="${k}">${l} (${n})</button>`).join('')}</div>
      ${V.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Lote</th><th>Peça</th><th>Fabricação</th><th class="n">Peças</th><th class="n">No pátio</th><th>Libera em</th><th>Situação</th><th></th></tr></thead><tbody>
      ${V.map(({l,lb,patio})=>`<tr class="pm-lin" data-pm="lote" data-lote="${fe(l.lote)}"><td><b>${fe(l.lote)}</b><small>${fe(resumoSub(l))}</small></td><td>${fe(nomePeca(l.peca))}</td><td>${fe(brDe(dt(l.data)))}</td><td class="n">${nf(l.qtd,0)}</td><td class="n">${nf(patio,0)}</td><td>${fe(brDe(lb.lib))}<small>${nf(lb.cura,0)} dias de cura</small></td><td>${pill(lb.curto,lb.cor,lb.ico)}</td><td><i class="fas fa-chevron-right" style="color:#98A2B3"></i></td></tr>`).join('')}</tbody></table></div>`
      :'<div class="gf-vazio"><i class="fas fa-tags"></i><p>Nenhum lote nesta situação.</p></div>'}</section>`;}
  if(vista==='ensaios'){const cpL=comCP.filter(x=>x.st&&(x.st.k!=='aprovado'||dt(x.l.data)>=lim)).sort((a,b)=>String(b.l.data).localeCompare(String(a.l.data))).slice(0,60);
    return cab+`<section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas fa-flask" style="color:#7A2FE0"></i> Corpos de prova e ensaios</h3><p>Rompimento aos 7 dias (esperado ≈ 65% do fck) e aos 28 dias (tem de atingir o fck do traço). Clique no lote para registrar o ensaio.</p></div></div>${GUIA_ENSAIO.replace('<details class="pm-guia">','<details class="pm-guia" style="margin:0 0 10px">')}
      ${cpL.length?`<div class="pm-rolar"><table class="pm-tab2"><thead><tr><th>Lote</th><th>Peça</th><th>Moldagem</th><th class="n">CPs</th><th>7 dias</th><th>28 dias</th><th>Situação</th></tr></thead><tbody>
      ${cpL.map(({l,st})=>{const e7=st.es.filter(e=>num(e.idade)<28).slice(-1)[0],e28=st.es.filter(e=>num(e.idade)>=28).slice(-1)[0],d=dt(l.data);
        return `<tr class="pm-lin" data-pm="lote" data-lote="${fe(l.lote)}"><td><b>${fe(l.lote)}</b></td><td>${fe(nomePeca(l.peca))}</td><td>${fe(brDe(d))}</td><td class="n">${nf(l.cp,0)}</td><td>${e7?`${nf(num(e7.resultado),1)} MPa`:`<small>${fe(brDe(addD(d,7)).slice(0,5))}</small>`}</td><td>${e28?`<b>${nf(num(e28.resultado),1)} MPa</b>`:`<small>${fe(brDe(addD(d,28)).slice(0,5))}</small>`}</td><td>${pill(st.rot,st.cor)}</td></tr>`;}).join('')}</tbody></table></div>`
      :'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Nenhum ensaio pendente. Informe os CPs (corpos de prova) ao registrar o dia.</p></div>'}</section>`;}
  const temHoje=L.some(r=>r.data===hojeISO()),fMes=CFG().fechado_ate;
  const dia=r=>{const d=dt(r.data),pt=pontoDe(r),pr=pt.filter(x=>x.status==='presente'),au=pt.filter(x=>x.status&&x.status!=='presente'),ii=itensProd(r),q=ii.reduce((s,it)=>s+num(it.qtd),0),rf=ii.reduce((s,it)=>s+num(it.refugo),0),
      hh=pr.reduce((s,x)=>s+(num(x.horas)||horasDe(x.entrada,x.saida,x.intervalo)),0),mm=ii.reduce((s,it)=>{const p=pecaDe(it.peca);return s+(p?geoPeca(p).V*(num(it.qtd)+num(it.refugo)):0);},0);
    const fech=diaFechado(r)||!!(fMes&&r.data<=fMes),cl=climaDe(r),f=r.fechado||{},hj=r.data===hojeISO();
    const st=fech?`<span class="pm-st-dia fe"><i class="fas fa-lock"></i> ${diaFechado(r)?`Fechado${f.auto?' às 19h (automático)':' por '+fe(f.por||'')}${f.em?' · '+fe(brDe(dt(String(f.em).slice(0,10))).slice(0,5))+' '+fe(String(f.em).slice(11,16)):''}`:'Mês fechado'}</span>`
      :`<span class="pm-st-dia ab"><i class="fas fa-lock-open"></i> Aberto${hj?' · fecha às 19h':''}</span>`;
    return `<article class="pm-dia2${fech?' fech':''}"><div class="pm-dia2-cab"><div class="pm-cal${fech?' fech':''}"><span class="m">${fe(MESES_PT[d.getMonth()].slice(0,3).toUpperCase())}</span><span class="d">${d.getDate()}</span><span class="s">${fe(SEM_PT[d.getDay()].split('-')[0])}</span></div>
      <div class="pm-dia2-meta"><div class="pm-dia2-tit"><b>${fe(SEM_PT[d.getDay()].replace(/^./,c=>c.toUpperCase()))}, ${d.getDate()} de ${fe(MESES_PT[d.getMonth()])}</b>${st}</div>
        <div class="pm-pills">${cl.manha?pill('Manhã: '+fe(cl.manha),'',CLI_ICO[cl.manha]||'fa-sun'):''}${cl.tarde?pill('Tarde: '+fe(cl.tarde),'',CLI_ICO[cl.tarde]||'fa-sun'):''}${num(r.betonadas)?pill(nf(num(r.betonadas),0)+' betonada(s)','','fa-blender'):''}${r.ocorrencia&&r.ocorrencia!=='Nenhuma'?pill(fe(r.ocorrencia),'warn','fa-triangle-exclamation'):''}</div>
        <div class="pm-dia2-num"><span><b>${nf(q,0)}</b> peças</span><span><b>${nf(mm,2)}</b> m³</span><span><b>${q+rf?nf(rf/(q+rf)*100,1):0}%</b> refugo</span><span><b>${nf(hh,1)}</b> h de equipe</span></div></div>
      <div class="pm-dia2-bt">${temHoje?'':`<button type="button" class="gf-bt mini" data-pm="prod-copiar" data-id="${r.rowid}" title="Registrar hoje com a mesma equipe e as mesmas peças"><i class="fas fa-copy"></i> Repetir hoje</button>`}
        ${fech?(diaFechado(r)&&ehAdm()?`<button type="button" class="gf-bt mini" data-pm="dia-reabrir" data-id="${r.rowid}"><i class="fas fa-lock-open"></i> Reabrir</button>`:'')+`<button type="button" class="gf-bt mini" data-pm="prod" data-id="${r.rowid}"><i class="fas fa-eye"></i> Ver</button>`
          :`<button type="button" class="gf-bt mini" data-pm="dia-fechar" data-id="${r.rowid}"><i class="fas fa-lock"></i> Fechar o dia</button><button type="button" class="gf-bt mini pri" data-pm="prod" data-id="${r.rowid}"><i class="fas fa-pen"></i> Alterar</button>`}</div></div>
      ${pt.length?`<div class="pm-dia2-eq">${pr.map(x=>`<span class="pm-av" title="${fe(x.nome)}${x.entrada?` · ${fe(x.entrada)}–${fe(x.saida||'')}`:''}">${fe(iniciais(x.nome))}</span>`).join('')}<span class="pm-mini">${pr.length} presente(s)</span>${au.map(x=>pill(`${fe(x.nome)} · ${SIT_PT[x.status][0].toLowerCase()}`,SIT_PT[x.status][1])).join('')}</div>`:''}
      <div class="pm-rolar"><table class="pm-tab2" data-sem-ordem><thead><tr><th></th><th>Peça</th><th>Lote</th><th class="n">Boas</th><th class="n">Refugo</th><th>Ordem</th><th>Cura</th><th class="n">Custo/peça</th></tr></thead><tbody>
      ${ii.map((it,i)=>{const p=pecaDe(it.peca),lib=addD(d,num(p&&p.cura!=null&&p.cura!==''?p.cura:tipoDePeca(p||{}).cura||7)),o=ordens().find(x=>String(x.rowid)===String(it.ordem||'')),cod=loteDe(r,it,i),l=lts.find(x=>x.lote===cod),st=situacaoLote(l);
        return `<tr><td style="width:64px"><span class="pm-th" data-th="${p?p.rowid:''}" style="cursor:default">${p?miniPeca(p):''}</span></td><td><b>${fe(p?p.nome:'(peça excluída)')}</b>${num(it.cp)?`<small>${nf(num(it.cp),0)} corpo(s) de prova</small>`:''}</td>
          <td style="white-space:nowrap"><button type="button" class="gf-bt mini" data-pm="lote" data-lote="${fe(cod)}" title="Paletes/unidades, ensaios, rastreio e etiquetas"><i class="fas fa-tag"></i> ${fe(cod)}</button><small>${l?fe(resumoSub(l)):''}</small>${st?pill(st.rot,st.cor,'fa-flask'):''}</td>
          <td class="n">${nf(num(it.qtd),0)}</td><td class="n">${num(it.refugo)?nf(num(it.refugo),0):'—'}</td><td>${o?'OP nº '+fe(String(o.numero)):'—'}</td><td>${lib>h?pill('em cura até '+brDe(lib).slice(0,5),'info','fa-hourglass-half'):pill('liberada','ok','fa-check')}</td><td class="n">${R(num(it.custo_un))}</td></tr>`;}).join('')}</tbody></table></div>
      ${r.obs?`<p class="pm-mini" style="margin:6px 2px 0"><i class="fas fa-note-sticky"></i> ${fe(r.obs)}</p>`:''}</article>`;};
  return cab+(L.length?L.map(dia).join(''):`<section class="gf-sec"><div class="gf-vazio"><i class="fas fa-industry"></i><p>Nenhuma produção registrada em ${fe(mesNome(k))}.</p><button type="button" class="gf-bt pri" data-pm="prod-nova"><i class="fas fa-plus"></i> Registrar o dia</button></div></section>`);
}
function formProducao(reg,pre){
  pre=pre||{};if(!pecas().length)return toast('Cadastre as peças primeiro (Peças e catálogo).','error');
  const c=CFG(),jr=jornada(),equipe=(c.equipe_lista||[]).filter(x=>x&&x.nome),cp0=pre.copiar;
  const b=reg?{...reg,...(()=>{const c2=climaDe(reg);return {clima_manha:c2.manha,clima_tarde:c2.tarde};})(),itens:itensProd(reg)}:cp0?{data:pre.data||hojeISO(),clima_manha:'',clima_tarde:'',ocorrencia:'Nenhuma',ponto:pontoDe(cp0).map(x=>({...x,horas:''})),itens:itensProd(cp0).map(it=>({peca:it.peca,ordem:'',qtd:'',refugo:''}))}
    :{data:pre.data||hojeISO(),clima_manha:'',clima_tarde:'',ocorrencia:'Nenhuma',ponto:null,itens:[{peca:pre.peca||pecas()[0].rowid,ordem:pre.ordem||'',qtd:'',refugo:''}]};
  const fechadoJa=!!reg&&(diaFechado(reg)||!!(c.fechado_ate&&reg.data<=c.fechado_ate)),fx=(reg&&reg.fechado)||{};
  const pts=b.ponto?pontoDe(b):[],ptDe=n=>pts.find(x=>x.nome===n),avulsos=pts.filter(x=>!equipe.some(e=>e.nome===x.nome));
  const opsOrd=(pid,sel)=>`<option value="">— sem ordem (estoque) —</option>`+ordens().filter(o=>String(o.peca)===String(pid)&&(o.status==='planejada'||o.status==='producao'||String(o.rowid)===String(sel))).map(o=>`<option value="${o.rowid}" ${String(o.rowid)===String(sel)?'selected':''}>OP nº ${o.numero} — ${nf(prodDaOrdem(o.rowid),0)} de ${nf(num(o.qtd),0)}</option>`).join('');
  const cpPad=pid=>pedeCP(tipoDePeca(pecaDe(pid)||{}))?2:'';
  const linIt=it=>`<tr data-item ${it.lote?`data-lote="${fe(it.lote)}"`:''}><td style="width:66px">${thumbBt(it.peca)}</td><td><select data-i="peca" data-prev="${fe(String(it.peca))}">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(it.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select>${it.lote?`<small class="pm-mini">lote ${fe(it.lote)}</small>`:''}</td>
    <td><select data-i="ordem">${opsOrd(it.peca,it.ordem)}</select></td><td><input data-i="qtd" inputmode="numeric" data-num="int" value="${fe(String(it.qtd||''))}" placeholder="0"></td><td><input data-i="refugo" inputmode="numeric" data-num="int" value="${fe(String(it.refugo||''))}" placeholder="0"></td>
    <td><input data-i="cp" inputmode="numeric" data-num="int" data-sem-mascara="1" value="${fe(String(it.cp!=null&&it.cp!==''?it.cp:(it.lote?'':cpPad(it.peca))))}" placeholder="0" title="Corpos de prova moldados com o concreto desta peça"></td><td><button type="button" class="pm-x" data-pmf="it-x"><i class="fas fa-xmark"></i></button></td></tr>`;
  // ponto obrigatório: no dia novo ninguém vem marcado — cada pessoa tem de ser marcada (presente, falta, atestado ou folga)
  const linP=(x,avulso)=>{const pt=ptDe(x.nome)||{},st=pt.status||(b.ponto?'falta':'');return `<div class="pm-pt" data-p ${avulso?'data-avulso="1"':''} data-nome="${fe(x.nome||'')}" data-funcao="${fe(x.funcao||'')}">
    <span class="pm-av">${fe(iniciais(x.nome)||'+')}</span>
    <div class="pm-pt-nm">${avulso?`<input data-pn value="${fe(x.nome||'')}" placeholder="Nome (diarista, visitante)"><select data-pf>${[...new Set([x.funcao||'Ajudante',...FUNCOES])].map(f=>`<option ${f===(x.funcao||'Ajudante')?'selected':''}>${f}</option>`).join('')}</select>`:`<b>${fe(x.nome)}</b><small>${fe(x.funcao||'')}</small>`}</div>
    <select data-pst class="pm-pt-st"><option value="" ${st?'':'selected'}>— marcar —</option>${Object.entries(SIT_PT).map(([k,[l]])=>`<option value="${k}" ${k===st?'selected':''}>${l}</option>`).join('')}</select>
    <label class="pm-pt-h"><small>Entrada</small><input type="time" data-pe value="${fe(pt.entrada||jr.entrada)}"></label><label class="pm-pt-h"><small>Saída</small><input type="time" data-ps value="${fe(pt.saida||jr.saida)}"></label>
    <label class="pm-pt-h"><small>Intervalo</small><input data-pi inputmode="numeric" data-num="int" data-sem-mascara="1" value="${fe(String(pt.intervalo!=null&&pt.intervalo!==''?pt.intervalo:jr.intervalo))}" title="minutos"></label>
    <div class="pm-pt-r" data-ph></div>${avulso?'<button type="button" class="pm-x" data-pmf="p-x"><i class="fas fa-xmark"></i></button>':'<span></span>'}</div>`;};
  const sel=(k,ops,v,vazio)=>`<select data-k="${k}">${vazio?`<option value="" ${v?'':'selected'}>${vazio}</option>`:''}${ops.map(x=>`<option ${x===v?'selected':''}>${x}</option>`).join('')}</select>`;
  const dd=dt(b.data),tit=reg?`${fechadoJa?'Diário fechado':'Alterar o diário'} — ${SEM_PT[dd.getDay()]}, ${brDe(dd)}`:`${cp0?'Registrar o dia (repetindo equipe e peças)':'Registrar o dia de produção'} — ${SEM_PT[dd.getDay()]}, ${brDe(dd)}`;
  const j=janela(tit,`${fechadoJa?`<div class="fin-aviso" style="margin:0 0 10px;background:#F2F4F7;border-color:#E4E7EC"><div><i class="fas fa-lock"></i> <b>Dia fechado</b>${diaFechado(reg)?` ${fx.auto?'automaticamente às 19h':'por '+fe(fx.por||'')}${fx.em?' em '+fe(brDe(dt(String(fx.em).slice(0,10))))+' '+fe(String(fx.em).slice(11,16)):''}`:' junto com o mês (Parâmetros › Fechamento do mês)'}. Nada pode ser alterado${diaFechado(reg)?'; só o Administrador reabre':''}.</div></div>`
      :reg&&reg.data===hojeISO()?`<div class="fin-aviso" style="margin:0 0 10px"><div><i class="fas fa-clock"></i> Este diário <b>fecha sozinho às 19h</b>. Depois disso, só o Administrador reabre.</div></div>`:''}
    <div class="fin-linha">
      <div class="fin-fld"><label>Data <span class="obg">*</span></label><div style="display:flex;gap:6px"><input type="date" data-k="data" value="${fe(b.data||'')}" max="${hojeISO()}" readonly tabindex="-1" style="flex:1;min-width:0">${fechadoJa?'':`<button type="button" class="gf-bt mini" data-pmf="dia-trocar" title="Escolher outro dia no calendário"><i class="fas fa-calendar-day"></i> Trocar</button>`}</div><small class="pm-mini" data-dt-aviso style="color:#B42318"></small></div>
      <div class="fin-fld"><label>Clima de manhã <span class="obg">*</span></label>${sel('clima_manha',CLIMAS,b.clima_manha,'— escolha —')}</div><div class="fin-fld"><label>Clima à tarde <span class="obg">*</span></label>${sel('clima_tarde',CLIMAS,b.clima_tarde,'— escolha —')}</div>
      <div class="fin-fld"><label>Betonadas feitas <span class="obg">*</span></label><input data-k="betonadas" inputmode="numeric" data-num="int" value="${fe(String(b.betonadas||''))}" placeholder="0"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Ocorrência <span class="obg">*</span></label>${sel('ocorrencia',OCORR,b.ocorrencia||'Nenhuma')}</div></div>
    <div class="pm-bloco" style="margin-top:10px"><div class="pm-pt-cab"><h5 style="margin:0"><i class="fas fa-user-clock"></i> Equipe presente — ponto do dia</h5>
        <div class="pm-pt-acoes"><button type="button" class="gf-bt mini" data-pmf="p-todos"><i class="fas fa-user-check"></i> Todos presentes</button><button type="button" class="gf-bt mini" data-pmf="p-jornada"><i class="fas fa-clock-rotate-left"></i> Jornada padrão (${fe(jr.entrada)}–${fe(jr.saida)})</button></div></div>
      <div class="pm-pt-tot" data-p-tot></div>
      ${equipe.length?'':'<p class="pm-mini" style="margin:0 0 6px">Cadastre a equipe em <b>Parâmetros › Equipe da fábrica</b> para ela aparecer aqui todo dia.</p>'}
      <div class="pm-pts" data-ponto>${equipe.map(x=>linP(x,false)).join('')}${avulsos.map(x=>linP(x,true)).join('')}</div>
      <button type="button" class="gf-bt mini" data-pmf="p-add" style="margin-top:8px"><i class="fas fa-plus"></i> Pessoa avulsa</button></div>
    <div class="pm-bloco"><h5><i class="fas fa-cubes"></i> Peças produzidas</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th></th><th>Peça</th><th>Ordem de produção</th><th style="width:78px">Boas</th><th style="width:78px">Refugo</th><th style="width:70px" title="Corpos de prova">CPs</th><th></th></tr></thead><tbody data-itens>${(b.itens||[]).map(linIt).join('')}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="it-add" style="margin-top:6px"><i class="fas fa-plus"></i> Outra peça</button><p class="pm-mini" style="margin:6px 0 0">Cada peça do dia vira um lote — por palete (peças pequenas) ou por unidade (peças grandes). <b>CPs</b> = corpos de prova moldados (sugestão: 2 em tubos, postes, tampas, lajes e peças estruturais).</p></div>
    <div class="fin-fld"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}" placeholder="Ex.: forma 3 trincada, faltou brita à tarde"></div>
    <div class="fin-aviso" style="margin-top:8px"><div data-pr-prev></div></div>`,
    fechadoJa?(diaFechado(reg)&&ehAdm()?[{html:'<i class="fas fa-lock-open"></i> Reabrir o dia',cls:'pri',acao:async()=>{setTimeout(()=>reabrirDia(reg),60);}}]:[])
    :[...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,`Produção de ${brDe(dt(reg.data))}`),60);}}]:[]),
      {html:'<i class="fas fa-lock"></i> Salvar e fechar o dia',cls:'valida',acao:async jj=>salvarDia(jj,true)},
      {html:'<i class="fas fa-floppy-disk"></i> Salvar o dia',cls:'pri',acao:async jj=>salvarDia(jj,false)}],1040);
  // dia fechado: só leitura
  if(fechadoJa)j.querySelectorAll('.fin-jan-corpo input,.fin-jan-corpo select,.fin-jan-corpo textarea,.fin-jan-corpo [data-pmf]').forEach(e=>{if(!e.closest('[data-pm="lote"]'))e.disabled=true;});
  async function salvarDia(jj,fechar){
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      if(reg&&diaFechado(reg))throw new Error('Este dia está fechado: só o Administrador reabre.');
      const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),o=reg?{...reg}:{tipo:'producao',data_lancamento:todayDateTime()};
      ['data','clima_manha','clima_tarde','ocorrencia','obs'].forEach(k=>o[k]=g(k));o.betonadas=num(g('betonadas'));delete o.turno;delete o.clima;
      o.ponto=lerPonto(jj);o.equipe=o.ponto.filter(x=>x.status==='presente').map(x=>x.nome);o.alterado_em=todayDateTime();o.alterado_por=eu();
      if(!o.data)throw new Error('Informe a data.');if(o.data>hojeISO())throw new Error('A data não pode ser no futuro.');
      {const tm=travaMes(o,reg);if(tm)return trava('Período fechado',[{ok:false,txt:tm}]);}
      // um diário por dia: o dia já registrado só se altera
      {const outro=T('producao').find(r=>r.data===o.data&&(!reg||String(r.rowid)!==String(reg.rowid)));
        if(outro)return trava(`Já existe o diário de ${brDe(dt(o.data))}`,[{ok:false,txt:`Cada dia tem um diário só. ${diaFechado(outro)?'Esse dia já está fechado (só o Administrador reabre).':'Abra o dia registrado para alterar.'}`}],diaFechado(outro)?null:{rot:'Abrir o dia registrado',f:()=>formProducao(outro)});}
      // depois das 19h (ou dia passado) o diário novo só com o Administrador
      if(!reg&&passouHora(o.data)){if(!ehAdm())return trava('Dia encerrado',[{ok:false,txt:`O diário de ${brDe(dt(o.data))} encerrou às 19h. Peça ao Administrador para registrar este dia.`}]);o.aberto_ate=new Date(Date.now()+3600e3).toISOString();}
      if(!o.clima_manha||!o.clima_tarde)throw new Error('Informe o clima de manhã e à tarde.');
      // ponto: todo mundo da lista marcado
      {const sem=o.ponto.filter(x=>!x.status);jj.querySelectorAll('[data-p]').forEach(row=>row.classList.toggle('pend',!row.querySelector('[data-pst]').value));
        if(sem.length)return trava('Falta marcar o ponto',[{ok:false,txt:`Marque o ponto de: <b>${sem.map(x=>fe(x.nome)).join(', ')}</b> — Presente, Falta, Atestado ou Folga (use "Todos presentes" se todos vieram).`}]);
        if(!o.ponto.length)return trava('Falta o ponto do dia',[{ok:false,txt:'Ninguém no ponto: cadastre a equipe em Parâmetros › Equipe da fábrica ou inclua uma Pessoa avulsa.'}]);}
      const ruim=o.ponto.find(x=>x.status==='presente'&&!(x.horas>0));if(ruim)throw new Error(`Confira o ponto de ${ruim.nome}: entrada e saída não dão horas trabalhadas.`);
      const its=lerItensProd(jj);if(!its.length)throw new Error('Informe ao menos uma peça com quantidade.');
      {const rp=repetido(its.map(it=>it.peca));if(rp)throw new Error(`"${nomePeca(rp)}" está em duas linhas: deixe uma só e some as quantidades.`);}
      if(its.some(it=>it.qtd>0)&&!(o.betonadas>=1))throw new Error('Informe quantas betonadas foram feitas (só números).');
      if(its.some(it=>it.qtd>0)&&!o.ponto.some(x=>x.status==='presente'))return trava('Produção sem equipe presente',[{ok:false,txt:'Marque quem trabalhou no dia (Presente) — produção sem ninguém no ponto não fecha com as horas e o custo da mão de obra.'}]);
      // não se produz sem material: o consumo do dia tem de caber no estoque de insumos (na edição, o consumo antigo volta)
      const devolve={};if(reg)itensProd(reg).forEach(it=>Object.entries(it.consumo||{}).forEach(([k,q])=>devolve[k]=(devolve[k]||0)+num(q)));
      const fl=faltaInsumos(its,devolve);
      if(fl.some(x=>x.falta>1e-6))return trava('Faltam insumos para registrar esta produção',depsInsumos(fl).concat([{ok:true,txt:'Lance as compras em <b>Estoque › Entrada de insumo</b>. Material que já estava no pátio antes do sistema: lance o estoque inicial em <b>Estoque › Acerto de inventário</b>.'}]));
      // ordem de produção: não passa da quantidade pedida
      const porOP={};its.forEach(it=>{if(it.ordem)porOP[it.ordem]=(porOP[it.ordem]||0)+it.qtd;});
      for(const [id,q] of Object.entries(porOP)){const op=ordens().find(z=>String(z.rowid)===String(id));if(!op)continue;const ja=prodDaOrdem(op.rowid)-(reg?itensProd(reg).filter(it=>String(it.ordem)===String(id)).reduce((s,it)=>s+num(it.qtd),0):0);
        if(ja+q>num(op.qtd))return trava(`OP nº ${op.numero}: passou da quantidade pedida`,[{ok:false,txt:`A ordem pede ${nf(num(op.qtd),0)} peças; já tem ${nf(ja,0)} registradas; este registro soma ${nf(q,0)} — <b>${nf(ja+q-num(op.qtd),0)} a mais</b>. Aumente a quantidade da ordem no Planejamento ou lance esta peça "sem ordem (estoque)".`}]);}
      // lote de cada peça: o que já tinha fica; peça nova ganha o próximo número do dia
      const base='L'+ymd(o.data),usados=new Set(lotes().map(l=>l.lote));let seq=0;const prox=()=>{let c2;do{seq++;c2=`${base}-${String(seq).padStart(2,'0')}`;}while(usados.has(c2));usados.add(c2);return c2;};
      // retrato do dia: consumo (boas + refugo), custo por peça e o controle do lote (palete ou unidade)
      o.itens=its.map(it=>{const p=pecaDe(it.peca),x=calc(p,it.qtd+it.refugo),u=calc(p,1),cons={};Object.entries(x.est).forEach(([k,q])=>cons[k]=Math.round(q*10000)/10000);
        const old=reg&&it.lote?itensProd(reg).find(z=>z.lote===it.lote):null,ml=old&&old.lmodo?{modo:old.lmodo,pp:old.lpp}:modoLote(p);return {...it,lote:it.lote||prox(),lmodo:ml.modo,lpp:ml.pp,consumo:cons,custo_un:r2(u.un),custo_mat_un:r2(u.custo.mat),m3:Math.round(x.Vt*10000)/10000};});
      ['peca','ordem','qtd','refugo','consumo','custo_un','custo_mat_un','m3'].forEach(k=>delete o[k]);
      if(fechar){if(!(await simNao(`Fechar o dia ${brDe(dt(o.data))}?`,msgFechar(o),'Sim, fechar','fa-lock')))return false;o.fechado={em:todayDateTime(),por:eu(),auto:false};o.aberto_ate='';}
      PM.mes=mesKey(dt(o.data));PM.dVista='dias';   // a lista do diário passa a mostrar o mês do dia registrado
      await gravar(o,reg?reg.rowid:null);
      const mud=[];new Set(o.itens.map(it=>it.ordem).filter(Boolean)).forEach(id=>{const op=ordens().find(z=>String(z.rowid)===String(id));if(!op)return;
        if(op.status!=='concluida'&&prodDaOrdem(op.rowid)>=num(op.qtd))mud.push([{...op,status:'concluida',concluida_em:o.data},op.rowid]);else if(op.status==='planejada')mud.push([{...op,status:'producao',inicio:op.inicio||o.data},op.rowid]);});
      if(mud.length)await gravarVarios(mud);
      toast(`Dia ${fechar?'registrado e fechado':'registrado'}: ${o.itens.length} lote(s) — ${o.itens.map(it=>it.lote).join(', ')}.`,'success');}
  const atPonto=()=>{let t=0,n=0,ex=0,aus=0,sm=0;j.querySelectorAll('[data-p]').forEach(row=>{const nome=row.dataset.avulso?String((row.querySelector('[data-pn]')||{}).value||'').trim():row.dataset.nome,st=row.querySelector('[data-pst]').value,on=st==='presente'&&!!nome;
      if(!fechadoJa)row.querySelectorAll('[data-pe],[data-ps],[data-pi]').forEach(e=>e.disabled=!on);row.classList.toggle('off',!on);if(st)row.classList.remove('pend');
      const hh=on?horasDe(row.querySelector('[data-pe]').value,row.querySelector('[data-ps]').value,row.querySelector('[data-pi]').value):0,xe=Math.max(0,hh-jr.horas),atr=on&&minDe(row.querySelector('[data-pe]').value)>minDe(jr.entrada)+10;
      row.querySelector('[data-ph]').innerHTML=on?`<b>${nf(hh,1)} h</b>${xe>0.01?`<span class="x">+${nf(xe,1)} extra</span>`:''}${atr?'<span class="a">atraso</span>':''}`:`<span class="pm-mini" style="${st?'':'color:#B54708;font-weight:700'}">${fe(st?SIT_PT[st][0]:'falta marcar')}</span>`;
      if(on){t+=hh;n++;ex+=xe;}else if(nome&&!st)sm++;else if(nome&&st!=='folga')aus++;});
    const e=j.querySelector('[data-p-tot]');if(e)e.innerHTML=`<span><b>${n}</b> presente(s)</span><span><b>${nf(t,1)} h</b> no dia</span>${ex>0.01?`<span class="x"><b>${nf(ex,1)} h</b> extras</span>`:''}${aus?`<span class="a"><b>${aus}</b> ausência(s)</span>`:''}${sm?`<span class="a"><b>${sm}</b> sem marcar</span>`:''}`;};
  const at=()=>{atPonto();semRepetir(j,'[data-i="peca"]');
    {const av=j.querySelector('[data-dt-aviso]'),dv=(j.querySelector('[data-k="data"]')||{}).value;if(av&&!fechadoJa){const ou=dv&&T('producao').find(r=>r.data===dv&&(!reg||String(r.rowid)!==String(reg.rowid)));
      av.textContent=ou?'Este dia já tem diário: abra o dia registrado para alterar.':(!reg&&dv&&passouHora(dv))?(ehAdm()?'Dia já encerrado às 19h: registrando como Administrador.':'Dia encerrado às 19h: só o Administrador registra.'):'';}}
    const its=lerItensProd(j),e=j.querySelector('[data-pr-prev]');if(!e)return;if(!its.length){e.innerHTML='Informe as peças feitas para ver o que sai do estoque de insumos.';return;}
    const tot={};its.forEach(it=>{const x=calc(pecaDe(it.peca),it.qtd+it.refugo);Object.entries(x.est).forEach(([k,q])=>tot[k]=(tot[k]||0)+q);});const ei=estoqueInsumos();
    e.innerHTML='Sai do estoque: '+INS.filter(i=>tot[i.k]).map(i=>{const f=ei[i.k].saldo<tot[i.k];return `<span style="${f?'color:#B42318;font-weight:700':''}">${i.nome.split(' (')[0].toLowerCase()} ${nf(tot[i.k],2)} ${i.un}${f?' (estoque insuficiente)':''}</span>`;}).join(' · ')+'.';};
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('change',ev=>{const t=ev.target;if(t.matches('[data-i="peca"]')){const tr=t.closest('tr');
      // a peça já lançada em outra linha não entra de novo (volta à anterior)
      if([...j.querySelectorAll('[data-i="peca"]')].some(s=>s!==t&&s.value===t.value)){const nova=t.value;t.value=t.dataset.prev||'';trocarThumb(tr,t.value);toast(`"${nomePeca(nova)}" já está lançada em outra linha: some a quantidade lá.`,'error');}
      else{t.dataset.prev=t.value;tr.querySelector('[data-i="ordem"]').innerHTML=opsOrd(t.value,'');trocarThumb(tr,t.value);const cp=tr.querySelector('[data-i="cp"]');if(cp&&!cp.dataset.mexeu)cp.value=cpPad(t.value);}}at();});
  corpo.addEventListener('input',ev=>{if(ev.target.matches('[data-i="cp"]'))ev.target.dataset.mexeu='1';if(ev.target.matches('[data-pn]')){const av=ev.target.closest('[data-p]').querySelector('.pm-av');if(av)av.textContent=iniciais(ev.target.value)||'+';}clearTimeout(j._pmT);j._pmT=setTimeout(at,150);});
  corpo.addEventListener('click',ev=>{const b2=ev.target.closest('[data-pmf]');if(!b2)return;const f=b2.dataset.pmf;
    if(f==='pick'){const tr=b2.closest('tr'),s=tr.querySelector('[data-i="peca"]');return escolherPeca(s.value,pid=>{s.value=pid;s.dispatchEvent(new Event('change',{bubbles:true}));});}
    if(f==='dia-trocar'){const inp=j.querySelector('[data-k="data"]');return escolherDiaProducao(iso=>{inp.value=iso;inp.dispatchEvent(new Event('change',{bubbles:true}));const tb=j.querySelector('.fin-jan-cab b');if(tb&&!reg)tb.textContent=`Registrar o dia de produção — ${SEM_PT[dt(iso).getDay()]}, ${brDe(dt(iso))}`;},String(inp.value||'').slice(0,7));}
    if(f==='p-todos')j.querySelectorAll('[data-pst]').forEach(s=>s.value='presente');
    else if(f==='p-jornada')j.querySelectorAll('[data-p]').forEach(row=>{row.querySelector('[data-pe]').value=jr.entrada;row.querySelector('[data-ps]').value=jr.saida;row.querySelector('[data-pi]').value=jr.intervalo;});
    else if(f==='it-add'){const pl=livreDe(j,'[data-i="peca"]',pecas().map(p=>String(p.rowid)));if(!pl)return toast('Todas as peças cadastradas já estão lançadas neste dia.','error');
      j.querySelector('[data-itens]').insertAdjacentHTML('beforeend',linIt({peca:pl,ordem:'',qtd:'',refugo:''}));pintarFotos(j);}
    else if(f==='it-x')b2.closest('tr').remove();else if(f==='p-add')j.querySelector('[data-ponto]').insertAdjacentHTML('beforeend',linP({nome:'',funcao:'Ajudante'},true));else if(f==='p-x')b2.closest('[data-p]').remove();at();});
  pintarFotos(j);at();
}
function lerPonto(j){return [...j.querySelectorAll('[data-p]')].map(row=>{const av=!!row.dataset.avulso,nome=av?String((row.querySelector('[data-pn]')||{}).value||'').trim():row.dataset.nome;if(!nome)return null;
  const status=row.querySelector('[data-pst]').value,funcao=av?(row.querySelector('[data-pf]')||{}).value||'Avulso':row.dataset.funcao;
  if(status!=='presente')return {nome,funcao,status};   /* status vazio = não marcado (o Salvar cobra) */const entrada=row.querySelector('[data-pe]').value,saida=row.querySelector('[data-ps]').value,intervalo=num(row.querySelector('[data-pi]').value);
  return {nome,funcao,status,entrada,saida,intervalo,horas:Math.round(horasDe(entrada,saida,intervalo)*100)/100};}).filter(Boolean);}
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
          return `<tr><td><b>${fe(p.nome)}</b><small>${fe(p.codigo||'')}</small></td><td>${pill(rp.rot,rp.cor,rp.k==='ok'?'fa-check':'fa-triangle-exclamation')}</td><td class="n">${nf(x.cura,0)}</td><td class="n">${nf(x.disp,0)}${x.bloq?`<small style="color:#B42318;font-weight:700" title="Lote com ensaio reprovado: não pode ser vendido">${nf(x.bloq,0)} bloqueada(s)</small>`:''}</td><td class="n">${nf(x.res,0)}</td><td class="n" style="${x.livre<0?'color:#B42318;font-weight:800':''}">${nf(x.livre,0)}</td><td class="n">${nf(x.emProd,0)}</td><td class="n">${nf(rp.ponto,0)}</td><td class="n">${R(Math.max(0,x.disp)*x.custoUn)}</td>
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
function formAvariaLote(pecaPre,pre){
  pre=pre||{};const E=estoque();
  const lin=pid=>`<tr><td style="width:66px">${thumbBt(pid)}</td><td><select data-a="peca" data-prev="${fe(String(pid))}">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(pid)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></td>
    <td><input data-a="qtd" inputmode="numeric" data-num="int" placeholder="0"></td><td><input data-a="tem" readonly tabindex="-1"></td><td><input data-a="perda" readonly tabindex="-1"></td><td><button type="button" class="pm-x" data-pmf="l-x" title="Tirar esta linha"><i class="fas fa-xmark"></i></button></td></tr>`;
  const j=janela('Registrar avarias (peças quebradas)',`<div class="fin-linha">
      <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${hojeISO()}" max="${hojeISO()}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Onde quebrou <span class="obg">*</span></label><select data-k="origem">${Object.entries(ORIG_AV).filter(([k])=>k!=='cliente').map(([k,l])=>`<option value="${k}" ${k===(pre.origem||'patio')?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Causa <span class="obg">*</span></label><input data-k="causa" placeholder="Ex.: queda da empilhadeira, desforma antes da hora, estrada ruim"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Venda (se aconteceu numa entrega)</label><select data-k="venda"><option value="">—</option>${vendas().filter(v=>!encerrada(v)).slice(-60).reverse().map(v=>`<option value="${v.rowid}" ${String(v.rowid)===String(pre.venda||'')?'selected':''}>Venda nº ${v.numero} — ${fe(v.cliente||'')}</option>`).join('')}</select></div>
      <label class="nfc-amb" data-av-repor hidden style="grid-column:1/-1"><input type="checkbox" data-k="repor" checked><span><b>Repor as peças ao cliente</b> — sai do estoque a mesma quantidade (peças novas no lugar das quebradas)</span></label></div>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-heart-crack"></i> Peças quebradas</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th></th><th>Peça</th><th style="width:90px">Quantidade</th><th style="width:150px" data-av-temh>Prontas no pátio</th><th style="width:130px">Perda (R$)</th><th></th></tr></thead><tbody data-lote-linhas>${lin(pecaPre||pecas()[0].rowid)}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="l-add" style="margin-top:6px"><i class="fas fa-plus"></i> Outra peça</button></div>
    <div class="fin-linha"><div class="fin-fld"><label>Perda total</label><input data-k="perda_tot" readonly tabindex="-1"></div></div>`,
    [{html:'<i class="fas fa-floppy-disk"></i> Registrar avarias',cls:'pri',acao:async jj=>{
      const g=k=>String((jj.querySelector(`[data-k="${k}"]`)||{}).value||'').trim(),L=ler(jj),og=g('origem'),vd=g('venda'),v=vd?vendaDe(vd):null,ent=vendaEntregue(vd),repor=ent&&!!(jj.querySelector('[data-k="repor"]')||{}).checked,E2=estoque();
      if(!g('data'))throw new Error('Informe a data.');if(!g('causa'))throw new Error('Informe a causa.');
      {const rp=repetido(L.map(x=>x.peca));if(rp)throw new Error(`"${nomePeca(rp)}" está em duas linhas: deixe uma só.`);}
      const sem=L.find(x=>!(x.qtd>0));if(sem)throw new Error(`${nomePeca(sem.peca)}: informe a quantidade (ou tire a linha).`);
      if(v&&dt(v.data)&&g('data')<v.data)throw new Error('A data da avaria não pode ser antes do pedido.');
      // não quebra mais do que existe: no pátio (estoque) ou na entrega (o que foi entregue de cada peça)
      for(const x of L){const e=E2.P[String(x.peca)]||{disp:0};
        if(AV_ESTOQUE.includes(og)&&!ent&&x.qtd>e.disp)return trava('Avaria maior do que o estoque',[{ok:false,txt:`${fe(nomePeca(x.peca))}: há ${nf(Math.max(0,e.disp),0)} peça(s) prontas no pátio — a avaria não pode passar disso.`},{ok:true,txt:'Peça que quebrou ainda em cura: registre como refugo no dia de produção.'}]);
        if(ent){const q=(v.itens||[]).filter(it=>String(it.peca)===String(x.peca)).reduce((s,it)=>s+num(it.qtd),0),ja=T('avaria').filter(a=>String(a.venda)===String(vd)&&String(a.peca)===String(x.peca)).reduce((s,a)=>s+num(a.qtd),0);
          if(x.qtd>q-ja)return trava('Avaria maior do que foi entregue',[{ok:q>0,txt:`A venda nº ${v.numero} entregou ${nf(q,0)} peça(s) de ${fe(nomePeca(x.peca))}`},{ok:false,txt:`Já há ${nf(ja,0)} avariada(s) nessa entrega — dá para registrar no máximo ${nf(Math.max(0,q-ja),0)}`}]);
          if(repor&&x.qtd>e.disp)return trava('Sem peças para repor',[{ok:false,txt:`${fe(nomePeca(x.peca))}: repor ${nf(x.qtd,0)} exige estoque pronto — há ${nf(Math.max(0,e.disp),0)}. Desmarque "Repor" e reponha depois.`}]);}}
      const ops=[];L.forEach(x=>{const e=E2.P[String(x.peca)];ops.push([{tipo:'avaria',data_lancamento:todayDateTime(),data:g('data'),peca:x.peca,qtd:x.qtd,origem:og,causa:g('causa'),venda:vd,custo_un:r2(e&&e.custoUn?e.custoUn:calc(pecaDe(x.peca),1).un),por:eu()},null]);
        if(repor)ops.push([{tipo:'ajuste',data:g('data'),item:'peca:'+x.peca,qtd:-x.qtd,motivo:`reposição de avaria — venda nº ${v.numero}`,por:eu(),data_lancamento:todayDateTime()},null]);});
      await gravarVarios(ops);toast(`${L.length} avaria(s) registrada(s)${repor?' e peças repostas ao cliente':''}.`,'success');}}],860);
  function ler(jj){return [...jj.querySelectorAll('[data-lote-linhas] tr')].map(tr=>({peca:tr.querySelector('[data-a="peca"]').value,qtd:num(tr.querySelector('[data-a="qtd"]').value)}));}
  const at=()=>{semRepetir(j,'[data-a="peca"]');const vd=j.querySelector('[data-k="venda"]').value,ent=vendaEntregue(vd),rp=j.querySelector('[data-av-repor]');if(rp)rp.hidden=!ent;let t=0;
    j.querySelectorAll('[data-lote-linhas] tr').forEach(tr=>{const id=tr.querySelector('[data-a="peca"]').value,x=E.P[String(id)],q=num(tr.querySelector('[data-a="qtd"]').value),cu=x&&x.custoUn?x.custoUn:calc(pecaDe(id),1).un;t+=cu*q;
      tr.querySelector('[data-a="tem"]').value=`${nf(Math.max(0,(x||{}).disp||0),0)} prontas`;tr.querySelector('[data-a="perda"]').value=q?R(cu*q):'';});
    j.querySelector('[data-k="perda_tot"]').value=R(t);};
  loteForm(j,'[data-a="peca"]',lin,()=>pecas().map(p=>String(p.rowid)));const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('change',ev=>{if(ev.target.matches('[data-a="peca"]'))trocarThumb(ev.target.closest('tr'),ev.target.value);});
  corpo.addEventListener('click',ev=>{const b2=ev.target.closest('[data-pmf="pick"]');if(!b2)return;const tr=b2.closest('tr'),s=tr.querySelector('[data-a="peca"]');escolherPeca(s.value,pid=>{s.value=pid;s.dispatchEvent(new Event('change',{bubbles:true}));});});
  corpo.addEventListener('input',at);corpo.addEventListener('change',at);pintarFotos(j);at();
}
function formAvaria(reg,pecaPre,pre){
  if(!pecas().length)return toast('Cadastre as peças primeiro.','error');pre=pre||{};
  if(!reg)return formAvariaLote(pecaPre,pre);
  const b=reg||{data:hojeISO(),peca:pecaPre||pecas()[0].rowid,origem:pre.origem||'patio',qtd:'',venda:pre.venda||''};
  const j=janela(reg?'Editar avaria':'Registrar avaria (peça quebrada)',`<div class="fin-linha">
      <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}" max="${hojeISO()}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Peça <span class="obg">*</span></label><select data-k="peca">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(b.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade <span class="obg">*</span></label><input data-k="qtd" inputmode="numeric" data-num="int" value="${fe(String(b.qtd||''))}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Onde quebrou</label><select data-k="origem">${Object.entries(ORIG_AV).filter(([k])=>k!=='cliente'||b.origem==='cliente').map(([k,l])=>`<option value="${k}" ${k===b.origem?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Causa <span class="obg">*</span></label><input data-k="causa" value="${fe(b.causa||'')}" placeholder="Ex.: queda da empilhadeira, desforma antes da hora, estrada ruim"></div>
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
      o.custo_un=r2(x.custoUn||calc(pecaDe(o.peca),1).un);o.por=o.por||eu();
      const ops=[[o,reg?reg.rowid:null]];if(repor)ops.push([{tipo:'ajuste',data:o.data,item:'peca:'+o.peca,qtd:-o.qtd,motivo:`reposição de avaria — venda nº ${v.numero}`,data_lancamento:todayDateTime()},null]);
      await gravarVarios(ops);toast(repor?'Avaria registrada e peças repostas ao cliente (saíram do estoque).':'Avaria registrada.','success');}}],640);
  const at=()=>{const p=pecaDe(j.querySelector('[data-k="peca"]').value),q=num(j.querySelector('[data-k="qtd"]').value),og=j.querySelector('[data-k="origem"]').value,vd=j.querySelector('[data-k="venda"]').value,x=estoque().P[String(p&&p.rowid)],cu=x?x.custoUn:(p?calc(p,1).un:0),ent=vendaEntregue(vd);
    const rp=j.querySelector('[data-av-repor]');if(rp)rp.hidden=!ent;
    j.querySelector('[data-av-prev]').innerHTML=q?`Perda de <b>${R(cu*q)}</b> (custo ${R(cu)} por peça).${ent?' A peça já tinha saído com a entrega: a perda entra no resultado sem baixar o estoque de novo.':AV_ESTOQUE.includes(og)?` As peças saem do estoque (há ${nf(Math.max(0,(x||{}).disp||0),0)} prontas).`:''}`:'Informe a quantidade.';};
  const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}
/* ── lançamentos em lote (como no Contas a pagar): os dados comuns em cima e uma linha por item; cada linha vira um registro.
   O item escolhido numa linha fica bloqueado nas outras. Abrir um lançamento já feito continua no formulário de um item. ── */
const fornLista=()=>[...new Set(T('compra').map(x=>x.fornecedor).filter(Boolean).concat((GS.D().fornecedores||[]).map(f=>f.nome||f.razao_social||'').filter(Boolean)))].slice(0,300);
function loteForm(j,sel,linha,todas,minimo){const corpo=j.querySelector('.fin-jan-corpo'),box=j.querySelector('[data-lote-linhas]');
  corpo.addEventListener('change',ev=>{const t=ev.target;if(!t.matches(sel))return;if([...j.querySelectorAll(sel)].some(s=>s!==t&&s.value===t.value)){t.value=t.dataset.prev||'';toast('Este item já está em outra linha: some a quantidade lá.','error');}else t.dataset.prev=t.value;});
  corpo.addEventListener('click',ev=>{const b=ev.target.closest('[data-pmf]');if(!b)return;
    if(b.dataset.pmf==='l-add'){const v=livreDe(j,sel,todas());if(!v)return toast('Todos os itens já estão na lista.','error');box.insertAdjacentHTML('beforeend',linha(v));pintarFotos(j);}
    else if(b.dataset.pmf==='l-x'){if(box.querySelectorAll('tr').length<=(minimo||1))return toast('Deixe ao menos uma linha.','error');b.closest('tr').remove();}
    corpo.dispatchEvent(new Event('input',{bubbles:true}));});}
function formCompraLote(insPre){
  const c=CFG();
  const lin=k=>`<tr><td><select data-c="insumo" data-prev="${fe(k)}">${INS.map(i=>`<option value="${i.k}" ${i.k===k?'selected':''}>${fe(i.nome)}</option>`).join('')}</select></td>
    <td><input data-c="qtd" inputmode="decimal" data-num="dec" placeholder="0"><small class="pm-mini" data-c-un></small></td><td><input data-c="valor" data-mask="moeda" placeholder="R$ 0,00"></td>
    <td><input data-c="unit" readonly tabindex="-1" placeholder="automático"><small class="pm-mini" data-c-ref></small></td><td><button type="button" class="pm-x" data-pmf="l-x" title="Tirar esta linha"><i class="fas fa-xmark"></i></button></td></tr>`;
  const j=janela('Entrada de insumos (compra)',`<div class="fin-linha">
      <div class="fin-fld"><label>Data da compra <span class="obg">*</span></label><input type="date" data-k="data" value="${hojeISO()}" max="${hojeISO()}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Fornecedor <span class="obg">*</span></label><input data-k="fornecedor" list="vx-forn-pm"></div>
      <div class="fin-fld"><label>Nº da nota</label><input data-k="nf"></div>
      <div class="fin-fld"><label>Vencimento</label><input type="date" data-k="vencimento"></div><div class="fin-fld"><label>Pago em</label><input type="date" data-k="pago_em" max="${hojeISO()}"></div></div>
    <datalist id="vx-forn-pm">${fornLista().map(n=>`<option value="${fe(n)}">`).join('')}</datalist>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-boxes-stacked"></i> Insumos desta compra</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th>Insumo</th><th style="width:140px">Quantidade</th><th style="width:150px">Valor total (R$)</th><th style="width:170px">Preço por unidade</th><th></th></tr></thead><tbody data-lote-linhas>${lin(insPre||'cimento')}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="l-add" style="margin-top:6px"><i class="fas fa-plus"></i> Outro insumo</button></div>
    <div class="fin-linha"><div class="fin-fld"><label>Total da compra</label><input data-k="total" readonly tabindex="-1"></div></div>
    <label class="nfc-amb" style="margin-top:8px"><input type="checkbox" data-k="atualiza" checked><span>Usar estes preços nos cálculos das peças (atualiza o preço dos insumos em Parâmetros)</span></label>`,
    [{html:'<i class="fas fa-floppy-disk"></i> Lançar a entrada',cls:'pri',acao:async jj=>{
      const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),L=ler(jj);
      if(!g('data'))throw new Error('Informe a data da compra.');if(g('data')>hojeISO())throw new Error('A data da compra não pode ser no futuro.');if(!g('fornecedor'))throw new Error('Informe o fornecedor.');
      {const rp=repetido(L.map(x=>x.insumo));if(rp)throw new Error(`${insDe(rp).nome} está em duas linhas: deixe uma só.`);}
      const ruim=L.find(x=>!(x.qtd>0)||!(x.valor>0));if(ruim)throw new Error(`${insDe(ruim.insumo).nome}: informe a quantidade e o valor total (ou tire a linha).`);
      if(g('pago_em')&&g('pago_em')<g('data'))throw new Error('O pagamento não pode ser antes da compra.');
      const grupo='C'+Date.now().toString(36),ops=L.map(x=>[{tipo:'compra',data_lancamento:todayDateTime(),data:g('data'),insumo:x.insumo,qtd:x.qtd,valor:x.valor,fornecedor:g('fornecedor'),nf:g('nf'),vencimento:g('vencimento'),pago_em:g('pago_em'),grupo,por:eu()},null]);
      if(jj.querySelector('[data-k="atualiza"]').checked){const r=cfgRow(),cf=r&&r.cfg?JSON.parse(JSON.stringify(r.cfg)):{};cf.precos=cf.precos||{};L.forEach(x=>cf.precos[x.insumo]=Math.round(x.valor/x.qtd*100)/100);ops.push([r?{...r,cfg:cf}:{tipo:'config',cfg:cf,data_lancamento:todayDateTime()},r?r.rowid:null]);}
      await gravarVarios(ops);toast(`Entrada lançada: ${L.length} insumo(s) no estoque.`,'success');}}],900);
  function ler(jj){return [...jj.querySelectorAll('[data-lote-linhas] tr')].map(tr=>({insumo:tr.querySelector('[data-c="insumo"]').value,qtd:num(tr.querySelector('[data-c="qtd"]').value),valor:r2(num(tr.querySelector('[data-c="valor"]').value))}));}
  const at=()=>{semRepetir(j,'[data-c="insumo"]');let t=0;j.querySelectorAll('[data-lote-linhas] tr').forEach(tr=>{const i=insDe(tr.querySelector('[data-c="insumo"]').value),q=num(tr.querySelector('[data-c="qtd"]').value),v=num(tr.querySelector('[data-c="valor"]').value);t+=v;
    tr.querySelector('[data-c-un]').textContent=i.unL;tr.querySelector('[data-c="unit"]').value=q>0&&v>0?`${R(v/q)} por ${i.un}`:'';tr.querySelector('[data-c-ref]').textContent=num(c.precos[i.k])?`hoje nos parâmetros: ${R(num(c.precos[i.k]))}`:'';});
    j.querySelector('[data-k="total"]').value=R(t);};
  loteForm(j,'[data-c="insumo"]',lin,()=>INS.map(i=>i.k));const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}
function formCompra(reg,insPre){
  if(!reg)return formCompraLote(insPre);
  const b=reg||{data:hojeISO(),insumo:insPre||'cimento'},c=CFG();
  const j=janela(reg?'Editar entrada de insumo':'Entrada de insumo (compra)',`<div class="fin-linha">
      <div class="fin-fld"><label>Data da compra <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Insumo <span class="obg">*</span></label><select data-k="insumo">${INS.map(i=>`<option value="${i.k}" ${i.k===b.insumo?'selected':''}>${fe(i.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Quantidade <span data-un></span> <span class="obg">*</span></label><input data-k="qtd" inputmode="decimal" data-num="dec" value="${b.qtd?fe(String(b.qtd).replace('.',',')):''}"></div>
      <div class="fin-fld"><label>Valor total (R$) <span class="obg">*</span></label><input data-k="valor" value="${b.valor?fe(String(b.valor)):''}"></div>
      <div class="fin-fld"><label>Fornecedor <span class="obg">*</span></label><input data-k="fornecedor" value="${fe(b.fornecedor||'')}" list="vx-forn-pm"></div>
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
function formAjusteLote(itemPre){
  const ei=estoqueInsumos(),E=estoque(),todos=INS.map(i=>'insumo:'+i.k).concat(pecas().map(p=>'peca:'+p.rowid));
  const saldoDe=it=>it.startsWith('peca:')?((E.P[it.slice(5)]||{}).disp||0):((ei[it.slice(7)]||{}).saldo||0),unDe=it=>it.startsWith('peca:')?'peças':insDe(it.slice(7)).un;
  const opsHtml=v=>`<optgroup label="Insumos">${INS.map(i=>`<option value="insumo:${i.k}" ${('insumo:'+i.k)===v?'selected':''}>${fe(i.nome)}</option>`).join('')}</optgroup><optgroup label="Peças">${pecas().map(p=>`<option value="peca:${p.rowid}" ${('peca:'+p.rowid)===v?'selected':''}>${fe(p.nome)}</option>`).join('')}</optgroup>`;
  const lin=v=>`<tr><td><select data-j="item" data-prev="${fe(v)}">${opsHtml(v)}</select></td><td><input data-j="sist" readonly tabindex="-1"></td><td><input data-j="fis" inputmode="decimal" data-num="dec" placeholder="quanto tem"></td><td><input data-j="dif" readonly tabindex="-1"></td><td><button type="button" class="pm-x" data-pmf="l-x" title="Tirar esta linha"><i class="fas fa-xmark"></i></button></td></tr>`;
  const j=janela('Acerto de inventário',`<div class="fin-aviso"><div>Conte o que existe de verdade e informe na <b>Contagem física</b> — o sistema lança a diferença de cada item. Peça quebrada: use <b>Registrar avaria</b>.</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${hojeISO()}" max="${hojeISO()}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Motivo <span class="obg">*</span></label><input data-k="motivo" placeholder="Ex.: inventário do mês, saco de cimento empedrado"></div></div>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-scale-balanced"></i> Itens contados</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th>Item</th><th style="width:150px">Saldo no sistema</th><th style="width:140px">Contagem física</th><th style="width:140px">Diferença</th><th></th></tr></thead><tbody data-lote-linhas>${lin(itemPre||'insumo:cimento')}</tbody></table></div>
      <button type="button" class="gf-bt mini" data-pmf="l-add" style="margin-top:6px"><i class="fas fa-plus"></i> Outro item</button></div>`,
    [{html:'<i class="fas fa-floppy-disk"></i> Lançar acertos',cls:'pri',acao:async jj=>{
      const g=k=>String(jj.querySelector(`[data-k="${k}"]`).value||'').trim(),rows=[...jj.querySelectorAll('[data-lote-linhas] tr')].map(tr=>({item:tr.querySelector('[data-j="item"]').value,f:tr.querySelector('[data-j="fis"]').value.trim()}));
      if(!g('data'))throw new Error('Informe a data.');if(!g('motivo'))throw new Error('Informe o motivo do acerto (ex.: inventário do mês, saco empedrado, peça achada).');
      {const rp=repetido(rows.map(x=>x.item));if(rp)throw new Error('O mesmo item está em duas linhas: deixe uma só.');}
      const vazio=rows.find(x=>x.f==='');if(vazio)throw new Error(`Informe a contagem física de ${vazio.item.startsWith('peca:')?nomePeca(vazio.item.slice(5)):insDe(vazio.item.slice(7)).nome} (ou tire a linha).`);
      const L=rows.map(x=>({...x,qtd:Math.round((num(x.f)-saldoDe(x.item))*10000)/10000})).filter(x=>Math.abs(x.qtd)>1e-6);
      if(!L.length)throw new Error('As contagens batem com o sistema: não há acerto a lançar.');
      await gravarVarios(L.map(x=>[{tipo:'ajuste',data_lancamento:todayDateTime(),data:g('data'),item:x.item,qtd:x.qtd,motivo:g('motivo'),por:eu()},null]));
      toast(`${L.length} acerto(s) lançado(s)${rows.length>L.length?` — ${rows.length-L.length} item(ns) já batiam com o sistema`:''}.`,'success');}}],820);
  const at=()=>{semRepetir(j,'[data-j="item"]');j.querySelectorAll('[data-lote-linhas] tr').forEach(tr=>{const it=tr.querySelector('[data-j="item"]').value,s=saldoDe(it),f=tr.querySelector('[data-j="fis"]').value.trim(),un=unDe(it),d=num(f)-s;
    tr.querySelector('[data-j="sist"]').value=`${nf(s,2)} ${un}`;const de=tr.querySelector('[data-j="dif"]');de.value=f===''?'':`${d>0?'+':''}${nf(d,2)} ${un}`;de.style.color=f===''||Math.abs(d)<1e-6?'':d<0?'#B42318':'#067647';});};
  loteForm(j,'[data-j="item"]',lin,()=>todos);const corpo=j.querySelector('.fin-jan-corpo');corpo.addEventListener('input',at);corpo.addEventListener('change',at);at();
}
function formAjuste(reg,itemPre){
  if(!reg)return formAjusteLote(itemPre);
  const b=reg||{data:hojeISO(),item:itemPre||'insumo:cimento'},ei=estoqueInsumos(),E=estoque();
  const ops=`<optgroup label="Insumos">${INS.map(i=>`<option value="insumo:${i.k}" ${('insumo:'+i.k)===b.item?'selected':''}>${fe(i.nome)}</option>`).join('')}</optgroup><optgroup label="Peças">${pecas().map(p=>`<option value="peca:${p.rowid}" ${('peca:'+p.rowid)===b.item?'selected':''}>${fe(p.nome)}</option>`).join('')}</optgroup>`;
  const saldoDe=it=>it.startsWith('peca:')?((E.P[it.slice(5)]||{}).disp||0):((ei[it.slice(7)]||{}).saldo||0);
  const j=janela(reg?'Editar acerto de inventário':'Acerto de inventário',`<div class="fin-aviso"><div>Quando a contagem física não bate com o sistema: informe <b>quanto existe de verdade</b> — o sistema lança a diferença. Peça quebrada: use <b>Registrar avaria</b>.</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Item <span class="obg">*</span></label><select data-k="item">${ops}</select></div>
      <div class="fin-fld"><label>Saldo no sistema</label><input data-k="sist" readonly></div>
      <div class="fin-fld"><label>Contagem física <span class="obg">*</span></label><input data-k="fisico" inputmode="decimal" data-num="dec" value="${reg?fe(String(r2(saldoDe(reg.item))).replace('.',',')):''}"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Motivo <span class="obg">*</span></label><input data-k="motivo" value="${fe(b.motivo||'')}" placeholder="Ex.: inventário do mês, saco de cimento empedrado"></div></div>
      <div class="fin-aviso" style="margin-top:8px"><div data-aj-prev></div></div>`,
    [...(reg?[{html:'<i class="fas fa-trash"></i> Excluir',acao:async()=>{setTimeout(()=>apagarReg(reg,'Acerto de inventário'),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Lançar acerto',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg))throw new Error(GS.MSG_DONO);
      const g=k=>jj.querySelector(`[data-k="${k}"]`),it=g('item').value,sist=saldoDe(it)-(reg&&reg.item===it?num(reg.qtd):0),fis=num(g('fisico').value);
      if(String(g('fisico').value).trim()==='')throw new Error('Informe a contagem física.');
      const o=reg?{...reg}:{tipo:'ajuste',data_lancamento:todayDateTime()};o.data=g('data').value;o.item=it;o.qtd=Math.round((fis-sist)*10000)/10000;o.motivo=g('motivo').value.trim();if(!o.motivo)throw new Error('Informe o motivo do acerto (ex.: inventário do mês, saco empedrado, peça achada).');o.por=eu();
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
  const L=vendas().filter(v=>!q||[v.cliente,v.numero,(v.itens||[]).map(it=>nomePeca(it.peca)).join(' ')].join(' ').toLowerCase().includes(q));
  const PEN={};pendenciasProducao(E).forEach(x=>PEN[x.v.rowid]=x.its);
  const card=v=>{const f=faseVenda(v,E),fim=encerrada(v),tot=totalVenda(v),pago=pagoDe(v),pz=dt(v.prazo_entrega),ag=v.agenda&&dt(v.agenda.data),pc=tot?Math.min(100,pago/tot*100):0,a=E.aloc[v.rowid]||{};
    const fc=fim?FASES_V[5]:(FASES_V.find(x=>x.k===f)||FASES_V[4]),dv=fim?devolvidoDe(v):null,pen=PEN[v.rowid]||[];
    // em produção: o andamento de cada ordem (a fazer · em cura até)
    const andam=f==='producao'?opsDaVenda(v).map(o=>{const x=andamentoOP(o),t=[x.falta?`${nf(x.falta,0)} a fazer`:'',x.cura?`${nf(x.cura,0)} em cura até ${brDe(x.ate).slice(0,5)}`:''].filter(Boolean).join(' · ');return t?`<li class="mais"><i class="fas fa-industry"></i> OP nº ${fe(String(o.numero))}: ${t}</li>`:'';}).join(''):'';
    return `<article class="vk-card${fim?' vk-fim':''}" style="--cor:${fc.cor}" data-pm="venda" data-id="${v.rowid}" draggable="${fim?'false':'true'}" data-card="${v.rowid}">
      <div class="vk-top"><b>Venda nº ${fe(String(v.numero||''))}</b>${fim?pill(v.status==='devolvida'?'devolvida':'cancelada','err',v.status==='devolvida'?'fa-rotate-left':'fa-ban'):pill(v.tipo_venda==='pronta'?'pronta entrega':'encomenda',v.tipo_venda==='pronta'?'ok':'info')}</div>
      <div class="vk-obra"><i class="fas fa-user"></i>${fe(v.cliente||'—')}${v.canal==='atacado'?' · atacado':''}</div>
      <ul class="vk-itens">${(v.itens||[]).slice(0,3).map((it,i)=>`<li><span>${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}${f==='producao'?` <small>(${nf(a[i]||0,0)} prontas)</small>`:''}</span><b>${R(num(it.qtd)*num(it.preco))}</b></li>`).join('')}${(v.itens||[]).length>3?`<li class="mais">+ ${(v.itens||[]).length-3} item(ns)</li>`:''}${andam}</ul>
      ${pen.length?`<div class="vk-sub">${pill(`sem ordem de produção: ${pen.map(x=>nf(x.qtd,0)+' pç').join(', ')}`,'err','fa-triangle-exclamation')}</div>`:''}
      ${ag&&!fim&&f!=='entregue'?`<div class="vk-sub">${pill('entrega agendada '+brDe(ag).slice(0,5)+(v.agenda.caminhao?' · '+fe(v.agenda.caminhao):''),'info','fa-truck')}</div>`:''}
      ${fim?`<div class="vk-sub vk-motivo"><i class="fas fa-comment-dots"></i> ${fe(motivoFim(v)||'sem motivo informado')}${dv.avaria?` · ${nf(dv.avaria,0)} avariada(s)`:''}${dv.estoque?` · ${nf(dv.estoque,0)} de volta ao estoque`:''}</div>
      <div class="vk-val"><span>${fe(brDe(dt(dataFim(v))))} · estorno ${R(dv.estorno)}</span><b>${pago>0.009?'ficou '+R(pago):R(0)}</b></div>`
      :`<div class="vk-val"><span>pago ${R(pago)}${pz&&!ag&&f!=='entregue'?' · prevista '+brDe(pz).slice(0,5):''}</span><b>${R(tot)}</b></div><div class="pm-barra ${pc>=100?'ok':''}"><i style="width:${pc}%"></i></div>`}</article>`;};
  const cols=FASES_V.map(fc=>{let itens=fc.k==='cancelada'?L.filter(v=>encerrada(v)&&(!dt(dataFim(v))||dt(dataFim(v))>=lim)):L.filter(v=>!encerrada(v)&&faseVenda(v,E)===fc.k);
    if(fc.k==='entregue')itens=itens.filter(v=>!dt(v.entrega)||dt(v.entrega)>=lim);
    itens.sort((a,b)=>String(fc.k==='cancelada'?dataFim(b):b.data||'').localeCompare(String(fc.k==='cancelada'?dataFim(a):a.data||'')));
    return fc.k==='cancelada'?{c:fc,itens,sub:`${itens.length} · ficou ${R(itens.reduce((s,v)=>s+Math.max(0,pagoDe(v)),0))}`}:{c:fc,itens,total:itens.reduce((s,v)=>s+totalVenda(v),0)};});
  setTimeout(()=>{const w=document.querySelector('#pm-app .vk-quadro');if(w&&!w._lig){w._lig=1;GS.ligarArraste(w,moverVenda);}},0);
  const nPen=Object.keys(PEN).length;
  return cabG('Vendas','Pronta entrega (peça pronta, pagamento completo) ou encomenda (reserva com '+nf(num(c.sinal),0)+'% de sinal; sem peça pronta, a ordem de produção sai sozinha). O cartão anda sozinho: sinal pago → produção → curada → pronto. O saldo pode ser pago antes ou na entrega. Cancelados e devolvidos ficam na última coluna.',
      `<button type="button" class="gf-bt pri" data-pm="venda-nova"><i class="fas fa-plus"></i> Nova venda</button>`)+sub+
    (nPen?`<div class="fin-aviso laranja" style="margin:0 0 10px"><div><b>${nPen} venda(s)</b> com peças reservadas sem ordem de produção (o estoque não cobre). <button type="button" class="gf-bt mini pri" data-pm="mandar-prod" style="margin-left:6px"><i class="fas fa-industry"></i> Mandar para a produção</button></div></div>`:'')+
    `<div class="pm-filtros"><input type="search" data-pm-busca placeholder="Buscar cliente, nº ou peça…" value="${fe(PM.busca)}" style="min-width:260px"><span class="pm-mini">Entregues, cancelados e devolvidos: últimos 60 dias (os anteriores ficam nos Relatórios).</span></div>`+
    GS.colunasHtml(cols,card,{sinal:'Nenhuma encomenda esperando sinal',producao:'Nada em produção para venda',pagamento:'Nenhum pedido pronto esperando pagamento',liberado:'Nada liberado para entrega',entregue:'Entregas aparecem aqui',cancelada:'Pedidos cancelados ou devolvidos aparecem aqui'});
}
/* ── entregas: agenda da semana por caminhão ── */
const segunda=d=>{d=new Date(d);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;};
function pesoVenda(v){return (v.itens||[]).reduce((s,it)=>{const p=pecaDe(it.peca);return s+(p?calc(p,1).peso*num(it.qtd):0);},0);}
const PERIODOS=['Manhã','Tarde','Dia todo'];
function telaEntregas(sub){
  const c=CFG(),E=estoque(),h=hoje0(),ini=dt(PM.semana)||segunda(h),dias7=[...Array(7)].map((_,i)=>addD(ini,i)),cams=(c.caminhoes||[]).filter(x=>x&&x.nome);
  const vs=vendas().filter(v=>v.status!=='cancelada'),doDia=d=>vs.filter(v=>v.agenda&&v.agenda.data===isoDe(d));
  // retirada na fábrica não vai para o caminhão: fica numa lista à parte
  const abertas=vs.filter(v=>['aguardando_sinal','reservado'].includes(v.status)),retiradas=abertas.filter(v=>v.entrega_tipo==='retira');
  const semData=abertas.filter(v=>v.entrega_tipo!=='retira'&&!(v.agenda&&v.agenda.data)).sort((a,b)=>String(a.prazo_entrega||'9').localeCompare(String(b.prazo_entrega||'9')));
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
      ${semData.length?`<div class="pm-grid">${semData.map(cartao).join('')}</div>`:'<div class="gf-vazio ok"><i class="fas fa-circle-check"></i><p>Todos os pedidos abertos têm data de entrega.</p></div>'}</section>
    ${retiradas.length?`<section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas fa-store"></i> Retiradas na fábrica</h3><p>O cliente busca as peças: não usam caminhão. Abra o pedido e use <b>Registrar a retirada</b> quando ele levar.</p></div></div><div class="pm-grid">${retiradas.map(cartao).join('')}</div></section>`:''}`;
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
  const linP=x=>`<tr data-pr><td style="width:66px">${thumbBt(x.peca)}</td><td><select data-pp data-prev="${fe(String(x.peca))}">${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(x.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></td><td><input data-pv data-mask="moeda" value="${x.preco?fe(R(num(x.preco))):''}" placeholder="R$ 0,00"></td><td class="pm-mini" data-pref></td><td><button type="button" class="pm-x" data-pmf="pr-x"><i class="fas fa-xmark"></i></button></td></tr>`;
  const j=janela(reg?`Cliente — ${b.nome}`:'Novo cliente',`<div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Nome / razão social <span class="obg">*</span></label><input data-k="nome" value="${fe(b.nome||'')}"></div>
      <div class="fin-fld"><label>CPF / CNPJ</label><input data-k="doc" value="${fe(b.doc||'')}"></div><div class="fin-fld"><label>Telefone / WhatsApp <span class="obg">*</span></label><input data-k="telefone" value="${fe(b.telefone||'')}"></div>
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
      if(!o.nome)throw new Error('Informe o nome do cliente.');if(new Set(o.precos.map(x=>String(x.peca))).size<o.precos.length)throw new Error('A mesma peça está duas vezes na tabela de preços: deixe uma linha só.');const dup=cliDe(o.nome);if(dup&&(!reg||String(dup.rowid)!==String(reg.rowid)))throw new Error('Já existe um cliente com esse nome.');
      await gravar(o,reg?reg.rowid:null);toast('Cliente salvo.','success');}}],940);
  const at=()=>(semRepetir(j,'[data-pp]'),j.querySelectorAll('[data-pr]')).forEach(tr=>{const p=pecaDe(tr.querySelector('[data-pp]').value);if(!p)return;const x=calc(p,1);tr.querySelector('[data-pref]').textContent=`varejo ${R(x.preco||x.sug)}${num(p.preco_atacado)?` · atacado ${R(num(p.preco_atacado))}`:''} · custo ${R(x.un)}`;});
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('click',ev=>{const b2=ev.target.closest('[data-pmf]');if(!b2)return;const f=b2.dataset.pmf;
    if(f==='pick'){const tr=b2.closest('tr'),s=tr.querySelector('[data-pp]');return escolherPeca(s.value,pid=>{s.value=pid;s.dispatchEvent(new Event('change',{bubbles:true}));});}
    if(f==='pr-add'){const usadas=new Set([...j.querySelectorAll('[data-pp]')].map(s=>s.value)),p0=pecas().find(p=>!usadas.has(String(p.rowid)));if(!p0)return toast('Todas as peças já têm preço para este cliente.','error');
      j.querySelector('[data-precos]').insertAdjacentHTML('beforeend',linP({peca:p0.rowid,preco:''}));pintarFotos(j);}else if(f==='pr-x')b2.closest('tr').remove();at();});
  corpo.addEventListener('change',ev=>{const t=ev.target;if(t.matches('[data-pp]')){
      if([...j.querySelectorAll('[data-pp]')].some(s=>s!==t&&s.value===t.value)){const nova=t.value;t.value=t.dataset.prev||'';toast(`"${nomePeca(nova)}" já tem preço nesta tabela.`,'error');}else t.dataset.prev=t.value;
      trocarThumb(t.closest('tr'),t.value);}at();});
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
  const linV=x=>`<div class="fin-linha" data-lin="vend" style="margin-bottom:6px;grid-template-columns:1fr 140px 170px 36px"><div class="fin-fld"><input data-vn value="${fe(x.nome||'')}" placeholder="Nome"></div><div class="fin-fld"><input data-vp value="${x.pct!=null&&x.pct!==''?fe(String(x.pct).replace('.',',')):''}" placeholder="Comissão %" data-sem-mascara="1" inputmode="decimal" data-num="dec"></div><div class="fin-fld"><input data-vt value="${fe(x.telefone||'')}" placeholder="Telefone"></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
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
    {ok:pago>=tot-0.009,txt:`Pagamento completo — antes ou na hora da entrega: ${R(pago)} de ${R(tot)}${pago<tot-0.009?` — <b>faltam ${R(tot-pago)}</b>`:''}`}];
}
// quem pode cancelar: o Administrador sempre; os demais só pedido sem dinheiro recebido e sem produção começada
const podeCancelar=v=>!encerrada(v)&&(ehAdm()||(pagoDe(v)<=0.009&&!opsDaVenda(v).some(opIniciada)&&v.status!=='entregue'));
async function moverVenda(id,col){
  const v=vendaDe(id);if(!v||!col)return;const f=faseVenda(v);if(col===f||(col==='cancelada'&&encerrada(v)))return;render();
  if(encerrada(v))return trava(`Venda nº ${v.numero}: pedido encerrado`,[{ok:false,txt:v.status==='devolvida'?'Esta venda foi devolvida por inteiro: o pedido está encerrado e não volta para outra fase.':'Esta venda foi cancelada: o pedido está encerrado. Para vender de novo, crie uma nova venda.'}]);
  if(col==='cancelada')return podeCancelar(v)?cancelarVenda(v):trava(`Venda nº ${v.numero}: não pode ser cancelada por você`,[{ok:false,txt:'Pedido com dinheiro recebido, produção começada ou já entregue: só o Administrador cancela (o estorno e o destino das peças precisam ser conferidos).'}]);
  if(f==='entregue')return trava(`Venda nº ${v.numero}: já foi entregue`,[{ok:false,txt:'Venda entregue não volta de fase. Use <b>Devolução / estorno</b> na ficha da venda, ou arraste para <b>Cancelados</b> (Administrador) para devolver tudo.'}]);
  if(col==='entregue'&&(f==='liberado'||f==='pagamento'))return entregar(v);
  if(col==='entregue')return trava(`Venda nº ${v.numero}: ainda não pode ser entregue`,depsVenda(v),f==='sinal'?{rot:'Receber o sinal',f:()=>registrarPagamento(v)}:null);
  if(f==='sinal'&&col!=='sinal')return trava(`Venda nº ${v.numero}: falta o sinal`,depsVenda(v).slice(0,1),{rot:'Receber o sinal',f:()=>registrarPagamento(v)});
  if(col==='liberado'&&f==='pagamento')return registrarPagamento(v);
  trava(`Venda nº ${v.numero}: o cartão muda de coluna sozinho`,[{ok:true,txt:'Aguardando sinal → Reservado: quando o sinal é pago (Receber o sinal)'},{ok:true,txt:'Em produção → Pronto: quando as peças da venda terminam a cura'},{ok:true,txt:'Pronto → Liberado: quando o pagamento fica completo (ou arraste direto para Entregue e receba na entrega)'},{ok:true,txt:'→ Entregue: arraste para Entregue ou use o botão Entregar'},{ok:true,txt:'→ Cancelados: arraste para Cancelados ou use Cancelar venda'}].concat(depsVenda(v)));
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
  const itemLin=it=>`<tr data-item><td style="width:66px">${thumbBt(it.peca)}</td><td><select data-i="peca" data-prev="${fe(String(it.peca))}" ${travarItens?'disabled':''}>${pecas().map(p=>`<option value="${p.rowid}" ${String(p.rowid)===String(it.peca)?'selected':''}>${fe(p.nome)}</option>`).join('')}</select></td>
    <td><input data-i="qtd" inputmode="numeric" data-num="int" value="${fe(String(it.qtd||''))}" placeholder="0" ${travarItens?'readonly':''}></td><td><input data-i="preco" data-mask="moeda" value="${it.preco!==''&&it.preco!=null?fe(R(num(it.preco))):''}" ${travarItens?'readonly':''}></td>
    <td data-i="disp" class="pm-mini" style="min-width:150px"></td><td class="n" data-i="tot" style="white-space:nowrap;text-align:right"></td><td>${travarItens?'':'<button type="button" class="pm-x" data-pmf="item-x"><i class="fas fa-xmark"></i></button>'}</td></tr>`;
  const entTipo=reg?(reg.entrega_tipo||(reg.end&&reg.end.logradouro?'entrega':'retira')):'',e=b.end||{},sel=(k,ops2,v)=>`<select data-k="${k}">${ops2.map(([a,l])=>`<option value="${a}" ${a===v?'selected':''}>${l}</option>`).join('')}</select>`;
  const j=janela(reg?`Editar venda nº ${reg.numero}`:'Nova venda',`${travarItens&&reg?`<div class="fin-aviso laranja"><div>${iniciada?'A produção desta venda <b>já começou</b>: os itens não podem mais ser mudados (só contato, endereço, prazo e observações).':'Os itens desta venda não podem mais ser mudados.'}</div></div>`:''}
    <div class="fin-linha" style="margin-top:6px">
      <div class="fin-fld"><label>Tipo de venda</label>${sel('tipo_venda',[['encomenda','Encomenda (reserva com sinal)'],['pronta','Pronta entrega (peça pronta)']],b.tipo_venda||'encomenda')}</div>
      <div class="fin-fld"><label>Canal / tabela de preço</label>${sel('canal',[['varejo','Varejo'],['atacado','Atacado']],b.canal||'varejo')}</div>
      <div class="fin-fld"><label>Data do pedido <span class="obg">*</span></label><input type="date" data-k="data" value="${fe(b.data||'')}"></div>
      <div class="fin-fld"><label>Entrega prevista <span class="obg" data-obg-enc>*</span></label><input type="date" data-k="prazo_entrega" value="${fe(b.prazo_entrega||'')}"></div>
      <div class="fin-fld"><label>Vendedor</label><select data-k="vendedor"><option value="">— sem vendedor —</option>${vends.concat(b.vendedor&&!vends.some(x=>x.nome===b.vendedor)?[{nome:b.vendedor}]:[]).map(x=>`<option ${x.nome===b.vendedor?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>
      <div class="fin-fld"><label>Comissão (%)</label><input data-k="comissao_pct" value="${b.comissao_pct!=null&&b.comissao_pct!==''?fe(String(b.comissao_pct)):''}"></div></div>
    <div class="pm-bloco" style="margin-top:10px"><h5><i class="fas fa-user"></i> Cliente</h5><div class="fin-linha">
      <div class="fin-fld" style="grid-column:span 2"><label>Nome / razão social <span class="obg">*</span></label><input data-k="cliente" value="${fe(b.cliente||'')}" list="pm-clientes" placeholder="cliente do cadastro ou novo"></div>
      <div class="fin-fld"><label>CPF / CNPJ</label><input data-k="doc" value="${fe(b.doc||'')}"></div><div class="fin-fld"><label>Telefone / WhatsApp <span class="obg" data-obg-enc>*</span></label><input data-k="telefone" value="${fe(b.telefone||'')}"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Entrega ou retirada <span class="obg">*</span></label><select data-k="entrega_tipo"><option value="" ${entTipo?'':'selected'}>— escolha —</option><option value="entrega" ${entTipo==='entrega'?'selected':''}>Entregar no endereço do cliente</option><option value="retira" ${entTipo==='retira'?'selected':''}>Cliente retira na fábrica</option></select></div>
      <div class="fin-fld"><label>CEP <span class="obg" data-obg-ent>*</span></label><input data-k="cep" value="${fe(e.cep||'')}" placeholder="00000-000"></div>
      <div class="fin-fld" style="grid-column:span 2"><label>Endereço de entrega (rua) <span class="obg" data-obg-ent>*</span></label><input data-k="logradouro" value="${fe(e.logradouro||'')}" placeholder="digite a rua: o sistema sugere o endereço com o CEP" autocomplete="off"></div>
      <div class="fin-fld"><label>Número <span class="obg" data-obg-ent>*</span></label><input data-k="numero" value="${fe(e.numero||'')}" placeholder="ou S/N"></div><div class="fin-fld"><label>Complemento</label><input data-k="complemento" value="${fe(e.complemento||'')}"></div>
      <div class="fin-fld"><label>Bairro <span class="obg" data-obg-ent>*</span></label><input data-k="bairro" value="${fe(e.bairro||'')}"></div><div class="fin-fld"><label>Cidade <span class="obg" data-obg-ent>*</span></label><input data-k="cidade" value="${fe(cidUF(e.cidade,e.uf))}" placeholder="Ex.: Itarantim, BA"></div><div class="fin-fld"><label>UF <span class="obg" data-obg-ent>*</span></label><input data-k="uf" value="${fe(e.uf||'')}" maxlength="2"></div></div>
      <p class="pm-mini" data-cli-info style="margin:6px 0 0"></p></div>
    <datalist id="pm-clientes">${clientes.map(x=>`<option value="${fe(x.nome)}">`).join('')}</datalist>
    <div class="pm-bloco"><h5><i class="fas fa-cubes"></i> Itens</h5><div class="pm-rolar"><table class="pm-itens"><thead><tr><th></th><th>Peça</th><th style="width:80px">Quant.</th><th style="width:130px">Preço unit. (R$)</th><th>Estoque e preço</th><th style="width:100px;text-align:right">Total</th><th></th></tr></thead><tbody data-itens>${(b.itens||[]).map(itemLin).join('')}</tbody></table></div>
      ${travarItens?'':'<button type="button" class="gf-bt mini" data-pmf="item-add" style="margin-top:6px"><i class="fas fa-plus"></i> Item</button>'}</div>
    <div class="fin-linha"><div class="fin-fld"><label>Desconto (%)</label><input data-k="desconto_pct" value="${b.desconto_pct?fe(String(b.desconto_pct)):''}" ${travarItens?'readonly':''}></div><div class="fin-fld"><label>Desconto em reais</label><input data-k="desc_rs" readonly></div>
      <div class="fin-fld" data-frete-fld><label>Frete (R$)</label><div style="display:flex;gap:6px"><input data-k="frete" value="${num(b.frete)?fe(R(num(b.frete))):''}" ${travarItens?'readonly':''} style="flex:1;min-width:0">${travarItens?'':'<button type="button" class="gf-bt mini" data-pmf="frete" title="Calcular pelo endereço"><i class="fas fa-route"></i> Calcular</button>'}</div><small class="pm-mini" data-frete-info>${fe(b.frete_info||'')}</small></div>
      <div class="fin-fld"><label>Cliente quer nota fiscal?</label><select data-k="nf_quer"><option value="nao" ${!(b.nf||{}).quer?'selected':''}>Não</option><option value="sim" ${(b.nf||{}).quer?'selected':''}>Sim</option></select></div>
      <div class="fin-fld" data-nf-num ${(b.nf||{}).quer?'':'hidden'}><label>Nº da nota fiscal</label><input data-k="nf_numero" value="${fe((b.nf||{}).numero||'')}" placeholder="preencher ao emitir"></div>
      <div class="fin-fld" style="grid-column:1/-1"><label>Observações</label><input data-k="obs" value="${fe(b.obs||'')}"></div></div>
    ${reg?'':`<div class="pm-bloco" data-pg><h5><i class="fas fa-hand-holding-dollar"></i> <span data-pg-tit>Sinal recebido agora</span></h5><div class="fin-linha">
      <div class="fin-fld"><label>O cliente pagou agora</label><select data-k="pg_modo"><option value="sinal">Só o sinal</option><option value="tudo">Tudo (pagamento completo)</option><option value="nada">Nada ainda</option><option value="outro">Outro valor</option></select></div>
      <div class="fin-fld"><label>Valor recebido (R$)</label><input data-k="pg_valor" data-mask="moeda" placeholder="R$ 0,00"></div><div class="fin-fld"><label>Forma</label><select data-k="pg_forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <label class="nfc-amb" data-pg-levou hidden style="grid-column:1/-1"><input type="checkbox" data-k="levou"><span>O cliente já levou as peças agora (entrega no balcão)</span></label></div><p class="pm-mini" data-pg-dica style="margin:6px 0 0"></p></div>`}
    <div class="pm-big"><span>Total da venda</span><b data-v-tot>—</b><span data-v-est></span></div>`,
    [...(reg&&ehAdm()&&pagoDe(reg)<=0.009&&!ops.length?[{html:'<i class="fas fa-trash"></i> Excluir (lançado errado)',acao:async()=>{if(pagoDe(reg)>0||ops.length)throw new Error('Venda com pagamento ou produção: use Cancelar venda.');setTimeout(()=>apagarReg(reg,`Venda nº ${reg.numero}`),60);}}]:[]),
     {html:'<i class="fas fa-floppy-disk"></i> Salvar e ver o pedido',cls:'pri',acao:async jj=>{
      if(reg&&GS.podeMexer&&!GS.podeMexer(reg)&&!ehAdm())throw new Error(GS.MSG_DONO);
      const g=k=>String((jj.querySelector(`[data-k="${k}"]`)||{}).value||'').trim(),o=reg?{...reg}:{tipo:'venda',numero:proxNum('venda','numero'),pagamentos:[],data_lancamento:todayDateTime()};
      ['cliente','doc','telefone','data','prazo_entrega','obs','tipo_venda','canal','vendedor'].forEach(k=>o[k]=g(k));o.comissao_pct=o.vendedor?num(g('comissao_pct')):0;
      o.end={cep:g('cep'),logradouro:g('logradouro'),numero:g('numero'),complemento:g('complemento'),bairro:g('bairro'),cidade:g('cidade'),uf:g('uf').toUpperCase()};
      o.entrega_tipo=g('entrega_tipo');if(!o.entrega_tipo)throw new Error('Informe se o cliente quer a entrega ou se vai retirar na fábrica.');
      if(o.entrega_tipo==='entrega'){const falta=[['cep','CEP'],['logradouro','rua'],['numero','número'],['bairro','bairro'],['cidade','cidade'],['uf','UF']].filter(([k])=>!o.end[k]).map(([,l])=>l);
        if(falta.length)throw new Error(`Para entregar, preencha o endereço: falta ${falta.join(', ')}.`);}
      else if(o.agenda&&o.agenda.data)o.agenda=null;   /* retirada não vai para a agenda do caminhão */
      o.nf={quer:g('nf_quer')==='sim',numero:g('nf_numero')};
      if(!travarItens){o.itens=lerItens(jj);o.desconto_pct=num(g('desconto_pct'));o.frete=g('entrega_tipo')==='retira'?0:r2(num(g('frete')));o.frete_info=(jj.querySelector('[data-frete-info]')||{}).textContent||'';if(/^Calculando/.test(o.frete_info))throw new Error('Espere o cálculo do frete terminar.');delete o.desconto;}
      if(!o.cliente)throw new Error('Informe o cliente.');if(!o.data)throw new Error('Informe a data do pedido.');if(!(o.itens||[]).length)throw new Error('Inclua ao menos um item com quantidade.');
      {const vis={};for(const it of o.itens){if(vis[it.peca])throw new Error(`"${nomePeca(it.peca)}" está duas vezes no pedido: deixe uma linha só e some as quantidades.`);vis[it.peca]=1;}}
      if(o.desconto_pct<0||o.desconto_pct>=100)throw new Error('O desconto deve ficar entre 0% e 99%.');
      if(o.comissao_pct<0||o.comissao_pct>30)throw new Error('A comissão deve ficar entre 0% e 30%.');
      if((o.itens||[]).some(it=>!(it.preco>0)))throw new Error('Todo item precisa de preço.');
      if(!reg&&r2(num(g('pg_valor')))>r2(totalVenda(o))+0.009)return trava('Pagamento maior que a venda',[{ok:false,txt:`Valor recebido ${R(num(g('pg_valor')))} — a venda é de ${R(totalVenda(o))}. Troco não entra no sistema: informe só o valor da venda.`}]);
      o.total=totalVenda(o);const tot=o.total;
      if(!reg){const pv=r2(num(g('pg_valor')));if(pv>0)o.pagamentos=[{data:hojeISO(),valor:pv,forma:g('pg_forma'),tipo:o.tipo_venda==='pronta'||pv>=tot-0.009?'pagamento':'sinal',por:eu()}];}
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
    j.querySelector('[data-nf-num]').hidden=j.querySelector('[data-k="nf_quer"]').value!=='sim';
    // encomenda: telefone e entrega prevista são obrigatórios (balcão/pronta entrega não)
    j.querySelectorAll('[data-obg-enc]').forEach(s=>s.hidden=tp==='pronta');
    // entregar: o endereço completo é obrigatório e tem frete; retirada na fábrica: sem endereço obrigatório e sem frete
    const et=j.querySelector('[data-k="entrega_tipo"]').value;j.querySelectorAll('[data-obg-ent]').forEach(s=>s.hidden=et!=='entrega');
    const ff=j.querySelector('[data-frete-fld]');if(ff){ff.hidden=et==='retira'&&!travarItens;if(et==='retira'&&!travarItens){const fr=j.querySelector('[data-k="frete"]');if(fr&&fr.value){fr.value='';const fi=j.querySelector('[data-frete-info]');if(fi)fi.textContent='';}}}};
  const at=()=>{if(!j.isConnected||!j.querySelector('[data-v-tot]'))return;semRepetir(j,'[data-i="peca"]');const its=lerItens(j),cli=cliAtual(),canal=canalAtual();
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
    // pagamento na criação: só o sinal, tudo, nada ou outro valor (pronta entrega = tudo)
    const md=j.querySelector('[data-k="pg_modo"]'),pv=j.querySelector('[data-k="pg_valor"]');
    if(md&&pv){const tp=j.querySelector('[data-k="tipo_venda"]').value;if(tp==='pronta')md.value='tudo';md.disabled=tp==='pronta';
      const alvo=md.value==='tudo'?tot:md.value==='sinal'?r2(tot*num(c.sinal)/100):md.value==='nada'?0:null;if(alvo!=null){pv.value=alvo>0?R(alvo):'';pv.readOnly=true;}else pv.readOnly=false;}
    const dica=j.querySelector('[data-pg-dica]');if(dica){const tp=j.querySelector('[data-k="tipo_venda"]').value;dica.innerHTML=tp==='pronta'?`Valor a receber: <b>${R(tot)}</b>.`:`Sinal mínimo (${nf(num(c.sinal),0)}%): <b>${R(tot*num(c.sinal)/100)}</b>. Depois do sinal, o resto é pago <b>uma vez só</b>: antes (Completar pagamento) ou na hora da entrega. Sem o sinal, o pedido fica "aguardando sinal" e não reserva peça nem gera produção.`;}
    const ci=j.querySelector('[data-cli-info]');if(ci)ci.innerHTML=cli?`<i class="fas fa-address-book"></i> Cliente do cadastro${cli.canal==='atacado'?' · atacado':''}${(cli.precos||[]).length?` · ${(cli.precos||[]).length} preço(s) próprio(s)`:''}${num(cli.desconto_pct)?` · desconto padrão ${nf(num(cli.desconto_pct),1)}%`:''}`:(j.querySelector('[data-k="cliente"]').value.trim()?'<i class="fas fa-user-plus"></i> Cliente novo: entra no cadastro ao salvar.':'');};
  const reprecificar=tr0=>{if(travarItens)return;const cli=cliAtual(),canal=canalAtual();j.querySelectorAll('[data-item]').forEach(tr=>{if(tr0&&tr!==tr0)return;const p=pecaDe(tr.querySelector('[data-i="peca"]').value);if(p)tr.querySelector('[data-i="preco"]').value=R(precoPara(p,canal,cli).v);});};
  const corpo=j.querySelector('.fin-jan-corpo');
  corpo.addEventListener('input',ev=>{if(ev.target.matches('[data-k="frete"]')){const fi=j.querySelector('[data-frete-info]');if(fi)fi.textContent='';}clearTimeout(j._pmT);j._pmT=setTimeout(at,100);});
  corpo.addEventListener('change',ev=>{const t=ev.target;
    if(t.matches('[data-i="peca"]')){const tr=t.closest('tr');
      // a mesma peça não entra duas vezes: volta à anterior e avisa
      if([...j.querySelectorAll('[data-i="peca"]')].some(s=>s!==t&&s.value===t.value)){const nova=t.value;t.value=t.dataset.prev||'';trocarThumb(tr,t.value);toast(`"${nomePeca(nova)}" já está no pedido em outra linha: aumente a quantidade lá.`,'error');}
      else{t.dataset.prev=t.value;trocarThumb(tr,t.value);reprecificar(tr);}}
    if(t.matches('[data-k="pg_valor"]')){const md=j.querySelector('[data-k="pg_modo"]');if(md&&!md.disabled)md.value='outro';}
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
    if(f==='item-add'){const usadas=new Set([...j.querySelectorAll('[data-i="peca"]')].map(s=>s.value)),p0=pecas().find(p=>!usadas.has(String(p.rowid)));
      if(!p0)return toast('Todas as peças cadastradas já estão no pedido.','error');
      j.querySelector('[data-itens]').insertAdjacentHTML('beforeend',itemLin({peca:p0.rowid,qtd:'',preco:precoPara(p0,canalAtual(),cliAtual()).v}));pintarFotos(j);}
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
  const fim=encerrada(v),pen=fim?[]:((pendenciasProducao(E).find(x=>String(x.v.rowid)===String(v.rowid))||{}).its||[]);
  if((v.nf||{}).quer||f==='entregue'||fim)bts.push({html:`<i class="fas fa-file-invoice"></i> ${fim?'Anexar nota (venda ou devolução)':'Anexar nota fiscal'}`,acao:async()=>{anexarNota(v);return false;}});
  // cancelar: o Administrador sempre; os demais só pedido sem dinheiro e sem produção (antes da entrega a produção feita fica no estoque; depois, é a devolução de tudo)
  if(podeCancelar(v))bts.push({html:'<i class="fas fa-ban"></i> Cancelar venda',acao:async()=>{setTimeout(()=>cancelarVenda(v),60);}});
  if((f==='entregue'||fim)&&ehAdm()&&pago>0.009)bts.push({html:`<i class="fas fa-hand-holding-dollar"></i> ${fim?'Estornar o que ficou':'Estorno sem devolução'}`,acao:async()=>{setTimeout(()=>estornoSimples(v),60);}});
  if(fim&&ehAdm())bts.unshift({html:'<i class="fas fa-trash"></i> Excluir venda',acao:async()=>{setTimeout(()=>excluirVenda(v),60);}});
  if(f==='entregue')bts.push({html:'<i class="fas fa-rotate-left"></i> Devolução / estorno',acao:async()=>{setTimeout(()=>devolver(v),60);}});
  if(f==='entregue')bts.push({html:'<i class="fas fa-heart-crack"></i> Avaria na entrega',acao:async()=>{setTimeout(()=>formAvaria(null,(v.itens||[])[0]&&v.itens[0].peca,{venda:v.rowid,origem:'transporte'}),60);}});
  if(!fim&&f!=='entregue'&&v.entrega_tipo!=='retira')bts.push({html:'<i class="fas fa-calendar-days"></i> Agendar entrega',acao:async()=>{setTimeout(()=>formAgenda(v),60);}});
  if(!fim&&f!=='entregue')bts.push({html:'<i class="fas fa-pen"></i> Editar',acao:async()=>{setTimeout(()=>formVenda(v),60);}});
  if(pen.length)bts.push({html:'<i class="fas fa-industry"></i> Mandar para a produção',acao:async()=>{await mandarProducao([{v,its:pen}]);const v2=vendaDe(v.rowid);if(v2)setTimeout(()=>fichaVenda(v2),120);return false;}});
  // pagamento em no máximo dois passos: o sinal e, depois, o resto (antes ou na entrega)
  if(f==='sinal')bts.push({html:'<i class="fas fa-hand-holding-dollar"></i> Receber o sinal',cls:'pri',acao:async()=>{setTimeout(()=>registrarPagamento(v),60);}});
  else if(['producao','pagamento','liberado'].includes(f)&&pago<tot-0.009)bts.push({html:`<i class="fas fa-hand-holding-dollar"></i> ${pago>0.009?'Completar pagamento':'Receber pagamento'} (${R(tot-pago)})`,cls:f==='producao'?'pri':'',acao:async()=>{setTimeout(()=>registrarPagamento(v),60);}});
  const retV=v.entrega_tipo==='retira';
  if(f==='liberado')bts.push({html:retV?'<i class="fas fa-store"></i> Registrar a retirada':'<i class="fas fa-truck"></i> Entregar',cls:'pri',acao:async()=>{setTimeout(()=>entregar(v),60);}});
  if(f==='pagamento')bts.push({html:retV?'<i class="fas fa-store"></i> Retirada e receber o saldo':'<i class="fas fa-truck"></i> Entregar e receber o saldo',cls:'pri',acao:async()=>{setTimeout(()=>entregar(v),60);}});
  const lts=(f==='entregue'||v.status==='devolvida')?(rastreio().porVenda[v.rowid]||[]):[];
  const extra=`${v.agenda&&v.agenda.data&&f!=='entregue'?`<p class="pm-mini" style="margin:8px 0 0"><i class="fas fa-calendar-check"></i> Entrega agendada: <b>${fe(brDe(dt(v.agenda.data)))}</b>${v.agenda.periodo?' · '+fe(v.agenda.periodo):''}${v.agenda.caminhao?' · '+fe(v.agenda.caminhao):''}${v.agenda.obs?' · '+fe(v.agenda.obs):''}</p>`:''}
    ${v.vendedor?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-user-tie"></i> Vendedor: ${fe(v.vendedor)}${num(v.comissao_pct)?` · comissão ${nf(num(v.comissao_pct),1)}% = ${R(baseComissao(v)*num(v.comissao_pct)/100)}`:''}</p>`:''}
    ${v.frete_info?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-route"></i> Frete: ${fe(v.frete_info)}</p>`:''}
    ${lts.length?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-tag"></i> Lotes entregues (pela ordem de saída): ${lts.map(x=>`${fe(x.cod||x.lote)} (${nf(x.qtd,0)} × ${fe(nomePeca(x.peca))})`).join(' · ')}</p>`:''}`;
  const andam=ops.map(o=>{const x=andamentoOP(o);return `OP nº ${o.numero}: ${nf(x.feito,0)} de ${nf(num(o.qtd),0)} feitas${x.cura?` · ${nf(x.cura,0)} em cura até ${brDe(x.ate)}`:''}`;}).join(' · ');
  const pend=f==='sinal'?`Falta o sinal de <b>${R(Math.max(0,tot*num(c.sinal)/100-pago))}</b> (${nf(num(c.sinal),0)}%) para reservar as peças e mandar para a produção.`
    :f==='producao'?`Peças em produção — o cartão vai sozinho para "Pronto" quando terminarem a cura. ${andam||'Aguardando peça pronta do estoque.'}${pen.length?` <b style="color:#B42318">Sem ordem de produção: ${pen.map(it=>`${nf(it.qtd,0)} × ${fe(nomePeca(it.peca))}`).join(', ')}</b> (use Mandar para a produção).`:''}`
    :f==='pagamento'?`Peças prontas. Falta receber <b>${R(tot-pago)}</b>: agora (Completar pagamento) ou na hora da entrega (Entregar e receber o saldo).`:f==='liberado'?'Pago e com as peças prontas: <b>pode entregar</b>.':'';
  const dv=fim?devolvidoDe(v):null,brutoPago=r2((v.pagamentos||[]).filter(p=>p.tipo!=='estorno').reduce((s,p)=>s+num(p.valor),0));
  const fimTxt=fim?`<b>${v.status==='devolvida'?'Pedido encerrado: o cliente devolveu as peças':'Pedido cancelado'}</b> em ${fe(brDe(dt(dataFim(v))))}${v.cancelada_por?' por '+fe(v.cancelada_por):''}. Motivo: ${fe(motivoFim(v)||'—')}.
    ${dv.estoque||dv.avaria?`<br>${dv.estoque?`${nf(dv.estoque,0)} peça(s) voltaram ao estoque`:''}${dv.estoque&&dv.avaria?' · ':''}${dv.avaria?`<b>${nf(dv.avaria,0)} avariada(s): entraram nas perdas</b> (não voltam ao estoque)`:''}.`:''}
    <br>Recebido ${R(brutoPago)} · estornado ${R(dv.estorno)} · <b>ficou com a empresa ${R(Math.max(0,pago))}</b>.`:'';
  janela(`Venda nº ${v.numero}`,`<div class="fin-resumo"><b>${fe(v.cliente||'')}</b>${v.telefone?' · '+fe(v.telefone):''}${v.doc?' · '+fe(v.doc):''} · ${v.tipo_venda==='pronta'?'pronta entrega':'encomenda'} · ${v.canal==='atacado'?'atacado':'varejo'}<br>${fe(rotFase(v,f))}${v.data?' · pedido em '+brDe(dt(v.data)):''}${v.prazo_entrega&&!fim?' · entrega prevista '+brDe(dt(v.prazo_entrega)):''}${v.entrega?' · entregue em '+brDe(dt(v.entrega)):''}</div>
    ${fim?`<div class="fin-aviso vermelho" style="margin-top:8px"><div>${fimTxt}</div></div>`:''}
    ${pend?`<div class="fin-aviso ${f==='liberado'?'':'laranja'}" style="margin-top:8px"><div>${pend}</div></div>`:''}
    <table class="pm-tab2" data-sem-ordem style="margin-top:8px"><thead><tr><th>Peça</th><th class="n">Quant.</th><th class="n">Prontas</th><th class="n">Preço</th><th class="n">Total</th></tr></thead><tbody>
    ${(v.itens||[]).map((it,i)=>`<tr><td>${fe(nomePeca(it.peca))}</td><td class="n">${nf(num(it.qtd),0)}</td><td class="n">${v.status==='reservado'?nf(a[i]||0,0):'—'}</td><td class="n">${R(num(it.preco))}</td><td class="n">${R(num(it.qtd)*num(it.preco))}</td></tr>`).join('')}
    ${descontoVenda(v)?`<tr><td colspan="4">Desconto${v.desconto_pct?' ('+nf(num(v.desconto_pct),1)+'%)':''}</td><td class="n">${R(-descontoVenda(v))}</td></tr>`:''}${num(v.frete)?`<tr><td colspan="4">Frete</td><td class="n">${R(num(v.frete))}</td></tr>`:''}
    <tr class="t"><td colspan="4">Total${fim?' do pedido':''}</td><td class="n">${R(tot)}</td></tr>${fim?`<tr><td colspan="4">Recebido</td><td class="n" style="color:#067647">${R(brutoPago)}</td></tr><tr><td colspan="4">Estornado ao cliente</td><td class="n" style="color:#B42318">${R(-dv.estorno)}</td></tr><tr><td colspan="4"><b>Ficou com a empresa</b></td><td class="n"><b>${R(Math.max(0,pago))}</b></td></tr>`
      :`<tr><td colspan="4">Pago</td><td class="n" style="color:#067647">${R(pago)}</td></tr><tr><td colspan="4"><b>Saldo</b></td><td class="n"><b>${R(Math.max(0,tot-pago))}</b></td></tr>`}</tbody></table>
    ${(v.pagamentos||[]).length?`<h5 style="margin:10px 0 4px;font:800 12px Inter">Pagamentos</h5><ul class="pm-arml">${(v.pagamentos||[]).map(p=>`<li${p.tipo==='estorno'?' style="background:#FEF3F2"':''}><i class="fas ${p.tipo==='estorno'?'fa-rotate-left':'fa-circle-dollar-to-slot'}" style="color:${p.tipo==='estorno'?'#B42318':'#067647'}"></i><span>${fe(brDe(dt(p.data)))} · <b>${p.tipo==='estorno'?'estorno −':''}${R(num(p.valor))}</b> · ${fe(p.forma||'')} · ${fe(p.tipo||'')}${p.obs?' · '+fe(p.obs):''}</span></li>`).join('')}</ul>`:''}
    ${v.entrega_tipo==='retira'?`<p class="pm-mini" style="margin:8px 0 0"><i class="fas fa-store"></i> <b>Cliente retira na fábrica</b> (sem frete)</p>`:endTxt(v.end)?`<p class="pm-mini" style="margin:8px 0 0"><i class="fas fa-location-dot"></i> Entregar em: ${fe(endTxt(v.end))}</p>`:''}${(v.nf||{}).quer?`<p class="pm-mini" style="margin:4px 0 0"><i class="fas fa-file-invoice"></i> Cliente quer nota fiscal${(v.nf||{}).numero?' — NF nº '+fe(v.nf.numero):' (ainda sem número)'}.</p>`:''}${v.obs?`<p class="pm-mini" style="margin:4px 0 0">${fe(v.obs)}</p>`:''}${extra}<div data-nf-arqs style="margin-top:6px"></div>`,bts,820);
  // arquivos da nota fiscal anexada (XML / PDF)
  pintarNotas(v);
}
function registrarPagamento(v){
  if(encerrada(v))return toast('Pedido encerrado: não recebe pagamento.','error');
  const c=CFG(),tot=totalVenda(v),pago=pagoDe(v),sinalFalta=r2(Math.max(0,tot*num(c.sinal)/100-pago)),saldo=r2(tot-pago),ehSinal=v.status==='aguardando_sinal';
  if(saldo<=0.009)return toast('Esta venda já está paga.','success');
  janela(ehSinal?`Receber o sinal — venda nº ${v.numero}`:`${pago>0.009?'Completar pagamento':'Receber pagamento'} — venda nº ${v.numero}`,`<div class="fin-resumo">Total ${R(tot)} · pago ${R(pago)} · <b>saldo ${R(saldo)}</b>${ehSinal?`<br>Sinal mínimo para reservar: <b>${R(sinalFalta)}</b>`:''}</div>
    ${ehSinal?`<div class="pm-seg" style="margin-top:8px" data-pg-op><button type="button" class="on" data-v="${sinalFalta}">Só o sinal (${R(sinalFalta)})</button><button type="button" data-v="${saldo}">Tudo de uma vez (${R(saldo)})</button></div>`
      :`<p class="pm-mini" style="margin:8px 0 0">Este pagamento quita a venda. ${faseVenda(v)==='producao'?'O cliente também pode pagar na hora da entrega.':''}</p>`}
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Valor (R$) <span class="obg">*</span></label><input data-k="valor" data-mask="moeda" value="${fe(R(ehSinal?sinalFalta:saldo))}"></div>
    <div class="fin-fld"><label>Data <span class="obg">*</span></label><input type="date" data-k="data" value="${hojeISO()}" max="${hojeISO()}"></div>
    <div class="fin-fld"><label>Forma</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Observação</label><input data-k="obs"></div></div>`,
    [{html:'<i class="fas fa-circle-check"></i> Confirmar pagamento',cls:'pri',acao:async j=>{const g=k=>j.querySelector(`[data-k="${k}"]`).value,val=r2(num(g('valor')));
      if(!(val>0))throw new Error('Informe o valor.');if(v.data&&g('data')&&g('data')<v.data)throw new Error('O pagamento não pode ser antes da data do pedido.');if(val>saldo+0.009)throw new Error(`O valor passa do saldo (${R(saldo)}).`);if(!g('data'))throw new Error('Informe a data.');
      if(ehSinal&&r2(pago+val)<r2(tot*num(c.sinal)/100)-0.009)return trava('Valor menor que o sinal',[{ok:false,txt:`O sinal mínimo é ${R(sinalFalta)} (${nf(num(c.sinal),0)}%). Com menos, as peças não ficam reservadas.`}]);
      const o=vendaBruta(v);o.pagamentos=(o.pagamentos||[]).concat([{data:g('data'),valor:val,forma:g('forma'),tipo:ehSinal&&val<saldo-0.009?'sinal':'pagamento',obs:g('obs'),por:eu()}]);
      let reservou=false;if(o.status==='aguardando_sinal'&&pagoDe(o)>=r2(tot*num(c.sinal)/100)-0.009){o.status='reservado';reservou=true;}
      await gravar(o,v.rowid);toast(reservou?'Sinal recebido: peças reservadas.':pagoDe(o)>=tot-0.009?'Pagamento completo.':'Pagamento registrado.','success');
      if(reservou){const v2=vendaDe(v.rowid);if(v2&&!v2.ops_geradas)await gerarProducaoVenda(v2);}
      const v3=vendaDe(v.rowid);if(v3)setTimeout(()=>fichaVenda(v3),120);}}],560);
  const jj=document.getElementById('fin-jan'),seg=jj.querySelector('[data-pg-op]');
  if(seg)seg.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));const e=jj.querySelector('[data-k="valor"]');e.value=R(num(b.dataset.v));});
}
function entregar(v){
  const f=faseVenda(v);if(f!=='liberado'&&f!=='pagamento')return trava(`Venda nº ${v.numero}: ainda não pode ser entregue`,depsVenda(v));
  const saldo=r2(totalVenda(v)-pagoDe(v)),ret=v.entrega_tipo==='retira',pal=ret?'retirada':'entrega';
  janela(ret?`Retirada na fábrica — venda nº ${v.numero}`:saldo>0.009?`Entregar e receber — venda nº ${v.numero}`:`Entregar a venda nº ${v.numero}`,`<div class="fin-resumo">${fe(v.cliente||'')} · ${(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${fe(nomePeca(it.peca))}`).join(' · ')}</div>
    ${saldo>0.009?`<div class="pm-bloco" style="margin-top:8px"><h5><i class="fas fa-hand-holding-dollar"></i> Receber o saldo na ${pal}</h5><div class="fin-linha">
      <div class="fin-fld"><label>Valor a receber</label><input data-k="pg_valor" value="${fe(R(saldo))}" readonly></div><div class="fin-fld"><label>Forma <span class="obg">*</span></label><select data-k="pg_forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <label class="nfc-amb" style="grid-column:1/-1"><input type="checkbox" data-k="pg_ok"><span>Recebi ${fe(R(saldo))} do cliente nesta ${pal}</span></label></div>
      <p class="pm-mini" style="margin:6px 0 0">A peça só sai paga: sem marcar o recebimento, a ${pal} não é registrada.</p></div>`:''}
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Data da ${pal} <span class="obg">*</span></label><input type="date" data-k="entrega" value="${hojeISO()}" max="${hojeISO()}"></div>
    ${(v.nf||{}).quer?`<div class="fin-fld"><label>Nº da nota fiscal</label><input data-k="nf" value="${fe((v.nf||{}).numero||'')}"></div>`:''}
    ${ret?'':`<div class="fin-fld"><label>Caminhão</label><select data-k="caminhao"><option value="">—</option>${(CFG().caminhoes||[]).filter(x=>x&&x.nome).map(x=>`<option ${v.agenda&&v.agenda.caminhao===x.nome?'selected':''}>${fe(x.nome)}</option>`).join('')}</select></div>`}
    <div class="fin-fld" style="grid-column:1/-1"><label>${ret?'Quem retirou':'Quem recebeu'} <span class="obg">*</span></label><input data-k="recebedor" placeholder="${ret?'nome (e documento) de quem retirou as peças':'nome de quem recebeu as peças'}"></div></div>
    <p class="pm-mini">${ret?'Confira as peças com o cliente antes de carregar o veículo dele.':'Peça quebrada no caminho: registre depois em <b>Avaria na entrega</b>.'}</p>`,
    [{html:`<i class="fas ${ret?'fa-store':'fa-truck'}"></i> Confirmar ${pal}`,cls:'pri',acao:async j=>{const e=j.querySelector('[data-k="entrega"]').value;if(!e)throw new Error(`Informe a data da ${pal}.`);
      if(!j.querySelector('[data-k="recebedor"]').value.trim())throw new Error(ret?'Informe quem retirou as peças.':'Informe quem recebeu as peças.');
      if(v.data&&e<v.data)throw new Error('A entrega não pode ser antes da data do pedido.');
      if(saldo>0.009&&!j.querySelector('[data-k="pg_ok"]').checked)return trava('Falta receber o saldo',[{ok:false,txt:`Marque "Recebi ${R(saldo)} do cliente nesta entrega". Sem o pagamento completo a peça não sai.`}]);
      const o=vendaBruta(v);if(saldo>0.009)o.pagamentos=(o.pagamentos||[]).concat([{data:e,valor:saldo,forma:j.querySelector('[data-k="pg_forma"]').value,tipo:'pagamento',obs:'na entrega',por:eu()}]);o.status='entregue';o.entrega=e;o.entregue_por=eu();o.caminhao=ret?'':j.querySelector('[data-k="caminhao"]').value;o.recebedor=j.querySelector('[data-k="recebedor"]').value.trim();if(j.querySelector('[data-k="nf"]'))o.nf={...(o.nf||{}),numero:j.querySelector('[data-k="nf"]').value.trim()};
      // ordem de produção que ainda estava aberta para esta venda (a peça saiu do estoque): sem produção é cancelada, com produção segue para o estoque
      const ops=soltarOPs(v,'já entregue',true);
      await gravarVarios([[o,v.rowid]].concat(ops));toast(`Venda nº ${v.numero} ${ret?'retirada pelo cliente':'entregue'}${saldo>0.009?' e paga':''}: peças baixadas do estoque.${ops.length?` ${ops.length} ordem(ns) de produção liberada(s).`:''}`,'success');}}],600);
}
// estorno só em dinheiro (o cliente fica com as peças: abatimento combinado, defeito pequeno) — não mexe no estoque
function estornoSimples(v){
  const pago=pagoDe(v);
  janela(`${encerrada(v)?'Estornar o que ficou':'Estorno sem devolução'} — venda nº ${v.numero}`,`<div class="fin-aviso"><div>${encerrada(v)?'Pedido encerrado: devolve ao cliente o dinheiro que ficou com a empresa (ex.: sinal retido). O estoque não muda.':'O cliente <b>fica com as peças</b> (o estoque não muda); só o dinheiro volta. Para devolver peças, use <b>Devolução / estorno</b>.'}</div></div>
    <div class="fin-linha" style="margin-top:8px"><div class="fin-fld"><label>Valor do estorno (R$) <span class="obg">*</span></label><input data-k="estorno" data-mask="moeda"></div><div class="fin-fld"><label>Forma</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>
    <div class="fin-fld" style="grid-column:1/-1"><label>Motivo <span class="obg">*</span></label><input data-k="motivo" placeholder="Ex.: abatimento por atraso, peça com defeito de acabamento"></div></div><p class="pm-mini">Já pago: <b>${R(pago)}</b>.</p>`,
    [{html:'<i class="fas fa-hand-holding-dollar"></i> Lançar estorno',cls:'pri',acao:async j=>{if(!ehAdm())throw new Error('Só o Administrador lança estorno.');const g=k=>j.querySelector(`[data-k="${k}"]`).value.trim(),est=r2(num(g('estorno')));
      if(!(est>0))throw new Error('Informe o valor.');if(!g('motivo'))throw new Error('Informe o motivo.');if(est>pago+0.009)return trava('Estorno maior do que foi pago',[{ok:false,txt:`Pago: ${R(pago)} — o estorno não pode passar disso.`}]);
      const o=vendaBruta(v);o.pagamentos=(o.pagamentos||[]).concat([{data:hojeISO(),valor:est,forma:g('forma'),tipo:'estorno',obs:'abatimento: '+g('motivo'),por:eu()}]);o.abatimentos=r2(num(o.abatimentos)+est);
      await gravar(o,v.rowid);toast('Estorno lançado (as peças ficam com o cliente).','success');}}],560);
}
// cancelar (só o Administrador): antes da entrega, a produção já feita fica no estoque e o restante pode parar;
// depois da entrega, cancelar = devolver tudo (peça boa volta ao estoque, avariada vira perda) + estorno
const MOTIVOS_CANC=['Cliente desistiu da compra','Peça avariada','Atraso na entrega','Erro no pedido','Sem condição de pagamento','Outro'];
const selMotivo=()=>`<div class="fin-fld"><label>Motivo <span class="obg">*</span></label><select data-k="motivo_tipo"><option value="">— escolha —</option>${MOTIVOS_CANC.map(m=>`<option>${m}</option>`).join('')}</select></div>
  <div class="fin-fld" style="grid-column:span 2"><label>Detalhe do motivo</label><input data-k="motivo" placeholder="Ex.: obra parada; 3 peças trincadas no transporte"></div>`;
const lerMotivo=jj=>{const t=jj.querySelector('[data-k="motivo_tipo"]').value,d=jj.querySelector('[data-k="motivo"]').value.trim();if(!t)throw new Error('Escolha o motivo.');if(t==='Outro'&&!d)throw new Error('Em "Outro", escreva o motivo no detalhe.');return t==='Outro'?d:t+(d?' — '+d:'');};
function cancelarVenda(v){
  if(!podeCancelar(v))return toast(encerrada(v)?'Este pedido já está encerrado.':'Pedido com dinheiro recebido, produção começada ou já entregue: só o Administrador cancela.','error');
  const pago=pagoDe(v),ops=opsDaVenda(v),entregue=v.status==='entregue';
  const jaDev={};(v.devolucoes||[]).forEach(dv=>(dv.itens||[]).forEach(it=>jaDev[it.peca]=(jaDev[it.peca]||0)+num(it.qtd)));
  const resta=(v.itens||[]).map((it,i)=>({i,peca:it.peca,preco:num(it.preco),max:Math.max(0,num(it.qtd)-(jaDev[it.peca]||0))})).filter(x=>x.max>0);
  const opsInfo=ops.map(o=>({o,feito:prodDaOrdem(o.rowid)}));
  const deps=entregue?[{ok:true,txt:'A venda já foi entregue: cancelar registra a <b>devolução de tudo</b> o que ainda está com o cliente.'},{ok:true,txt:'Peça boa volta ao estoque; peça avariada entra nas perdas (não volta).'}]
    :[...opsInfo.map(({o,feito})=>({ok:true,txt:feito?`OP nº ${o.numero}: ${nf(feito,0)} de ${nf(num(o.qtd),0)} peças já feitas — <b>ficam no estoque</b> para outras vendas${feito<num(o.qtd)?'; o restante para (a ordem é concluída com o que foi feito)':''}.`:`OP nº ${o.numero}: nada produzido — <b>é cancelada</b>.`})),{ok:true,txt:'As peças reservadas voltam a ficar livres no estoque.'}];
  const j=janela(`Cancelar a venda nº ${v.numero}`,`<ul class="pm-arml" style="margin-bottom:10px">${deps.map(d=>`<li><i class="fas fa-circle-info" style="color:#1652D8"></i><span>${d.txt}</span></li>`).join('')}</ul>
    ${entregue&&resta.length?`<div class="pm-rolar"><table class="pm-itens"><thead><tr><th>Peça com o cliente</th><th style="width:90px">Quant.</th><th>Situação da peça</th></tr></thead><tbody>${resta.map(x=>`<tr data-cr="${x.i}"><td>${fe(nomePeca(x.peca))}</td><td>${nf(x.max,0)}</td><td><select data-d="destino"><option value="estoque">Boa — volta ao estoque</option><option value="avaria">Avariada — perda</option></select></td></tr>`).join('')}</tbody></table></div>`:''}
    <div class="fin-linha" style="margin-top:8px">${selMotivo()}
      ${pago>0.009?`<div class="fin-fld"><label>Estorno ao cliente (R$)</label><input data-k="estorno" data-mask="moeda" value="${fe(R(Math.max(0,pago)))}"></div><div class="fin-fld"><label>Forma do estorno</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div>`:''}</div>
    <p class="pm-mini">${pago>0.009?`Já pago pelo cliente: <b>${R(pago)}</b>. O estorno pode ser menor (ex.: sinal retido como multa, se combinado).`:'Nenhum dinheiro recebido nesta venda: não há estorno.'} O pedido vai para a coluna <b>Cancelados · devolvidos</b> (não é excluído).</p>`,
    [{html:'<i class="fas fa-ban"></i> Cancelar a venda',cls:'pri',acao:async jj=>{if(!podeCancelar(v))throw new Error('Só o Administrador pode cancelar este pedido.');
      const g=k=>{const e=jj.querySelector(`[data-k="${k}"]`);return e?e.value.trim():'';},est=r2(num(g('estorno'))),mot=lerMotivo(jj);
      if(est<0||est>pago+0.009)return trava('Estorno maior do que foi pago',[{ok:false,txt:`Pago pelo cliente: ${R(pago)} — o estorno não pode passar disso.`}]);
      const hoje=hojeISO(),o=vendaBruta(v),mud=[];o.cancelada_em=hoje;o.cancelada_por=eu();o.motivo_cancelamento=mot;
      if(est>0)o.pagamentos=(o.pagamentos||[]).concat([{data:hoje,valor:est,forma:g('forma'),tipo:'estorno',obs:'cancelamento: '+mot,por:eu()}]);
      if(entregue){const its=[...jj.querySelectorAll('[data-cr]')].map(tr=>{const x=resta.find(r=>String(r.i)===tr.dataset.cr);return {peca:x.peca,qtd:x.max,destino:tr.querySelector('[data-d="destino"]').value,preco:x.preco};});
        if(its.length)o.devolucoes=(o.devolucoes||[]).concat([{data:hoje,itens:its,estorno:est,motivo:'cancelamento: '+mot,por:eu()}]);o.status='devolvida';
        const E=estoque();its.filter(x=>x.destino==='avaria').forEach(x=>{const e=E.P[String(x.peca)];mud.push([{tipo:'avaria',data:hoje,peca:x.peca,qtd:x.qtd,origem:'cliente',causa:'cancelamento: '+mot,venda:String(v.rowid),custo_un:r2(e?e.custoUn:0),por:eu(),data_lancamento:todayDateTime()},null]);});
        mud.push(...soltarOPs(v,'cancelada',false));}
      else{o.status='cancelada';opsInfo.forEach(({o:op,feito})=>mud.push([feito?{...op,venda:'',cliente:`Estoque (venda nº ${v.numero} cancelada)`,qtd:feito,status:'concluida',concluida_em:op.concluida_em||hoje,obs:(op.obs?op.obs+' · ':'')+'venda cancelada: produção feita fica no estoque'}:{...op,status:'cancelada',obs:(op.obs?op.obs+' · ':'')+'venda cancelada'},op.rowid]));}
      await gravarVarios([[o,v.rowid]].concat(mud));toast(entregue?'Venda cancelada: devolução registrada'+(est>0?' e estorno lançado':'')+'.':'Venda cancelada — está na coluna Cancelados.','success');}}],680);
  // motivo "Peça avariada": as peças com o cliente já vêm marcadas como avariadas
  j.querySelector('[data-k="motivo_tipo"]').addEventListener('change',ev=>{if(ev.target.value==='Peça avariada')j.querySelectorAll('[data-cr] [data-d="destino"]').forEach(s=>s.value='avaria');});
}
/* ── excluir de vez uma venda encerrada (cancelada ou devolvida): só o Administrador ──
   O dinheiro dela sai do caixa; a perda das peças que voltaram avariadas continua (vira avaria da fábrica, o estoque não muda);
   ordem de produção sem produção é excluída, com produção fica para o estoque. */
function planoExcluirVenda(v){
  const f=CFG().fechado_ate,datas=[v.data,v.entrega,v.cancelada_em,...(v.pagamentos||[]).map(p=>p.data),...(v.devolucoes||[]).map(d=>d.data)].filter(Boolean),bloq=[];
  if(!encerrada(v))bloq.push('Só venda cancelada ou devolvida pode ser excluída (as outras: use Cancelar venda).');
  if(f&&datas.some(d=>d<=f))bloq.push(`A venda tem lançamento no período fechado (até ${brDe(dt(f))}): o Administrador reabre em Parâmetros › Fechamento do mês.`);
  const avs=T('avaria').filter(a=>String(a.venda||'')===String(v.rowid));
  if(avs.some(a=>a.origem!=='cliente'))bloq.push('A venda tem avaria de entrega/transporte ligada a ela: exclua ou corrija essa avaria antes.');
  const ops=ordens().filter(o=>String(o.venda||'')===String(v.rowid)),pg=v.pagamentos||[];
  const ent=r2(pg.filter(p=>p.tipo!=='estorno').reduce((s,p)=>s+num(p.valor),0)),est=r2(pg.filter(p=>p.tipo==='estorno').reduce((s,p)=>s+num(p.valor),0));
  const mud=avs.map(a=>[{...a,origem:'outra',venda:'',causa:(a.causa?a.causa+' · ':'')+`voltou avariada do cliente (venda nº ${v.numero} excluída)`},a.rowid]),del=[];
  ops.forEach(o=>{if(prodDaOrdem(o.rowid)>0)mud.push([{...o,venda:'',cliente:`Estoque (venda nº ${v.numero} excluída)`},o.rowid]);else del.push(o.rowid);});
  return {bloq,ent,est,avs,ops,mud,del};}
function excluirVenda(v){
  if(!ehAdm())return toast('Só o Administrador exclui venda.','error');
  const pl=planoExcluirVenda(v);if(pl.bloq.length)return trava(`Não dá para excluir a venda nº ${v.numero}`,pl.bloq.map(t=>({ok:false,txt:t})));
  confirmar(`Excluir a venda nº ${v.numero}?`,`<b>A venda some de vez</b> — não tem como desfazer. (Para guardar o histórico, deixe na coluna Cancelados.)<ul style="margin:8px 0 0 18px">
    <li>${pl.ent||pl.est?`Sai do caixa: entradas de ${R(pl.ent)} e estornos de ${R(pl.est)} (o saldo muda ${R(pl.est-pl.ent)}).`:'Não tem dinheiro lançado nesta venda.'}</li>
    ${pl.avs.length?`<li>${pl.avs.length} avaria(s) da devolução continuam como perda da fábrica (o estoque não muda).</li>`:''}
    ${pl.ops.length?`<li>${pl.ops.length} ordem(ns) de produção ligada(s): sem produção são excluídas; com produção ficam para o estoque.</li>`:''}
    <li>Os arquivos de nota fiscal anexados a ela também são excluídos.</li></ul>`,'Sim, excluir a venda',async()=>{await excluirVendaJa(v,pl);toast(`Venda nº ${v.numero} excluída.`,'success');});}
async function excluirVendaJa(v,pl,extra){
  if(!ehAdm())throw new Error('Só o Administrador exclui venda.');pl=pl||planoExcluirVenda(v);if(pl.bloq.length)throw new Error(pl.bloq[0]);
  for(const a of await arquivosNota(v)){try{await excluirAnexoFab(a);}catch(e){}}
  await executar(async()=>{for(const [o,id] of pl.mud)await salvar(ABA,o,id);for(const id of pl.del)await excluir(ABA,id);await excluir(ABA,v.rowid);if(extra)await extra();});}
// peça só com histórico "de teste": vendas encerradas e ordens sem produção (nada produzido, sem avaria fora dessas vendas, sem acerto)
function cascataPeca(id){
  id=String(id);if(!ehAdm())return null;
  if(T('producao').some(r=>itensProd(r).some(it=>String(it.peca)===id))||T('ajuste').some(a=>a.item==='peca:'+id))return null;
  const vs=vendas().filter(v=>(v.itens||[]).some(it=>String(it.peca)===id));if(vs.some(v=>!encerrada(v)))return null;
  const ids=new Set(vs.map(v=>String(v.rowid)));if(T('avaria').some(a=>String(a.peca)===id&&!(a.origem==='cliente'&&ids.has(String(a.venda||'')))))return null;
  const pls=vs.map(v=>({v,pl:planoExcluirVenda(v)}));if(pls.some(x=>x.pl.bloq.length))return null;
  const ops=ordens().filter(o=>String(o.peca)===id);if(ops.some(o=>prodDaOrdem(o.rowid)>0))return null;
  // as avarias desta peça que vieram dessas vendas saem junto (a peça deixa de existir)
  const avDel=T('avaria').filter(a=>String(a.peca)===id).map(a=>a.rowid);
  pls.forEach(x=>{x.pl.mud=x.pl.mud.filter(([o])=>!(o.tipo==='avaria'&&String(o.peca)===id));});
  return {pls,ops,avDel};}
function excluirPecaCascata(p,cas){
  const nOut=v=>(v.itens||[]).some(it=>String(it.peca)!==String(p.rowid));
  confirmar('Excluir a peça e o histórico dela?',`<b>${fe(p.nome)}</b> e tudo abaixo somem de vez — não tem como desfazer:<ul style="margin:8px 0 0 18px">
    ${cas.pls.map(({v,pl})=>`<li>Venda nº ${fe(String(v.numero))} (${v.status==='devolvida'?'devolvida':'cancelada'} · ${fe(v.cliente||'')})${nOut(v)?' — <b>tem outras peças: sai inteira</b>':''}${pl.ent||pl.est?` · sai do caixa: entradas ${R(pl.ent)}, estornos ${R(pl.est)}`:''}</li>`).join('')}
    ${cas.ops.length?`<li>${cas.ops.length} ordem(ns) de produção sem produção: ${cas.ops.map(o=>'OP nº '+fe(String(o.numero))).join(', ')}</li>`:''}
    ${cas.avDel.length?`<li>${cas.avDel.length} avaria(s) desta peça (das devoluções acima)</li>`:''}</ul>`,'Sim, excluir tudo',async()=>{
      const feitos=new Set();for(const {v,pl} of cas.pls){await excluirVendaJa(v,pl);pl.del.forEach(id=>feitos.add(String(id)));}
      await executar(async()=>{for(const o of cas.ops)if(!feitos.has(String(o.rowid)))await excluir(ABA,o.rowid);for(const id of cas.avDel)await excluir(ABA,id);await excluir(ABA,p.rowid);});
      toast('Peça e histórico excluídos.','success');});}
function devolver(v){
  const ja={};(v.devolucoes||[]).forEach(dv=>(dv.itens||[]).forEach(it=>ja[it.peca]=(ja[it.peca]||0)+num(it.qtd)));
  const lin=(v.itens||[]).map((it,i)=>{const max=num(it.qtd)-(ja[it.peca]||0);return `<tr data-dv="${i}"><td>${fe(nomePeca(it.peca))}<small>máx. ${nf(max,0)}</small></td><td><input data-d="qtd" inputmode="numeric" data-num="int" placeholder="0" data-max="${max}"></td><td><select data-d="destino"><option value="estoque">Volta ao estoque (peça boa)</option><option value="avaria">Avariada (perda)</option></select></td></tr>`;}).join('');
  const j=janela(`Devolução — venda nº ${v.numero}`,`<p class="pm-mini">Informe o que o cliente devolveu. Peça boa volta ao estoque; peça avariada entra nas perdas. O estorno sai do caixa.</p>
    <div class="pm-rolar"><table class="pm-itens"><thead><tr><th>Peça</th><th style="width:90px">Devolvidas</th><th>Destino</th></tr></thead><tbody>${lin}</tbody></table></div>
    <div class="fin-linha" style="margin-top:8px">${selMotivo()}<div class="fin-fld"><label>Estorno ao cliente (R$)</label><input data-k="estorno" data-mask="moeda"></div><div class="fin-fld"><label>Forma</label><select data-k="forma">${FORMAS_PG.map(x=>`<option>${x}</option>`).join('')}</select></div></div>
    <p class="pm-mini">Devolvendo tudo, o pedido fica encerrado e vai para a coluna <b>Cancelados · devolvidos</b>.</p>`,
    [{html:'<i class="fas fa-rotate-left"></i> Registrar devolução',cls:'pri',acao:async jj=>{
      const its=[...jj.querySelectorAll('[data-dv]')].map(tr=>{const it=v.itens[+tr.dataset.dv],q=num(tr.querySelector('[data-d="qtd"]').value),max=num(tr.querySelector('[data-d="qtd"]').dataset.max);if(q>max)throw new Error(`${nomePeca(it.peca)}: máximo ${max}.`);return {peca:it.peca,qtd:q,destino:tr.querySelector('[data-d="destino"]').value,preco:num(it.preco)};}).filter(x=>x.qtd>0);
      if(!its.length)throw new Error('Informe as peças devolvidas.');const mot=lerMotivo(jj),g=k=>k==='motivo'?mot:jj.querySelector(`[data-k="${k}"]`).value.trim(),est=r2(num(g('estorno')));
      // estorno nunca maior que o valor das peças devolvidas, nem que o pago
      const valDev=r2(its.reduce((s,x)=>s+x.qtd*x.preco,0)*(1-num(v.desconto_pct)/100)),pg=pagoDe(v);
      if(est>valDev+0.009||est>pg+0.009)return trava('Estorno maior do que pode',[{ok:est<=valDev+0.009,txt:`Valor das peças devolvidas (com o desconto da venda): ${R(valDev)}`},{ok:est<=pg+0.009,txt:`Valor pago pelo cliente até agora: ${R(pg)}`},{ok:false,txt:`Estorno informado: ${R(est)} — no máximo ${R(Math.min(valDev,pg))}`}]);
      const o=vendaBruta(v),dv={data:hojeISO(),itens:its,estorno:est,motivo:g('motivo'),por:eu()};o.devolucoes=(o.devolucoes||[]).concat([dv]);if(est>0)o.pagamentos=(o.pagamentos||[]).concat([{data:hojeISO(),valor:est,forma:g('forma'),tipo:'estorno',obs:'devolução: '+g('motivo'),por:eu()}]);
      const totDev={};o.devolucoes.forEach(d=>d.itens.forEach(it=>totDev[it.peca]=(totDev[it.peca]||0)+num(it.qtd)));if((o.itens||[]).every(it=>(totDev[it.peca]||0)>=num(it.qtd))){o.status='devolvida';o.cancelada_em=hojeISO();o.cancelada_por=eu();o.motivo_cancelamento=mot;}
      const E=estoque(),mud=[[o,v.rowid]];its.filter(x=>x.destino==='avaria').forEach(x=>{const e=E.P[String(x.peca)];mud.push([{tipo:'avaria',data:hojeISO(),peca:x.peca,qtd:x.qtd,origem:'cliente',causa:'devolução: '+g('motivo'),venda:String(v.rowid),custo_un:r2(e?e.custoUn:0),por:eu(),data_lancamento:todayDateTime()},null]);});
      if(o.status==='devolvida')mud.push(...soltarOPs(v,'devolvida',false));
      await gravarVarios(mud);toast(o.status==='devolvida'?'Devolução de tudo registrada: o pedido foi para Cancelados · devolvidos.':'Devolução registrada.','success');}}],720);
  j.querySelector('[data-k="motivo_tipo"]').addEventListener('change',ev=>{if(ev.target.value==='Peça avariada')j.querySelectorAll('[data-dv] [data-d="destino"]').forEach(s=>s.value='avaria');});
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
    ${v.entrega_tipo==='retira'?caixa('RETIRADA',[v.entrega?`Retirado na fábrica em <b>${fe(brDe(dt(v.entrega)))}</b>${v.recebedor?' — por '+fe(v.recebedor):''}`:'O cliente retira na fábrica (sem frete)',v.prazo_entrega&&!v.entrega?`Previsto para ${fe(brDe(dt(v.prazo_entrega)))}`:'']):''}
    ${v.entrega_tipo==='retira'?'':caixa('ENTREGA',[v.entrega?`Entregue em <b>${fe(brDe(dt(v.entrega)))}</b>${v.recebedor?' — recebido por '+fe(v.recebedor):''}`:v.agenda&&v.agenda.data?`Agendada para <b>${fe(brDe(dt(v.agenda.data)))}</b> (${fe(v.agenda.periodo||'')})`:v.prazo_entrega?`Prevista para ${fe(brDe(dt(v.prazo_entrega)))}`:'A combinar',v.frete_info?'Frete: '+fe(v.frete_info):''])}
    ${caixa('NOTA FISCAL',[nfx.numero?`NF-e nº <b>${fe(nfx.numero)}</b>${nfx.serie?' série '+fe(nfx.serie):''}`:nfx.quer?'Será emitida (NF-e)':'Não solicitada',nfx.chave?`<span style="font-size:8.5px;letter-spacing:.02em">Chave ${fe(nfx.chave.replace(/(\d{4})(?=\d)/g,'$1 '))}</span>`:''])}</div>`;
  const rows=(v.itens||[]).map(it=>{const p=pecaDe(it.peca),t=tipoDePeca(p||{}),ncm=(p&&p.ncm)||CAT.ncmDe(t);
    return `<tr><td>${fe(p&&p.codigo||'')}</td><td>${fe(nomePeca(it.peca))}<br><small style="color:#6e6e73">${fe(p?geoPeca(p).desc:'')}${lts.filter(x=>String(x.peca)===String(it.peca)).length?' · lote '+[...new Set(lts.filter(x=>String(x.peca)===String(it.peca)).map(x=>x.cod||x.lote))].map(fe).join(', '):''}</small></td><td>${fe(ncm)}</td><td style="text-align:right">${nf(num(it.qtd),0)} pç</td><td style="text-align:right">${R(num(it.preco))}</td><td style="text-align:right">${R(num(it.qtd)*num(it.preco))}</td></tr>`;});
  const pags=(v.pagamentos||[]).map(p=>`${fe(brDe(dt(p.data)))} · ${p.tipo==='estorno'?'estorno −':''}${R(num(p.valor))} · ${fe(p.forma||'')}`).join('<br>');
  App._relExportPaginado({titulo:`${encerrada(v)?(v.status==='devolvida'?'Venda devolvida':'Pedido cancelado'):comp?'Comprovante de venda':'Pedido de venda'} nº ${v.numero}`,subLinhas:[`${fe(v.cliente||'')} · ${fe(brDe(dt(v.data)))}`],preHtml:pre,
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
      await gravar(o,v.rowid);toast(info?`Nota nº ${info.numero} anexada à venda.`:'Arquivo da nota anexado.','success');
      // a ficha aberta já mostra a nota (sem precisar fechar e abrir)
      const v2=vendaDe(v.rowid);if(v2&&document.querySelector('#fin-ov.open #fin-jan [data-nf-arqs]'))fichaVenda(v2);}catch(e){toast(e.message||String(e),'error');}finally{UI._hideBusy();}};inp.click();
}
// arquivos da nota na ficha da venda: abrir e excluir (sem o XML, número e chave da nota saem da venda)
async function pintarNotas(v){const L=await arquivosNota(v),box=document.querySelector('#fin-jan [data-nf-arqs]');if(!box)return;if(!L.length){box.innerHTML='';return;}
  box.innerHTML=`<div class="pm-arqs"><b><i class="fas fa-file-invoice"></i> Nota fiscal${(v.nf||{}).numero?' nº '+fe(v.nf.numero):''}</b>${L.map((a,i)=>`<span class="pm-arq"><a href="#" data-nfa="${i}">${a.doc==='xml'?'XML':'PDF'} · ${fe(a.nome||'')}</a>${podeApagarArq(a)?`<button type="button" data-nfdel="${i}" title="Excluir este arquivo"><i class="fas fa-xmark"></i></button>`:''}</span>`).join('')}</div>`;
  box.onclick=ev=>{const o=ev.target.closest('[data-nfa]');if(o){ev.preventDefault();return GS.docs.baixarArq(L[+o.dataset.nfa],true);}
    const d=ev.target.closest('[data-nfdel]');if(!d)return;const a=L[+d.dataset.nfdel];
    perguntar('Excluir o arquivo da nota?',`${a.doc==='xml'?'Sem o XML, o número e a chave da nota saem da venda (o comprovante volta a dizer "será emitida").':'O PDF da nota sai da venda.'}`,'Excluir arquivo',async()=>{UI._showBusy('Excluindo…');
      try{await excluirAnexoFab(a);if(a.doc==='xml'&&!L.some(x=>x!==a&&x.doc==='xml')){const o2=vendaBruta(v);o2.nf={...(o2.nf||{}),numero:'',serie:'',chave:'',emissao:'',valor:0};await gravar(o2,v.rowid);}}finally{UI._hideBusy();}
      toast('Arquivo da nota excluído.','success');const v2=vendaDe(v.rowid);if(v2&&document.querySelector('#fin-jan [data-nf-arqs]'))pintarNotas(v2);});};}
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
      <div class="fin-fld" style="grid-column:1/-1"><label>Descrição <span class="obg">*</span></label><input data-k="descricao" value="${fe(b.descricao||'')}" placeholder="Ex.: folha de outubro — 3 pessoas"></div>
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
  if(tipo==='vendas'){const L=vendas().filter(v=>dentro(encerrada(v)?dataFim(v):(v.entrega||v.data))).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    // canceladas e devolvidas aparecem (com o motivo), mas o total do pedido não soma nas vendas
    const SIT={aguardando_sinal:'Aguardando sinal',reservado:'Reservado',entregue:'Entregue',devolvida:'Devolvida',cancelada:'Cancelada'};
    const cab=[{l:'Nº'},{l:'Data'},{l:'Cliente'},{l:'Tipo'},{l:'Itens'},{l:'Situação'},{l:'Total',d:1},{l:'Pago',d:1}];
    const lin=L.map(v=>[String(v.numero),brDe(dt(v.data)),v.cliente||'',`${v.tipo_venda==='pronta'?'pronta':'encomenda'} · ${v.canal||'varejo'}`,(v.itens||[]).map(it=>`${nf(num(it.qtd),0)} × ${nomePeca(it.peca)}`).join('; '),(SIT[v.status]||v.status)+(encerrada(v)&&motivoFim(v)?' — '+motivoFim(v):''),encerrada(v)?'('+R(totalVenda(v))+')':R(totalVenda(v)),R(pagoDe(v))]);
    return {cab,lin,tot:['Total','','','','','',R(L.filter(v=>!encerrada(v)).reduce((s,v)=>s+totalVenda(v),0)),R(L.reduce((s,v)=>s+pagoDe(v),0))]};}
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
  const linCam=x=>`<div class="fin-linha" data-lin="cam" style="margin-bottom:6px;grid-template-columns:1fr 130px 1fr 36px"><div class="fin-fld"><input data-kn value="${fe(x.nome||'')}" placeholder="Ex.: Munck ABC-1234"></div><div class="fin-fld"><input data-kc inputmode="numeric" data-num="int" data-sem-mascara="1" value="${x.cap_kg?fe(String(x.cap_kg)):''}" placeholder="Carga (kg)"></div><div class="fin-fld"><input data-km value="${fe(x.motorista||'')}" placeholder="Motorista"></div><button type="button" class="pm-x" data-pm="cfg-x"><i class="fas fa-xmark"></i></button></div>`;
  PM._linFixo=linFixo;PM._linEq=linEq;PM._linCid=linCid;PM._linCam=linCam;
  return cabG('Parâmetros e preços','A base de todos os cálculos: preço dos insumos, características dos materiais, equipe, betoneira, custos rateados por m³ e as regras de venda.',`<button type="button" class="gf-bt pri" data-pm="cfg-salvar"><i class="fas fa-floppy-disk"></i> Salvar parâmetros</button>`)+
    `<div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Preços dos insumos</h3><p>Atualizados também pelas compras (Estoque › Entrada de insumo).</p></div></div><div class="fin-linha">
       ${mo('precos.cimento','Cimento — saco de 50 kg',pr.cimento)}${mo('precos.areia','Areia — m³',pr.areia)}${mo('precos.po','Pó de pedra — m³',pr.po)}${mo('precos.brita','Brita 0 — m³',pr.brita)}
       ${mo('precos.aco50','Aço CA-50 — kg',pr.aco50)}${mo('precos.aco60','Aço CA-60 — kg',pr.aco60)}${mo('precos.malha','Malha POP — painel 2 × 3 m',pr.malha)}${mo('precos.arame','Arame recozido — kg',pr.arame)}
       ${mo('precos.aditivo','Aditivo — kg',pr.aditivo)}${mo('precos.desmoldante','Desmoldante — litro',pr.desmoldante)}${mo('precos.agua','Água — m³',pr.agua)}${mo('precos.energia','Energia — kWh',pr.energia)}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Rateio previsto por m³</h3><p>Quanto cada m³ de concreto carrega de mão de obra, equipamento, energia, água e custos fixos.</p></div></div>
       <table class="pm-tab2" data-sem-ordem><tbody><tr><td>Mão de obra</td><td class="n">${R(ra.mao)}</td></tr><tr><td>Betoneira (depreciação + manutenção)</td><td class="n">${R(ra.betoneira)}</td></tr><tr><td>Energia (${nf(ra.kwh,2)} kWh/m³)</td><td class="n">${R(ra.energia)}</td></tr><tr><td>Água de cura</td><td class="n">${R(ra.agua)}</td></tr><tr><td>Custos fixos</td><td class="n">${R(ra.fixos)}</td></tr><tr class="t"><td>Total por m³ (sem materiais)</td><td class="n">${R(ra.total)}</td></tr></tbody></table>
       <div class="fin-linha" style="margin-top:12px">${f('prod_m3','Produção prevista por mês (m³)',c.prod_m3,'inputmode="decimal" data-num="dec"')}${f('equipe.pessoas','Pessoas na produção',c.equipe.pessoas,'inputmode="numeric" data-num="int"')}${mo('equipe.custo','Custo mensal por pessoa (com encargos)',c.equipe.custo)}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Equipe da fábrica</h3><p>Aparece no diário de produção para marcar quem esteve presente.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-equipe-add"><i class="fas fa-plus"></i> Pessoa</button></div>
       <div data-equipe>${(c.equipe_lista||[]).map(linEq).join('')||'<p class="pm-mini" data-vazio>Ninguém cadastrado.</p>'}</div>
       <p class="pm-mini" style="margin:10px 0 4px"><b>Jornada padrão</b> (já vem preenchida no ponto do diário):</p><div class="fin-linha">
       <div class="fin-fld"><label>Entrada</label><input type="time" data-cfg="jornada.entrada" value="${fe((c.jornada||{}).entrada||'07:00')}"></div><div class="fin-fld"><label>Saída</label><input type="time" data-cfg="jornada.saida" value="${fe((c.jornada||{}).saida||'17:00')}"></div>
       ${f('jornada.intervalo','Intervalo (minutos)',(c.jornada||{}).intervalo!=null?c.jornada.intervalo:60,'inputmode="numeric" data-num="int" data-sem-mascara="1"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Vendas e endereços</h3><p>Regras de venda e a cidade padrão para sugerir endereços.</p></div></div><div class="fin-linha" data-end>
       ${f('sinal','Sinal mínimo para reservar encomenda (%)',c.sinal)}${f('impostos','Impostos sobre a venda (%)',c.impostos)}${f('margem','Margem desejada (%)',c.margem)}
       ${f('cidade','Cidade padrão dos clientes',cidUF(c.cidade,c.uf),'data-k="cidade" placeholder="Ex.: Itarantim, BA"')}${f('uf','UF padrão',c.uf,'maxlength="2" data-k="uf"')}${f('lata','Lata usada na produção (litros)',c.lata,'inputmode="numeric" data-num="int"')}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Entregas e frete</h3><p>Frete por km (distância pelo mapa até o endereço do cliente) ou valor fixo por cidade — a tabela de cidades vale primeiro.</p></div></div><div class="fin-linha" data-end>
       ${f('frete.origem.cep','CEP da fábrica',fr.origem.cep||'','data-k="cep"')}${f('frete.origem.logradouro','Endereço da fábrica (rua)',fr.origem.logradouro||'','data-k="logradouro" autocomplete="off" placeholder="digite a rua: o sistema sugere"')}${f('frete.origem.numero','Número',fr.origem.numero||'','data-k="numero"')}
       ${f('frete.origem.bairro','Bairro',fr.origem.bairro||'','data-k="bairro"')}${f('frete.origem.cidade','Cidade da fábrica',cidUF(fr.origem.cidade||c.cidade||'',fr.origem.uf||c.uf||''),'data-k="cidade" placeholder="Ex.: Itarantim, BA"')}${f('frete.origem.uf','UF',fr.origem.uf||c.uf||'','maxlength="2" data-k="uf"')}
       ${mo('frete.rs_km','Valor por km rodado',fr.rs_km)}${f('frete.km_min','Km mínimo cobrado',fr.km_min,'inputmode="numeric" data-num="int" data-sem-mascara="1"')}
       <label class="nfc-amb" style="grid-column:1/-1"><input type="checkbox" data-cfg-ck="frete.ida_volta" ${fr.ida_volta!==false?'checked':''}><span>Cobrar ida e volta (o caminhão volta vazio)</span></label></div>
       <p class="pm-mini" style="margin:10px 0 4px"><b>Valor fixo por cidade</b></p><div data-cids>${(fr.cidades||[]).map(linCid).join('')}</div><button type="button" class="gf-bt mini" data-pm="cfg-cid-add"><i class="fas fa-plus"></i> Cidade</button></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Caminhões</h3><p>Para a agenda de entregas: a carga de cada dia é conferida com a capacidade.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-cam-add"><i class="fas fa-plus"></i> Caminhão</button></div>
       <div data-cams>${(c.caminhoes||[]).map(linCam).join('')||'<p class="pm-mini" data-vazio>Nenhum caminhão cadastrado.</p>'}</div></section></div>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas fa-lock" style="color:#B42318"></i> Fechamento do mês</h3><p>Depois de conferir o mês (estoque contado, caixa batido), feche: nada com data até o dia escolhido pode ser lançado, mudado ou excluído — produção, compras, acertos, avarias, custos, ensaios, pagamentos, entregas e devoluções.</p></div></div>
      <div class="fin-linha"><div class="fin-fld"><label>Lançamentos fechados até</label><input type="date" data-cfg="fechado_ate" value="${fe(c.fechado_ate||'')}" max="${hojeISO()}" ${ehAdm()?'':'disabled title="Só o Administrador fecha ou reabre o mês"'}></div>
        <div class="fin-fld" style="grid-column:span 2;align-self:end"><p class="pm-mini" style="margin:0 0 10px">${c.fechado_ate?`<b>Fechado até ${fe(brDe(dt(c.fechado_ate)))}.</b> Para reabrir, apague a data ou escolha uma anterior e salve.`:'Nenhum mês fechado ainda.'}${ehAdm()?'':' Só o Administrador muda esta data.'}</p></div></div></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3><i class="fas fa-calendar-xmark" style="color:#B42318"></i> Feriados da cidade</h3><p>Os feriados nacionais, o 2 de Julho (Bahia), o Carnaval, a Sexta-feira Santa e o Corpus Christi já aparecem sozinhos no calendário do diário. Aqui entram os feriados da cidade da fábrica: um por linha, com dia/mês e o nome.</p></div></div>
      <div class="fin-fld"><label>Feriados da cidade</label><textarea data-cfg="feriados_cidade" rows="4" placeholder="Ex.:&#10;20/05 Aniversário da cidade&#10;29/06 São Pedro (padroeiro)">${fe(c.feriados_cidade||'')}</textarea></div></section>
    <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Nota fiscal das vendas de peças</h3><p>Venda de peça é venda de <b>produto</b>: a nota é a NF-e, autorizada pela SEFAZ-BA (não é a nota de serviço da prefeitura).</p></div></div>
      <div class="fin-aviso" style="margin-bottom:10px"><div>Para o sistema emitir a NF-e sozinho são necessários: <b>Inscrição Estadual</b> da empresa na SEFAZ-BA, o <b>certificado A1</b> (o mesmo já usado nas assinaturas) e a confirmação do contador sobre o regime e o CFOP.
        Enquanto isso, emita a nota no emissor do contador (ou a NFA-e, nota avulsa da SEFAZ-BA) e use <b>Anexar nota fiscal</b> na venda: o número e a chave entram sozinhos no comprovante. O NCM de cada peça já sai preenchido pelo tipo (pode mudar no cadastro da peça).</div></div>
      <div class="fin-linha">${f('fiscal.ie','Inscrição Estadual (IE)',fis.ie||'','placeholder="ainda não tem"')}${f('fiscal.regime','Regime tributário',fis.regime||'Simples Nacional')}${f('fiscal.cfop_dentro','CFOP — venda na Bahia',fis.cfop_dentro||'5101','inputmode="numeric" data-num="int"')}${f('fiscal.cfop_fora','CFOP — venda para outro estado',fis.cfop_fora||'6101','inputmode="numeric" data-num="int"')}
        <div class="fin-fld" style="grid-column:1/-1"><label>Observação no comprovante de venda</label><input data-cfg="fiscal.obs" value="${fe(fis.obs||'')}" placeholder="Ex.: garantia de 5 anos contra defeito de fabricação"></div></div></section>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Betoneira e vibrador</h3><p>Energia por m³ = potência × tempo das traçadas; depreciação pela vida útil.</p></div></div><div class="fin-linha">
       ${f('betoneira.cap','Capacidade da betoneira (litros)',c.betoneira.cap,'inputmode="numeric" data-num="int"')}${f('betoneira.util','Aproveitamento por traçada (%)',c.betoneira.util)}${f('betoneira.kw','Potência da betoneira (kW)',c.betoneira.kw,'inputmode="decimal" data-num="dec"')}${f('betoneira.min','Minutos por traçada',c.betoneira.min,'inputmode="decimal" data-num="dec"')}
       ${mo('betoneira.valor','Valor da betoneira',c.betoneira.valor)}${f('betoneira.vida','Vida útil (meses)',c.betoneira.vida,'inputmode="numeric" data-num="int"')}${mo('betoneira.manut','Manutenção por mês',c.betoneira.manut)}
       ${f('vibrador.kw','Potência do vibrador (kW)',c.vibrador.kw,'inputmode="decimal" data-num="dec"')}${f('vibrador.min','Minutos de vibração por m³',c.vibrador.min,'inputmode="decimal" data-num="dec"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Custos fixos mensais (rateados)</h3><p>Aluguel, manutenção de formas, EPIs… divididos pela produção prevista.</p></div><button type="button" class="gf-bt mini" data-pm="cfg-fixo-add"><i class="fas fa-plus"></i> Custo fixo</button></div>
       <div data-fixos>${(c.fixos||[]).map(linFixo).join('')}</div></section></div>
    <div class="gf-duas">
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Materiais e perdas</h3><p>Massas específicas (traço), unitárias (compra em m³ e latas), perdas e consumos.</p></div></div><div class="fin-linha">
       ${f('dens.cimento','Massa específica do cimento (t/m³)',c.dens.cimento,'inputmode="decimal" data-num="dec"')}${f('dens.areia','Massa específica da areia (t/m³)',c.dens.areia,'inputmode="decimal" data-num="dec"')}${f('dens.po','Massa específica do pó de pedra (t/m³)',c.dens.po,'inputmode="decimal" data-num="dec"')}${f('dens.brita','Massa específica da brita (t/m³)',c.dens.brita,'inputmode="decimal" data-num="dec"')}
       ${f('unit.areia','Massa unitária da areia (t/m³)',c.unit.areia,'inputmode="decimal" data-num="dec"')}${f('unit.po','Massa unitária do pó de pedra (t/m³)',c.unit.po,'inputmode="decimal" data-num="dec"')}${f('unit.brita','Massa unitária da brita (t/m³)',c.unit.brita,'inputmode="decimal" data-num="dec"')}${f('ar','Ar incorporado no concreto (%)',c.ar)}
       ${f('perdas.concreto','Perda de concreto (%)',c.perdas.concreto)}${f('perdas.aco','Perda de aço — pontas e transpasse (%)',c.perdas.aco)}${f('perdas.malha','Perda / transpasse de malha (%)',c.perdas.malha)}${f('arame_pct','Arame de amarração (% do aço)',c.arame_pct)}
       ${f('cura_l','Água de cura (litros por m³)',c.cura_l,'inputmode="decimal" data-num="dec"')}${f('desm_lm2','Desmoldante (litros por m² de forma)',c.desm_lm2,'inputmode="decimal" data-num="dec"')}${f('malha_m2','Área do painel de malha (m²)',c.malha_m2,'inputmode="decimal" data-num="dec"')}
       ${f('massa.simples','Peso do concreto simples (kg/m³)',c.massa.simples,'inputmode="numeric" data-num="int"')}${f('massa.armado','Peso do concreto armado (kg/m³)',c.massa.armado,'inputmode="numeric" data-num="int"')}</div></section>
     <section class="gf-sec"><div class="gf-sec-cab"><div><h3>Estoque mínimo e caixa</h3><p>Abaixo do mínimo, o painel avisa. Saldo inicial do caixa da fábrica.</p></div></div><div class="fin-linha">
       ${INS.map(i=>f('minimos.'+i.k,`${i.nome.split(' (')[0]} — mínimo (${i.unL})`,(c.minimos||{})[i.k],'inputmode="decimal" data-num="dec"')).join('')}
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
  box.querySelectorAll('[data-cfg]').forEach(e=>{const path=e.dataset.cfg.split('.'),txt=['cidade','uf','saldo_data','jornada.entrada','jornada.saida','fechado_ate','feriados_cidade'].includes(e.dataset.cfg)||e.dataset.cfg.startsWith('frete.origem.')||e.dataset.cfg.startsWith('fiscal.'),v=txt?String(e.value||'').trim():(e.dataset.cfg==='jornada.intervalo'||e.dataset.cfg==='frete.km_min'?(parseFloat(String(e.value).replace(',','.'))||0):num(e.value));let o=c;for(let i=0;i<path.length-1;i++){o[path[i]]=o[path[i]]||{};o=o[path[i]];}o[path[path.length-1]]=e.dataset.cfg==='uf'?String(v).toUpperCase():v;});
  c.fixos=[...box.querySelectorAll('[data-lin="fixos"]')].map(d=>({nome:d.querySelector('[data-fx="nome"]').value.trim(),valor:r2(num(d.querySelector('[data-fx="valor"]').value))})).filter(x=>x.nome||x.valor);
  c.equipe_lista=[...box.querySelectorAll('[data-lin="equipe"]')].map(d=>({nome:d.querySelector('[data-eqn]').value.trim(),funcao:d.querySelector('[data-eqf]').value})).filter(x=>x.nome);
  if(!ehAdm())c.fechado_ate=CFG().fechado_ate||'';else if(c.fechado_ate&&c.fechado_ate>hojeISO())return toast('O fechamento não pode ser depois de hoje.','error');
  c.frete=c.frete||{};const ck=box.querySelector('[data-cfg-ck="frete.ida_volta"]');if(ck)c.frete.ida_volta=ck.checked;if(c.frete.origem&&c.frete.origem.uf)c.frete.origem.uf=String(c.frete.origem.uf).toUpperCase();
  c.frete.cidades=[...box.querySelectorAll('[data-lin="cid"]')].map(d=>({cidade:cidUF(d.querySelector('[data-cn]').value),uf:partesCid(d.querySelector('[data-cn]').value)[1]||d.querySelector('[data-cu]').value.trim().toUpperCase(),valor:r2(num(d.querySelector('[data-cv]').value))})).filter(x=>x.cidade&&x.valor>0);
  c.caminhoes=[...box.querySelectorAll('[data-lin="cam"]')].map(d=>({nome:d.querySelector('[data-kn]').value.trim(),cap_kg:parseFloat(String(d.querySelector('[data-kc]').value).replace(',','.'))||0,motorista:d.querySelector('[data-km]').value.trim()})).filter(x=>x.nome);
  if(!(num(c.prod_m3)>0))return toast('Informe a produção prevista por mês (m³): é a base do rateio.','error');
  if(!(num(c.sinal)>=0&&num(c.sinal)<=100))return toast('O sinal deve ficar entre 0% e 100%.','error');
  const r=cfgRow();
  try{await gravar(r?{...r,cfg:{...((r&&r.cfg)||{}),...c}}:{tipo:'config',cfg:c,data_lancamento:todayDateTime()},r?r.rowid:null);toast('Parâmetros salvos: os custos das peças foram recalculados.','success');}catch(e){toast(e.message,'error',false);}
}

window.PM_FABRICA={escolherDiaProducao,feriadosDe,liberacaoLote,formCompra,formAvaria,formAjuste,formEnsaio,fichaLote,loteInfo,fecharDiasVencidos,confirmarFecharDia,reabrirDia,formProducao,diaFechado,passouHora,opSolta,cascataPeca,planoExcluirVenda,excluirVenda,depsExcluir2:depsExcluir,apagarReg,formOrdem,ordens,T,vendas,vendaDe,fichaVenda,cancelarVenda,devolver,registrarPagamento,entregar,moverVenda,formVenda,pendenciasProducao,andamentoOP,encerrada,depsVenda,depsOrdem,faltaInsumos,lerXmlNfe,catalogoPDF,imprimirVenda,depsExcluir,lotes,rastreio,comissoesMes,precoPara,calcularFrete,situacaoLote,pesoVenda,romaneio,imprimirEtiquetas,escolherPeca,calc,receita,traco1m3,rateio,estoque,estoqueInsumos,CFG,render,irAba,resumoMes,necessidade,caixaMes,faseVenda,totalVenda,pagoDe,reposicao,fichaHtml,tiposTodos,armPeca};
})();
