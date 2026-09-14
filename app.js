(()=>{"use strict";
const $=id=>document.getElementById(id), pages=[...document.querySelectorAll(".page")], back=$("back"), title=$("title");
let current="home", stream=null, scanRAF=0, fileData=null, blocks=[], blockIndex=0, recv=null, scanEnableAt=0, scanning=false, lastSeenKey="", lastSeenAt=0, autoTimer=null, autoRunning=false, normalResultText="";
let transferSource=null, transferMode="legacy", sessionId=null, senderStream=null, senderRAF=0, senderActive=false, senderAligning=false, senderAckSeenAt=0, senderLastScanAt=0, handshakeComplete=false, pendingHandshakeStart=null, recvAlignmentSeenAt=0, switchingReceiveCamera=false;
const START=new Uint8Array([0xD3,0x51,0x52,0x43]), SHORT=new Uint8Array([0xD3,0x43]), ACK=new Uint8Array([0xD3,0x41,0x43]);
const VERSION1=1, VERSION2=2, ACK_VERSION=1, MODE_LEGACY=0, MODE_HANDSHAKE=1, ALIGN_HOLD_MS=250;

function go(id){
  stopAuto();stopSenderHandshake();stopCamera();
  pages.forEach(p=>p.classList.toggle("active",p.id===id));current=id;
  const cq=$("copyQR");if(cq)cq.classList.add("hidden");
  back.classList.toggle("hidden",id==="home");const sh=$("settingsHome");if(sh)sh.classList.toggle("hidden",id!=="home");
  title.textContent=id==="home"?"QR通信":({send:"送信 / 表示",show:"送信",receive:"受信 / 読込",settings:"設定"}[id]||"QR通信");
  if(id==="receive"){resetReceiveState();startCamera("environment");}
}
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
back.onclick=()=>go("home");$("end").onclick=()=>go("home");$("stop").onclick=()=>go("home");

function resetReceiveState(){
  recv=null; pendingHandshakeStart=null; recvAlignmentSeenAt=0; switchingReceiveCamera=false;
  scanning=false; lastSeenKey=""; lastSeenAt=0; scanEnableAt=0;
  $("recvStatus").classList.remove("receiveGuide","singleQRDone");$("recvStatus").textContent="コードを認識枠内に合わせてください";
  const startBtn=$("startRead");if(startBtn){startBtn.classList.remove("hidden");startBtn.disabled=false;startBtn.textContent="読取開始";}
  const rbs=$("receiveBlockStatus");if(rbs){rbs.classList.add("hidden");rbs.innerHTML="";}
  $("bar").style.width="0%";$("result").textContent="";normalResultText="";$("result").classList.add("hidden");$("copy").classList.add("hidden");$("save").classList.add("hidden");$("copy").onclick=null;$("save").onclick=null;
  const v=$("video"),cap=$("capturedCanvas"),guide=$("cameraGuide"),ack=$("ackGrid");
  if(v)v.classList.remove("hidden");if(cap){cap.classList.add("hidden");const cx=cap.getContext("2d");cx.clearRect(0,0,cap.width||1,cap.height||1)}if(guide)guide.classList.remove("hidden");if(ack)ack.classList.add("hidden");
}
function senderStatus(){if(!blocks.length)return;$("sendStatus").innerHTML='<div class="blockStatus"><span class="label">送信中</span><span class="current">'+(blockIndex+1)+'</span><span class="total">/ '+blocks.length+'</span></div>';}
function receiverStatus(done,total){const el=$("receiveBlockStatus");if(!el)return;el.classList.remove("hidden");el.innerHTML='<span class="label">受信済み</span><span class="current">'+done+'</span><span class="total">/ '+total+'</span>';}

function stopAuto(){if(autoTimer){clearInterval(autoTimer);autoTimer=null}autoRunning=false;const b=$("autoToggle");if(b){b.textContent="▶ 一定間隔自動";b.disabled=!blocks.length||transferMode==="handshake"}}
function startAuto(){if(!blocks.length||autoRunning||transferMode==="handshake")return;autoRunning=true;const b=$("autoToggle");if(b)b.textContent="⏸ 停止";const intervalMs=parseInt(($("autoInterval")&&$("autoInterval").value)||localStorage.autoInterval||"200",10);autoTimer=setInterval(()=>{if(blockIndex>=blocks.length-1){stopAuto();return}blockIndex++;renderBlock();},intervalMs)}
function toggleAuto(){autoRunning?stopAuto():startAuto()}

$("fileBtn").onclick=()=>$("file").click();
$("file").onchange=async e=>{let f=e.target.files[0];if(!f)return;fileData={name:f.name,bytes:new Uint8Array(await f.arrayBuffer())};$("fileInfo").textContent=`📄 ${f.name}  ${f.size.toLocaleString()} bytes`;};
function bytesText(){return new TextEncoder().encode($("text").value)}
function concat(...aa){let n=aa.reduce((s,a)=>s+a.length,0),o=new Uint8Array(n),p=0;aa.forEach(a=>{o.set(a,p);p+=a.length});return o}
function u16(n){return new Uint8Array([(n>>>8)&255,n&255])}
function randomSession(){const x=new Uint8Array(4);crypto.getRandomValues(x);return x}
function sameBytes(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
function makeBlocks(bytes,type,name="",mode=MODE_LEGACY,sid=randomSession()){
  const size=+$("block").value,payloads=[];for(let p=0;p<bytes.length||p===0;p+=size)payloads.push(bytes.slice(p,p+size));
  const max=mode===MODE_HANDSHAKE?65535:255;if(payloads.length>max)throw Error(mode===MODE_HANDSHAKE?"65535ブロックを超えるデータは対象外です":"255ブロックを超えるためハンドシェークを使用してください");
  const total=payloads.length,out=[],meta=type===2?new TextEncoder().encode(name):new Uint8Array();if(meta.length>255)throw Error("ファイル名が長すぎます");
  const common=concat(START,new Uint8Array([VERSION2,type,mode]),sid);
  let first;
  if(mode===MODE_HANDSHAKE)first=concat(common,u16(total),u16(1),type===2?new Uint8Array([meta.length]):new Uint8Array(),meta,payloads[0]);
  else first=concat(common,new Uint8Array([total,1]),type===2?new Uint8Array([meta.length]):new Uint8Array(),meta,payloads[0]);
  out.push(first);
  for(let i=1;i<total;i++)out.push(mode===MODE_HANDSHAKE?concat(SHORT,u16(i+1),payloads[i]):concat(SHORT,new Uint8Array([i+1]),payloads[i]));
  return out;
}
function binaryString(u8){let s="";for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return s}
function drawQRToCanvas(c,data,ecc="M"){const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);const qr=qrcode(0,ecc);qr.addData(binaryString(data),"Byte");qr.make();const n=qr.getModuleCount(),pad=Math.max(10,Math.round(c.width*.04)),cell=Math.max(1,Math.floor((c.width-pad*2)/n)),used=cell*n,x=(c.width-used)/2,y=x;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="#000";for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect(x+col*cell,y+r*cell,cell,cell)}
function drawQR(data){try{drawQRToCanvas($("qrCanvas"),data,$("ecc").value)}catch(e){alert("QR生成に失敗しました: "+e.message)}}
function drawHomeQR(){const c=$("homeQR");if(!c||!window.qrcode)return;try{const qr=qrcode(0,"M");qr.addData("https://sugarware.github.io/QR-Comm/","Byte");qr.make();const ctx=c.getContext("2d"),n=qr.getModuleCount(),pad=20,cell=Math.floor((c.width-pad*2)/n),used=cell*n,x=(c.width-used)/2,y=x;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="#000";for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect(x+col*cell,y+r*cell,cell,cell)}catch(e){console.error(e)}}

$("normalQR").onclick=()=>{let t=$("text").value;if(!t){alert("テキストを入力してください");return}transferSource=null;blocks=[];go("show");if($("copyQR"))$("copyQR").classList.remove("hidden");$("sendStatus").textContent="通常QR";if($("showHelp"))$("showHelp").classList.add("hidden");$("waitText").textContent="相手に読み取ってもらってください";$("back10").classList.add("hidden");$("prev").classList.add("hidden");$("next").classList.add("hidden");$("autoToggle").classList.add("hidden");$("handshakeToggle").classList.add("hidden");$("resumeHandshake").classList.add("hidden");drawQR(new TextEncoder().encode(t))};

$("commQR").onclick=()=>{try{
  if($("copyQR"))$("copyQR").classList.add("hidden");if($("showHelp"))$("showHelp").classList.remove("hidden");
  const type=fileData?2:1,bytes=fileData?fileData.bytes:bytesText();if(!bytes.length){alert("テキストまたはファイルを指定してください");return}
  transferSource={type,bytes,name:fileData?.name||""};sessionId=randomSession();
  const count=Math.max(1,Math.ceil(bytes.length/(+$("block").value)));
  transferMode="legacy";handshakeComplete=false;blockIndex=0;go("show");
  $("back10").classList.remove("hidden");$("prev").classList.remove("hidden");$("next").classList.remove("hidden");$("autoToggle").classList.remove("hidden");$("handshakeToggle").classList.remove("hidden");
  if(count<=255){blocks=makeBlocks(bytes,type,transferSource.name,MODE_LEGACY,sessionId);renderBlock();}
  else{blocks=[];$("sendStatus").textContent=`${count} Block`;$("waitText").textContent="255 Blockを超えるためハンドシェークを開始してください";clearQR();setLegacyControls(false,true);}
}catch(e){alert(e.message)}};

function clearQR(){const c=$("qrCanvas"),ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height)}
function setLegacyControls(enabled,forceDisabled=false){const dis=!enabled||forceDisabled;$("back10").disabled=dis||blockIndex===0;$("prev").disabled=dis||blockIndex===0;$("next").disabled=dis||!blocks.length||blockIndex===blocks.length-1;$("autoToggle").disabled=dis||blocks.length<=1}
function renderBlock(){if(!blocks.length)return;senderStatus();if(!handshakeComplete)$("waitText").textContent=transferMode==="handshake"?(senderAligning?"位置合わせ中…赤枠を確認してください":"ACKを待っています…"):"相手の読み取りを待っています…";drawQR(blocks[blockIndex]);setLegacyControls(transferMode!=="handshake");}

$("copyQR").onclick=async()=>{try{const c=$("qrCanvas");const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("PNG変換に失敗しました")),"image/png"));if(!navigator.clipboard?.write||typeof ClipboardItem==="undefined")throw new Error("このブラウザは画像のクリップボードコピーに対応していません");await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);const w=$("waitText");if(w){const prev=w.textContent;w.textContent="コピーしました";setTimeout(()=>{if(w.textContent==="コピーしました")w.textContent=prev},1200)}}catch(e){alert("QR画像をコピーできませんでした: "+e.message)}};
$("back10").onclick=()=>{stopAuto();if(transferMode==="handshake")return;blockIndex=Math.max(0,blockIndex-10);renderBlock()};
$("prev").onclick=()=>{stopAuto();if(transferMode!=="handshake"&&blockIndex>0){blockIndex--;renderBlock()}};
$("next").onclick=()=>{stopAuto();if(transferMode!=="handshake"&&blockIndex<blocks.length-1){blockIndex++;renderBlock()}};
$("autoToggle").onclick=toggleAuto;
$("handshakeToggle").onclick=()=>{if(senderActive||senderAligning){cancelHandshakeToLegacy();return}startHandshakeSend()};
$("resumeHandshake").onclick=()=>{if(!senderAligning||performance.now()-senderAckSeenAt>ALIGN_HOLD_MS)return;senderAligning=false;setSenderAckVisual(false);$("resumeHandshake").classList.add("hidden");if(blocks.length<=1){completeHandshakeSend();return}blockIndex=1;renderBlock()};

