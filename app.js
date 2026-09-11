(()=>{"use strict";
const $=id=>document.getElementById(id), pages=[...document.querySelectorAll(".page")], back=$("back"), title=$("title");
let current="home", stream=null, scanRAF=0, fileData=null, blocks=[], blockIndex=0, recv=null, scanEnableAt=0, lastSeenKey="", lastSeenAt=0, autoTimer=null, autoRunning=false;
const START=new Uint8Array([0xD3,0x51,0x52,0x43]), SHORT=new Uint8Array([0xD3,0x43]), VERSION=1;
function go(id){stopAuto();stopCamera();pages.forEach(p=>p.classList.toggle("active",p.id===id));current=id;back.classList.toggle("hidden",id==="home");title.textContent=id==="home"?"QR通信":({send:"送る",show:"送信",receive:"受ける",settings:"設定"}[id]||"QR通信");if(id==="receive"){resetReceiveState();startCamera();}}
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));back.onclick=()=>go("home");$("end").onclick=()=>{stopAuto();go("home")};$("stop").onclick=()=>go("home");
function resetReceiveState(){
  recv=null; lastSeenKey=""; lastSeenAt=0; scanEnableAt=0;
  $("recvStatus").textContent="QRコードを映してください"; const rbs=$("receiveBlockStatus"); if(rbs){rbs.classList.add("hidden");rbs.innerHTML="";}
  $("bar").style.width="0%";
  $("result").textContent="";
  $("result").classList.add("hidden");
  $("copy").classList.add("hidden");
  $("save").classList.add("hidden");
  $("copy").onclick=null; $("save").onclick=null;
}
function senderStatus(){
  if(!blocks.length)return;
  $("sendStatus").innerHTML='<div class="blockStatus"><span class="label">送信中</span><span class="current">'+(blockIndex+1)+'</span><span class="total">/ '+blocks.length+'</span></div>';
}
function receiverStatus(done,total){
  const el=$("receiveBlockStatus");
  if(!el)return;
  el.classList.remove("hidden");
  el.innerHTML='<span class="label">受信済み</span><span class="current">'+done+'</span><span class="total">/ '+total+'</span>';
}
function stopAuto(){
  if(autoTimer){clearInterval(autoTimer);autoTimer=null}
  autoRunning=false;
  const b=$("autoToggle");
  if(b){b.textContent="▶ 自動送信";b.disabled=!blocks.length}
}
function startAuto(){
  if(!blocks.length||autoRunning)return;
  autoRunning=true;
  const b=$("autoToggle"); if(b)b.textContent="⏸ 停止";
  const intervalMs=parseInt(($("autoInterval")&&$("autoInterval").value)||localStorage.autoInterval||"200",10);
  autoTimer=setInterval(()=>{
    if(blockIndex>=blocks.length-1){stopAuto();return}
    blockIndex++;
    renderBlock();
  },intervalMs);
}
function toggleAuto(){autoRunning?stopAuto():startAuto()}

