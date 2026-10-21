"use strict";(()=>{var k=Object.defineProperty;var E=(t,e,i)=>e in t?k(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var s=(t,e,i)=>E(t,typeof e!="symbol"?e+"":e,i);var M="0.1.0";var u=document.currentScript;function L(){return u&&/^https?:/.test(u.src)?new URL("api/v1",new URL(".",u.src)).toString():new URL("api/v1/",new URL(".",location.href)).toString()}function H(t,e,i){return Math.min(i,Math.max(e,t))}function q(t){let e=[...t];for(let i=e.length-1;i>0;i--){let n=Math.floor(Math.random()*(i+1));[e[i],e[n]]=[e[n],e[i]]}return e}var z=`
:host { display: block; width: 100%; }

.hi {
  position: relative;
  width: 100%;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  border-radius: 12px;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.hi--rectangle { max-width: 300px; aspect-ratio: 300 / 250; }
.hi--poster { max-width: 480px; aspect-ratio: 480 / 320; }
.hi--leaderboard { max-width: 728px; aspect-ratio: auto; height: 96px; }

/* themes */
.hi--dark { background: #0a0a0c; color: #f2efe9; }
.hi--light { background: #faf7f0; color: #1a1d21; }
.hi--dark .hi-card { box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.hi--light .hi-card { box-shadow: 0 10px 30px rgba(20,20,30,.18); }

/* split-layout panels (poster, leaderboard): solid text column beside the photo */
.hi--dark .hi-nameplate { background: #101013; border-top: 1px solid #24242b; }
.hi--dark .hi-panel { background: #101013; border-left: 1px solid #24242b; }
.hi--poster.hi--dark .hi-foot { background: #101013; border-top: 1px solid #24242b; }
.hi--light .hi-nameplate { background: #f3eee2; border-top: 1px solid #d9d0bd; }
.hi--light .hi-panel { background: #f3eee2; border-left: 1px solid #d9d0bd; }
.hi--poster.hi--light .hi-foot { background: #f3eee2; border-top: 1px solid #d9d0bd; }

.hi-card {
  position: absolute; inset: 0;
  display: block;
  text-decoration: none; color: inherit;
  border-radius: 12px; overflow: hidden;
}

.hi-layer {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  opacity: 0; transform: scale(1.015);
  transition: opacity .55s ease, transform .55s ease;
  pointer-events: none;
}
.hi-layer.is-active { opacity: 1; transform: none; }

.hi-media { position: absolute; inset: 0; background-size: cover; background-position: 50% 22%; }
.hi-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; }
.hi-noimg {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 4.5rem; font-weight: 700; letter-spacing: .04em;
}
.hi--dark .hi-noimg { background: linear-gradient(150deg, #1c2733 0%, #2e1f14 60%, #3a2410 100%); color: rgba(244,241,234,.25); }
.hi--light .hi-noimg { background: linear-gradient(150deg, #efe7d8 0%, #e7d9c1 60%, #dfd0b4 100%); color: rgba(26,29,33,.25); }

.hi-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,10,12,.12) 0%, rgba(8,10,12,.34) 50%, rgba(8,10,12,.88) 76%, rgba(8,10,12,.95) 100%);
}
.hi--light .hi-scrim {
  background: linear-gradient(180deg, rgba(250,247,240,.12) 0%, rgba(250,247,240,.38) 50%, rgba(250,247,240,.93) 84%, rgba(250,247,240,.98) 100%);
}

.hi-info {
  position: relative; margin-top: auto;
  padding: 12px 14px 8px;
}
.hi-field {
  font-size: 10px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
  color: #ffb454; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hi--light .hi-field { color: #b05e00; }
.hi-name {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700; line-height: 1.12;
  font-size: 1.22rem;
  margin: 0 0 5px;
}
.hi-tag {
  font-size: .74rem; line-height: 1.35; opacity: .88;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

/* ---- split layouts (poster, leaderboard): face + name, achievement column ---- */
.hi-body { position: relative; display: flex; flex: 1; min-height: 0; }
.hi--poster .hi-layer { flex-direction: column; }

.hi-face { display: flex; flex-direction: column; width: 45%; min-width: 0; }
.hi-face .hi-media { position: relative; flex: 1; }

.hi-nameplate { padding: 9px 12px 10px; }
.hi-nameplate .hi-name { margin: 0; font-size: 1.14rem; line-height: 1.15; }
.hi-nameplate-sub { margin-top: 3px; font-size: .66rem; letter-spacing: .08em; opacity: .6; }

.hi-panel {
  flex: 1; min-width: 0;
  padding: 14px 16px;
  display: flex; flex-direction: column; justify-content: center; gap: 8px;
}
.hi--poster .hi-field { margin-bottom: 0; }
.hi--poster .hi-tag { font-size: .82rem; -webkit-line-clamp: 5; }

.hi-quote {
  display: none; margin: 2px 0 0; padding-left: 10px;
  border-left: 2px solid #ffb454;
  font-family: Georgia, 'Times New Roman', serif; font-style: italic;
  font-size: .78rem; line-height: 1.45; opacity: .82;
}
.hi--light .hi-quote { border-left-color: #b05e00; }
.hi-quote.has {
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

.hi--poster .hi-foot { position: relative; padding: 6px 12px 8px; }

.hi--leaderboard .hi-media { right: auto; width: 96px; }
.hi--leaderboard .hi-panel { position: absolute; top: 0; bottom: 0; left: 96px; right: 0; padding: 8px 92px 8px 14px; gap: 2px; }
.hi--leaderboard .hi-field { font-size: 9px; margin-bottom: 0; }
.hi--leaderboard .hi-name { font-size: 1.02rem; margin: 0; }
.hi--leaderboard .hi-tag { font-size: .71rem; -webkit-line-clamp: 2; }
.hi--leaderboard .hi-foot {
  position: absolute; right: 10px; bottom: 7px; z-index: 3;
  padding: 0; flex-direction: column; align-items: flex-end; gap: 1px;
  max-width: 82px; font-size: 7px; line-height: 1.35; opacity: .55;
}
.hi--leaderboard .hi-brand { font-size: 7px; }
.hi--leaderboard .hi-noimg { font-size: 1.7rem; }
.hi--poster .hi-noimg { font-size: 3rem; }

.hi-foot {
  position: relative;
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 4px 14px 9px;
  font-size: 9px; letter-spacing: .02em; opacity: .62;
}
.hi-attr {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.hi-brand { flex-shrink: 0; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }

.hi-progress {
  position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 3;
}
.hi-progress i {
  display: block; height: 100%; width: 0;
  background: linear-gradient(90deg, #ff9933, #ffffff 55%, #138808);
  border-radius: 0 2px 2px 0;
}
@keyframes hi-progress { from { width: 0; } to { width: 100%; } }

.hi-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  z-index: 4;
  width: 26px; height: 26px; border-radius: 50%;
  border: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; line-height: 1; color: #fff;
  background: rgba(10,12,14,.5);
  opacity: 0; transition: opacity .2s ease;
  backdrop-filter: blur(2px);
}
.hi:hover .hi-nav, .hi-nav:focus-visible { opacity: 1; }
.hi-prev { left: 6px; }
.hi-next { right: 6px; }
.hi-nav:hover { background: rgba(10,12,14,.75); }

.hi-error {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 16px; text-align: center;
}
.hi-error-title { font-family: Georgia, serif; font-size: 1.05rem; font-weight: 700; }
.hi-error-sub { font-size: .72rem; opacity: .7; }
.hi-retry {
  border: 1px solid currentColor; background: none; color: inherit;
  border-radius: 6px; padding: 5px 14px; font-size: .72rem; cursor: pointer;
}
.hi-retry:hover { opacity: .8; }

@media (prefers-reduced-motion: reduce) {
  .hi-layer { transition: none; }
}
`;function S(t,e){let i=document.createElement("div");i.className=`hi hi--${t} hi--${e}`,i.setAttribute("role","region"),i.setAttribute("aria-label","Honour India \u2014 billboards honouring Indian scientists");let n=document.createElement("a");n.className="hi-card",n.target="_blank",n.rel="noopener noreferrer";let o=[];for(let d=0;d<2;d++){let a=document.createElement("div");a.className="hi-layer",d===1&&a.setAttribute("aria-hidden","true"),t==="poster"?a.innerHTML='<div class="hi-body"><div class="hi-face"><div class="hi-media"></div><div class="hi-nameplate"><h3 class="hi-name"></h3><div class="hi-nameplate-sub"></div></div></div><div class="hi-panel"><div class="hi-field"></div><p class="hi-tag"></p><blockquote class="hi-quote"></blockquote></div></div><div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">\u0938\u092E\u094D\u092E\u093E\u0928 \xB7 Honour India</span></div>':t==="leaderboard"?a.innerHTML='<div class="hi-body"><div class="hi-media"></div><div class="hi-panel"><div class="hi-field"></div><h3 class="hi-name"></h3><p class="hi-tag"></p></div></div><div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">\u0938\u092E\u094D\u092E\u093E\u0928 \xB7 Honour India</span></div>':a.innerHTML='<div class="hi-media"></div><div class="hi-scrim"></div><div class="hi-info"><div class="hi-field"></div><h3 class="hi-name"></h3><p class="hi-tag"></p></div><div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">\u0938\u092E\u094D\u092E\u093E\u0928 \xB7 Honour India</span></div>',n.appendChild(a),o.push(a)}let r=document.createElement("div");r.className="hi-progress",r.innerHTML="<i></i>";let h=document.createElement("button");h.className="hi-nav hi-prev",h.setAttribute("aria-label","Previous figure"),h.innerHTML="&#8249;";let c=document.createElement("button");c.className="hi-nav hi-next",c.setAttribute("aria-label","Next figure"),c.innerHTML="&#8250;";let l=document.createElement("div");return l.className="hi-error",l.style.display="none",l.innerHTML='<div class="hi-error-title">\u0938\u092E\u094D\u092E\u093E\u0928 \xB7 Honour India</div><div class="hi-error-sub">Could not reach the Honour India API. Retrying\u2026</div>',i.append(r,n,h,c,l),{root:i,progress:r,card:n,layers:[o[0],o[1]],navPrev:h,navNext:c,errorBox:l}}function y(t){return t.split(/\s+/).filter(Boolean).slice(0,2).map(e=>e[0].toUpperCase()).join("")}function C(t,e,i){var b,v,x;let n=t.querySelector(".hi-media"),o=t.querySelector(".hi-field"),r=t.querySelector(".hi-name"),h=t.querySelector(".hi-tag"),c=t.querySelector(".hi-attr"),l=t.querySelector(".hi-nameplate-sub");l?(o.textContent=e.field,l.textContent=(b=e.years)!=null?b:""):o.textContent=e.field+(e.years?` \xB7 ${e.years}`:""),r.textContent=e.name,h.textContent=e.tagline;let d=t.querySelector(".hi-quote");if(d&&(e.quote?(d.textContent=`\u201C${e.quote.text}\u201D`,d.classList.add("has")):(d.textContent="",d.classList.remove("has"))),e.image){let p=document.createElement("img");p.alt=`Portrait of ${e.name}`,p.loading="eager",p.decoding="async",p.src=new URL(e.image.url,i).toString(),p.onerror=()=>{n.innerHTML="";let m=document.createElement("div");m.className="hi-noimg",m.textContent=y(e.name),n.appendChild(m)},n.innerHTML="",n.appendChild(p)}else{n.innerHTML="";let p=document.createElement("div");p.className="hi-noimg",p.textContent=y(e.name),n.appendChild(p)}let a=((v=e.image)==null?void 0:v.credit)||"Wikimedia Commons",g=((x=e.image)==null?void 0:x.license)||"";c.textContent=`Photo: ${a}${g?` \xB7 ${g}`:""}`}function N(t,e){let i=t.image;return i?new Promise(n=>{let o=new Image,r=()=>n();o.onload=r,o.onerror=r,o.src=new URL(i.url,e).toString(),setTimeout(r,2e3)}):Promise.resolve()}var f=class{constructor(e,i){s(this,"queue",[]);s(this,"index",-1);s(this,"active",0);s(this,"timer",null);s(this,"fetching",!1);s(this,"destroyed",!1);s(this,"auto");s(this,"intervalMs");s(this,"api");s(this,"keyQuery");s(this,"dom");s(this,"shadow");s(this,"host");s(this,"onVisibility",()=>{document.hidden?this.pause():!this.destroyed&&this.queue.length>0&&this.show(this.index,!0)});var r,h,c,l,d;this.host=e,this.api=(r=i.api)!=null?r:L(),this.keyQuery=i.key?`&key=${encodeURIComponent(i.key)}`:"";let n=H((h=i.interval)!=null?h:8,5,60);this.intervalMs=n*1e3,this.auto=!window.matchMedia("(prefers-reduced-motion: reduce)").matches,this.shadow=(c=e.shadowRoot)!=null?c:e.attachShadow({mode:"open"}),this.shadow.innerHTML="";let o=document.createElement("style");o.textContent=z,this.shadow.appendChild(o),this.dom=S((l=i.size)!=null?l:"rectangle",(d=i.theme)!=null?d:"dark"),this.shadow.appendChild(this.dom.root),this.dom.navPrev.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),this.step(-1)}),this.dom.navNext.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),this.step(1)}),document.addEventListener("visibilitychange",this.onVisibility),this.fetchBatch()}async fetchBatch(){if(this.fetching||this.destroyed)return;this.fetching=!0;let e=5e3;for(;;){if(this.destroyed)return;try{let i=await fetch(`${this.api}/billboards/random?count=14${this.keyQuery}`);if(!i.ok)throw new Error(`HTTP ${i.status}`);let n=await i.json();if(this.destroyed)return;this.dom.errorBox.style.display="none",this.dom.card.style.visibility="visible",this.queue.push(...q(n.billboards)),this.index<0?this.show(0):this.schedule(),this.fetching=!1;return}catch(i){this.index<0&&(this.dom.errorBox.style.display="flex",this.dom.card.style.visibility="hidden"),await new Promise(n=>setTimeout(n,e)),e=Math.min(e*3,9e4)}}}step(e){if(this.queue.length===0)return;let i=(this.index+e+this.queue.length)%this.queue.length;this.show(i)}async show(e,i=!1){if(this.destroyed||this.queue.length===0)return;this.index=(e%this.queue.length+this.queue.length)%this.queue.length;let n=this.queue[this.index];if(i||await N(n,this.api),this.destroyed)return;let o=this.dom.layers[this.active===0?1:0],r=this.dom.layers[this.active];C(o,n,this.api),this.dom.card.href=n.link,o.classList.add("is-active"),o.setAttribute("aria-hidden","false"),r.classList.remove("is-active"),r.setAttribute("aria-hidden","true"),this.active=this.active===0?1:0,this.queue.length-this.index<=3&&this.fetchBatch(),this.schedule()}schedule(){if(this.clearTimer(),!this.auto||document.hidden||this.destroyed)return;let e=this.dom.progress.firstElementChild;e&&(e.style.animation="none",e.offsetWidth,e.style.animation=`hi-progress ${this.intervalMs}ms linear forwards`),this.timer=setTimeout(()=>this.step(1),this.intervalMs)}pause(){this.clearTimer();let e=this.dom.progress.firstElementChild;e&&(e.style.animationPlayState="paused")}clearTimer(){this.timer!==null&&(clearTimeout(this.timer),this.timer=null)}destroy(){this.destroyed=!0,this.clearTimer(),document.removeEventListener("visibilitychange",this.onVisibility),this.shadow.innerHTML=""}};function T(t,e={}){let i=typeof t=="string"?document.querySelector(t):t;if(!i)throw new Error("[honourindia] mount target not found");let n=new f(i,e);return{destroy:()=>n.destroy()}}function A(t){var n;let e=t.dataset,i=e.interval!==void 0?Number(e.interval):void 0;return{api:e.api,theme:e.theme==="light"?"light":e.theme==="dark"?"dark":void 0,size:["rectangle","leaderboard","poster"].includes((n=e.size)!=null?n:"")?e.size:void 0,interval:Number.isFinite(i)?i:void 0,key:e.key}}window.HonourIndia={version:M,mount:T};function w(){document.querySelectorAll("[data-honourindia]").forEach(t=>{t.getAttribute("data-honourindia-mounted")!=="1"&&(t.setAttribute("data-honourindia-mounted","1"),T(t,A(t)))})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",w,{once:!0}):w();})();
