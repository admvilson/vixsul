/* ═══════════ TELA DE ESPERA COM A LOGO ANIMADA ═══════════
   A logo da Vixsul (a mesma do topo) é separada em partes — as duas metades do "V", a pirâmide, o traço e o nome —
   e cada parte entra com o seu movimento: o "V" se fecha, a pirâmide cai e assenta, o traço cresce e o nome aparece.
   Enquanto espera: a pirâmide flutua, uma luz passa sobre a logo e ela acompanha o mouse (inclina em 3D);
   clicar na pirâmide faz ela girar.
   - Ao abrir o sistema (login ou sessão salva): tela cheia até os dados chegarem.
   - Ao salvar/atualizar (UI._showBusy): cartão por cima da tela, só se a espera passar de um instante. */
(function(){
  'use strict';
  const reduz=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css=`
#vx-espera{position:fixed;inset:0;z-index:10060;display:none;align-items:center;justify-content:center;perspective:1000px;opacity:0;transition:opacity .35s ease;}
#vx-espera.on{display:flex;} #vx-espera.vis{opacity:1;}
#vx-espera.inicio{background:radial-gradient(1100px 620px at 50% 42%,#FFFFFF 0%,#F3F7FF 52%,#E7EEFC 100%);}
#vx-espera.inicio::before,#vx-espera.inicio::after{content:'';position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;pointer-events:none;}
#vx-espera.inicio::before{width:420px;height:420px;left:12%;top:8%;background:#C9DBFF;animation:vxBolha 9s ease-in-out infinite;}
#vx-espera.inicio::after{width:360px;height:360px;right:10%;bottom:6%;background:#D7E4FF;animation:vxBolha 11s ease-in-out infinite reverse;}
#vx-espera.busy{background:rgba(242,246,252,.66);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);}
#vx-espera .vx-esp-cx{position:relative;display:flex;flex-direction:column;align-items:center;gap:20px;transform:translateY(8px) scale(.98);transition:transform .45s cubic-bezier(.2,.9,.3,1.15);}
#vx-espera.vis .vx-esp-cx{transform:none;}
#vx-espera.busy .vx-esp-cx{background:#fff;border:1px solid #E4E9F2;border-radius:24px;padding:28px 38px 24px;box-shadow:0 30px 70px -30px rgba(16,24,40,.45),0 2px 6px rgba(16,24,40,.05);}
.vxl{position:relative;width:min(400px,76vw);aspect-ratio:500/204;transform-style:preserve-3d;transition:transform .3s ease-out;will-change:transform;}
#vx-espera.busy .vxl{width:250px;}
.vxl img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none;-webkit-user-drag:none;}
.vxl .vxl-pirb{position:absolute;left:7%;top:12%;width:21%;height:48%;cursor:pointer;border-radius:30%;}
.vxl .vxl-sombra{position:absolute;left:10.5%;top:57%;width:13%;height:4.5%;border-radius:50%;background:radial-gradient(closest-side,rgba(16,24,40,.28),rgba(16,24,40,0));opacity:0;}
.vxl .vxl-luz{position:absolute;inset:0;overflow:hidden;pointer-events:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;}
.vxl .vxl-luz i{position:absolute;top:-20%;bottom:-20%;left:0;width:22%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.85),rgba(255,255,255,0));transform:translateX(-140%) skewX(-18deg);}
/* entrada */
#vx-espera.vis .l-chE{animation:vxChE .75s cubic-bezier(.2,.9,.3,1.12) both;}
#vx-espera.vis .l-chD{animation:vxChD .75s .06s cubic-bezier(.2,.9,.3,1.12) both;}
#vx-espera.vis .l-pir{transform-origin:17.1% 36%;animation:vxPirIn .8s .32s cubic-bezier(.3,1.3,.5,1) both,vxFlut 2.6s 1.3s ease-in-out infinite;}
#vx-espera.vis .vxl-sombra{animation:vxSombraIn .5s .7s both,vxSombra 2.6s 1.3s ease-in-out infinite;}
#vx-espera.vis .l-div{transform-origin:38% 50%;animation:vxDiv .45s .95s cubic-bezier(.2,.8,.3,1) both;}
#vx-espera.vis .l-txt{animation:vxTxt .7s 1.1s cubic-bezier(.2,.8,.3,1) both;}
#vx-espera.vis .vxl-luz i{animation:vxLuz 3.2s 1.9s ease-in-out infinite;}
#vx-espera.busy.vis .l-div,#vx-espera.busy.vis .l-txt{animation-delay:.35s,.45s;}
.vxl .vxl-pg{position:absolute;inset:0;transform-origin:17.1% 36%;transform-style:preserve-3d;pointer-events:none;}
.vxl .vxl-pg.gira{animation:vxGiro .95s cubic-bezier(.3,.9,.4,1) both;}
/* barra e mensagem */
#vx-espera .vx-esp-barra{width:190px;height:4px;border-radius:99px;background:#E1E8F5;overflow:hidden;position:relative;}
#vx-espera .vx-esp-barra i{position:absolute;top:0;bottom:0;width:38%;border-radius:99px;background:linear-gradient(90deg,#1E3A8A,#2E6FE0);animation:vxBarra 1.25s ease-in-out infinite;}
#vx-espera .vx-esp-msg{margin:0;min-height:18px;font:600 13.5px Inter,system-ui,sans-serif;color:#475467;letter-spacing:.01em;transition:opacity .25s;}
#vx-espera .vx-esp-dica{position:absolute;bottom:-34px;left:0;right:0;text-align:center;font:500 11px Inter,system-ui,sans-serif;color:#98A2B3;opacity:0;transition:opacity .4s;}
#vx-espera.inicio.vis .vx-esp-dica{opacity:1;transition-delay:2.4s;}
@keyframes vxChE{0%{opacity:0;transform:translate(-26%,22%) rotate(-6deg)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes vxChD{0%{opacity:0;transform:translate(26%,22%) rotate(6deg)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes vxPirIn{0%{opacity:0;transform:translateY(-75%) scale(.6) rotate(-12deg)}55%{opacity:1;transform:translateY(5%) scale(1.03) rotate(0)}78%{transform:translateY(-3%) scale(.99)}100%{opacity:1;transform:none}}
@keyframes vxFlut{0%,100%{transform:translateY(0)}50%{transform:translateY(-5.5%)}}
@keyframes vxSombraIn{from{opacity:0}to{opacity:1}}
@keyframes vxSombra{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.78);opacity:.55}}
@keyframes vxDiv{0%{transform:scaleY(0);opacity:0}100%{transform:scaleY(1);opacity:1}}
@keyframes vxTxt{0%{clip-path:inset(0 100% 0 38%);transform:translateX(-4%);opacity:.3}100%{clip-path:inset(0 0 0 0);transform:none;opacity:1}}
@keyframes vxLuz{0%{transform:translateX(-140%) skewX(-18deg)}55%,100%{transform:translateX(560%) skewX(-18deg)}}
@keyframes vxGiro{0%{transform:rotateY(0) translateY(0)}40%{transform:rotateY(200deg) translateY(-14%)}100%{transform:rotateY(360deg) translateY(0)}}
@keyframes vxBarra{0%{left:-40%}100%{left:102%}}
@keyframes vxBolha{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.12)}}
@media (prefers-reduced-motion:reduce){#vx-espera *{animation-duration:.01s!important;animation-iteration-count:1!important;} .vxl{transition:none;}}
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

  let el=null,msgT=null,fimT=null,abertoEm=0,modo='',busyT=null,iniP=null;
  function montar(){
    if(el)return el;
    el=document.createElement('div');el.id='vx-espera';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.innerHTML=`<div class="vx-esp-cx"><div class="vxl" data-vxl></div><div class="vx-esp-barra"><i></i></div><p class="vx-esp-msg" data-msg></p><div class="vx-esp-dica">dica: clique na pirâmide</div></div>`;
    document.body.appendChild(el);
    // inclina a logo acompanhando o mouse (efeito 3D)
    if(!reduz){el.addEventListener('pointermove',ev=>{const l=el.querySelector('[data-vxl]');if(!l)return;const r=l.getBoundingClientRect(),dx=(ev.clientX-(r.left+r.width/2))/window.innerWidth,dy=(ev.clientY-(r.top+r.height/2))/window.innerHeight;
        l.style.transform=`rotateY(${(dx*22).toFixed(2)}deg) rotateX(${(-dy*18).toFixed(2)}deg)`;});
      el.addEventListener('pointerleave',()=>{const l=el.querySelector('[data-vxl]');if(l)l.style.transform='';});}
    // clique na pirâmide: ela gira
    el.addEventListener('click',ev=>{if(!ev.target.closest('.vxl-pirb'))return;const p=el.querySelector('.vxl-pg');if(!p||p.classList.contains('gira'))return;p.classList.add('gira');setTimeout(()=>p.classList.remove('gira'),1000);});
    return el;}
  function pintarLogo(){
    const box=el.querySelector('[data-vxl]');box.style.transform='';
    if(camadas){box.innerHTML=`<img class="l-chE" src="${camadas.chE}" alt=""><img class="l-chD" src="${camadas.chD}" alt=""><span class="vxl-sombra"></span><span class="vxl-pg"><img class="l-pir" src="${camadas.pir}" alt=""></span><img class="l-div" src="${camadas.div}" alt=""><img class="l-txt" src="${camadas.txt}" alt=""><span class="vxl-luz"><i></i></span><span class="vxl-pirb" title="Clique na pirâmide"></span>`;
      const luz=box.querySelector('.vxl-luz');luz.style.webkitMaskImage=luz.style.maskImage=`url("${logoSrc}")`;}
    else{box.innerHTML=`<img class="l-txt" src="${(document.querySelector('.vx-marca img')||{}).src||''}" alt="Vixsul">`;
      // as partes ainda estão sendo separadas (frações de segundo): quando ficarem prontas, a animação começa
      (prontas||Promise.resolve(null)).then(cm=>cm||separar()).then(cm=>{if(cm&&el.classList.contains('on')){el.classList.remove('vis');pintarLogo();setTimeout(()=>el.classList.add('vis'),30);}});}}
  function abrir(m,msg){
    montar();clearTimeout(fimT);modo=m;
    const novo=!el.classList.contains('on')||!el.classList.contains(m);
    el.className='on '+m;
    if(novo){pintarLogo();abertoEm=Date.now();setTimeout(()=>el.classList.add('vis'),30);}else el.classList.add('vis');
    mensagem(msg);}
  function mensagem(t){const p=el&&el.querySelector('[data-msg]');if(!p||p.textContent===t)return;p.style.opacity=0;setTimeout(()=>{p.textContent=t||'';p.style.opacity=1;},180);}
  function fechar(minimo){
    if(!el||!el.classList.contains('on'))return;const falta=Math.max(0,(minimo||0)-(Date.now()-abertoEm));clearTimeout(fimT);
    fimT=setTimeout(()=>{clearInterval(msgT);msgT=null;el.classList.remove('vis');setTimeout(()=>{if(!el.classList.contains('vis'))el.className='';modo='';},380);},falta);}

  // ── abertura do sistema: tela cheia até os dados chegarem ──
  const FRASES=['Carregando seus dados…','Conferindo obras e contratos…','Organizando a fábrica…','Arrumando o financeiro…','Quase pronto…'];
  function inicio(){
    if(modo==='inicio')return;abrir('inicio',FRASES[0]);let i=0;clearInterval(msgT);msgT=setInterval(()=>{i=Math.min(i+1,FRASES.length-1);mensagem(FRASES[i]);},1700);
    clearTimeout(iniP);iniP=setTimeout(()=>fechar(0),45000);}   // segurança: nunca fica presa
  function fimInicio(){clearTimeout(iniP);if(modo==='inicio')fechar(1900);}
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
      App.init=function(silent,onDone){const prim=!(this.state&&this.state.data)&&!silent&&typeof Auth!=='undefined'&&Auth._session;
        if(prim)inicio();return orig.call(this,silent,prim?function(){fimInicio();if(onDone)return onDone.apply(this,arguments);}:onDone);};
      App.init._vx=1;}
    if(typeof UI!=='undefined'&&UI._showBusy&&!UI._showBusy._vx){const s=UI._showBusy,h=UI._hideBusy;
      UI._showBusy=function(t){const r=s.apply(this,arguments);ocupado(t);return r;};UI._showBusy._vx=1;
      UI._hideBusy=function(){const r=h.apply(this,arguments);livre();return r;};}
  }
  ligar();
})();
