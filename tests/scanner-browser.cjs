const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const parity = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function ean(code) {
  const right = d => L[d].replace(/[01]/g, b => b === '0' ? '1' : '0');
  if (code.length === 8) return '101'+[...code.slice(0,4)].map(d=>L[d]).join('')+'01010'+[...code.slice(4)].map(right).join('')+'101';
  return '101'+[...code.slice(1,7)].map((d,i)=>(parity[code[0]][i]==='L'?L:G)[d]).join('')+'01010'+[...code.slice(7)].map(right).join('')+'101';
}
(async () => {
 const server = http.createServer((req,res)=>{
  const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const type = {'.js':'application/javascript','.html':'text/html','.css':'text/css','.wasm':'application/wasm'}[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200,{'Content-Type':type}); fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url = `http://127.0.0.1:${server.address().port}/`;
 let browser;
 try {
  browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('https://**/*',route=>route.abort());
  await context.addInitScript(()=>localStorage.setItem('web_barcode_scanner_input_mode','scanner'));
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.evaluate(()=>window.ensureZXingLoaded());
  for (const [code,formats] of [['5901234123457',['EAN13']],['96385074',['EAN8']],['0036000291452',['UPCA']],['ABC',['Code128']],['04252614',['UPCE']]]) {
   for (const rotate of [false,true]) for (const invert of [false,true]) {
    const result = await page.evaluate(async ({bits,formats,rotate,invert})=>{
     const c=document.createElement('canvas'); c.width=(bits.length+24)*3; c.height=150;
     const x=c.getContext('2d'); x.fillStyle=invert?'black':'white'; x.fillRect(0,0,c.width,c.height);
     x.fillStyle=invert?'white':'black'; [...bits].forEach((b,i)=>{if(b==='1')x.fillRect((i+12)*3,15,3,120)});
     const out=document.createElement('canvas'); out.width=rotate?c.height:c.width; out.height=rotate?c.width:c.height;
     const ctx=out.getContext('2d'); if(rotate){ctx.translate(out.width,0);ctx.rotate(Math.PI/2)} ctx.drawImage(c,0,0);
     const detector=await window.ensureZXingLoaded();
     return detector.detect(ctx.getImageData(0,0,out.width,out.height),formats);
    },{bits:code === 'ABC' ? ['211214','111323','131123','131321','222122','2331112'].map(p=>[...p].map((n,i)=>(i%2?'0':'1').repeat(+n)).join('')).join('') : code === '04252614' ? '101'+[...code.slice(1,7)].map((d,i)=>('GLGGLL'[i]==='L'?L:G)[d]).join('')+'010101' : ean(code),formats,rotate,invert});
    assert.equal(result, formats[0]==='UPCA'?code.slice(1):code, JSON.stringify({code,rotate,invert}));
   }
  }
  console.log('PASS: actual worker/WASM decodes EAN-13, EAN-8, UPC-A, UPC-E and Code 128, normal, inverted and rotated (20 cases)');
  const canceled = await page.evaluate(async ()=>{
   state.inputMode='phone'; state.isScanning=true; state.isCameraRunning=true; state.track={}; state.scanSession++;
   const original=detectBarcodeInFrame, originalFresh=waitForFreshVideoFrame;
   let resolveRead; detectBarcodeInFrame=()=>new Promise(r=>resolveRead=r); waitForFreshVideoFrame=()=>Promise.resolve();
   Object.defineProperty(state.els.cameraPreview,'readyState',{configurable:true,value:2});
   const attempt=captureAttempt(state.scanSession); await Promise.resolve(); await Promise.resolve();
   stopScanning(true); state.isScanning=true; state.scanSession++;
   resolveRead('5901234123457'); const result=await attempt;
   detectBarcodeInFrame=original; waitForFreshVideoFrame=originalFresh; state.isScanning=false; state.isCameraRunning=false; state.track=null;
   return {result,barcode:state.els.barcodeInput.value,pending:state.pendingConfirmCount};
  });
  assert.equal(canceled.result,false); assert.equal(canceled.barcode,''); assert.equal(canceled.pending,0);
  console.log('PASS: stopped session cannot submit a late barcode after restart');
  const scroll=await page.evaluate(()=>{
   document.body.classList.remove('mode-scanner'); document.body.style.minHeight='2400px'; window.scrollTo(0,200);
   const before=window.scrollY; toggleScreenScrollLock(); const locked=state.manualScrollLockY; toggleScreenScrollLock();
   return {before,locked,after:window.scrollY, font:getComputedStyle(state.els.barcodeInput).fontSize};
  });
  assert.equal(scroll.locked,scroll.before); assert.equal(scroll.after,scroll.before); assert.equal(scroll.font,'16px');
  console.log('PASS: scroll lock preserves position; mobile input text is 16px');
  await page.evaluate(async ({bits})=>{
   delete state.els.cameraPreview.readyState;
   const c=document.createElement('canvas'); c.width=1920; c.height=1080;
   const x=c.getContext('2d'); x.fillStyle='white'; x.fillRect(0,0,1920,1080); x.fillStyle='black';
   [...bits].forEach((b,i)=>{if(b==='1')x.fillRect(700+i*5,420,5,220)});
   window.cameraRequests=0; window.cameraConstraints=[]; window.lookups=[];
   navigator.mediaDevices.getUserMedia=async()=>{
    window.cameraRequests++; const stream=c.captureStream(30); const track=stream.getVideoTracks()[0];
    track.getCapabilities=()=>({focusMode:['continuous'],zoom:{min:1,max:4}});
    track.applyConstraints=async value=>{window.cameraConstraints.push(value)};
    return stream;
   };
   navigator.mediaDevices.enumerateDevices=async()=>[];
   fetchProductInfo=async code=>{window.lookups.push(code)};
   await startScanning();
  },{bits:ean('5901234123457')});
  await page.waitForFunction(()=>window.lookups.length===1);
  assert.deepEqual(await page.evaluate(()=>({code:window.lookups[0],scanning:state.isScanning,requests:window.cameraRequests})),
    {code:'5901234123457',scanning:false,requests:1});
  assert.equal(await page.evaluate(()=>JSON.stringify(window.cameraConstraints).includes('zoom')),false);
  await page.evaluate(()=>stopTracks());
  console.log('PASS: camera stream to ROI to worker to lookup, exactly one capture, no zoom constraints');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.waitForFunction(async()=>{const c=await caches.open('webscanner-v12');return !!await c.match(new URL('js/vendor/zxing-wasm/3.1.2/zxing_reader.wasm',location.href).href)});
  await context.setOffline(true); await page.reload(); await page.evaluate(()=>window.ensureZXingLoaded());
  assert.deepEqual(errors,[]);
  console.log('PASS: app and worker/WASM initialize after offline reload; no page errors');
 } finally { await browser?.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1});