$("fileBtn").onclick=()=>$("file").click();$("file").onchange=async e=>{let f=e.target.files[0];if(!f)return;fileData={name:f.name,bytes:new Uint8Array(await f.arrayBuffer())};$("fileInfo").textContent=`📄 ${f.name}  ${f.size.toLocaleString()} bytes`;};
function bytesText(){return new TextEncoder().encode($("text").value);}
function concat(...aa){let n=aa.reduce((s,a)=>s+a.length,0),o=new Uint8Array(n),p=0;aa.forEach(a=>{o.set(a,p);p+=a.length});return o;}
function makeBlocks(bytes,type,name=""){let size=+$("block").value, payloads=[];for(let p=0;p<bytes.length||p===0;p+=size)payloads.push(bytes.slice(p,p+size));if(payloads.length>255)throw Error("255ブロックを超えるデータは対象外です");let total=payloads.length,out=[];let meta=type===2?new TextEncoder().encode(name):new Uint8Array();if(meta.length>255)throw Error("ファイル名が長すぎます");let first=concat(START,new Uint8Array([VERSION,type,total,1]),type===2?new Uint8Array([meta.length]):new Uint8Array(),meta,payloads[0]);out.push(first);for(let i=1;i<total;i++)out.push(concat(SHORT,new Uint8Array([i+1]),payloads[i]));return out;}
function binaryString(u8){let s="";for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return s}
function drawQR(data,binary=false){let c=$("qrCanvas"),ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);try{let qr=qrcode(0,$("ecc").value);qr.addData(binary?binaryString(data):data,binary?"Byte":"Byte");qr.make();let n=qr.getModuleCount(),pad=24,cell=Math.floor((c.width-pad*2)/n),used=cell*n,x=(c.width-used)/2,y=x;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="#000";for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect(x+col*cell,y+r*cell,cell,cell);}catch(e){alert("QR生成に失敗しました: "+e.message)}}
$("normalQR").onclick=()=>{let t=$("text").value;if(!t){alert("テキストを入力してください");return}blocks=[];go("show");$("sendStatus").textContent="通常QR";$("waitText").textContent="相手に読み取ってもらってください";$("back10").classList.add("hidden");$("prev").classList.add("hidden");$("next").classList.add("hidden");if($("autoToggle"))$("autoToggle").classList.add("hidden");drawQR(new TextEncoder().encode(t),true)};
$("commQR").onclick=()=>{try{let type=fileData?2:1,bytes=fileData?fileData.bytes:bytesText();if(!bytes.length){alert("テキストまたはファイルを指定してください");return}blocks=makeBlocks(bytes,type,fileData?.name||"");blockIndex=0;go("show");$("back10").classList.remove("hidden");$("prev").classList.remove("hidden");$("next").classList.remove("hidden");if($("autoToggle"))$("autoToggle").classList.remove("hidden");renderBlock()}catch(e){alert(e.message)}};
function renderBlock(){senderStatus();$("waitText").textContent="相手の読み取りを待っています…";drawQR(blocks[blockIndex],true);$("back10").disabled=blockIndex===0;$("prev").disabled=blockIndex===0;$("next").disabled=blockIndex===blocks.length-1;if($("autoToggle"))$("autoToggle").disabled=blocks.length<=1}
$("back10").onclick=()=>{stopAuto();blockIndex=Math.max(0,blockIndex-10);renderBlock()};$("prev").onclick=()=>{stopAuto();if(blockIndex>0){blockIndex--;renderBlock()}};$("next").onclick=()=>{stopAuto();if(blockIndex<blocks.length-1){blockIndex++;renderBlock()}};$("autoToggle").onclick=toggleAuto;
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){$("recvStatus").textContent="カメラAPIに対応していません";return}
  try{
    const v=$("video");
    try{v.pause()}catch(e){}
    v.srcObject=null;
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    v.srcObject=stream;
    await v.play();
    startCameraPeriodMeasurement(v);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    scanEnableAt=performance.now()+400;
    scan();
  }catch(e){$("recvStatus").textContent="カメラを開始できません: "+e.name}
}
function stopCamera(){if(scanRAF)cancelAnimationFrame(scanRAF);scanRAF=0;const v=$("video");try{v.pause()}catch(e){};if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}v.srcObject=null;scanEnableAt=0;}
function scan(){
  const v=$("video"), c=$("scanCanvas"), ctx=c.getContext("2d",{willReadFrequently:true});
  if(performance.now()>=scanEnableAt && v.readyState>=2 && v.videoWidth>0 && v.videoHeight>0){
    const side=Math.min(v.videoWidth,v.videoHeight);
    const sx=Math.floor((v.videoWidth-side)/2);
    const sy=Math.floor((v.videoHeight-side)/2);

    c.width=side;
    c.height=side;
    ctx.clearRect(0,0,side,side);
    ctx.drawImage(v,sx,sy,side,side,0,0,side,side);

    const im=ctx.getImageData(0,0,side,side);
    const code=window.jsQR&&jsQR(im.data,side,side,{inversionAttempts:"dontInvert"});
    if(code) handleDecoded(code);
  }
  scanRAF=requestAnimationFrame(scan);
}
function rawBytes(code){if(code.binaryData)return new Uint8Array(code.binaryData);return new TextEncoder().encode(code.data||"")}
function eq(a,b,off=0){if(a.length<off+b.length)return false;for(let i=0;i<b.length;i++)if(a[off+i]!==b[i])return false;return true}
function handleDecoded(code){
  let b=rawBytes(code);
  const now=performance.now();
  const key=(code.data||"")+"|"+b.length+"|"+Array.from(b.slice(0,12)).join(",");
  if(key===lastSeenKey && now-lastSeenAt<350)return;
  lastSeenKey=key; lastSeenAt=now;if(eq(b,START)&&b.length>=8&&b[4]===VERSION&&(b[5]===1||b[5]===2)&&b[6]>=1&&b[7]===1){let type=b[5],total=b[6],p=8,name="";if(type===2){let n=b[p++];name=new TextDecoder().decode(b.slice(p,p+n));p+=n}recv={type,total,name,parts:[b.slice(p)],next:2};updateRecv();if(total===1)finishRecv();return}if(recv&&eq(b,SHORT)&&b.length>=3){let no=b[2];if(no===recv.next){recv.parts.push(b.slice(3));recv.next++;updateRecv();if(no===recv.total)finishRecv()}return}if(!recv){showNormal(code.data||new TextDecoder().decode(b))}}
