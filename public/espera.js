/* ═══════════ TELA DE ESPERA COM A LOGO ANIMADA (a única do sistema) ═══════════
   A logo da Vixsul (a mesma do topo) é separada em partes — as duas metades do "V", a pirâmide, o traço e o nome —
   e cada parte entra com o seu movimento: o "V" se fecha, a pirâmide cai, amassa ao pousar e solta uma onda,
   o traço cresce e o nome aparece. Enquanto espera: a pirâmide flutua balançando em 3D, o "V" respira junto,
   losangos sobem ao redor, uma luz passa sobre a logo e ela acompanha o mouse; clicar na pirâmide faz ela girar.
   Na saída, um círculo se fecha no centro revelando o sistema.
   - Ao abrir o sistema (login ou sessão salva): tela cheia, com a saudação, até os dados chegarem.
   - Ao salvar/atualizar (UI._showBusy): cartão por cima da tela, só se a espera passar de um instante. */
(function(){
  'use strict';
  const reduz=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css=`
#vx-espera{position:fixed;inset:0;z-index:10060;display:none;align-items:center;justify-content:center;perspective:1100px;opacity:0;transition:opacity .35s ease;}
#vx-espera.on{display:flex;} #vx-espera.vis{opacity:1;}
#vx-espera.inicio{background:radial-gradient(1100px 640px at 50% 44%,#FFFFFF 0%,#F3F7FF 50%,#E5EDFC 100%);clip-path:circle(150% at 50% 46%);transition:opacity .35s ease,clip-path .75s cubic-bezier(.7,0,.25,1);}
#vx-espera.inicio.saindo{clip-path:circle(0% at 50% 46%);}
#vx-espera.inicio.saindo .vxl{transform:scale(1.08)!important;transition:transform .7s cubic-bezier(.6,0,.3,1);}
#vx-espera.inicio::before,#vx-espera.inicio::after{content:'';position:absolute;border-radius:50%;filter:blur(64px);opacity:.6;pointer-events:none;}
#vx-espera.inicio::before{width:440px;height:440px;left:10%;top:6%;background:#C7D9FF;animation:vxBolha 9s ease-in-out infinite;}
#vx-espera.inicio::after{width:380px;height:380px;right:8%;bottom:4%;background:#D9E5FF;animation:vxBolha 11s ease-in-out infinite reverse;}
#vx-espera.busy{background:rgba(242,246,252,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
#vx-espera .vx-esp-cx{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;transform:translateY(10px) scale(.97);transition:transform .5s cubic-bezier(.2,.9,.3,1.15);}
#vx-espera.vis .vx-esp-cx{transform:none;}
#vx-espera.busy .vx-esp-cx{background:#fff;border:1px solid #E4E9F2;border-radius:24px;padding:28px 40px 24px;box-shadow:0 30px 70px -30px rgba(16,24,40,.45),0 2px 6px rgba(16,24,40,.05);}
.vxl{position:relative;width:min(410px,78vw);aspect-ratio:500/204;transform-style:preserve-3d;transition:transform .35s ease-out;will-change:transform;}
#vx-espera.busy .vxl{width:250px;}
.vxl img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none;-webkit-user-drag:none;}
.vxl .vxl-pg{position:absolute;inset:0;transform-origin:17.1% 36%;transform-style:preserve-3d;pointer-events:none;}
.vxl .vxl-pg.gira{animation:vxGiro 1s cubic-bezier(.3,.9,.4,1) both;}
.vxl .l-pir{transform-origin:17.1% 36%;}
.vxl .vxl-pirb{position:absolute;left:7%;top:12%;width:21%;height:48%;cursor:pointer;border-radius:30%;}
.vxl .vxl-sombra{position:absolute;left:10.5%;top:57%;width:13%;height:4.5%;border-radius:50%;background:radial-gradient(closest-side,rgba(16,24,40,.3),rgba(16,24,40,0));opacity:0;}
.vxl .vxl-onda{position:absolute;left:17.1%;top:58%;width:26%;aspect-ratio:1;border-radius:50%;border:2px solid rgba(46,111,224,.55);transform:translate(-50%,-50%) scale(.1);opacity:0;pointer-events:none;}
.vxl .vxl-luz{position:absolute;inset:0;overflow:hidden;pointer-events:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;}
.vxl .vxl-luz i{position:absolute;top:-20%;bottom:-20%;left:0;width:22%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.9),rgba(255,255,255,0));transform:translateX(-140%) skewX(-18deg);}
/* losangos que sobem ao redor (como a pirâmide da logo) */
#vx-espera .vx-esp-pts{position:absolute;inset:-40px -60px;pointer-events:none;}
#vx-espera .vx-esp-pts span{position:absolute;left:var(--x);bottom:12%;width:var(--s);height:var(--s);background:var(--c);transform:rotate(45deg);border-radius:2px;opacity:0;}
#vx-espera.inicio.vis .vx-esp-pts span{animation:vxPt var(--d) var(--a) ease-in infinite;}
#vx-espera.busy .vx-esp-pts{display:none;}
/* entrada */
#vx-espera.vis .l-chE{animation:vxChE .8s cubic-bezier(.2,.9,.3,1.12) both,vxRespE 2.6s 1.5s ease-in-out infinite;}
#vx-espera.vis .l-chD{animation:vxChD .8s .06s cubic-bezier(.2,.9,.3,1.12) both,vxRespD 2.6s 1.5s ease-in-out infinite;}
#vx-espera.vis .l-pir{animation:vxPirIn .9s .3s cubic-bezier(.3,1.2,.5,1) both,vxFlut 2.6s 1.5s ease-in-out infinite;}
#vx-espera.vis .vxl-sombra{animation:vxSombraIn .5s .75s both,vxSombra 2.6s 1.5s ease-in-out infinite;}
#vx-espera.vis .vxl-onda{animation:vxOnda 2.6s .78s ease-out infinite;}
#vx-espera.vis .l-div{transform-origin:38% 50%;animation:vxDiv .45s 1s cubic-bezier(.2,.8,.3,1) both;}
#vx-espera.vis .l-txt{animation:vxTxt .75s 1.12s cubic-bezier(.2,.8,.3,1) both;}
#vx-espera.vis .vxl-luz i{animation:vxLuz 3.4s 2s ease-in-out infinite;}
#vx-espera.busy.vis .l-div{animation-delay:.4s;} #vx-espera.busy.vis .l-txt{animation-delay:.5s;}
/* barra e mensagem */
#vx-espera .vx-esp-barra{width:200px;height:4px;border-radius:99px;background:#E1E8F5;overflow:hidden;position:relative;}
#vx-espera .vx-esp-barra i{position:absolute;top:0;bottom:0;width:38%;border-radius:99px;background:linear-gradient(90deg,#1E3A8A,#2E6FE0);box-shadow:0 0 10px rgba(46,111,224,.6);animation:vxBarra 1.3s ease-in-out infinite;}
#vx-espera .vx-esp-msg{margin:0;min-height:18px;font:600 13.5px Inter,system-ui,sans-serif;color:#475467;letter-spacing:.01em;transition:opacity .25s;}
#vx-espera .vx-esp-dica{position:absolute;bottom:-34px;left:0;right:0;text-align:center;font:500 11px Inter,system-ui,sans-serif;color:#98A2B3;opacity:0;transition:opacity .4s;}
#vx-espera.inicio.vis .vx-esp-dica{opacity:1;transition-delay:2.6s;} #vx-espera.busy .vx-esp-dica{display:none;}
@keyframes vxChE{0%{opacity:0;transform:translate(-28%,24%) rotate(-8deg)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes vxChD{0%{opacity:0;transform:translate(28%,24%) rotate(8deg)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes vxRespE{0%,100%{transform:none}50%{transform:translate(-1.1%,.9%)}}
@keyframes vxRespD{0%,100%{transform:none}50%{transform:translate(1.1%,.9%)}}
@keyframes vxPirIn{0%{opacity:0;transform:translateY(-80%) scale(.6) rotate(-14deg)}50%{opacity:1;transform:translateY(3%) scaleX(1.08) scaleY(.88) rotate(0)}68%{transform:translateY(-5%) scaleX(.97) scaleY(1.04)}84%{transform:translateY(1%) scale(1)}100%{opacity:1;transform:none}}
@keyframes vxFlut{0%,100%{transform:translateY(0) rotateY(0)}25%{transform:translateY(-3%) rotateY(16deg)}50%{transform:translateY(-5.5%) rotateY(0)}75%{transform:translateY(-3%) rotateY(-16deg)}}
@keyframes vxSombraIn{from{opacity:0}to{opacity:1}}
@keyframes vxSombra{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.75);opacity:.5}}
@keyframes vxOnda{0%{transform:translate(-50%,-50%) scale(.1);opacity:.75}55%{transform:translate(-50%,-50%) scale(1.5);opacity:0}100%{opacity:0}}
@keyframes vxDiv{0%{transform:scaleY(0);opacity:0}100%{transform:scaleY(1);opacity:1}}
@keyframes vxTxt{0%{clip-path:inset(0 100% 0 38%);transform:translateX(-4%);opacity:.3}100%{clip-path:inset(0 0 0 0);transform:none;opacity:1}}
@keyframes vxLuz{0%{transform:translateX(-140%) skewX(-18deg)}55%,100%{transform:translateX(560%) skewX(-18deg)}}
@keyframes vxGiro{0%{transform:rotateY(0) translateY(0)}40%{transform:rotateY(200deg) translateY(-14%)}100%{transform:rotateY(360deg) translateY(0)}}
@keyframes vxBarra{0%{left:-40%}100%{left:102%}}
@keyframes vxBolha{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.12)}}
@keyframes vxPt{0%{opacity:0;transform:translateY(0) rotate(45deg) scale(.6)}20%{opacity:.85}100%{opacity:0;transform:translateY(-150px) rotate(225deg) scale(1)}}
@media (prefers-reduced-motion:reduce){#vx-espera *{animation-duration:.01s!important;animation-iteration-count:1!important;} .vxl{transition:none;} #vx-espera.inicio{transition:opacity .3s;}}
@media (max-width:560px){#vx-espera.busy .vx-esp-cx{padding:22px 24px 20px;} #vx-espera.busy .vxl{width:200px;}}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  // ── as partes da logo: separadas pelos pixels da própria imagem (fundo transparente) ──
  let camadas=null,logoSrc='',prontas=null;
  async function separar(){
    if(camadas)return camadas;
    const ref=document.querySelector('.vx-marca img');logoSrc=ref?ref.src:'';if(!logoSrc)return null;
    const im=new Image();await new Promise(ok=>{im.onload=ok;im.onerror=ok;im.src=logoSrc;if(im.complete&&im.naturalWidth)ok();});if(!im.naturalWidth)return null;
    const W=im.naturalWidth,H=im.naturalHeight,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(im,0,0);
    const base=x.getImageData(0,0,W,H),nomes=['chE','chD','pir','div','txt'],dados={};nomes.forEach(n=>dados[n]=x.createImageData(W,H));
    // pirâmide = losango com centro em 17,1% × 36% da imagem; o "V" divide no meio (17,1%); traço e nome à direita
    const naPir=(fx,fy)=>Math.abs(fx-.171)/.098+Math.abs(fy-.36)/.235<=1;
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=(j*W+i)*4;if(base.data[k+3]<4)continue;const fx=i/W,fy=j/H;
      const n=fx>=.40?'txt':fx>=.355?'div':naPir(fx,fy)?'pir':fx<.171?'chE':'chD';const d=dados[n].data;d[k]=base.data[k];d[k+1]=base.data[k+1];d[k+2]=base.data[k+2];d[k+3]=base.data[k+3];}
    camadas={};nomes.forEach(n=>{x.clearRect(0,0,W,H);x.putImageData(dados[n],0,0);camadas[n]=c.toDataURL('image/png');});
    return camadas;}

  // losangos ao redor: posição, tamanho, cor, duração e atraso variados
  const PTS=[[8,7,'#2E6FE0',4.6,.4],[20,5,'#9AA0A8',5.2,1.6],[33,9,'#1E3A8A',4.2,2.6],[50,6,'#2E6FE0',5.6,.9],[63,8,'#9AA0A8',4.8,2.1],[76,5,'#1E3A8A',5.4,.2],[88,7,'#2E6FE0',4.4,1.2],[95,5,'#9AA0A8',5,3]];
  let el=null,msgT=null,fimT=null,abertoEm=0,modo='',busyT=null,iniP=null;
  function montar(){
    if(el)return el;
    el=document.createElement('div');el.id='vx-espera';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.innerHTML=`<div class="vx-esp-cx"><div class="vx-esp-pts">${PTS.map(([x,s,c,d,a])=>`<span style="--x:${x}%;--s:${s}px;--c:${c};--d:${d}s;--a:${a}s"></span>`).join('')}</div>
      <div class="vxl" data-vxl></div><div class="vx-esp-barra"><i></i></div><p class="vx-esp-msg" data-msg></p><div class="vx-esp-dica">dica: clique na pirâmide</div></div>`;
    document.body.appendChild(el);
    // inclina a logo acompanhando o mouse (efeito 3D)
    if(!reduz){el.addEventListener('pointermove',ev=>{const l=el.querySelector('[data-vxl]');if(!l||el.classList.contains('saindo'))return;const r=l.getBoundingClientRect(),dx=(ev.clientX-(r.left+r.width/2))/window.innerWidth,dy=(ev.clientY-(r.top+r.height/2))/window.innerHeight;
        l.style.transform=`rotateY(${(dx*22).toFixed(2)}deg) rotateX(${(-dy*18).toFixed(2)}deg)`;});
      el.addEventListener('pointerleave',()=>{const l=el.querySelector('[data-vxl]');if(l)l.style.transform='';});}
    // clique na pirâmide: ela gira
    el.addEventListener('click',ev=>{if(!ev.target.closest('.vxl-pirb'))return;const p=el.querySelector('.vxl-pg');if(!p||p.classList.contains('gira'))return;p.classList.add('gira');setTimeout(()=>p.classList.remove('gira'),1050);});
    return el;}
  function pintarLogo(){
    const box=el.querySelector('[data-vxl]');box.style.transform='';
    if(camadas){box.innerHTML=`<img class="l-chE" src="${camadas.chE}" alt=""><img class="l-chD" src="${camadas.chD}" alt=""><span class="vxl-onda"></span><span class="vxl-sombra"></span><span class="vxl-pg"><img class="l-pir" src="${camadas.pir}" alt=""></span><img class="l-div" src="${camadas.div}" alt=""><img class="l-txt" src="${camadas.txt}" alt=""><span class="vxl-luz"><i></i></span><span class="vxl-pirb" title="Clique na pirâmide"></span>`;
      const luz=box.querySelector('.vxl-luz');luz.style.webkitMaskImage=luz.style.maskImage=`url("${logoSrc}")`;}
    else{box.innerHTML=`<img class="l-txt" src="${(document.querySelector('.vx-marca img')||{}).src||''}" alt="Vixsul">`;
      // as partes ainda estão sendo separadas (frações de segundo): quando ficarem prontas, a animação começa
      (prontas||Promise.resolve(null)).then(cm=>cm||separar()).then(cm=>{if(cm&&el.classList.contains('on')){el.classList.remove('vis');pintarLogo();setTimeout(()=>el.classList.add('vis'),30);}});}}
  function abrir(m,msg){
    montar();clearTimeout(fimT);modo=m;
    const novo=!el.classList.contains('on')||!el.classList.contains(m)||el.classList.contains('saindo');
    el.className='on '+m;
    if(novo){pintarLogo();abertoEm=Date.now();setTimeout(()=>el.classList.add('vis'),30);}else el.classList.add('vis');
    mensagem(msg);}
  function mensagem(t){const p=el&&el.querySelector('[data-msg]');if(!p||p.textContent===t)return;p.style.opacity=0;setTimeout(()=>{p.textContent=t||'';p.style.opacity=1;},180);}
  function fechar(minimo){
    if(!el||!el.classList.contains('on'))return;const falta=Math.max(0,(minimo||0)-(Date.now()-abertoEm));clearTimeout(fimT);
    fimT=setTimeout(()=>{clearInterval(msgT);msgT=null;
      // abertura: um círculo se fecha no centro revelando o sistema; cartão de espera: some suave
      if(modo==='inicio'&&!reduz){el.classList.add('saindo');setTimeout(()=>{if(el.classList.contains('saindo')){el.className='';modo='';}},780);return;}
      el.classList.remove('vis');setTimeout(()=>{if(!el.classList.contains('vis')){el.className='';modo='';}},380);},falta);}

  // ── abertura do sistema: tela cheia desde o clique em Entrar (ou a sessão salva) até os dados chegarem ──
  const FRASES=['Carregando seus dados…','Conferindo obras e contratos…','Organizando a fábrica…','Arrumando o financeiro…','Quase pronto…'];
  function inicio(msg){
    if(modo==='inicio'&&el&&!el.classList.contains('saindo')){clearTimeout(fimT);return;}   // já aberta (ex.: desde o Entrar): segue
    abrir('inicio',msg||FRASES[0]);
    let i=msg?-1:0;clearInterval(msgT);msgT=setInterval(()=>{i=Math.min(i+1,FRASES.length-1);mensagem(FRASES[i]);},1700);
    clearTimeout(iniP);iniP=setTimeout(()=>fechar(0),45000);}   // segurança: nunca fica presa
  function fimInicio(){clearTimeout(iniP);if(modo==='inicio')fechar(2300);}
  // ── espera de gravação: só aparece se passar de um instante (não pisca nas gravações rápidas) ──
  function ocupado(t){
    clearTimeout(busyT);if(modo==='inicio')return;
    if(el&&el.classList.contains('on')&&modo==='busy'){clearTimeout(fimT);mensagem(t||'Aguarde…');return;}
    busyT=setTimeout(()=>abrir('busy',t||'Aguarde…'),450);}
  function livre(){clearTimeout(busyT);if(modo==='busy')fechar(700);}

  window.VxEspera={inicio,fimInicio,ocupado,livre,separar,abrir,fechar};
  prontas=separar();   // prepara as partes da logo logo que a página abre

  // ganchos: abertura (App.init sem dados ainda, com alguém entrando) e gravações (UI._showBusy / _hideBusy)
  function ligar(){
    if(typeof App!=='undefined'&&App.init&&!App.init._vx){const orig=App.init;
      // entrando no sistema: sem dados ainda, ou a tela de abertura já aberta pelo Entrar (sair e entrar de novo sem recarregar a página)
      App.init=function(silent,onDone){const prim=!silent&&typeof Auth!=='undefined'&&!!Auth._session&&(!(this.state&&this.state.data)||modo==='inicio');
        if(prim)inicio();return orig.call(this,silent,prim?function(){fimInicio();if(onDone)return onDone.apply(this,arguments);}:onDone);};
      App.init._vx=1;}
    if(typeof UI!=='undefined'&&UI._showBusy&&!UI._showBusy._vx){const s=UI._showBusy,h=UI._hideBusy;
      UI._showBusy=function(t){const r=s.apply(this,arguments);ocupado(t);return r;};UI._showBusy._vx=1;
      UI._hideBusy=function(){const r=h.apply(this,arguments);livre();return r;};}
  }
  ligar();
})();
