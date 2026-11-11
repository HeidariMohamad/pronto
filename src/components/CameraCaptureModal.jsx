import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, X, Check, Image as ImageIcon, Zap, Sun, Smartphone } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { getSquareGuide, optimizeImage } from '../services/imageOptimizer';

const labels = {
  en: { square: 'Square photo', auto: 'Auto', brighter: 'Brightness', flash: 'Torch', close: 'Close', camera: 'Use phone camera', gallery: 'Choose from gallery', take: 'Take photo', flip: 'Flip camera', retake: 'Retake', use: 'Use photo', starting: 'Starting camera…', processing: 'Preparing photo…', denied: 'Camera permission was denied. Allow access in your browser settings.', unavailable: 'Could not start the in-app camera. You can use your phone camera instead.', failed: 'Could not prepare this photo. Please try again.' },
  pt: { square: 'Foto quadrada', auto: 'Auto', brighter: 'Brilho', flash: 'Lanterna', close: 'Fechar', camera: 'Usar câmera do celular', gallery: 'Escolher da galeria', take: 'Tirar foto', flip: 'Trocar câmera', retake: 'Refazer', use: 'Usar foto', starting: 'Iniciando câmera…', processing: 'Preparando foto…', denied: 'Permissão negada. Permita o acesso à câmera nas configurações do navegador.', unavailable: 'Não foi possível iniciar a câmera do aplicativo. Use a câmera do celular.', failed: 'Não foi possível preparar a foto. Tente novamente.' },
  fa: { square: 'عکس مربعی', auto: 'خودکار', brighter: 'روشنایی', flash: 'چراغ', close: 'بستن', camera: 'استفاده از دوربین گوشی', gallery: 'انتخاب از گالری', take: 'گرفتن عکس', flip: 'تغییر دوربین', retake: 'دوباره', use: 'استفاده از عکس', starting: 'در حال راه‌اندازی دوربین…', processing: 'در حال آماده‌سازی عکس…', denied: 'دسترسی به دوربین رد شد. آن را در تنظیمات مرورگر فعال کنید.', unavailable: 'دوربین برنامه باز نشد. می‌توانید از دوربین گوشی استفاده کنید.', failed: 'آماده‌سازی عکس ناموفق بود. دوباره تلاش کنید.' }
};

function getSavedCamera() {
  try { return JSON.parse(localStorage.getItem('pronto_camera_preference') || '{}') || {}; }
  catch { return {}; }
}

