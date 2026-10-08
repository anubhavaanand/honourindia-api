"use strict";(()=>{var x=Object.defineProperty;var w=(i,e,t)=>e in i?x(i,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[e]=t;var a=(i,e,t)=>w(i,typeof e!="symbol"?e+"":e,t);var T="0.1.0";var p=document.currentScript;function E(){return p&&/^https?:/.test(p.src)?new URL("api/v1",new URL(".",p.src)).toString():new URL("api/v1/",new URL(".",location.href)).toString()}function M(i,e,t){return Math.min(t,Math.max(e,i))}function L(i){let e=[...i];for(let t=e.length-1;t>0;t--){let n=Math.floor(Math.random()*(t+1));[e[t],e[n]]=[e[n],e[t]]}return e}var k=`
:host { display: block; }

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
.hi--poster { max-width: 480px; aspect-ratio: 480 / 520; }
.hi--leaderboard { max-width: 728px; aspect-ratio: auto; height: 96px; }

/* themes */
.hi--dark { background: #101418; color: #f4f1ea; }
.hi--light { background: #faf7f0; color: #1a1d21; }
.hi--dark .hi-card { box-shadow: 0 10px 30px rgba(0,0,0,.45); }
.hi--light .hi-card { box-shadow: 0 10px 30px rgba(20,20,30,.18); }

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
.hi--poster .hi-name { font-size: 1.9rem; }
.hi-tag {
  font-size: .74rem; line-height: 1.35; opacity: .88;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.hi--poster .hi-tag { font-size: .85rem; -webkit-line-clamp: 4; }
.hi--leaderboard .hi-tag { -webkit-line-clamp: 2; }
.hi--leaderboard .hi-info { padding: 10px 14px 8px; }

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
`;function H(i,e){let t=document.createElement("div");t.className=`hi hi--${i} hi--${e}`,t.setAttribute("role","region"),t.setAttribute("aria-label","Honour India \u2014 billboards honouring Indian scientists");let n=document.createElement("a");n.className="hi-card",n.target="_blank",n.rel="noopener noreferrer";let r=[];for(let u=0;u<2;u++){let s=document.createElement("div");s.className="hi-layer",u===1&&s.setAttribute("aria-hidden","true"),s.innerHTML='<div class="hi-media"></div><div class="hi-scrim"></div><div class="hi-info"><div class="hi-field"></div><h3 class="hi-name"></h3><p class="hi-tag"></p></div><div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">\u0938\u092E\u094D\u092E\u093E\u0928 \xB7 Honour India</span></div>',n.appendChild(s),r.push(s)}let o=document.createElement("div");o.className="hi-progress",o.innerHTML="<i></i>";let l=document.createElement("button");l.className="hi-nav hi-prev",l.setAttribute("aria-label","Previous figure"),l.innerHTML="&#8249;";let d=document.createElement("button");d.className="hi-nav hi-next",d.setAttribute("aria-label","Next figure"),d.innerHTML="&#8250;";let h=document.createElement("div");return h.className="hi-error",h.style.display="none",h.innerHTML='<div class="hi-error-title">\u0938\u092E\u094D\u092E\u093E\u0928 \xB7 Honour India</div><div class="hi-error-sub">Could not reach the Honour India API. Retrying\u2026</div>',t.append(o,n,l,d,h),{root:t,progress:o,card:n,layers:[r[0],r[1]],navPrev:l,navNext:d,errorBox:h}}function v(i){return i.split(/\s+/).filter(Boolean).slice(0,2).map(e=>e[0].toUpperCase()).join("")}function S(i,e,t){var s,f;let n=i.querySelector(".hi-media"),r=i.querySelector(".hi-field"),o=i.querySelector(".hi-name"),l=i.querySelector(".hi-tag"),d=i.querySelector(".hi-attr");if(r.textContent=e.field+(e.years?` \xB7 ${e.years}`:""),o.textContent=e.name,l.textContent=e.tagline,e.image){let c=document.createElement("img");c.alt=`Portrait of ${e.name}`,c.loading="eager",c.decoding="async",c.src=new URL(e.image.url,t).toString(),c.onerror=()=>{n.innerHTML="";let m=document.createElement("div");m.className="hi-noimg",m.textContent=v(e.name),n.appendChild(m)},n.innerHTML="",n.appendChild(c)}else{n.innerHTML="";let c=document.createElement("div");c.className="hi-noimg",c.textContent=v(e.name),n.appendChild(c)}let h=((s=e.image)==null?void 0:s.credit)||"Wikimedia Commons",u=((f=e.image)==null?void 0:f.license)||"";d.textContent=`Photo: ${h}${u?` \xB7 ${u}`:""}`}function N(i,e){let t=i.image;return t?new Promise(n=>{let r=new Image,o=()=>n();r.onload=o,r.onerror=o,r.src=new URL(t.url,e).toString(),setTimeout(o,2e3)}):Promise.resolve()}var g=class{constructor(e,t){a(this,"queue",[]);a(this,"index",-1);a(this,"active",0);a(this,"timer",null);a(this,"fetching",!1);a(this,"destroyed",!1);a(this,"auto");a(this,"intervalMs");a(this,"api");a(this,"keyQuery");a(this,"dom");a(this,"shadow");a(this,"host");a(this,"onVisibility",()=>{document.hidden?this.pause():!this.destroyed&&this.queue.length>0&&this.show(this.index,!0)});var o,l,d,h,u;this.host=e,this.api=(o=t.api)!=null?o:E(),this.keyQuery=t.key?`&key=${encodeURIComponent(t.key)}`:"";let n=M((l=t.interval)!=null?l:8,5,60);this.intervalMs=n*1e3,this.auto=!window.matchMedia("(prefers-reduced-motion: reduce)").matches,this.shadow=(d=e.shadowRoot)!=null?d:e.attachShadow({mode:"open"}),this.shadow.innerHTML="";let r=document.createElement("style");r.textContent=k,this.shadow.appendChild(r),this.dom=H((h=t.size)!=null?h:"rectangle",(u=t.theme)!=null?u:"dark"),this.shadow.appendChild(this.dom.root),this.dom.navPrev.addEventListener("click",s=>{s.preventDefault(),s.stopPropagation(),this.step(-1)}),this.dom.navNext.addEventListener("click",s=>{s.preventDefault(),s.stopPropagation(),this.step(1)}),document.addEventListener("visibilitychange",this.onVisibility),this.fetchBatch()}async fetchBatch(){if(this.fetching||this.destroyed)return;this.fetching=!0;let e=5e3;for(;;){if(this.destroyed)return;try{let t=await fetch(`${this.api}/billboards/random?count=14${this.keyQuery}`);if(!t.ok)throw new Error(`HTTP ${t.status}`);let n=await t.json();if(this.destroyed)return;this.dom.errorBox.style.display="none",this.dom.card.style.visibility="visible",this.queue.push(...L(n.billboards)),this.index<0?this.show(0):this.schedule(),this.fetching=!1;return}catch(t){this.index<0&&(this.dom.errorBox.style.display="flex",this.dom.card.style.visibility="hidden"),await new Promise(n=>setTimeout(n,e)),e=Math.min(e*3,9e4)}}}step(e){if(this.queue.length===0)return;let t=(this.index+e+this.queue.length)%this.queue.length;this.show(t)}async show(e,t=!1){if(this.destroyed||this.queue.length===0)return;this.index=(e%this.queue.length+this.queue.length)%this.queue.length;let n=this.queue[this.index];if(t||await N(n,this.api),this.destroyed)return;let r=this.dom.layers[this.active===0?1:0],o=this.dom.layers[this.active];S(r,n,this.api),this.dom.card.href=n.link,r.classList.add("is-active"),r.setAttribute("aria-hidden","false"),o.classList.remove("is-active"),o.setAttribute("aria-hidden","true"),this.active=this.active===0?1:0,this.queue.length-this.index<=3&&this.fetchBatch(),this.schedule()}schedule(){if(this.clearTimer(),!this.auto||document.hidden||this.destroyed)return;let e=this.dom.progress.firstElementChild;e&&(e.style.animation="none",e.offsetWidth,e.style.animation=`hi-progress ${this.intervalMs}ms linear forwards`),this.timer=setTimeout(()=>this.step(1),this.intervalMs)}pause(){this.clearTimer();let e=this.dom.progress.firstElementChild;e&&(e.style.animationPlayState="paused")}clearTimer(){this.timer!==null&&(clearTimeout(this.timer),this.timer=null)}destroy(){this.destroyed=!0,this.clearTimer(),document.removeEventListener("visibilitychange",this.onVisibility),this.shadow.innerHTML=""}};function y(i,e={}){let t=typeof i=="string"?document.querySelector(i):i;if(!t)throw new Error("[honourindia] mount target not found");let n=new g(t,e);return{destroy:()=>n.destroy()}}function A(i){var n;let e=i.dataset,t=e.interval!==void 0?Number(e.interval):void 0;return{api:e.api,theme:e.theme==="light"?"light":e.theme==="dark"?"dark":void 0,size:["rectangle","leaderboard","poster"].includes((n=e.size)!=null?n:"")?e.size:void 0,interval:Number.isFinite(t)?t:void 0,key:e.key}}window.HonourIndia={version:T,mount:y};function b(){document.querySelectorAll("[data-honourindia]").forEach(i=>{i.getAttribute("data-honourindia-mounted")!=="1"&&(i.setAttribute("data-honourindia-mounted","1"),y(i,A(i)))})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",b,{once:!0}):b();})();
