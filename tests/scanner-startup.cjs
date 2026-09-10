const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/camera.js'), 'utf8'), context);
  let releaseCamera, releaseDecoder;
  const started = [];
  let scheduled = 0;
  Object.assign(context, {
    state: { inputMode: 'phone', isScanning: false, isCameraRunning: false, scanSession: 0 },
    createDetector: () => { started.push('decoder'); return new Promise(resolve => { releaseDecoder = resolve; }); },
    startCamera: () => { started.push('camera'); return new Promise(resolve => { releaseCamera = () => { context.state.isCameraRunning = true; resolve(); }; }); },
    setStatus: () => {}, scheduleFocusRefresh: () => {}, startScanTimeoutTimer: () => {},
    updateScanButton: () => {}, updateModePill: () => {}, cleanupScanTimer: () => {},
    runScanLoop: async () => { scheduled++; }
  });
  const startup = context.startScanning();
  assert.deepEqual(started, ['decoder', 'camera'], 'Both dependencies must start before either resolves');
  releaseDecoder();
  await Promise.resolve();
  assert.equal(context.state.isScanning, false, 'Do not scan before the camera is ready');
  releaseCamera();
  await startup;
  assert.equal(context.state.isScanning, true);
  assert.equal(scheduled, 1);
  console.log('PASS: camera and decoder initialize concurrently; scan begins only when both are ready.');
})().catch(error => { console.error(error); process.exitCode = 1; });