export function CameraCaptureModal({ isOpen, onCapture, onClose }) {
  const { lang } = useTranslation();
  const text = labels[lang] || labels.en;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);
  const nativeRef = useRef(null);
  const generationRef = useRef(0);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState(() => getSavedCamera().facingMode === 'user' ? 'user' : 'environment');
  const [deviceId, setDeviceId] = useState(() => getSavedCamera().deviceId || '');
  const [devices, setDevices] = useState([]);
  const [mirrored, setMirrored] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 4, height: 3 });
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canFocus, setCanFocus] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null);

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCaptured(null);
      setCameraEnabled(true);
      setBrightness(1);
      setCaptureError('');
      setProcessing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !cameraEnabled) return undefined;
    let cancelled = false;
    let ownedStream;
    const generation = generationRef;
    setReady(false);
    setCameraError('');
    setHasTorch(false);
    setTorchOn(false);
    setCanFocus(false);
    setFocusPoint(null);

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        const openCamera = selection => navigator.mediaDevices.getUserMedia({
          video: { ...selection, width: { ideal: 1920 }, resizeMode: { ideal: 'none' } }, audio: false
        });
        try {
          ownedStream = await openCamera(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facingMode } });
        } catch (err) {
          if (!deviceId || !['OverconstrainedError', 'NotFoundError', 'DevicesNotFoundError'].includes(err.name)) throw err;
          ownedStream = await openCamera({ facingMode: { ideal: facingMode } });
        }
        if (cancelled) { ownedStream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = ownedStream;
        if (videoRef.current) {
          videoRef.current.srcObject = ownedStream;
          videoRef.current.play().catch(() => {});
        }
        const track = ownedStream.getVideoTracks()[0];
        const actualFacing = track?.getSettings?.().facingMode;
        const trackLabel = track?.label || '';
        const actualId = track?.getSettings?.().deviceId || '';
        try { localStorage.setItem('pronto_camera_preference', JSON.stringify({ deviceId: actualId, facingMode: actualFacing === 'user' ? 'user' : actualFacing === 'environment' ? 'environment' : facingMode })); } catch { /* Storage is optional. */ }
        if (!cancelled) setMirrored(actualFacing ? actualFacing === 'user' : /front|user|selfie|frontal/i.test(trackLabel) || (!deviceId && facingMode === 'user'));
        try {
          const available = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setDevices(available.filter(device => device.kind === 'videoinput' && device.deviceId));
        } catch { /* Camera selection is optional. */ }
        try {
          const caps = track?.getCapabilities?.() || {};
          if (!cancelled) setHasTorch(!!caps.torch);
          const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
          if (!cancelled) setCanFocus(!!supported.pointsOfInterest && Array.isArray(caps.focusMode) && caps.focusMode.some(mode => mode === 'continuous' || mode === 'single-shot'));
          if (track && caps.focusMode?.includes('continuous')) {
            const constraints = track.getConstraints?.() || {};
            await track.applyConstraints({ ...constraints, advanced: [...(constraints.advanced || []), { focusMode: 'continuous' }] });
          }
        } catch (err) {
          // Cameras that don't expose these controls still use their own defaults.
          console.warn('Automatic camera controls unavailable:', err);
        }
      } catch (err) {
        if (!cancelled) setCameraError(err.name === 'NotAllowedError' ? text.denied : text.unavailable);
      }
    };
    start();
    return () => {
      cancelled = true;
      generation.current++;
      ownedStream?.getTracks().forEach(track => track.stop());
      if (streamRef.current === ownedStream) streamRef.current = null;
    };
  }, [isOpen, facingMode, deviceId, cameraEnabled, text.denied, text.unavailable]);

  if (!isOpen) return null;

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      const constraints = track.getConstraints?.() || {};
      const advanced = (constraints.advanced || []).filter(item => !('torch' in item));
      await track.applyConstraints({ ...constraints, advanced: [...advanced, { torch: next }] });
      setTorchOn(next);
    } catch (err) { console.warn('Torch unavailable:', err); }
  };

  const focusAtPoint = async (event) => {
    if (!canFocus || captured || !ready || processing) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const caps = track.getCapabilities?.() || {};
    const mode = caps.focusMode?.includes('continuous') ? 'continuous' : 'single-shot';
    const constraints = track.getConstraints?.() || {};
    const advanced = (constraints.advanced || []).filter(item => !('focusMode' in item) && !('pointsOfInterest' in item));
    try {
      await track.applyConstraints({ ...constraints, advanced: [...advanced, { focusMode: mode, pointsOfInterest: [{ x: mirrored ? 1 - x : x, y }] }] });
      setFocusPoint({ x, y });
    } catch (err) { console.warn('Tap to focus unavailable:', err); }
  };

  const prepare = async (source, options, generation) => {
    const photo = await optimizeImage(source, 1600, 0.88, true, options);
    if (generation === generationRef.current) setCaptured(photo);
  };

  const videoFrame = () => new Promise((resolve, reject) => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) { reject(new Error('Camera frame is not ready')); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { reject(new Error('Canvas unavailable')); return; }
    context.drawImage(video, 0, 0);
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to capture frame')), 'image/png');
  });

  const handleSnap = async () => {
    if (!ready || processing) return;
    const generation = ++generationRef.current;
    setProcessing(true);
    setCaptureError('');
    try {
      const options = { brightness, mirror: mirrored };
      await prepare(await videoFrame(), options, generation);
      if (generation === generationRef.current && navigator.vibrate) navigator.vibrate(20);
    } catch (err) {
      console.error('Photo capture failed:', err);
      if (generation === generationRef.current) setCaptureError(text.failed);
    } finally {
      if (generation === generationRef.current) setProcessing(false);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) { setCameraEnabled(true); return; }
    const generation = ++generationRef.current;
    setProcessing(true);
    setCaptureError('');
    try { await prepare(file, {}, generation); }
    catch (err) { console.error('Photo selection failed:', err); if (generation === generationRef.current) setCaptureError(text.failed); }
    finally { if (generation === generationRef.current) setProcessing(false); }
  };

  const openPhoneCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraEnabled(false);
    setReady(false);
    nativeRef.current?.click();
  };

  const retake = () => {
    setCaptured(null);
    setCaptureError('');
    if (!cameraEnabled) setCameraEnabled(true);
    else videoRef.current?.play().catch(() => {});
  };

  const updateFrameSize = (event) => {
    const video = event.currentTarget;
    if (video.videoWidth && video.videoHeight) setFrameSize({ width: video.videoWidth, height: video.videoHeight });
  };
  const ratio = captured ? 1 : frameSize.width / frameSize.height;
  const previewWidth = Math.max(1, Math.min(viewport.width - 32, 420, Math.max(1, viewport.height - 270) * ratio));
  const guide = getSquareGuide(frameSize.width, frameSize.height);
  const guideText = lang === 'pt' ? 'A área dentro do quadrado será salva' : lang === 'fa' ? 'محدوده داخل مربع ذخیره می‌شود' : 'The area inside the square will be saved';
  const lensText = lang === 'pt' ? 'Câmera' : lang === 'fa' ? 'دوربین' : 'Camera';

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-between gap-4 bg-black p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white select-none">
      <div className="w-full max-w-[380px] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold"><Camera size={14} /> 1:1</span>
          <button type="button" onClick={() => setBrightness(value => value === 1 ? 1.25 : value === 1.25 ? 1.5 : 1)} title={text.brighter} aria-label={text.brighter} className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs"><Sun size={14} />{brightness === 1 ? text.auto : `+${Math.round((brightness - 1) * 100)}%`}</button>
          {hasTorch && <button type="button" onClick={toggleTorch} title={text.flash} aria-label={text.flash} aria-pressed={torchOn} className={`rounded-full border p-1.5 ${torchOn ? 'bg-amber-400 text-black border-amber-300' : 'bg-white/10 border-white/15'}`}><Zap size={16} /></button>}
        </div>
        <button type="button" onClick={onClose} title={text.close} aria-label={text.close} className="rounded-full bg-white/10 p-2"><X size={18} /></button>
      </div>

      <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
        <div onClick={focusAtPoint} className="relative shrink-0 overflow-hidden rounded-3xl border border-white/25 bg-neutral-900 shadow-2xl" style={{ width: `${previewWidth}px`, maxWidth: '100%', aspectRatio: `${ratio}` }}>
          <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={updateFrameSize} onResize={updateFrameSize} onLoadedData={() => setReady(true)} className={`absolute inset-0 h-full w-full object-contain ${mirrored ? 'scale-x-[-1]' : ''} ${captured || cameraError || !cameraEnabled ? 'invisible' : ''}`} style={{ filter: brightness === 1 ? undefined : `brightness(${brightness})` }} />
          {captured && <img src={captured.dataUrl} alt={text.square} className="absolute inset-0 h-full w-full object-cover" />}
          {!captured && !cameraError && cameraEnabled && !ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">{text.starting}</div>}
          {!captured && cameraError && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-300">{cameraError}</div>}
          {!captured && ready && !cameraError && cameraEnabled && <div className="pointer-events-none absolute left-1/2 top-1/2 rounded-xl border-2 border-white/80" style={{ ...guide, transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 9999px rgba(0,0,0,.35)' }} />}
          {!captured && focusPoint && <div aria-hidden="true" className="pointer-events-none absolute h-12 w-12 rounded-full border-2 border-amber-300" style={{ left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%`, transform: 'translate(-50%, -50%)' }} />}
          {processing && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">{text.processing}</div>}
        </div>
        {captureError && <p role="alert" className="text-center text-xs text-red-300">{captureError}</p>}
        {!captured && ready && cameraEnabled && <p className="text-center text-xs text-slate-300">{guideText}</p>}
        {!captured && ready && cameraEnabled && canFocus && <p className="text-center text-xs text-slate-400">{lang === 'pt' ? 'Toque na imagem para focar' : lang === 'fa' ? 'برای فوکوس روی تصویر ضربه بزنید' : 'Tap the image to focus'}</p>}
        {!captured && cameraEnabled && devices.length > 1 && <select aria-label={lensText} value={deviceId || streamRef.current?.getVideoTracks()[0]?.getSettings?.().deviceId || ''} onChange={event => setDeviceId(event.target.value)} className="max-w-full rounded-lg bg-neutral-800 px-3 py-2 text-xs text-white">{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${lensText} ${index + 1}`}</option>)}</select>}
        {!captured && <button type="button" onClick={openPhoneCamera} disabled={processing} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-200"><Smartphone size={14} />{text.camera}</button>}
      </div>

      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} onCancel={() => setCameraEnabled(true)} />
      <div className="w-full max-w-[340px] flex items-center justify-around">
        {!captured ? <>
          <button type="button" onClick={() => galleryRef.current?.click()} disabled={processing} title={text.gallery} aria-label={text.gallery} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 disabled:opacity-40"><ImageIcon size={20} /></button>
          <button type="button" onClick={handleSnap} disabled={!ready || !cameraEnabled || processing || !!cameraError} title={text.take} aria-label={text.take} className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 bg-white/20 disabled:opacity-40"><span className="h-[52px] w-[52px] rounded-full bg-white" /></button>
          <button type="button" onClick={() => { setDeviceId(''); setFacingMode(mirrored ? 'environment' : 'user'); }} disabled={processing || !cameraEnabled} title={text.flip} aria-label={text.flip} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 disabled:opacity-40"><RefreshCw size={20} /></button>
        </> : <div className="flex w-full gap-3">
          <button type="button" onClick={retake} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 py-3.5 text-sm font-semibold"><RefreshCw size={16} />{text.retake}</button>
          <button type="button" onClick={() => { onCapture(captured); onClose(); }} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-semibold"><Check size={18} />{text.use}</button>
        </div>}
      </div>
    </div>, document.body
  );
}