async function startHandshakeSend(){
  if(!transferSource)return;
  stopAuto();sessionId=randomSession();
  try{blocks=makeBlocks(transferSource.bytes,transferSource.type,transferSource.name,MODE_HANDSHAKE,sessionId)}catch(e){alert(e.message);return}
  transferMode="handshake";blockIndex=0;handshakeComplete=false;senderAligning=blocks.length>1;$("handshakeToggle").textContent="■ ハンドシェーク停止";setLegacyControls(false);renderBlock();
  if(blocks.length===1){$("waitText").textContent="1 BlockのためACK・Inカメラ切替は行いません";senderAligning=false;return}
  $("waitText").textContent="端末同士を向かい合わせています…";
  try{await startSenderCamera();senderActive=true;senderRAF=requestAnimationFrame(senderScan)}catch(e){senderActive=false;senderAligning=false;$("handshakeToggle").textContent="⇄ ハンドシェーク";$("waitText").textContent="Inカメラを開始できません: "+e.name;alert("ハンドシェーク用Inカメラを開始できません")}
}
function cancelHandshakeToLegacy(){stopSenderHandshake();if(!transferSource)return;sessionId=randomSession();const count=Math.max(1,Math.ceil(transferSource.bytes.length/(+$("block").value)));if(count<=255){transferMode="legacy";blocks=makeBlocks(transferSource.bytes,transferSource.type,transferSource.name,MODE_LEGACY,sessionId);blockIndex=0;$("handshakeToggle").textContent="⇄ ハンドシェーク";renderBlock()}else{transferMode="legacy";blocks=[];clearQR();$("sendStatus").textContent=`${count} Block`;$("waitText").textContent="255 Blockを超えるためハンドシェークを開始してください";$("handshakeToggle").textContent="⇄ ハンドシェーク";setLegacyControls(false,true)}}
async function startSenderCamera(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera API unavailable");stopSenderCameraTracks();
  const v=$("senderVideo");senderStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"user"}},audio:false});v.srcObject=senderStream;await v.play();senderLastScanAt=0;senderAckSeenAt=0;
}
function stopSenderCameraTracks(){const v=$("senderVideo");try{v.pause()}catch(e){}if(senderStream){senderStream.getTracks().forEach(t=>t.stop());senderStream=null}if(v)v.srcObject=null}
function stopSenderHandshake(){if(senderRAF)cancelAnimationFrame(senderRAF);senderRAF=0;senderActive=false;senderAligning=false;senderAckSeenAt=0;setSenderAckVisual(false);const r=$("resumeHandshake");if(r)r.classList.add("hidden");stopSenderCameraTracks();const hb=$("handshakeToggle");if(hb)hb.textContent="⇄ ハンドシェーク"}
function setSenderAckVisual(on){$("qrCanvas").classList.toggle("ackSeen",!!on);if(senderAligning)$("resumeHandshake").classList.toggle("hidden",!on)}
function senderScan(now){
  if(!senderActive)return;const v=$("senderVideo"),c=$("senderScanCanvas");
  if(now-senderLastScanAt>=45&&v.readyState>=2&&v.videoWidth>0&&v.videoHeight>0){senderLastScanAt=now;const ctx=c.getContext("2d",{willReadFrequently:true}),side=Math.min(v.videoWidth,v.videoHeight),sx=Math.floor((v.videoWidth-side)/2),sy=Math.floor((v.videoHeight-side)/2);c.width=side;c.height=side;ctx.drawImage(v,sx,sy,side,side,0,0,side,side);const im=ctx.getImageData(0,0,side,side),code=window.jsQR&&jsQR(im.data,side,side,{inversionAttempts:"dontInvert"});if(code)handleSenderDecoded(code)}
  if(senderAligning&&performance.now()-senderAckSeenAt>ALIGN_HOLD_MS)setSenderAckVisual(false);
  if(senderActive)senderRAF=requestAnimationFrame(senderScan);
}
function parseAck(b){if(!eq(b,ACK)||b.length<10||b[3]!==ACK_VERSION)return null;return{session:b.slice(4,8),block:(b[8]<<8)|b[9]}}
function handleSenderDecoded(code){const a=parseAck(rawBytes(code));if(!a||!sameBytes(a.session,sessionId)||a.block!==blockIndex+1)return;senderAckSeenAt=performance.now();if(senderAligning){setSenderAckVisual(true);$("waitText").textContent="ACK確認中：位置を固定して通信再開を押してください";return}if(blockIndex>=blocks.length-1){completeHandshakeSend();return}blockIndex++;renderBlock()}
function completeHandshakeSend(){handshakeComplete=true;senderAligning=false;setSenderAckVisual(false);$("resumeHandshake").classList.add("hidden");$("waitText").textContent="✓ 送信完了";stopSenderCameraTracks();senderActive=false;if(senderRAF)cancelAnimationFrame(senderRAF);senderRAF=0;$("handshakeToggle").textContent="⇄ ハンドシェーク";}

