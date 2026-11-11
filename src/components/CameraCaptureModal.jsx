import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, X, Check, Image as ImageIcon, Zap, Sun, Smartphone } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { optimizeImage } from '../services/imageOptimizer';

const labels = {
  en: { square: 'Square photo', auto: 'Auto', brighter: 'Brightness', flash: 'Torch', close: 'Close', camera: 'Use phone camera', gallery: 'Choose from gallery', take: 'Take photo', flip: 'Flip camera', retake: 'Retake', use: 'Use photo', starting: 'Starting camera…', processing: 'Preparing photo…', denied: 'Camera permission was denied. Allow access in your browser settings.', unavailable: 'Could not start the in-app camera. You can use your phone camera instead.', failed: 'Could not prepare this photo. Please try again.' },
  pt: { square: 'Foto quadrada', auto: 'Auto', brighter: 'Brilho', flash: 'Lanterna', close: 'Fechar', camera: 'Usar câmera do celular', gallery: 'Escolher da galeria', take: 'Tirar foto', flip: 'Trocar câmera', retake: 'Refazer', use: 'Usar foto', starting: 'Iniciando câmera…', processing: 'Preparando foto…', denied: 'Permissão negada. Permita o acesso à câmera nas configurações do navegador.', unavailable: 'Não foi possível iniciar a câmera do aplicativo. Use a câmera do celular.', failed: 'Não foi possível preparar a foto. Tente novamente.' },
  fa: { square: 'عکس مربعی', auto: 'خودکار', brighter: 'روشنایی', flash: 'چراغ', close: 'بستن', camera: 'استفاده از دوربین گوشی', gallery: 'انتخاب از گالری', take: 'گرفتن عکس', flip: 'تغییر دوربین', retake: 'دوباره', use: 'استفاده از عکس', starting: 'در حال راه‌اندازی دوربین…', processing: 'در حال آماده‌سازی عکس…', denied: 'دسترسی به دوربین رد شد. آن را در تنظیمات مرورگر فعال کنید.', unavailable: 'دوربین برنامه باز نشد. می‌توانید از دوربین گوشی استفاده کنید.', failed: 'آماده‌سازی عکس ناموفق بود. دوباره تلاش کنید.' }
};

export function CameraCaptureModal({ isOpen, onCapture, onClose }) {
  const { lang } = useTranslation();
  const text = labels[lang] || labels.en;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);
  const nativeRef = useRef(null);
  const generationRef = useRef(0);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState('environment');
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

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

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        ownedStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false
        });
        if (cancelled) { ownedStream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = ownedStream;
        if (videoRef.current) {
          videoRef.current.srcObject = ownedStream;
          videoRef.current.play().catch(() => {});
        }
        const track = ownedStream.getVideoTracks()[0];
        try {
          const caps = track?.getCapabilities?.() || {};
          if (!cancelled) setHasTorch(!!caps.torch);
          const auto = {};
          for (const key of ['exposureMode', 'focusMode', 'whiteBalanceMode']) {
            if (Array.isArray(caps[key]) && caps[key].includes('continuous')) auto[key] = 'continuous';
          }
          if (track && Object.keys(auto).length) {
            const constraints = track.getConstraints?.() || {};
            await track.applyConstraints({ ...constraints, advanced: [...(constraints.advanced || []), auto] });
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
  }, [isOpen, facingMode, cameraEnabled, text.denied, text.unavailable]);

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
      const track = streamRef.current?.getVideoTracks()[0];
      const options = { brightness, mirror: facingMode === 'user' };
      let still;
      if (track && facingMode === 'environment' && typeof window.ImageCapture === 'function') {
        try { still = await new window.ImageCapture(track).takePhoto(); }
        catch (err) { console.warn('Still capture unavailable, using video frame:', err); }
      }
      if (still) {
        try { await prepare(still, options, generation); }
        catch (err) {
          console.warn('Could not decode still capture, using video frame:', err);
          await prepare(await videoFrame(), options, generation);
        }
      } else {
        await prepare(await videoFrame(), options, generation);
      }
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
        <div className="relative shrink-0 overflow-hidden rounded-3xl border border-white/25 bg-neutral-900 shadow-2xl" style={{ width: 'min(100%, 360px, max(160px, calc(100dvh - 230px)))', aspectRatio: '1 / 1' }}>
          <video ref={videoRef} autoPlay playsInline muted onLoadedData={() => setReady(true)} className={`absolute inset-0 h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''} ${captured || cameraError || !cameraEnabled ? 'invisible' : ''}`} style={{ filter: brightness === 1 ? undefined : `brightness(${brightness})` }} />
          {captured && <img src={captured.dataUrl} alt={text.square} className="absolute inset-0 h-full w-full object-cover" />}
          {!captured && !cameraError && cameraEnabled && !ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">{text.starting}</div>}
          {!captured && cameraError && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-300">{cameraError}</div>}
          {!captured && ready && !cameraError && <div className="pointer-events-none absolute inset-0 border border-white/10 rounded-3xl" />}
          {processing && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">{text.processing}</div>}
        </div>
        {captureError && <p role="alert" className="text-center text-xs text-red-300">{captureError}</p>}
        {!captured && <button type="button" onClick={openPhoneCamera} disabled={processing} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-200"><Smartphone size={14} />{text.camera}</button>}
      </div>

      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} onCancel={() => setCameraEnabled(true)} />
      <div className="w-full max-w-[340px] flex items-center justify-around">
        {!captured ? <>
          <button type="button" onClick={() => galleryRef.current?.click()} disabled={processing} title={text.gallery} aria-label={text.gallery} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 disabled:opacity-40"><ImageIcon size={20} /></button>
          <button type="button" onClick={handleSnap} disabled={!ready || !cameraEnabled || processing || !!cameraError} title={text.take} aria-label={text.take} className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 bg-white/20 disabled:opacity-40"><span className="h-[52px] w-[52px] rounded-full bg-white" /></button>
          <button type="button" onClick={() => setFacingMode(mode => mode === 'environment' ? 'user' : 'environment')} disabled={processing || !cameraEnabled} title={text.flip} aria-label={text.flip} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 disabled:opacity-40"><RefreshCw size={20} /></button>
        </> : <div className="flex w-full gap-3">
          <button type="button" onClick={retake} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 py-3.5 text-sm font-semibold"><RefreshCw size={16} />{text.retake}</button>
          <button type="button" onClick={() => { onCapture(captured); onClose(); }} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-semibold"><Check size={18} />{text.use}</button>
        </div>}
      </div>
    </div>, document.body
  );
}
