import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, X, Check, Image as ImageIcon, Zap, Sun, Maximize2, Minimize2, Smartphone } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

export function CameraCaptureModal({ isOpen, onCapture, onClose }) {
    const { t } = useTranslation();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const galleryInputRef = useRef(null);
    const systemCameraInputRef = useRef(null);

    const [stream, setStream] = useState(null);
    const [capturedDataUrl, setCapturedDataUrl] = useState(null);
    const [capturedBlob, setCapturedBlob] = useState(null);
    const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoadingCamera, setIsLoadingCamera] = useState(true);

    // Advanced camera controls
    const [brightnessLevel, setBrightnessLevel] = useState(1.0); // 1.0, 1.3, 1.6
    const [hasTorch, setHasTorch] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [viewMode, setViewMode] = useState('framed'); // 'framed' (unzoomed full FOV with 1:1 box) | 'fill' (1:1 crop zoom)

    // Start video stream with native unconstrained wide-angle resolution
    const startCamera = async (mode) => {
        setIsLoadingCamera(true);
        setErrorMsg('');
        setTorchOn(false);
        setHasTorch(false);

        // Stop any existing stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Camera access not supported on this device/browser');
            }

            // DO NOT request 1:1 aspect ratio in getUserMedia — it triggers digital zoom & dark sensor crop.
            // Request standard wide resolution so the sensor operates at full aperture, full FOV and auto-exposure.
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: mode },
                    width: { ideal: 1920, min: 640 },
                    height: { ideal: 1080, min: 480 }
                },
                audio: false
            });

            setStream(mediaStream);

            // Check if device supports torch (flash)
            const videoTrack = mediaStream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getCapabilities) {
                const capabilities = videoTrack.getCapabilities();
                if (capabilities.torch) {
                    setHasTorch(true);
                }
            }

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                try {
                    await videoRef.current.play();
                } catch {
                    // Ignore autoplay restrictions if handled
                }
            }
        } catch (err) {
            console.warn('Camera stream error:', err);
            setErrorMsg(err.name === 'NotAllowedError' 
                ? 'Camera permission denied. Please allow camera access in browser settings.' 
                : 'Unable to start in-app camera.');
        } finally {
            setIsLoadingCamera(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setCapturedDataUrl(null);
            setCapturedBlob(null);
            startCamera(facingMode);
        } else {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [isOpen, facingMode]);

    if (!isOpen) return null;

    // Flip between front and rear camera
    const toggleFacingMode = () => {
        const nextMode = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(nextMode);
    };

    // Toggle flashlight / torch
    const toggleTorch = async () => {
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        if (track && track.applyConstraints) {
            try {
                const nextTorch = !torchOn;
                await track.applyConstraints({
                    advanced: [{ torch: nextTorch }]
                });
                setTorchOn(nextTorch);
            } catch (err) {
                console.warn('Failed to toggle torch:', err);
            }
        }
    };

    // Cycle brightness booster: 1.0x -> 1.3x -> 1.6x -> 1.0x
    const cycleBrightness = () => {
        if (brightnessLevel === 1.0) setBrightnessLevel(1.3);
        else if (brightnessLevel === 1.3) setBrightnessLevel(1.6);
        else setBrightnessLevel(1.0);
    };

    // Snap photo directly from the video stream with 1:1 center crop & brightness boost
    const handleSnap = () => {
        const video = videoRef.current;
        if (!video) return;

        const videoW = video.videoWidth || 640;
        const videoH = video.videoHeight || 480;

        // Calculate 1:1 center crop coordinates from full camera resolution
        const squareSize = Math.min(videoW, videoH);
        const sx = (videoW - squareSize) / 2;
        const sy = (videoH - squareSize) / 2;

        const canvas = canvasRef.current || document.createElement('canvas');
        const outputSize = Math.min(1080, squareSize);
        canvas.width = outputSize;
        canvas.height = outputSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Apply software brightness boost if user increased it
            if (brightnessLevel > 1.0) {
                ctx.filter = `brightness(${brightnessLevel})`;
            }

            // Mirror image if using front camera
            if (facingMode === 'user') {
                ctx.translate(outputSize, 0);
                ctx.scale(-1, 1);
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(video, sx, sy, squareSize, squareSize, 0, 0, outputSize, outputSize);

            canvas.toBlob((blob) => {
                if (blob) {
                    setCapturedBlob(blob);
                    setCapturedDataUrl(canvas.toDataURL('image/webp', 0.85));
                }
            }, 'image/webp', 0.85);

            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(20); } catch {}
            }
        }
    };

    const handleRetake = () => {
        setCapturedDataUrl(null);
        setCapturedBlob(null);
    };

    const handleConfirm = () => {
        if (capturedBlob) {
            onCapture(capturedBlob);
            onClose();
        }
    };

    // Fallback file / system camera upload (auto-crops 1:1 in Home.jsx)
    const handleFileFallback = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            onCapture(file);
            onClose();
        }
    };

    const modalContent = (
        <div className="fixed inset-0 z-[10000] flex flex-col justify-between items-center p-4 py-6 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-200 select-none">
            
            {/* Top Bar: Title & Utility Quick Actions */}
            <div className="w-full max-w-[380px] flex justify-between items-center text-white pt-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-widest uppercase bg-white/10 px-2.5 py-1 rounded-full border border-white/15 flex items-center gap-1.5 text-blue-300">
                        <Camera size={13} />
                        <span>1:1 RATIO</span>
                    </span>

                    {/* Brightness Booster button */}
                    <button
                        type="button"
                        onClick={cycleBrightness}
                        className={`px-2 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 border transition-all ${
                            brightnessLevel > 1.0 
                                ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-400/20' 
                                : 'bg-white/10 text-slate-300 border-white/10 hover:bg-white/15'
                        }`}
                        title="Boost Brightness"
                    >
                        <Sun size={12} className={brightnessLevel > 1.0 ? 'animate-spin' : ''} />
                        <span>{brightnessLevel > 1.0 ? `+${Math.round((brightnessLevel - 1.0) * 100)}%` : 'Auto'}</span>
                    </button>

                    {/* Torch (Flash) Button if available */}
                    {hasTorch && (
                        <button
                            type="button"
                            onClick={toggleTorch}
                            className={`p-1.5 rounded-full border transition-all ${
                                torchOn 
                                    ? 'bg-amber-400 text-black border-amber-300' 
                                    : 'bg-white/10 text-slate-300 border-white/10 hover:bg-white/15'
                            }`}
                            title="Flashlight"
                        >
                            <Zap size={14} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* View Mode Toggle: Framed vs Fill */}
                    {!capturedDataUrl && (
                        <button
                            type="button"
                            onClick={() => setViewMode(prev => prev === 'framed' ? 'fill' : 'framed')}
                            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 border border-white/10 transition-all"
                            title={viewMode === 'framed' ? 'Switch to Full Screen Fill' : 'Switch to Unzoomed Framed View'}
                        >
                            {viewMode === 'framed' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Viewfinder Area */}
            <div className="w-full max-w-[360px] flex-1 flex flex-col items-center justify-center my-auto">
                <div 
                    className="w-full max-w-[340px] aspect-square rounded-3xl overflow-hidden relative border-2 border-white/25 shadow-2xl bg-black flex items-center justify-center"
                    style={{
                        filter: brightnessLevel > 1.0 ? `brightness(${brightnessLevel})` : undefined
                    }}
                >
                    {/* Live Camera View */}
                    {!capturedDataUrl && !errorMsg && (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full ${
                                    viewMode === 'framed' ? 'object-contain' : 'object-cover'
                                } ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                            />

                            {/* 1:1 Reticle Guides */}
                            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                                <div className="flex justify-between">
                                    <div className="w-6 h-6 border-t-2 border-l-2 border-white/70 rounded-tl-lg shadow-sm" />
                                    <div className="w-6 h-6 border-t-2 border-r-2 border-white/70 rounded-tr-lg shadow-sm" />
                                </div>
                                <div className="flex justify-between">
                                    <div className="w-6 h-6 border-b-2 border-l-2 border-white/70 rounded-bl-lg shadow-sm" />
                                    <div className="w-6 h-6 border-b-2 border-r-2 border-white/70 rounded-br-lg shadow-sm" />
                                </div>
                            </div>

                            {/* Subtle Crosshair in center */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
                                <div className="w-4 h-0.5 bg-white" />
                                <div className="h-4 w-0.5 bg-white absolute" />
                            </div>

                            {/* Framing mode info */}
                            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-bold text-white tracking-widest uppercase">
                                {viewMode === 'framed' ? 'Wide · 1:1 Box' : 'Zoom · 1:1'}
                            </div>
                        </>
                    )}

                    {/* Captured Photo Preview */}
                    {capturedDataUrl && (
                        <img
                            src={capturedDataUrl}
                            alt="Captured punch"
                            className="w-full h-full object-cover"
                        />
                    )}

                    {/* Error / Fallback State */}
                    {errorMsg && !capturedDataUrl && (
                        <div className="p-6 text-center space-y-4">
                            <p className="text-xs text-red-300 font-medium leading-relaxed">{errorMsg}</p>
                            <button
                                type="button"
                                onClick={() => systemCameraInputRef.current?.click()}
                                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto"
                            >
                                <Smartphone size={15} />
                                <span>Use System Camera</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Subtitle / Mode hint */}
                {!capturedDataUrl && !errorMsg && (
                    <div className="mt-3 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => systemCameraInputRef.current?.click()}
                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors py-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10"
                        >
                            <Smartphone size={13} />
                            <span>Switch to Native Phone Camera</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Camera Controls */}
            <div className="w-full max-w-[340px] flex items-center justify-around pb-2">
                {!capturedDataUrl ? (
                    <>
                        {/* Gallery / File Picker */}
                        <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white border border-white/15"
                            title="Choose from gallery"
                        >
                            <ImageIcon size={20} />
                        </button>
                        <input
                            ref={galleryInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileFallback}
                        />

                        {/* System Camera File Input */}
                        <input
                            ref={systemCameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleFileFallback}
                        />

                        {/* Shutter Button */}
                        <button
                            type="button"
                            onClick={handleSnap}
                            disabled={isLoadingCamera || !!errorMsg}
                            className="w-18 h-18 rounded-full border-4 border-white/80 bg-white/20 hover:bg-white/30 active:scale-90 transition-all shadow-[0_0_24px_rgba(255,255,255,0.25)] flex items-center justify-center cursor-pointer disabled:opacity-40"
                            title="Take photo (1:1)"
                        >
                            <div className="w-13 h-13 rounded-full bg-white shadow-inner" />
                        </button>

                        {/* Flip Camera */}
                        <button
                            type="button"
                            onClick={toggleFacingMode}
                            disabled={isLoadingCamera || !!errorMsg}
                            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white border border-white/15 disabled:opacity-40"
                            title="Flip camera"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </>
                ) : (
                    /* Review Action Buttons */
                    <div className="w-full flex gap-3">
                        <button
                            type="button"
                            onClick={handleRetake}
                            className="flex-1 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={16} />
                            <span>Retake</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="flex-1 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            <Check size={18} />
                            <span>Use Photo</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Hidden capture canvas */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );

    return createPortal(modalContent, document.body);
}