async function startCamera(facing="environment"){
  if(!navigator.mediaDevices?.getUserMedia){$("recvStatus").textContent="カメラAPIに対応していません";return}
  try{await openReceiveCamera(facing);scanEnableAt=0;scanning=false;$("recvStatus").classList.remove("singleQRDone");$("recvStatus").classList.add("receiveGuide");$("recvStatus").textContent="コードを認識枠内に合わせ、読取開始を押してください"}catch(e){$("recvStatus").textContent="カメラを開始できません: "+e.name}
}
async function openReceiveCamera(facing){
  const v=$("video");try{v.pause()}catch(e){}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}v.srcObject=null;
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing}},audio:false});v.srcObject=stream;await v.play();startCameraPeriodMeasurement(v);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
}
async function switchReceiveToFront(){
  if(switchingReceiveCamera)return;switchingReceiveCamera=true;scanning=false;if(scanRAF)cancelAnimationFrame(scanRAF);scanRAF=0;
  try{await openReceiveCamera("user");scanEnableAt=performance.now()+250;scanning=true;$("recvStatus").textContent="端末同士の画面を向かい合わせ、赤枠が安定する位置に固定してください";scanRAF=requestAnimationFrame(scan)}catch(e){$("recvStatus").textContent="Inカメラへ切り替えできません: "+e.name}finally{switchingReceiveCamera=false}
}
function stopCamera(){if(scanRAF)cancelAnimationFrame(scanRAF);scanRAF=0;scanning=false;const v=$("video");try{v.pause()}catch(e){}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}v.srcObject=null;scanEnableAt=0}
$("startRead").onclick=()=>{if(!stream)return;const b=$("startRead");b.disabled=true;b.textContent="安定待ち…";$("recvStatus").classList.remove("receiveGuide","singleQRDone");$("recvStatus").textContent="端末を動かさず、そのままお待ちください";scanning=true;scanEnableAt=performance.now()+300;if(scanRAF)cancelAnimationFrame(scanRAF);scanRAF=requestAnimationFrame(scan);setTimeout(()=>{if(scanning){b.classList.add("hidden");$("recvStatus").textContent="読取中…"}},300)};
function scan(){
  if(!scanning)return;const v=$("video"),c=$("scanCanvas"),ctx=c.getContext("2d",{willReadFrequently:true});
  if(performance.now()>=scanEnableAt&&v.readyState>=2&&v.videoWidth>0&&v.videoHeight>0){const side=Math.min(v.videoWidth,v.videoHeight),sx=Math.floor((v.videoWidth-side)/2),sy=Math.floor((v.videoHeight-side)/2);c.width=side;c.height=side;ctx.clearRect(0,0,side,side);ctx.drawImage(v,sx,sy,side,side,0,0,side,side);const im=ctx.getImageData(0,0,side,side),code=window.jsQR&&jsQR(im.data,side,side,{inversionAttempts:"dontInvert"});if(code)handleDecoded(code)}
  updateAlignmentAckVisibility();if(scanning)scanRAF=requestAnimationFrame(scan);
}
function captureRecognized(code,sourceCanvas=null){const src=sourceCanvas||$("scanCanvas"),dst=$("capturedCanvas"),v=$("video"),guide=$("cameraGuide");if(!src||!dst||!src.width)return;let x=0,y=0,w=src.width,h=src.height;if(code&&code.location){const pts=[code.location.topLeftCorner,code.location.topRightCorner,code.location.bottomRightCorner,code.location.bottomLeftCorner].filter(Boolean);if(pts.length){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys),m=Math.max(20,Math.round(Math.max(maxx-minx,maxy-miny)*.18));x=Math.max(0,Math.floor(minx-m));y=Math.max(0,Math.floor(miny-m));w=Math.min(src.width-x,Math.ceil(maxx-minx+2*m));h=Math.min(src.height-y,Math.ceil(maxy-miny+2*m))}}dst.width=Math.max(1,w);dst.height=Math.max(1,h);dst.getContext("2d").drawImage(src,x,y,w,h,0,0,w,h);if(v)v.classList.add("hidden");dst.classList.remove("hidden");if(guide)guide.classList.add("hidden")}
function rawBytes(code){if(code.binaryData)return new Uint8Array(code.binaryData);return new TextEncoder().encode(code.data||"")}
function eq(a,b,off=0){if(a.length<off+b.length)return false;for(let i=0;i<b.length;i++)if(a[off+i]!==b[i])return false;return true}
function parseStart(b){
  if(!eq(b,START)||b.length<8)return null;const ver=b[4],type=b[5];if(type!==1&&type!==2)return null;
  let mode=MODE_LEGACY,total,no,p,session=null;
  if(ver===VERSION1){total=b[6];no=b[7];p=8;if(!total||no!==1)return null}
  else if(ver===VERSION2){if(b.length<13)return null;mode=b[6];if(mode!==MODE_LEGACY&&mode!==MODE_HANDSHAKE)return null;session=b.slice(7,11);if(mode===MODE_HANDSHAKE){if(b.length<15)return null;total=(b[11]<<8)|b[12];no=(b[13]<<8)|b[14];p=15}else{total=b[11];no=b[12];p=13}if(!total||no!==1)return null}
  else return null;
  let name="";if(type===2){if(p>=b.length)return null;const n=b[p++];if(p+n>b.length)return null;name=new TextDecoder().decode(b.slice(p,p+n));p+=n}
  return{version:ver,type,mode,total,no,session,name,payload:b.slice(p)};
}
function commitStart(s){recv={version:s.version,type:s.type,mode:s.mode,total:s.total,session:s.session,name:s.name,parts:[s.payload],next:2,handshake:s.mode===MODE_HANDSHAKE,alignment:false};updateRecv()}
function handleDecoded(code){
  const b=rawBytes(code),now=performance.now(),start=parseStart(b);
  if(pendingHandshakeStart){
    if(start&&start.mode===MODE_HANDSHAKE&&start.total===pendingHandshakeStart.total&&sameBytes(start.session,pendingHandshakeStart.session)){recvAlignmentSeenAt=now;if(!recv){commitStart(start);recv.alignment=true}showAck(1);$("recvStatus").textContent="位置合わせ中：送信側の赤枠を確認して通信再開してください";return}
    if(!recv)return;
    if(start)return;
  }
  if(start){
    if(start.total===1){commitStart(start);finishRecv(false);return}
    if(start.version===VERSION2&&start.mode===MODE_HANDSHAKE){pendingHandshakeStart=start;$("recvStatus").textContent="ハンドシェーク通信です。端末同士の画面を向かい合わせ、転送完了まで位置を固定してください";switchReceiveToFront();return}
    if(!recv){commitStart(start);return}
  }
  if(recv&&eq(b,SHORT)){
    let no,p;if(recv.handshake){if(b.length<4)return;no=(b[2]<<8)|b[3];p=4}else{if(b.length<3)return;no=b[2];p=3}
    if(no===recv.next){recv.parts.push(b.slice(p));recv.next++;if(recv.handshake){recv.alignment=false;pendingHandshakeStart=null;showAck(no)}updateRecv();if(no===recv.total)finishRecv(recv.handshake);return}
    if(recv.handshake&&no===recv.next-1&&!recv.alignment){showAck(no);return}
  }
  if(!recv){const key=(code.data||"")+"|"+b.length+"|"+Array.from(b.slice(0,12)).join(",");if(key===lastSeenKey&&now-lastSeenAt<350)return;lastSeenKey=key;lastSeenAt=now;const text=String(code.data||"");if(!text)return;captureRecognized(code);showNormal(text)}
}
function updateAlignmentAckVisibility(){if(!recv?.alignment)return;if(performance.now()-recvAlignmentSeenAt>ALIGN_HOLD_MS)hideAck()}
function makeAck(blockNo){return concat(ACK,new Uint8Array([ACK_VERSION]),recv.session,u16(blockNo))}
function showAck(blockNo){if(!recv?.session)return;const grid=$("ackGrid"),v=$("video"),guide=$("cameraGuide"),cap=$("capturedCanvas"),data=makeAck(blockNo);for(const c of grid.querySelectorAll("canvas")){c.width=260;c.height=260;drawQRToCanvas(c,data,"M")}grid.classList.remove("hidden");v.classList.add("hidden");guide.classList.add("hidden");cap.classList.add("hidden")}
function hideAck(){const grid=$("ackGrid"),v=$("video"),guide=$("cameraGuide");grid.classList.add("hidden");v.classList.remove("hidden");guide.classList.remove("hidden")}
function updateRecv(){const done=recv.parts.length;receiverStatus(done,recv.total);if(!recv.handshake||!recv.alignment){$("recvStatus").classList.remove("receiveGuide","singleQRDone");$("recvStatus").textContent=recv.handshake?"ハンドシェーク受信中…":"そのままQRコードにカメラを向けてください"}$("bar").style.width=(done/recv.total*100)+"%"}