function updateRecv(){
  let done=recv.parts.length;
  const el=$("receiveBlockStatus");
  if(el){
    el.classList.remove("hidden");
    el.innerHTML='<span class="label">受信済み</span><span class="current">'+done+'</span><span class="total">/ '+recv.total+'</span>';
  }
  $("recvStatus").textContent="そのままQRコードにカメラを向けてください";
  $("bar").style.width=(done/recv.total*100)+"%";
}
function showNormal(t){stopCamera();$("recvStatus").textContent="✓ 読み取り完了";$("result").classList.remove("hidden");$("result").textContent=t;$("copy").classList.remove("hidden");$("save").classList.remove("hidden");$("copy").onclick=()=>navigator.clipboard.writeText(t);$("save").onclick=()=>download(new TextEncoder().encode(t),"qr.txt","text/plain")}
function finishRecv(){stopCamera();let data=concat(...recv.parts);$("recvStatus").textContent="✓ 受信完了";$("result").classList.remove("hidden");if(recv.type===1){let t=new TextDecoder().decode(data);$("result").textContent=t;$("copy").classList.remove("hidden");$("copy").onclick=()=>navigator.clipboard.writeText(t);$("save").classList.remove("hidden");$("save").onclick=()=>download(data,"qr通信.txt","text/plain")}else{$("result").textContent=`📄 ${recv.name||"受信ファイル"}  ${data.length.toLocaleString()} bytes`;$("save").classList.remove("hidden");$("save").onclick=()=>download(data,recv.name||"received.bin","application/octet-stream")}}
function download(bytes,name,type){let u=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$("block").value=localStorage.block||"512";$("ecc").value=localStorage.ecc||"M";$("block").onchange=e=>localStorage.block=e.target.value;$("ecc").onchange=e=>localStorage.ecc=e.target.value;
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(console.error));

if($("autoInterval"))$("autoInterval").onchange=()=>{localStorage.autoInterval=$("autoInterval").value};

function measureDisplayPeriod(){
 const o=$("displayDiag"); if(!o)return; o.textContent="測定中…";
 let a=[],last=performance.now(),start=last;
 function f(now){let d=now-last;last=now;if(d>0&&d<100)a.push(d);
  if(now-start<1800)return requestAnimationFrame(f);
  if(a.length){a.sort((x,y)=>x-y);let d=a[Math.floor(a.length/2)];o.textContent=`${(1000/d).toFixed(1)} Hz / ${d.toFixed(1)} ms`;}
 }
 requestAnimationFrame(f);
}
function startCameraPeriodMeasurement(v){
  const o=$("cameraDiag");
  if(!o||!v) return;
  o.textContent="測定中…";

  let finished=false;
  const finish=(fps)=>{
    if(finished) return;
    finished=true;
    if(Number.isFinite(fps) && fps>1){
      const ms=1000/fps;
      o.textContent=`${fps.toFixed(1)} fps / ${ms.toFixed(1)} ms`;
    }else{
      o.textContent="測定できません";
    }
  };

  // Primary: count actual video-frame callbacks using wall-clock time.
  if(typeof v.requestVideoFrameCallback==="function"){
    let count=0;
    let first=null;
    let last=null;
    const cb=(now,meta)=>{
      if(finished) return;
      if(first===null) first=now;
      last=now;
      count++;
      if(now-first>=2200){
        const elapsed=(last-first)/1000;
        finish(elapsed>0 ? (count-1)/elapsed : NaN);
        return;
      }
      v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);

    // Safari fallback: if callback remains stalled, switch method.
    setTimeout(()=>{
      if(!finished && count<3) measureCameraByCurrentTime(v,finish);
    },2600);
    return;
  }

  measureCameraByCurrentTime(v,finish);
}

function measureCameraByCurrentTime(v,finish){
  let changes=0;
  let lastTime=v.currentTime;
  const start=performance.now();
  let lastChange=start;
  function poll(now){
    if(v.currentTime!==lastTime){
      lastTime=v.currentTime;
      changes++;
      lastChange=now;
    }
    if(now-start>=2500){
      const elapsed=(now-start)/1000;
      finish(changes/elapsed);
      return;
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}

if($("measureDisplay"))$("measureDisplay").onclick=measureDisplayPeriod;
})();
