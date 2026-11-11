import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, X, Check, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

export function CameraCaptureModal({ isOpen, onCapture, onClose }) {
    const { t } = useTranslation();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);

    const [stream, setStream] = useState(null);
    const [capturedDataUrl, setCapturedDataUrl] = useState(null);
    const [capturedBlob, setCapturedBlob] = useState(null);
    const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoadingCamera, setIsLoadingCamera] = useState(true);

    // Start video stream
    const startCamera = async (mode) => {
        setIsLoadingCamera(true);
        setErrorMsg('');
        
        // Stop any existing stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Camera access not supported on this device/browser');
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: mode },
                    width: { ideal: 1080 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                await videoRef.current.play();
            }
        } catch (err) {
            console.warn('Camera stream error:', err);
            setErrorMsg(err.name === 'NotAllowedError' 
                ? 'Camera permission denied. Please allow camera access in browser settings.' 
                : 'Unable to start camera.');
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

    // Snap photo directly from the 1:1 square video frame
    const handleSnap = () => {
        const video = videoRef.current;
        if (!video) return;

        const videoW = video.videoWidth || 640;
        const videoH = video.videoHeight || 640;

        // Calculate 1:1 center crop coordinates
        const squareSize = Math.min(videoW, videoH);
        const sx = (videoW - squareSize) / 2;
        const sy = (videoH - squareSize) / 2;

        const canvas = canvasRef.current || document.createElement('canvas');
        const outputSize = Math.min(800, squareSize);
        canvas.width = outputSize;
        canvas.height = outputSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
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
                try { navigator.vibrate(15); } catch {}
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

    // Fallback file upload from gallery (also crops 1:1)
    const handleFileFallback = (e) => {
        const file = e.target.files[0];
        if (file) {
            onCapture(file);
            onClose();
        }
    };

    const modalContent = (
        <div className="fixed inset-0 z-[10000] flex flex-col justify-center items-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 select-none">
            {/* Top Bar: Title & Close */}
            <div className="w-full max-w-[360px] flex justify-between items-center mb-4 text-white">
                <span className="text-sm font-bold tracking-wider uppercase opacity-80 flex items-center gap-2">
                    <Camera size={16} />
                    <span>Camera 1:1</span>
                </span>
                <button
                    onClick={onClose}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
                >
                    <X size={20} />
                </button>
            </div>

            {/* 1:1 Square Viewfinder Area */}
            <div className="w-full max-w-[340px] aspect-square rounded-3xl overflow-hidden relative border-2 border-white/25 shadow-2xl bg-black flex items-center justify-center">
                {/* Live Camera View */}
                {!capturedDataUrl && !errorMsg && (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                        />

                        {/* 1:1 Reticle Guides */}
                        <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                            <div className="flex justify-between">
                                <div className="w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-lg" />
                                <div className="w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-lg" />
                            </div>
                            <div className="flex justify-between">
                                <div className="w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-lg" />
                                <div className="w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-lg" />
                            </div>
                        </div>

                        {/* 1:1 Aspect Pill */}
                        <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-bold text-white tracking-widest uppercase">
                            1 : 1
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
                        <p className="text-xs text-red-300 font-medium">{errorMsg}</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg active:scale-95 transition-all"
                        >
                            Choose from Photos
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Camera Controls */}
            <div className="w-full max-w-[340px] mt-6 flex items-center justify-around">
                {!capturedDataUrl ? (
                    <>
                        {/* Gallery / File Picker */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white border border-white/15"
                            title="Choose from gallery"
                        >
                            <ImageIcon size={20} />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileFallback}
                        />

                        {/* Shutter Button */}
                        <button
                            type="button"
                            onClick={handleSnap}
                            disabled={isLoadingCamera || !!errorMsg}
                            className="w-18 h-18 rounded-full border-4 border-white/80 bg-white/20 hover:bg-white/30 active:scale-90 transition-all shadow-[0_0_24px_rgba(255,255,255,0.25)] flex items-center justify-center cursor-pointer disabled:opacity-40"
                            title="Take photo"
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