async function copyTextReliable(text){const value=String(text??"");if(!value)return false;try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);return true}}catch(_e){}try{const ta=document.createElement("textarea");ta.value=value;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();const ok=document.execCommand("copy");document.body.removeChild(ta);return!!ok}catch(_e){return false}}
function showNormal(t){normalResultText=String(t??"");stopCamera();$("recvStatus").classList.remove("receiveGuide");$("recvStatus").classList.add("singleQRDone");$("recvStatus").textContent="✓ QRコード 読み取り完了";$("result").classList.remove("hidden");$("result").textContent=normalResultText;$("copy").classList.remove("hidden");$("save").classList.remove("hidden");$("copy").onclick=async()=>{const ok=await copyTextReliable(normalResultText);$("recvStatus").classList.remove("singleQRDone");$("recvStatus").textContent=ok?"✓ QRコード 読み取り完了・コピーしました":"✓ QRコード 読み取り完了（コピーに失敗）"};$("save").onclick=()=>download(new TextEncoder().encode(normalResultText),"qr.txt","text/plain")}
function finishRecv(keepAck=false){if(keepAck&&recv?.handshake)showAck(recv.total);stopCamera();const data=concat(...recv.parts);$("recvStatus").classList.remove("receiveGuide","singleQRDone");$("recvStatus").textContent="✓ 受信完了";$("result").classList.remove("hidden");if(recv.type===1){const t=new TextDecoder().decode(data);$("result").textContent=t;$("copy").classList.remove("hidden");$("copy").onclick=()=>navigator.clipboard.writeText(t);$("save").classList.remove("hidden");$("save").onclick=()=>download(data,"qr通信.txt","text/plain")}else{$("result").textContent=`📄 ${recv.name||"受信ファイル"}  ${data.length.toLocaleString()} bytes`;$("save").classList.remove("hidden");$("save").onclick=()=>download(data,recv.name||"received.bin",mimeFromName(recv.name))}}
function mimeFromName(name=""){const n=name.toLowerCase();if(n.endsWith(".jpg")||n.endsWith(".jpeg"))return"image/jpeg";if(n.endsWith(".png"))return"image/png";if(n.endsWith(".txt"))return"text/plain";return"application/octet-stream"}
function download(bytes,name,type){const u=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

$("block").value=localStorage.block||"512";$("ecc").value=localStorage.ecc||"M";$("block").onchange=e=>localStorage.block=e.target.value;$("ecc").onchange=e=>localStorage.ecc=e.target.value;
drawHomeQR();
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js?v=053").catch(console.error));
if($("autoInterval")){$("autoInterval").value=localStorage.autoInterval||"200";$("autoInterval").onchange=()=>{localStorage.autoInterval=$("autoInterval").value}};

function measureDisplayPeriod(){const o=$("displayDiag");if(!o)return;o.textContent="測定中…";let a=[],last=performance.now(),start=last;function f(now){const d=now-last;last=now;if(d>0&&d<100)a.push(d);if(now-start<1800)return requestAnimationFrame(f);if(a.length){a.sort((x,y)=>x-y);const d=a[Math.floor(a.length/2)];o.textContent=`${(1000/d).toFixed(1)} Hz / ${d.toFixed(1)} ms`}}requestAnimationFrame(f)}
function startCameraPeriodMeasurement(v){const o=$("cameraDiag");if(!o||!v)return;o.textContent="測定中…";let finished=false;const finish=fps=>{if(finished)return;finished=true;if(Number.isFinite(fps)&&fps>1){const ms=1000/fps;o.textContent=`${fps.toFixed(1)} fps / ${ms.toFixed(1)} ms`}else o.textContent="測定できません"};if(typeof v.requestVideoFrameCallback==="function"){let count=0,first=null,last=null;const cb=now=>{if(finished)return;if(first===null)first=now;last=now;count++;if(now-first>=2200){const elapsed=(last-first)/1000;finish(elapsed>0?(count-1)/elapsed:NaN);return}v.requestVideoFrameCallback(cb)};v.requestVideoFrameCallback(cb);setTimeout(()=>{if(!finished&&count<3)measureCameraByCurrentTime(v,finish)},2600);return}measureCameraByCurrentTime(v,finish)}
function measureCameraByCurrentTime(v,finish){let changes=0,lastTime=v.currentTime;const start=performance.now();function poll(now){if(v.currentTime!==lastTime){lastTime=v.currentTime;changes++}if(now-start>=2500){finish(changes/((now-start)/1000));return}requestAnimationFrame(poll)}requestAnimationFrame(poll)}
if($("measureDisplay"))$("measureDisplay").onclick=measureDisplayPeriod;
})();
