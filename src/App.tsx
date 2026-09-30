import React, { useState, useEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  Video,
  VideoOff,
  Tv,
  Settings,
  Radio,
  Layers,
  Type,
  Volume2,
  VolumeX,
  Check,
  Cpu,
  Wifi,
  AlertTriangle,
  Send,
  Sliders,
  Sparkles,
  Smartphone,
  Activity,
  Terminal,
  Upload,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import {
  StreamConfig,
  ChromaConfig,
  LogoConfig,
  TickerConfig,
  StreamStats,
  ChatMessage,
  StreamProtocol,
  StreamQuality,
  ChromaColorType,
  BgPresetType,
  LogoPositionType,
} from './types';
import { drawBackground, drawVirtualPresenter, applyChromaKey, drawLogo, drawTicker, initRenderer } from './utils/canvasRenderer';

// Default Ingest servers based on protocols
const NativeStreaming = registerPlugin<any>('NativeStreaming');

const PROTOCOL_DEFAULTS = {
  // YouTube encoder ingest endpoints. The stream key is entered separately.
  // YouTube recommends RTMPS for secure encoder streaming.
  RTMP: 'rtmp://a.rtmp.youtube.com/live2',
  RTMPS: 'rtmps://a.rtmps.youtube.com:443/live2',
  SRT: 'srt://ingest.streamcraft.io:9000?streamid=pub_stream',
  WebRTC: 'https://YOUR-SERVER:8889/stream/whip',
  HLS: 'https://hls-ingest.streamcraft.io/v2/stream_manifest.m3u8',
};

const BITRATE_PRESETS = {
  ultra: { label: 'Ultra (1080p 60FPS)', bitrate: 6000, resolution: { width: 1920, height: 1080 }, fps: 60 },
  high: { label: 'High (720p 30FPS)', bitrate: 4000, resolution: { width: 1280, height: 720 }, fps: 30 },
  medium: { label: 'Medium (480p 30FPS)', bitrate: 1800, resolution: { width: 854, height: 480 }, fps: 30 },
  low: { label: 'Low (360p 30FPS)', bitrate: 800, resolution: { width: 640, height: 360 }, fps: 30 },
};

export default function App() {
  // 1. Streaming Core State Configs
  const [activePage, setActivePage] = useState<'studio' | 'controls'>('studio');
  const [accessStatus, setAccessStatus] = useState<'checking' | 'locked' | 'requesting' | 'otp' | 'granted'>('checking');
  const [accessOtp, setAccessOtp] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');
  const [deviceId] = useState(() => {
    const key = 'streamflow_device_id';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, created);
    return created;
  });

const ACCESS_SERVER_URL = "https://streamflow-studio-api.onrender.com";

  useEffect(() => {
    const token = window.localStorage.getItem('streamflow_access_token');
    if (!token) {
      setAccessStatus('locked');
      return;
    }

    fetch(`${ACCESS_SERVER_URL}/check-access`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Access expired');
        setAccessStatus('granted');
      })
      .catch(() => {
        window.localStorage.removeItem('streamflow_access_token');
        setAccessStatus('locked');
      });
  }, [ACCESS_SERVER_URL]);

  const requestAccess = async () => {
    setAccessStatus('requesting');
    setAccessError('');
    setAccessMessage('');

    try {
      const response = await fetch(`${ACCESS_SERVER_URL}/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not request access');
      setAccessStatus('otp');
      setAccessMessage('OTP sent to the owner. Ask the owner for the OTP.');
    } catch (error: any) {
      setAccessStatus('locked');
      setAccessError(error?.message || 'Could not connect to the access server.');
    }
  };

  const verifyAccess = async () => {
    if (!accessOtp.trim()) {
      setAccessError('Enter the OTP.');
      return;
    }

    setAccessError('');
    setAccessMessage('Verifying...');

    try {
      const response = await fetch(`${ACCESS_SERVER_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, otp: accessOtp.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Invalid OTP');
      window.localStorage.setItem('streamflow_access_token', data.token);
      setAccessStatus('granted');
      setAccessMessage('Access granted.');
      setAccessOtp('');
    } catch (error: any) {
      setAccessMessage('');
      setAccessError(error?.message || 'Verification failed.');
    }
  };

  const [streamConfig, setStreamConfig] = useState<StreamConfig>({
    protocol: 'RTMP',
    streamUrl: PROTOCOL_DEFAULTS.RTMP,
    // Never generate a fake key. YouTube requires the real Stream Key from
    // YouTube Studio.
    streamKey: '',
    quality: 'high',
    bitrate: BITRATE_PRESETS.high.bitrate,
    fps: BITRATE_PRESETS.high.fps,
    resolution: BITRATE_PRESETS.high.resolution,
  });

  const [chromaConfig, setChromaConfig] = useState<ChromaConfig>({
    enabled: true,
    colorType: 'green',
    customColor: '#00ff00',
    tolerance: 50,
    smoothing: 20,
    spillReduction: 30,
    bgType: 'neon',
    bgSolidColor: '#10051e',
    bgImageUrl: '',
  });

  const [logoConfig, setLogoConfig] = useState<LogoConfig>({
    enabled: true,
    preset: 'news',
    customUrl: '',
    position: 'top-right',
    size: 16,
    opacity: 0.9,
    padding: 12,
  });

  // Free logo placement: X 0=left, 100=right; Y 0=top, 100=bottom.
  // Kept separate from LogoConfig so the existing types.ts does not need to change.
  const [logoX, setLogoX] = useState(100);
  const [logoY, setLogoY] = useState(0);

  const [tickerHeader, setTickerHeader] = useState('TICKER');

  const [tickerConfig, setTickerConfig] = useState<TickerConfig>({
    enabled: true,
    text: 'BREAKING NEWS: Dynamic live stream active! Real-time color model chroma-keyer, multi-protocol SRT/RTMP encoding, and direct frame overlays are fully operational.',
    speed: 'medium',
    bgColor: '#dc2626',
    textColor: '#ffffff',
    fontSize: 14,
  });

  // 2. Hardware / Feed Source States
  const [feedSource, setFeedSource] = useState<'virtual' | 'webcam'>('virtual');
  const [isMuted, setIsMuted] = useState(false);
  const [hasCamAccess, setHasCamAccess] = useState(false);
  const [camError, setCamError] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment');
  const [liveAudioVol, setLiveAudioVol] = useState(15);
  const [isLivePreviewFullscreen, setIsLivePreviewFullscreen] = useState(false);
  // RTMP/RTMPS uses the native Camera2 + RootEncoder composition.
  // The Android preview is the same native GL output that is sent to YouTube.
  const [isNativeCompositedStreaming, setIsNativeCompositedStreaming] = useState(false);

  // Keep the native RootEncoder ticker synchronized while the Android stream is live.
  // This makes text, speed, color, and enable/disable changes apply immediately
  // to BOTH the Android full-screen preview and the YouTube output.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isNativeCompositedStreaming) {
      return;
    }

    void NativeStreaming.setTicker({
      enabled: tickerConfig.enabled,
      header: tickerHeader,
      text: tickerConfig.text,
      speed: tickerConfig.speed,
      bgColor: tickerConfig.bgColor,
      textColor: tickerConfig.textColor,
      fontSize: tickerConfig.fontSize,
    }).catch((error: any) => {
      console.warn('Unable to update native ticker while streaming:', error);
    });
  }, [tickerHeader, tickerConfig, isNativeCompositedStreaming]);

  // Native logo synchronization. This updates the same RootEncoder GL output
  // used by both the Android preview and YouTube. It never restarts the stream.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isNativeCompositedStreaming) return;

    void NativeStreaming.setLogo({
      enabled: logoConfig.enabled,
      preset: logoConfig.preset,
      customUrl: logoConfig.customUrl,
      position: logoConfig.position,
      size: logoConfig.size,
      opacity: logoConfig.opacity,
      padding: logoConfig.padding,
      x: logoX,
      y: logoY,
    }).catch((error: any) => {
      console.warn('Unable to update native logo:', error);
    });
  }, [logoConfig, logoX, logoY, isNativeCompositedStreaming]);

  // Apply chroma controls to the native RootEncoder composition while live.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isNativeCompositedStreaming) return;

    void NativeStreaming.setChroma({
      enabled: chromaConfig.enabled,
      colorType: chromaConfig.colorType,
      customColor: chromaConfig.customColor,
      tolerance: chromaConfig.tolerance,
      smoothing: chromaConfig.smoothing,
      spillReduction: chromaConfig.spillReduction,
      bgType: chromaConfig.bgType,
      bgSolidColor: chromaConfig.bgSolidColor,
      bgImageUrl: chromaConfig.bgImageUrl,
    }).catch((error: any) => {
      console.warn('Unable to update native chroma key:', error);
    });
  }, [chromaConfig, isNativeCompositedStreaming]);

  const lastPreviewTapRef = useRef<number>(0);
  const [networkCondition, setNetworkCondition] = useState<'stable' | 'fluctuating' | 'congested'>('stable');

  // 3. System and Logging Telemetry
  const [streamStats, setStreamStats] = useState<StreamStats>({
    isStreaming: false,
    duration: 0,
    viewerCount: 0,
    droppedFrames: 0,
    currentBitrate: 0,
    fps: 30,
    audioLevel: 0,
    packetLoss: 0,
    status: 'offline',
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userComment, setUserComment] = useState('');
  const [connectionLogs, setConnectionLogs] = useState<string[]>([
    'System initialized on port 3000.',
    'Ready for protocol-aware publishing. RTMP/RTMPS use the Android encoder; WebRTC uses WHIP.',
  ]);

  const [activeTab, setActiveTab] = useState<'overlays' | 'chroma' | 'network'>('chroma');

  // 4. Document element refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Position the native RootEncoder TextureView exactly over the React preview.
  // The native view renders the same camera + ticker composition that is encoded
  // for YouTube, so the React canvas must not be shown during native RTMP/RTMPS.
  const syncNativePreview = async (visible = true) => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // During a real native live stream, the Android TextureView becomes the
      // camera screen itself. Do not position it over the small React preview.
      if (isLivePreviewFullscreen) {
        await NativeStreaming.setPreviewFullscreen({ fullscreen: true });
        await NativeStreaming.setPreviewVisible({ visible });
        return;
      }

      const host = document.getElementById('phone-device-wrapper');
      if (!host) return;

      const rect = host.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) return;

      await NativeStreaming.setPreviewFullscreen({ fullscreen: false });
      await NativeStreaming.setPreviewRect({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      await NativeStreaming.setPreviewVisible({ visible });
    } catch (e) {
      console.warn('Could not position native preview:', e);
    }
  };

  // Keep the native preview aligned if the device rotates, the preview enters
  // full screen, or the browser layout changes.
  useEffect(() => {
    if (!isNativeCompositedStreaming || !Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const sync = async () => {
      if (cancelled) return;
      await syncNativePreview(true);

      // The TextureView is created asynchronously by the Android plugin.
      // Retry briefly after startStream so the first layout is not missed.
      if (!cancelled && attempts++ < 10) {
        timer = window.setTimeout(sync, 100);
      }
    };

    void sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [isNativeCompositedStreaming, isLivePreviewFullscreen]);

  // Native Android fullscreen Settings button -> Controls & Analytics.
  // The native camera stays LIVE; only its fullscreen preview is hidden so
  // the React Controls & Analytics page can receive touches.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    const registerControlsListener = async () => {
      try {
        listenerHandle = await NativeStreaming.addListener(
          'controlsRequested',
          async () => {
            setActivePage('controls');
            setIsLivePreviewFullscreen(false);

            try {
              await NativeStreaming.setPreviewVisible({ visible: false });
            } catch (error) {
              console.warn('Could not hide native preview for Controls & Analytics:', error);
            }

            try {
              await NativeStreaming.setPreviewFullscreen({ fullscreen: false });
            } catch (error) {
              console.warn('Could not exit native fullscreen preview:', error);
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        );
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not register native controls listener:', error);
        }
      }
    };

    void registerControlsListener();

    return () => {
      cancelled = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);

  // Real WebRTC / WHIP publishing state.
  const publisherPcRef = useRef<RTCPeerConnection | null>(null);
  const publisherResourceUrlRef = useRef<string | null>(null);
  const publisherStreamRef = useRef<MediaStream | null>(null);
  const publisherAudioContextRef = useRef<AudioContext | null>(null);
  const publishStartedAtRef = useRef<number | null>(null);
  const previousBytesSentRef = useRef(0);
  const previousStatsAtRef = useRef<number | null>(null);

  // Bitrate line chart history data point pool (last 20 secs)
  const [bitrateHistory, setBitrateHistory] = useState<number[]>(Array(20).fill(0));

  // --- Functions ---

  // Append system log helper
  const addLog = (text: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConnectionLogs((prev) => [...prev.slice(-30), `[${timestamp}] ${text}`]);
  };

  // Receive the real RootEncoder connection result. startStream() only means
  // that the native encoder was started; YouTube is not connected until
  // RootEncoder fires onConnectionSuccess().
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let connectionHandle: { remove: () => Promise<void> } | null = null;
    let bitrateHandle: { remove: () => Promise<void> } | null = null;

    const registerListeners = async () => {
      try {
        connectionHandle = await NativeStreaming.addListener(
          'streamConnection',
          (event: { state?: string; message?: string }) => {
            const state = event?.state || 'unknown';
            const message = event?.message || '';

            if (state === 'started') {
              setStreamStats((prev) => ({ ...prev, isStreaming: true, status: 'connecting' }));
              addLog('YouTube connection started. Waiting for YouTube to accept the encoder...');
            } else if (state === 'connected') {
              setStreamStats((prev) => ({
                ...prev,
                isStreaming: true,
                status: 'live',
                duration: 0,
              }));
              setCamError('');
              addLog('YouTube connection successful. Video/audio data is now being sent.');
            } else if (state === 'failed') {
              setStreamStats((prev) => ({
                ...prev,
                isStreaming: false,
                status: 'offline',
                currentBitrate: 0,
              }));
              setIsNativeCompositedStreaming(false);
              const reason = message || 'YouTube rejected or could not receive the stream.';
              setCamError(reason);
              addLog(`YOUTUBE CONNECTION FAILED: ${reason}`);
            } else if (state === 'authError') {
              setStreamStats((prev) => ({ ...prev, isStreaming: false, status: 'offline' }));
              setCamError('YouTube authentication failed. Check the Stream Key and Stream URL.');
              addLog('YOUTUBE AUTHENTICATION FAILED: check the Stream Key and Stream URL.');
            } else if (state === 'disconnected') {
              setStreamStats((prev) => ({ ...prev, isStreaming: false, status: 'offline', currentBitrate: 0 }));
              addLog('YouTube connection disconnected.');
            }
          }
        );

        bitrateHandle = await NativeStreaming.addListener(
          'streamBitrate',
          (event: { bitrate?: number }) => {
            const bitrate = Number(event?.bitrate || 0);
            setStreamStats((prev) => ({ ...prev, currentBitrate: bitrate }));
          }
        );
      } catch (error) {
        console.warn('Could not register native streaming listeners:', error);
      }
    };

    void registerListeners();

    return () => {
      if (connectionHandle) void connectionHandle.remove();
      if (bitrateHandle) void bitrateHandle.remove();
    };
  }, []);

  // Select streaming protocols updatedefaults
  const handleProtocolChange = (p: StreamProtocol) => {
    setStreamConfig((prev) => ({
      ...prev,
      protocol: p,
      streamUrl: PROTOCOL_DEFAULTS[p],
      // Do not carry a key from another streaming service into YouTube.
      streamKey: prev.streamKey,
    }));
    addLog(`Changed publishing protocol to ${p}.`);
    if (p === 'RTMP' || p === 'RTMPS') {
      addLog('YouTube server URL selected. Paste the Stream Key from YouTube Studio.');
    }
  };

  // Select quality profile presets
  const handleQualityChange = (q: StreamQuality) => {
    if (q === 'custom') {
      setStreamConfig((prev) => ({ ...prev, quality: q }));
      return;
    }
    const preset = BITRATE_PRESETS[q];
    setStreamConfig((prev) => ({
      ...prev,
      quality: q,
      bitrate: preset.bitrate,
      fps: preset.fps,
      resolution: preset.resolution,
    }));
    addLog(`Switched encoder profile preset to ${q} (${preset.bitrate}kbps)`);
  };

  // Webcam capturing routines
  const startWebcam = async (
    facingMode: 'user' | 'environment' = cameraFacingMode
  ) => {
    setCamError('');

    const cameraName = facingMode === 'environment' ? 'back' : 'front';
    addLog(`Requesting ${cameraName} camera and audio device permissions...`);

    try {
      // Stop the current stream before changing cameras.
      if (videoRef.current?.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 360 },
        },
        audio: true,
      });

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Video preview element is unavailable.');
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setCameraFacingMode(facingMode);
      setHasCamAccess(true);
      setFeedSource('webcam');
      addLog(
        `${cameraName.charAt(0).toUpperCase() + cameraName.slice(1)} camera connected successfully.`
      );

      // Initialize audio analyser.
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;

        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();

          analyser.fftSize = 256;
          source.connect(analyser);

          audioContextRef.current = ctx;
          analyserRef.current = analyser;
        }
      } catch (e) {
        console.warn('Silent audio fallback active:', e);
      }
    } catch (err: any) {
      console.error(err);

      let errMsg =
        err?.message || 'Permission denied or video hardware unavailable';

      if (
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError'
      ) {
        errMsg =
          'Camera/microphone permission was denied. Allow Camera and Microphone in Android settings.';
      } else if (err?.name === 'NotFoundError') {
        errMsg = `The ${cameraName} camera was not found on this device.`;
      } else if (err?.name === 'OverconstrainedError') {
        errMsg = `The ${cameraName} camera could not be selected. Try switching cameras again.`;
      }

      setCamError(errMsg);
      addLog(`CRITICAL: System camera access failed: ${errMsg}`);
      setFeedSource('virtual');
    }
  };

  // Keep the React camera indicator synchronized when the native camera button is tapped.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      try {
        handle = await NativeStreaming.addListener('cameraSwitched', (event: { facing?: string }) => {
          const facing = event?.facing === 'user' ? 'user' : 'environment';
          setCameraFacingMode(facing);
          setHasCamAccess(true);
          setFeedSource('webcam');
        });
      } catch (error) {
        console.warn('Could not register camera switch listener:', error);
      }
    };

    void register();

    return () => {
      if (handle) void handle.remove();
    };
  }, []);

  const switchCamera = async () => {
    const nextFacingMode =
      cameraFacingMode === 'environment' ? 'user' : 'environment';

    // While native RTMP/RTMPS is live, switch the actual Camera2 source.
    // Do not start a separate WebView camera because that would diverge from YouTube.
    if (isNativeCompositedStreaming && Capacitor.isNativePlatform()) {
      try {
        await NativeStreaming.switchCamera();
        setCameraFacingMode(nextFacingMode);
        setHasCamAccess(true);
        setFeedSource('webcam');
        addLog(
          `Native camera switched to ${
            nextFacingMode === 'environment' ? 'back' : 'front'
          } camera. Android preview and YouTube use the same source.`
        );
      } catch (e: any) {
        addLog(`Native camera switch failed: ${e?.message || 'unknown error'}`);
      }
      return;
    }

    if (!hasCamAccess) {
      await startWebcam('environment');
      return;
    }

    addLog(
      `Switching camera to ${
        nextFacingMode === 'environment' ? 'back' : 'front'
      } camera...`
    );

    await startWebcam(nextFacingMode);
  };

  const stopWebcam = () => {
    if (Capacitor.isNativePlatform() && isNativeCompositedStreaming) {
      void NativeStreaming.stopCamera().catch(() => {});
      setIsNativeCompositedStreaming(false);
      setHasCamAccess(false);
      setFeedSource('virtual');
      addLog('Released native Camera2 preview.');
      return;
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setHasCamAccess(false);
      addLog('Released hardware camera and microphone resources safely.');
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
    }
  };


  // File loading handoffs
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addLog(`Reading custom backdrop image: ${file.name}`);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setChromaConfig((prev) => ({
            ...prev,
            bgType: 'custom',
            bgImageUrl: event.target!.result as string,
          }));
          addLog('Custom green screen backplate loaded into background buffer.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addLog(`Reading custom logo overlay file: ${file.name}`);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setLogoConfig((prev) => ({
            ...prev,
            preset: 'custom',
            customUrl: event.target!.result as string,
          }));
          addLog('Branded corporate logo loaded into graphic container overlay.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Camera Device uses the SAME native Camera2 + RootEncoder pipeline that
  // will later be sent to YouTube. There is no separate WebView camera path
  // while running the Android native RTMP/RTMPS workflow.
  const toggleFeedSource = async (source: 'virtual' | 'webcam') => {
    if (source === 'webcam') {
      if (Capacitor.isNativePlatform()) {
        setCamError('');
        try {
          await NativeStreaming.startCamera({
            width: streamConfig.resolution.width,
            height: streamConfig.resolution.height,
            bitrateKbps: streamConfig.bitrate,
            fps: streamConfig.fps,
            facing: cameraFacingMode,
            audioEnabled: !isMuted,
            tickerEnabled: tickerConfig.enabled,
            tickerHeader,
            tickerText: tickerConfig.text,
            tickerSpeed: tickerConfig.speed,
            tickerBgColor: tickerConfig.bgColor,
            tickerTextColor: tickerConfig.textColor,
            tickerFontSize: tickerConfig.fontSize,
            logoEnabled: logoConfig.enabled,
            logoPreset: logoConfig.preset,
            logoCustomUrl: logoConfig.customUrl,
            logoPosition: logoConfig.position,
            logoSize: logoConfig.size,
            logoOpacity: logoConfig.opacity,
            logoPadding: logoConfig.padding,
            logoX: logoX,
            logoY: logoY,
            chromaEnabled: chromaConfig.enabled,
            chromaColorType: chromaConfig.colorType,
            chromaCustomColor: chromaConfig.customColor,
            chromaTolerance: chromaConfig.tolerance,
            chromaSmoothing: chromaConfig.smoothing,
            chromaSpillReduction: chromaConfig.spillReduction,
            chromaBgType: chromaConfig.bgType,
            chromaBgSolidColor: chromaConfig.bgSolidColor,
            chromaBgImageUrl: chromaConfig.bgImageUrl,
          });

          setIsNativeCompositedStreaming(true);
          setIsLivePreviewFullscreen(false);
          setHasCamAccess(true);
          setFeedSource('webcam');
          setCamError('');

          await new Promise((resolve) => window.setTimeout(resolve, 120));
          await syncNativePreview(true);

          addLog('Native Camera2 started. Android preview and YouTube will use the same camera + ticker output.');
        } catch (error: any) {
          setHasCamAccess(false);
          setIsNativeCompositedStreaming(false);
          const message = error?.message || 'Unable to access the native camera.';
          setCamError(message);
          addLog(`Native camera access failed: ${message}`);
        }
      } else {
        if (!hasCamAccess) {
          await startWebcam();
        } else {
          setFeedSource('webcam');
          addLog('Switched feed source layer to direct Webcam channel.');
        }
      }
    } else {
      setFeedSource('virtual');
      addLog('Switched feed source layer to Virtual Green Screen Host.');
    }
  };

  // Real browser -> WebRTC/WHIP publisher.
  // The browser publishes the rendered canvas + microphone/camera audio to a WHIP server.
  const waitForIceGatheringComplete = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const handleStateChange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', handleStateChange);
          resolve();
        }
      };

      pc.addEventListener('icegatheringstatechange', handleStateChange);
    });

  const createSilentAudioTrack = () => {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();

    // Keep a real audio track in the WebRTC stream without audible output.
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start();

    publisherAudioContextRef.current = audioContext;

    return destination.stream.getAudioTracks()[0] ?? null;
  };

  const stopRealPublisher = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await NativeStreaming.setPreviewVisible({ visible: false });
      } catch {}
      try {
        await NativeStreaming.setPreviewFullscreen({ fullscreen: false });
      } catch {}
      try {
        await NativeStreaming.stopStream();
      } catch {
        // Ignore when no native stream is active.
      }
      setIsNativeCompositedStreaming(false);
      setIsLivePreviewFullscreen(false);
    }

    const pc = publisherPcRef.current;
    const resourceUrl = publisherResourceUrlRef.current;

    publisherPcRef.current = null;
    publisherResourceUrlRef.current = null;

    if (pc) {
      pc.getSenders().forEach((sender) => {
        try {
          sender.replaceTrack(null);
        } catch {}
      });
      pc.close();
    }

    if (resourceUrl) {
      try {
        await fetch(resourceUrl, { method: 'DELETE' });
      } catch {
        // The server may already have closed the WHIP resource.
      }
    }

    publisherStreamRef.current?.getTracks().forEach((track) => track.stop());
    publisherStreamRef.current = null;

    if (publisherAudioContextRef.current) {
      await publisherAudioContextRef.current.close().catch(() => {});
      publisherAudioContextRef.current = null;
    }

    publishStartedAtRef.current = null;
    previousBytesSentRef.current = 0;
    previousStatsAtRef.current = null;
  };

  const startRealPublisher = async () => {
    const endpoint = streamConfig.streamUrl.trim();
    const streamKey = streamConfig.streamKey.trim();

    if (!endpoint) {
      throw new Error('Enter the ingest server URL first.');
    }

    if (!streamKey) {
      throw new Error('Enter the stream access key before going live.');
    }

    // RTMP/RTMPS are handled by the Android native encoder. The stream URL
    // and key entered in this panel are passed separately to the native layer.
    if (streamConfig.protocol === 'RTMP' || streamConfig.protocol === 'RTMPS') {
      if (!/^rtmps?:\/\//i.test(endpoint)) {
        throw new Error(
          `For ${streamConfig.protocol}, enter an ${streamConfig.protocol.toLowerCase()}:// server URL.`
        );
      }

      if (!Capacitor.isNativePlatform()) {
        throw new Error(
          'RTMP/RTMPS publishing requires the Android app. npm run dev in Chrome cannot publish RTMP.'
        );
      }

      // The Android encoder uses Camera2 + RootEncoder directly.
      // Its native TextureView is the same GL pipeline that is encoded to YouTube.
      addLog(
        `Preparing ${streamConfig.protocol} native broadcast: camera + ticker`
      );

      try {
        // Ask Android for camera + microphone permissions as part of Go Live.
        // If they were already granted, this resolves immediately.
        await NativeStreaming.requestPermissions({
          permissions: ['camera', 'microphone'],
        });

        await NativeStreaming.startStream({
          protocol: streamConfig.protocol,
          serverUrl: endpoint,
          streamKey,
          bitrateKbps: streamConfig.bitrate,
          fps: streamConfig.fps,
          width: streamConfig.resolution.width,
          height: streamConfig.resolution.height,
          facing: cameraFacingMode,
          audioEnabled: !isMuted,
          tickerEnabled: tickerConfig.enabled,
          tickerHeader,
          tickerText: tickerConfig.text,
          tickerSpeed: tickerConfig.speed,
          tickerBgColor: tickerConfig.bgColor,
          tickerTextColor: tickerConfig.textColor,
          tickerFontSize: tickerConfig.fontSize,
          logoEnabled: logoConfig.enabled,
          logoPreset: logoConfig.preset,
          logoCustomUrl: logoConfig.customUrl,
          logoPosition: logoConfig.position,
          logoSize: logoConfig.size,
          logoOpacity: logoConfig.opacity,
          logoPadding: logoConfig.padding,
          logoX: logoX,
          logoY: logoY,
            chromaEnabled: chromaConfig.enabled,
            chromaColorType: chromaConfig.colorType,
            chromaCustomColor: chromaConfig.customColor,
            chromaTolerance: chromaConfig.tolerance,
            chromaSmoothing: chromaConfig.smoothing,
            chromaSpillReduction: chromaConfig.spillReduction,
            chromaBgType: chromaConfig.bgType,
            chromaBgSolidColor: chromaConfig.bgSolidColor,
            chromaBgImageUrl: chromaConfig.bgImageUrl,
        });
      } catch (nativeError: any) {
        setIsNativeCompositedStreaming(false);
        setIsLivePreviewFullscreen(false);

        const nativeMessage =
          nativeError?.message ||
          nativeError?.error ||
          'NativeStreaming plugin is not installed or failed to start.';
        throw new Error(nativeMessage);
      }

      publishStartedAtRef.current = Date.now();

      // Go Live is the trigger for the camera. The native preview becomes a
      // full-screen camera view and is the exact same RootEncoder output sent
      // to YouTube.
      setIsNativeCompositedStreaming(true);
      setIsLivePreviewFullscreen(true);

      // The plugin creates the TextureView asynchronously. Put it full-screen
      // after the native stream has been created, then keep it synced.
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await NativeStreaming.setPreviewFullscreen({ fullscreen: true });
      await syncNativePreview(true);

      addLog(
        `Native ${streamConfig.protocol} publishing started. Android preview and YouTube now use the same native camera + ticker output.`
      );
      return;
    }

    // WebRTC continues to use the WHIP endpoint.
    if (streamConfig.protocol === 'WebRTC') {
      const whipEndpoint = endpoint;

      if (!/^https?:\/\//i.test(whipEndpoint) || /YOUR-SERVER/i.test(whipEndpoint)) {
        throw new Error(
          'Set a real WHIP endpoint first. Example: https://your-server:8889/stream/whip'
        );
      }

      if (!window.RTCPeerConnection) {
        throw new Error('This Android WebView does not support WebRTC publishing.');
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Live preview canvas is not ready.');
      }

      const videoStream = canvas.captureStream(streamConfig.fps);
      const publishStream = new MediaStream(videoStream.getVideoTracks());

      const cameraStream = videoRef.current?.srcObject as MediaStream | null;
      const microphoneTrack = cameraStream?.getAudioTracks()[0];

      if (microphoneTrack && !isMuted) {
        publishStream.addTrack(microphoneTrack);
      } else {
        const silentTrack = createSilentAudioTrack();
        if (silentTrack) publishStream.addTrack(silentTrack);
      }

      if (publishStream.getVideoTracks().length === 0) {
        throw new Error('No video track is available for publishing.');
      }

      const pc = new RTCPeerConnection();
      publisherPcRef.current = pc;
      publisherStreamRef.current = publishStream;

      pc.onconnectionstatechange = () => {
        addLog(`WebRTC connection state: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setStreamStats((prev) => ({
            ...prev,
            isStreaming: false,
            status: 'offline',
          }));
          setIsLivePreviewFullscreen(false);
        }
      };

      publishStream.getTracks().forEach((track) => pc.addTrack(track, publishStream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const localDescription = pc.localDescription;
      if (!localDescription?.sdp) {
        throw new Error('WebRTC offer could not be created.');
      }

      addLog(`Publishing to WHIP endpoint: ${whipEndpoint}`);

      const response = await fetch(whipEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: localDescription.sdp,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `WHIP server rejected the stream (${response.status}). ${body.slice(0, 180)}`
        );
      }

      const answerSdp = await response.text();
      const location = response.headers.get('Location');

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      publisherResourceUrlRef.current = location
        ? new URL(location, whipEndpoint).toString()
        : null;

      publishStartedAtRef.current = Date.now();
      addLog('Real WebRTC publishing session established.');
      addLog('The WHIP server is now receiving the rendered video and audio tracks.');
      return;
    }

    throw new Error(
      `${streamConfig.protocol} is not wired to a native publisher yet. RTMP/RTMPS use the Android NativeStreaming encoder; WebRTC uses WHIP.`
    );
  };

  const toggleGoLive = async () => {
    if (streamStats.isStreaming) {
      await stopRealPublisher();

      setStreamStats((prev) => ({
        ...prev,
        isStreaming: false,
        status: 'offline',
        duration: 0,
        viewerCount: 0,
        currentBitrate: 0,
        droppedFrames: 0,
        packetLoss: 0,
      }));

      setIsLivePreviewFullscreen(false);
      setChatMessages([]);
      addLog('Real publishing session stopped.');
      return;
    }

    setStreamStats((prev) => ({
      ...prev,
      isStreaming: true,
      status: 'connecting',
      viewerCount: 0,
    }));

    try {
      await startRealPublisher();

      if (streamConfig.protocol === 'RTMP' || streamConfig.protocol === 'RTMPS') {
        // Do not mark this LIVE yet. The native encoder must first receive
        // YouTube's successful RTMP/RTMPS connection callback.
        setStreamStats((prev) => ({
          ...prev,
          isStreaming: true,
          status: 'connecting',
          viewerCount: 0,
        }));
        addLog('Native encoder started. Waiting for the YouTube connection callback...');
      } else {
        setStreamStats((prev) => ({
          ...prev,
          isStreaming: true,
          status: 'live',
          viewerCount: 0,
        }));
        addLog('LIVE: media is being published to the configured WHIP server.');
      }
    } catch (err: any) {
      console.error(err);
      await stopRealPublisher();

      const message =
        err?.message || 'Unable to establish the real streaming connection.';

      setStreamStats((prev) => ({
        ...prev,
        isStreaming: false,
        status: 'offline',
        viewerCount: 0,
      }));

      addLog(`STREAM START FAILED: ${message}`);
      setCamError(message);
    }
  };

  // Handle user post message submissions
  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userComment.trim()) return;

    const myMsg: ChatMessage = {
      id: 'usr_' + Math.random().toString(36).substring(2, 7),
      user: 'Me (Broadcaster)',
      avatarColor: 'text-rose-500 font-semibold',
      message: userComment,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, myMsg]);
    setUserComment('');
    addLog(`User posted chat message: "${myMsg.message}"`);
  };

  // --- Core Loop Effects ---

  // Main Canvas Rendering frame tracker
  useEffect(() => {
    let animationId = 0;
    let startTime = Date.now();
    let lastTime = startTime;
    let frameCount = 0;
    let tickerOffset = 0;

    // Allocate lazy buffered canvasses
    if (!sourceCanvasRef.current) {
      sourceCanvasRef.current = document.createElement('canvas');
    }
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement('canvas');
    }

    // Initialize drop list particles
    initRenderer(640);

    const renderLoop = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationId = requestAnimationFrame(renderLoop);
        return;
      }

      // Studio output is fixed to landscape 16:9.
      const width = 640;
      const height = 360;

      // Match canvas coordinate boundaries
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const sourceCanvas = sourceCanvasRef.current!;
      if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
        sourceCanvas.width = width;
        sourceCanvas.height = height;
      }
      const bgCanvas = bgCanvasRef.current!;
      if (bgCanvas.width !== width || bgCanvas.height !== height) {
        bgCanvas.width = width;
        bgCanvas.height = height;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      const bgCtx = bgCanvas.getContext('2d');

      if (!ctx || !sCtx || !bgCtx) {
        animationId = requestAnimationFrame(renderLoop);
        return;
      }

      const now = Date.now();
      const elapsedSecs = (now - startTime) / 1000;
      const delta = now - lastTime;
      lastTime = now;

      // Track relative FPS measurements
      frameCount++;
      if (delta > 0 && frameCount % 12 === 0) {
        const liveFps = Math.round(1000 / delta);
        setStreamStats((s) => ({
          ...s,
          fps: s.isStreaming && s.status === 'live' 
            ? Math.min(streamConfig.fps, liveFps) 
            : Math.min(30, liveFps),
        }));
      }

      // Audio frequency polling measurements
      let micLevel = 5;
      if (feedSource === 'webcam' && analyserRef.current && !isMuted) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        micLevel = Math.max(5, Math.round((sum / dataArray.length) * (150 / 255)));
        setLiveAudioVol(micLevel);
      } else if (isMuted) {
        micLevel = 0;
        setLiveAudioVol(0);
      } else {
        // Mock presenter audio oscillations peaks
        const pulsing = Math.abs(Math.sin(elapsedSecs * 3)) * 40;
        const chatter = Math.sin(elapsedSecs * 15) * 15;
        micLevel = Math.max(5, Math.ceil(pulsing + chatter + (Math.random() * 10)));
        setLiveAudioVol(Math.min(100, micLevel));
      }

      // Step 1: Draw presenter into hidden source buffer
      if (feedSource === 'webcam' && videoRef.current && hasCamAccess) {
        sCtx.drawImage(videoRef.current, 0, 0, width, height);
      } else {
        drawVirtualPresenter(
          sCtx,
          width,
          height,
          chromaConfig.colorType,
          chromaConfig.customColor,
          micLevel,
          elapsedSecs
        );
      }

      // Step 2: Draw background into hidden back buffer
      drawBackground(
        bgCtx,
        width,
        height,
        chromaConfig.bgType,
        elapsedSecs,
        chromaConfig.bgSolidColor,
        chromaConfig.bgImageUrl
      );

      // Step 3: Run the pixel shader color threshold filter (chroma keyer)
      applyChromaKey(sCtx, bgCtx, ctx, width, height, chromaConfig);

      // Step 4: Write logo watermark on top of composite frames
      drawLogo(ctx, width, height, logoConfig);

      // Step 5: Render moving digital news ticker on bottom
      let scrollSpeed = 3.0;
      if (tickerConfig.speed === 'slow') scrollSpeed = 1.5;
      else if (tickerConfig.speed === 'fast') scrollSpeed = 5.0;
      
      tickerOffset += scrollSpeed;
      drawTicker(ctx, width, height, tickerConfig, tickerOffset);

      animationId = requestAnimationFrame(renderLoop);
    };

    animationId = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [feedSource, hasCamAccess, isMuted, chromaConfig, logoConfig, tickerConfig, streamConfig.fps]);

  // Real publisher telemetry. These values come from RTCPeerConnection.getStats().
  useEffect(() => {
    if (streamStats.status !== 'live') {
      setBitrateHistory(Array(20).fill(0));
      return;
    }

    const statInterval = setInterval(async () => {
      const pc = publisherPcRef.current;
      if (!pc) return;

      try {
        const stats = await pc.getStats();
        let bytesSent = 0;
        let packetsLost = 0;
        let packetsSent = 0;
        let measuredFps = streamConfig.fps;
        let measuredAudioLevel = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp') {
            bytesSent += report.bytesSent ?? 0;
            packetsSent += report.packetsSent ?? 0;
            packetsLost += report.packetsLost ?? 0;

            if (report.kind === 'video' || report.mediaType === 'video') {
              measuredFps = report.framesPerSecond ?? measuredFps;
            }
          }

          if (report.type === 'media-source' && report.kind === 'audio') {
            measuredAudioLevel = Math.round((report.audioLevel ?? 0) * 100);
          }
        });

        const now = Date.now();
        const previousAt = previousStatsAtRef.current;
        const previousBytes = previousBytesSentRef.current;

        let currentBitrate = 0;
        if (previousAt !== null && now > previousAt) {
          currentBitrate =
            ((bytesSent - previousBytes) * 8) / ((now - previousAt) / 1000) / 1000;
        }

        previousStatsAtRef.current = now;
        previousBytesSentRef.current = bytesSent;

        const loss =
          packetsSent > 0
            ? (packetsLost / (packetsSent + packetsLost)) * 100
            : 0;

        const duration = publishStartedAtRef.current
          ? Math.floor((now - publishStartedAtRef.current) / 1000)
          : 0;

        setStreamStats((prev) => ({
          ...prev,
          duration,
          currentBitrate: Math.max(0, currentBitrate),
          fps: Math.round(measuredFps),
          audioLevel: measuredAudioLevel,
          packetLoss: loss,
        }));

        setBitrateHistory((history) => [
          ...history.slice(1),
          Math.max(0, currentBitrate),
        ]);
      } catch (error) {
        console.warn('Unable to read WebRTC publishing stats:', error);
      }
    }, 1000);

    return () => clearInterval(statInterval);
  }, [streamStats.status, streamConfig.fps]);

  // Always close the real publisher if the component is unmounted.
  useEffect(() => {
    return () => {
      void stopRealPublisher();
    };
  }, []);

  // Auto-scroll chat boxes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (accessStatus !== 'granted') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-7 shadow-2xl">
          <div className="text-center mb-7">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-xl font-bold">SF</div>
            <h1 className="text-2xl font-bold">StreamFlow Studio</h1>
            <p className="mt-2 text-sm text-zinc-400">Access is required to use the streaming studio.</p>
          </div>

          <div className="rounded-xl bg-black/40 p-4 mb-5">
            <p className="text-xs text-zinc-500">Access owner</p>
            <p className="mt-1 text-sm font-medium">srihemanth4787@gmail.com</p>
          </div>

          {accessStatus === 'otp' ? (
            <>
              <label className="block text-sm text-zinc-300 mb-2">Enter OTP</label>
              <input
                value={accessOtp}
                onChange={(e) => setAccessOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit OTP"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none focus:border-red-500"
              />
              <button onClick={verifyAccess} className="mt-4 w-full rounded-xl bg-red-600 py-3 font-semibold active:scale-[0.98]">Verify & Continue</button>
              <button onClick={requestAccess} className="mt-3 w-full rounded-xl border border-zinc-700 py-3 text-sm text-zinc-300">Request New OTP</button>
            </>
          ) : (
            <button
              onClick={requestAccess}
              disabled={accessStatus === 'requesting' || accessStatus === 'checking'}
              className="w-full rounded-xl bg-red-600 py-3 font-semibold disabled:opacity-50"
            >
              {accessStatus === 'requesting' ? 'Sending OTP...' : accessStatus === 'checking' ? 'Checking access...' : 'Request Access'}
            </button>
          )}

          {accessMessage && <p className="mt-4 text-center text-sm text-emerald-400">{accessMessage}</p>}
          {accessError && <p className="mt-4 text-center text-sm text-red-400">{accessError}</p>}

          <p className="mt-6 text-center text-xs text-zinc-600">Device ID: {deviceId.slice(0, 8)}...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="main-studio-root" className="min-h-screen bg-black text-white font-sans flex flex-col selection:bg-red-650 selection:text-white antialiased relative overflow-x-hidden pb-8">
      
      {/* Background design grids */}
      <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      {/* Camera device invisible connector */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* 1. Header Navigation - Bento Theme */}
      <header id="studio-header" className="mx-4 md:mx-6 mt-6 mb-2 bg-zinc-900/50 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 flex flex-col md:flex-row gap-4 items-center justify-between relative z-10 transition-all shadow-md">
        <div className="flex items-center space-x-3 self-start md:self-auto">
          <div className="h-9 w-9 bg-zinc-805 rounded-xl border border-zinc-700/60 flex items-center justify-center shadow shadow-black">
            <Radio className="h-4.5 w-4.5 text-red-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
              StreamFlow Studio
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase font-bold mt-0.5">ENCODER KERNEL v2.5 • PORT: 3000</p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div id="stat-indicator-bar" className="flex flex-wrap items-center gap-2.5 bg-zinc-950/40 border border-zinc-800/40 px-3.5 py-2 rounded-2xl">
          <div className="flex items-center space-x-2">
            {streamStats.status === 'live' ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                <span className="font-mono text-xs font-bold tracking-wider text-red-500 uppercase">
                  LIVE: {Math.floor(streamStats.duration / 60).toString().padStart(2, '0')}:{(streamStats.duration % 60).toString().padStart(2, '0')}
                </span>
              </>
            ) : streamStats.status === 'connecting' ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
                <span className="font-mono text-xs font-bold tracking-wider text-yellow-500 uppercase">CONNECTING...</span>
              </>
            ) : (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <span className="font-mono text-xs font-bold tracking-wider text-zinc-500 uppercase">STANDBY</span>
              </>
            )}
          </div>

          <div className="h-3 w-px bg-zinc-800" />

          <div className="text-zinc-400 text-xs font-mono flex items-center gap-1.5">
            <span className="text-zinc-505 text-[10px] uppercase font-bold">Res:</span>
            <span>{streamConfig.resolution.width}x{streamConfig.resolution.height}</span>
            <span className="text-zinc-650">•</span>
            <span>{streamConfig.fps}fps</span>
            <span className="text-zinc-650">•</span>
            <span className="text-[#06b6d4]">{(streamStats.currentBitrate / 1000).toFixed(1)} Mbps</span>
          </div>
        </div>

        {/* Dropped frames & transport carrier settings indicator */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end shrink-0">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Dropped Frames</span>
            <span className="text-xs font-mono font-bold text-zinc-300">{streamStats.droppedFrames} ({streamStats.packetLoss.toFixed(1)}%)</span>
          </div>
          <div className="flex items-center space-x-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-400 select-none">
            <Wifi className="h-3 w-3 text-emerald-400" />
            <span>NET: {networkCondition.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* Mobile/Desktop page navigation */}
      <nav className="mx-4 md:mx-6 mt-2 mb-2 relative z-10 flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-1.5">
        <button
          onClick={async () => {
            setActivePage('studio');

            // If the native RTMP/RTMPS stream is still live, restore its
            // fullscreen Android camera preview without restarting the stream.
            if (Capacitor.isNativePlatform() && isNativeCompositedStreaming && streamStats.status === 'live') {
              setIsLivePreviewFullscreen(true);
              try {
                await NativeStreaming.setPreviewFullscreen({ fullscreen: true });
                await NativeStreaming.setPreviewVisible({ visible: true });
              } catch (error) {
                console.warn('Could not restore native fullscreen preview:', error);
              }
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activePage === 'studio'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          1. Studio
        </button>
        <button
          onClick={async () => {
            setActivePage('controls');
            setIsLivePreviewFullscreen(false);

            // Hide only the Android native preview. Do NOT stop the stream.
            if (Capacitor.isNativePlatform() && isNativeCompositedStreaming) {
              try {
                await NativeStreaming.setPreviewVisible({ visible: false });
                await NativeStreaming.setPreviewFullscreen({ fullscreen: false });
              } catch (error) {
                console.warn('Could not hide native preview for Controls & Analytics:', error);
              }
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activePage === 'controls'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          2. Controls & Analytics
        </button>
      </nav>

      {/* 2. Main Studio Dashboard Workspace */}
      <main id="studio-core-workspace" className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10 items-start">
        
        {/* Page 1: Studio preview, source controls, and Go Live */}
        {activePage === 'studio' && (
          <section id="device-view-section" className="lg:col-span-12 xl:col-span-12 flex flex-col gap-4 w-full">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 md:p-6 flex flex-col justify-start overflow-hidden relative shadow-xl shadow-black">
            
            {/* Grid background with subtle circles inside card */}
            <div className="absolute inset-0 bg-[radial-gradient(#18181b_1px,transparent_1px)] [background-size:12px_12px] opacity-45 pointer-events-none" />
            
            {/* Layout Head */}
            <div className="flex items-center justify-between mb-4 relative z-10 w-full">
              <div className="flex items-center space-x-2.5">
                <Smartphone className="h-4.5 w-4.5 text-[#06b6d4]" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
                  Stream Preview (16:9)
                </h3>
              </div>
            </div>

            {/* Live preview screen */}
            <div
              id="phone-device-wrapper"
              onPointerUp={(e) => {
                if (streamStats.status !== 'live') return;

                const now = Date.now();
                const timeSinceLastTap = now - lastPreviewTapRef.current;

                if (timeSinceLastTap > 0 && timeSinceLastTap < 350) {
                  e.preventDefault();
                  if (!isNativeCompositedStreaming) {
                    setIsLivePreviewFullscreen((prev) => !prev);
                  }
                  lastPreviewTapRef.current = 0;
                } else {
                  lastPreviewTapRef.current = now;
                }
              }}
              role={streamStats.status === 'live' ? 'button' : undefined}
              aria-label={
                streamStats.status === 'live'
                  ? isLivePreviewFullscreen
                    ? 'Live preview full screen'
                    : 'Open live preview full screen'
                  : undefined
              }
              className={`relative touch-manipulation transition-all duration-300 ease-out flex items-center justify-center shrink-0 overflow-hidden ${
                isLivePreviewFullscreen
                  ? 'fixed inset-0 z-[100] w-screen h-[100dvh] max-w-none m-0 rounded-none bg-black cursor-pointer'
                  : `mx-auto mt-0 mb-4 w-full max-w-[580px] aspect-[16/9] ${streamStats.status === 'live' ? 'cursor-pointer touch-manipulation' : ''}`
              }`}
            >
              <div
                className={`absolute inset-0 bg-black overflow-hidden flex items-center justify-center ${
                  isLivePreviewFullscreen
                    ? 'rounded-none border-0 shadow-none ring-0'
                    : 'rounded-[40px] border-[10px] border-zinc-850/90 shadow-2xl shadow-black/85 ring-1 ring-zinc-750/35'
                }`}
              >
                {/* Final Composite output canvas */}
                <canvas
                  id="composite-canvas-output"
                  ref={canvasRef}
                  className={`w-full h-full bg-black relative ${isNativeCompositedStreaming ? 'hidden' : 'object-cover'}`}
                />

                {/* Camera switch control.
                    On Android the native TextureView is above this React layer,
                    so the actual tappable switch control is provided by the
                    NativeStreaming camera overlay when the native camera is active. */}
                {!isNativeCompositedStreaming && feedSource === 'webcam' && hasCamAccess && (
                  <button
                    id="camera-switch-preview-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void switchCamera();
                    }}
                    className="absolute bottom-4 right-4 z-30 h-12 w-12 rounded-full bg-black/70 border border-white/20 text-white flex items-center justify-center shadow-xl backdrop-blur-md hover:bg-black/85 active:scale-95 transition-all cursor-pointer"
                    aria-label={`Switch to ${cameraFacingMode === 'environment' ? 'front' : 'back'} camera`}
                    title="Switch Camera"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                )}

                {/* During native RTMP/RTMPS the React canvas is hidden.
                    The Android TextureView above it is the exact RootEncoder output sent to YouTube. */}
                {!isNativeCompositedStreaming && (
                  <div className={`absolute top-2 px-6 left-0 right-0 z-20 flex justify-between text-[8px] text-zinc-400 font-mono tracking-wider pointer-events-none uppercase ${
                    isLivePreviewFullscreen ? 'pt-2' : ''
                  }`}>
                    <span>LIVE HUD ENCODER</span>
                    <span>5G CARRIER ROUTING</span>
                  </div>
                )}


              </div>
            </div>


          </div>

          {/* Camera source selector */}
          <div className="grid grid-cols-1 gap-4">
            
            {/* CAMERA SOURCE */}
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col justify-between shadow-md">
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase block mb-1">
                  1. Camera Source
                </span>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Use the device camera as the live video source.
                </p>
              </div>

              <div id="source-toggle-actions" className="flex flex-col space-y-2 mt-auto">
                <button
                  id="source-webcam-btn"
                  onClick={() => toggleFeedSource('webcam')}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer border transition-all ${
                    feedSource === 'webcam'
                      ? 'bg-zinc-100 text-black border-zinc-100 font-extrabold shadow-md'
                      : 'bg-zinc-950 text-zinc-500 border-zinc-850 hover:bg-zinc-900 hover:text-zinc-300'
                  }`}
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>📷 Camera Device</span>
                </button>

                {feedSource === 'webcam' && (
                  <div className="text-[9.5px] font-mono text-zinc-400 flex items-center justify-between mt-1 bg-zinc-950 p-2 rounded-xl border border-zinc-850 gap-2">
                    <span className="text-emerald-405 font-semibold uppercase tracking-wider">
                      ● {cameraFacingMode === 'environment' ? 'BACK' : 'FRONT'} CAM ACTIVE
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={switchCamera}
                        className="text-[#06b6d4] hover:text-cyan-400 transition-colors uppercase font-bold cursor-pointer"
                      >
                        ↻ Switch Camera
                      </button>

                      <button
                        onClick={stopWebcam}
                        className="text-[#06b6d4] hover:text-cyan-400 transition-colors uppercase font-bold cursor-pointer"
                      >
                        Release
                      </button>
                    </div>
                  </div>
                )}

                {camError && !isNativeCompositedStreaming && (
                  <div className="text-[11px] font-mono text-rose-500 bg-rose-950/20 border border-rose-900/50 p-2 rounded-lg flex items-center space-x-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{camError}</span>
                  </div>
                )}
              </div>
            </div>

          </div>
          </section>
        )}

        {/* Page 2: Advanced configuration */}
        {activePage === 'controls' && (
          <section id="config-deck-section" className="lg:col-span-12 xl:col-span-12 flex flex-col space-y-4">

          {/* Return to the live native camera without stopping the stream. */}
          {Capacitor.isNativePlatform() && isNativeCompositedStreaming && streamStats.status === 'live' && (
            <button
              id="back-to-live-camera-btn"
              onClick={async () => {
                setActivePage('studio');
                setIsLivePreviewFullscreen(true);

                try {
                  await NativeStreaming.setPreviewFullscreen({ fullscreen: true });
                  await NativeStreaming.setPreviewVisible({ visible: true });
                } catch (error) {
                  console.warn('Could not restore native fullscreen camera:', error);
                }

                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-rose-600/50 bg-rose-600/15 px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-600 hover:text-white transition-all cursor-pointer shadow-lg shadow-rose-950/20"
            >
              <Video className="h-4 w-4" />
              <span>Back to Live Camera</span>
            </button>
          )}

          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex flex-col min-h-[580px] lg:min-h-[640px]">
            
            {/* Control Panel Tab buttons */}
            <div id="control-tabs-panel" className="flex border-b border-neutral-800 pb-3 mb-4 space-x-1 bg-neutral-950/50 p-1 rounded-xl">
              <button
                id="tab-chroma-trigger"
                onClick={() => setActiveTab('chroma')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer transition-colors ${
                  activeTab === 'chroma'
                    ? 'bg-neutral-900 text-white border border-neutral-800/80 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span>Chroma Key</span>
              </button>

              <button
                id="tab-overlays-trigger"
                onClick={() => setActiveTab('overlays')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer transition-colors ${
                  activeTab === 'overlays'
                    ? 'bg-neutral-900 text-white border border-neutral-800/80 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                <span>Logo & Ticker</span>
              </button>

              <button
                id="tab-network-trigger"
                onClick={() => setActiveTab('network')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer transition-colors ${
                  activeTab === 'network'
                    ? 'bg-neutral-900 text-white border border-neutral-800/80 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Tv className="h-3.5 w-3.5 text-violet-400" />
                <span>Bitrate & Protocol</span>
              </button>
            </div>

            {/* TAB CONTENT CONTAINER */}
            <div className="flex-1 overflow-y-auto pr-1">
              
              {/* TAB 1: COLOR KEY CHROMA KEYER */}
              {activeTab === 'chroma' && (
                <div id="tab-chroma-content" className="space-y-5 animate-fade-in">
                  
                  {/* Chroma key Master Switcher */}
                  <div className="bg-neutral-950/80 p-4 rounded-xl border border-neutral-900/60 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-200">CHROMA KEY MATRIX FILTER</h3>
                      <p className="text-[11px] text-neutral-400 mt-0.5">Filter out flat colored backdrops dynamically in the canvas</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={chromaConfig.enabled}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setChromaConfig((prev) => ({ ...prev, enabled: val }));
                          addLog(val ? 'Chroma-keyer matrix engine ENABLED.' : 'Chroma-keyer matrix engine DISABLED.');
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-neutral-100" />
                    </label>
                  </div>

                  {chromaConfig.enabled && (
                    <div className="space-y-4 p-4 bg-neutral-950/40 rounded-xl border border-neutral-900 relative">
                      
                      {/* Step A: Color Key Target Pin */}
                      <div>
                        <span className="text-[10px] font-mono text-neutral-400 tracking-wider">STEP 1: SELECT CHROMA COLOR KEY</span>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, colorType: 'green' }));
                              addLog('Key color focused on: GREEN (#00FF00)');
                            }}
                            className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                              chromaConfig.colorType === 'green'
                                ? 'bg-emerald-950 border-emerald-500 text-emerald-400 font-bold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🟢 Green
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, colorType: 'blue' }));
                              addLog('Key color focused on: BLUE (#0000FF)');
                            }}
                            className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                              chromaConfig.colorType === 'blue'
                                ? 'bg-blue-950 border-blue-500 text-blue-400 font-bold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🔵 Blue
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, colorType: 'magenta' }));
                              addLog('Key color focused on: MAGENTA (#FF00FF)');
                            }}
                            className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                              chromaConfig.colorType === 'magenta'
                                ? 'bg-pink-950 border-pink-500 text-pink-400 font-bold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🟣 Magenta
                          </button>
                          
                          {/* Custom Color Selector Picker */}
                          <div className="relative">
                            <input
                              type="color"
                              value={chromaConfig.customColor}
                              onChange={(e) => {
                                setChromaConfig((prev) => ({ ...prev, colorType: 'custom', customColor: e.target.value }));
                              }}
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            />
                            <button
                              className={`py-1.5 w-full rounded-lg border text-[11px] font-medium transition-colors cursor-pointer truncate ${
                                chromaConfig.colorType === 'custom'
                                  ? 'bg-rose-950 border-rose-500 text-rose-400 font-bold'
                                  : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                              }`}
                            >
                              🎨 Custom
                            </button>
                          </div>
                        </div>

                        {chromaConfig.colorType === 'custom' && (
                          <div className="mt-2 text-right">
                            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 p-1 rounded-sm border border-neutral-900">
                              Selected HEX: <span className="text-rose-400 font-semibold">{chromaConfig.customColor}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Step B: Filter Tolerance Controls */}
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-[10px] text-neutral-400 font-mono mb-1">
                            <span>COLOR KEY TOLERANCE</span>
                            <span className="text-emerald-400 font-bold">{chromaConfig.tolerance}</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="180"
                            value={chromaConfig.tolerance}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setChromaConfig((prev) => ({ ...prev, tolerance: v }));
                            }}
                            className="w-full accent-rose-600 h-1.5 bg-neutral-900 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] text-neutral-400 font-mono mb-1">
                            <span>EDGE SMOOTHING (FEATHERING)</span>
                            <span className="text-emerald-400 font-bold">{chromaConfig.smoothing}</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="80"
                            value={chromaConfig.smoothing}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setChromaConfig((prev) => ({ ...prev, smoothing: v }));
                            }}
                            className="w-full accent-rose-600 h-1.5 bg-neutral-900 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Step C: Backdrop Picker Presets */}
                      <div className="border-t border-neutral-900 pt-3">
                        <span className="text-[10px] font-mono text-neutral-400 tracking-wider">STEP 2: REPLACE BACKGROUND (CHROMA SPACE)</span>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, bgType: 'nature' }));
                              addLog('Switched chroma scene environment to SUNSET PEAKS');
                            }}
                            className={`py-1 px-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-left truncate ${
                              chromaConfig.bgType === 'nature'
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-semibold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🌄 Sunset Peaks
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, bgType: 'matrix' }));
                              addLog('Switched chroma scene environment to DIGITAL MATRIX');
                            }}
                            className={`py-1 px-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-left truncate ${
                              chromaConfig.bgType === 'matrix'
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-semibold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            💻 Matrix Rain
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, bgType: 'neon' }));
                              addLog('Switched chroma scene environment to RETRO GRID');
                            }}
                            className={`py-1 px-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-left truncate ${
                              chromaConfig.bgType === 'neon'
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-semibold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🏁 Retro Grid
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, bgType: 'city' }));
                              addLog('Switched chroma scene environment to NEON CYBER WAVES');
                            }}
                            className={`py-1 px-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-left truncate ${
                              chromaConfig.bgType === 'city'
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-semibold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            ⚡ Laser Waves
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, bgType: 'cozy' }));
                              addLog('Switched chroma scene environment to RADIAL SPOTLIGHT');
                            }}
                            className={`py-1 px-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-left truncate ${
                              chromaConfig.bgType === 'cozy'
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-semibold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🛋️ Cozy Spotlight
                          </button>
                          <button
                            onClick={() => {
                              setChromaConfig((prev) => ({ ...prev, bgType: 'solid' }));
                              addLog('Switched chroma scene environment to SOLID COLOR');
                            }}
                            className={`py-1 px-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-left truncate ${
                              chromaConfig.bgType === 'solid'
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-semibold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            🎨 Solid Color
                          </button>
                        </div>

                        {chromaConfig.bgType === 'solid' && (
                          <div className="mt-3 flex items-center justify-between p-2 bg-neutral-950 rounded-lg border border-neutral-900 text-xs">
                            <span className="text-neutral-400 text-[11px]">Solid Backplate HEX:</span>
                            <div className="flex items-center space-x-1.5">
                              <input
                                type="color"
                                value={chromaConfig.bgSolidColor}
                                onChange={(e) => {
                                  setChromaConfig((prev) => ({ ...prev, bgSolidColor: e.target.value }));
                                }}
                                className="h-5 w-5 rounded cursor-pointer border-0 p-0"
                              />
                              <span className="font-mono text-neutral-300 text-[11px]">{chromaConfig.bgSolidColor}</span>
                            </div>
                          </div>
                        )}

                        {/* Custom Image File Upload Area */}
                        <div className="mt-3">
                          <div className="relative border border-dashed border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-neutral-950/40 transition-colors">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleBgUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex items-center space-x-2">
                              <Upload className="h-4 w-4 text-neutral-400" />
                              <div className="text-left">
                                <span className="text-xs text-neutral-300 block font-medium">Upload custom backplate</span>
                                <span className="text-[10px] text-neutral-500 block">PNG, JPG formats supported</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: OVERLAYS AND BRANDING (LOGO & TICKER) */}
              {activeTab === 'overlays' && (
                <div id="tab-overlays-content" className="space-y-6 animate-fade-in">
                  
                  {/* LOGO INSERTION DECK */}
                  <div className="space-y-4 p-4 bg-neutral-950/40 rounded-xl border border-neutral-900">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                      <div className="flex items-center space-x-2">
                        <Layers className="h-4 w-4 text-cyan-400" />
                        <h3 className="text-xs font-bold tracking-wide">1. BRANDED LOGO WATERMARK</h3>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={logoConfig.enabled}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setLogoConfig((prev) => ({ ...prev, enabled: val }));
                            addLog(val ? 'Logo watermark overlay ENABLED.' : 'Logo watermark overlay DISABLED.');
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-600 peer-checked:after:bg-neutral-100" />
                      </label>
                    </div>

                    {logoConfig.enabled && (
                      <div className="space-y-3 pt-1">
                        
                        {/* Custom Logo upload input */}
                        <div className="relative border border-dashed border-neutral-800 rounded-xl px-3 py-2 flex items-center justify-between hover:bg-neutral-950/40 transition-colors">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="flex items-center space-x-2">
                            <Upload className="h-3.5 w-3.5 text-neutral-400" />
                            <span className="text-[11px] text-neutral-300 font-medium truncate">
                              {logoConfig.preset === 'custom' ? 'Custom watermark active' : 'Upload PNG/GIF custom transparency logo'}
                            </span>
                          </div>
                        </div>

                        {/* Watermark Positions, Scale, and Alpha opacity sliders */}
                        <div className="space-y-3 pt-2">
                          
                          <div>
                            <span className="text-[10px] font-mono text-neutral-400 block mb-1.5">SCREEN WATERMARK OVERLAY POSITION</span>
                            <div className="grid grid-cols-4 gap-1.5 bg-neutral-950 p-1.5 rounded-lg border border-neutral-900">
                              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as LogoPositionType[]).map((pos) => (
                                <button
                                  key={pos}
                                  onClick={() => {
                                    setLogoConfig((p) => ({ ...p, position: pos }));
                                    addLog(`Moved stream logo overlay position to: ${pos}`);
                                  }}
                                  className={`py-1.5 text-[9px] font-semibold uppercase rounded-md transition-all cursor-pointer ${
                                    logoConfig.position === pos
                                      ? 'bg-neutral-800 text-white border border-neutral-700'
                                      : 'text-neutral-500 hover:text-neutral-300'
                                  }`}
                                >
                                  {pos.replace('-', ' ')}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Free X/Y logo placement */}
                          <div className="grid grid-cols-2 gap-4 pt-1">
                            <div>
                              <div className="flex justify-between text-[10px] text-neutral-400 font-mono mb-1">
                                <span>Logo X Position</span>
                                <span className="font-bold">{logoX}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={logoX}
                                onChange={(e) => {
                                  const x = parseInt(e.target.value, 10);
                                  setLogoX(x);
                                  addLog(`Logo X position: ${x}%`);
                                }}
                                className="w-full h-1 bg-neutral-900 rounded accent-cyan-500 cursor-pointer"
                              />
                              <div className="flex justify-between text-[8px] text-neutral-600 font-mono mt-1">
                                <span>LEFT 0%</span>
                                <span>RIGHT 100%</span>
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[10px] text-neutral-400 font-mono mb-1">
                                <span>Logo Y Position</span>
                                <span className="font-bold">{logoY}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={logoY}
                                onChange={(e) => {
                                  const y = parseInt(e.target.value, 10);
                                  setLogoY(y);
                                  addLog(`Logo Y position: ${y}%`);
                                }}
                                className="w-full h-1 bg-neutral-900 rounded accent-cyan-500 cursor-pointer"
                              />
                              <div className="flex justify-between text-[8px] text-neutral-600 font-mono mt-1">
                                <span>TOP 0%</span>
                                <span>BOTTOM 100%</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="flex justify-between text-[10px] text-neutral-400 font-mono mb-1">
                                <span>Logo Scale %</span>
                                <span className="font-bold">{logoConfig.size}%</span>
                              </div>
                              <input
                                type="range"
                                min="8"
                                max="35"
                                value={logoConfig.size}
                                onChange={(e) => {
                                  const s = parseInt(e.target.value);
                                  setLogoConfig((p) => ({ ...p, size: s }));
                                }}
                                className="w-full h-1 h-1 bg-neutral-900 rounded accent-cyan-500 cursor-pointer"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[10px] text-neutral-400 font-mono mb-1">
                                <span>Logo Opacity</span>
                                <span className="font-bold">{logoConfig.opacity}</span>
                              </div>
                              <input
                                type="range"
                                min="0.2"
                                max="1.0"
                                step="0.05"
                                value={logoConfig.opacity}
                                onChange={(e) => {
                                  const o = parseFloat(e.target.value);
                                  setLogoConfig((p) => ({ ...p, opacity: o }));
                                }}
                                className="w-full h-1 bg-neutral-900 rounded accent-cyan-500 cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                  {/* NEWS TICKER BANNER DECK */}
                  <div className="space-y-4 p-4 bg-neutral-950/40 rounded-xl border border-neutral-900">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                      <div className="flex items-center space-x-2">
                        <Type className="h-4 w-4 text-rose-400" />
                        <h3 className="text-xs font-bold tracking-wide">2. BOTTOM SCROLLING TICKER MARQUEE</h3>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={tickerConfig.enabled}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setTickerConfig((prev) => ({ ...prev, enabled: val }));
                            addLog(val ? 'Scrolling bottom news ticker ENABLED.' : 'Scrolling bottom news ticker DISABLED.');
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-rose-600 peer-checked:after:bg-neutral-100" />
                      </label>
                    </div>

                    {tickerConfig.enabled && (
                      <div className="space-y-3 pt-1">
                        
                        {/* Custom ticker header editor */}
                        <div>
                          <label className="text-[10px] font-mono text-neutral-400 block mb-1">TICKER HEADER</label>
                          <input
                            type="text"
                            value={tickerHeader}
                            onChange={(e) => {
                              setTickerHeader(e.target.value.slice(0, 24));
                            }}
                            maxLength={24}
                            placeholder="TICKER INDIA"
                            className="w-full bg-neutral-950 p-2 text-xs rounded-xl border border-neutral-850 focus:outline-none focus:border-rose-500 text-neutral-200 font-sans"
                          />
                          <span className="text-[9px] font-mono text-neutral-600 block mt-1">This fixed label appears on the streamed camera ticker.</span>
                        </div>

                        {/* Custom marquee message editor */}
                        <div>
                          <label className="text-[10px] font-mono text-neutral-400 block mb-1">EDIT TICKER RUNNING NEWS</label>
                          <textarea
                            value={tickerConfig.text}
                            onChange={(e) => {
                              setTickerConfig((prev) => ({ ...prev, text: e.target.value }));
                            }}
                            rows={2}
                            maxLength={350}
                            placeholder="Type news marquee headlines here..."
                            className="w-full bg-neutral-950 p-2 text-xs rounded-xl border border-neutral-850 focus:outline-none focus:border-rose-500 text-neutral-200 resize-none font-sans"
                          />
                        </div>

                        {/* Scroll speeds, colors */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] font-mono text-neutral-400 block mb-1">SCROLL SPEED</span>
                            <div className="grid grid-cols-3 gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-900">
                              {(['slow', 'medium', 'fast'] as const).map((spd) => (
                                <button
                                  key={spd}
                                  onClick={() => {
                                    setTickerConfig((prev) => ({ ...prev, speed: spd }));
                                    addLog(`Changed marquee flow speed preset: ${spd}`);
                                  }}
                                  className={`py-1 text-[9px] font-semibold uppercase rounded-md cursor-pointer transition-all ${
                                    tickerConfig.speed === spd
                                      ? 'bg-neutral-800 text-white'
                                      : 'text-neutral-500 hover:text-neutral-400'
                                  }`}
                                >
                                  {spd}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] font-mono text-neutral-400 block mb-1.5">TICKER GLOW FILL</span>
                            <div className="flex items-center gap-2 bg-neutral-950 py-1.5 px-2.5 rounded-lg border border-neutral-900">
                              <label
                                className="relative h-7 w-7 shrink-0 rounded-md overflow-hidden cursor-pointer border border-neutral-700"
                                title="Choose ticker background color"
                              >
                                <input
                                  type="color"
                                  value={tickerConfig.bgColor}
                                  onChange={(e) => {
                                    const color = e.target.value;
                                    setTickerConfig((prev) => ({ ...prev, bgColor: color }));
                                    addLog(`Ticker background color changed to ${color}`);
                                  }}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                                <span
                                  className="absolute inset-0 pointer-events-none"
                                  style={{ backgroundColor: tickerConfig.bgColor }}
                                />
                              </label>

                              <input
                                type="text"
                                value={tickerConfig.bgColor}
                                maxLength={7}
                                spellCheck={false}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                                    setTickerConfig((prev) => ({ ...prev, bgColor: value }));
                                  }
                                }}
                                onBlur={() => {
                                  if (!/^#[0-9A-Fa-f]{6}$/.test(tickerConfig.bgColor)) {
                                    setTickerConfig((prev) => ({ ...prev, bgColor: '#dc2626' }));
                                  }
                                }}
                                className="flex-1 min-w-0 bg-transparent text-neutral-200 font-mono text-[11px] outline-none"
                                placeholder="#dc2626"
                                aria-label="Ticker background color"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB 3: BITRATE & PROTOCOLS (SETTINGS) */}
              {activeTab === 'network' && (
                <div id="tab-network-content" className="space-y-5 animate-fade-in">
                  
                  {/* Protocol Selector Stack */}
                  <div className="space-y-3 p-4 bg-neutral-950/40 rounded-xl border border-neutral-900">
                    <div>
                      <span className="text-[10px] font-mono text-neutral-400 block mb-1">STREAM INGEST PROTOCOL (ENVELOPE CODELINS)</span>
                      
                      <div className="grid grid-cols-5 gap-1 bg-neutral-950 p-1.5 rounded-xl border border-neutral-900">
                        {(['RTMP', 'RTMPS', 'SRT', 'WebRTC', 'HLS'] as StreamProtocol[]).map((p) => (
                          <button
                            key={p}
                            onClick={() => handleProtocolChange(p)}
                            className={`py-2 text-[10px] font-black uppercase rounded-lg cursor-pointer transition-all ${
                              streamConfig.protocol === p
                                ? 'bg-rose-600 text-white shadow shadow-rose-950/55 scale-[1.03]'
                                : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Server URL inputs */}
                    <div className="grid grid-cols-1 gap-3 pt-1">
                      <div>
                        <label className="text-[9px] font-mono text-neutral-400 block mb-1">INGEST SERVER MANIFEST URL</label>
                        <input
                          type="text"
                          value={streamConfig.streamUrl}
                          onChange={(e) => {
                            setStreamConfig((prev) => ({ ...prev, streamUrl: e.target.value }));
                          }}
                          className="w-full bg-neutral-950 px-3 py-2 text-xs font-mono rounded-xl border border-neutral-850 focus:outline-none focus:border-rose-500 text-neutral-200"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-mono text-neutral-400">STREAM ACCESS KEY TOKEN</label>
                          <span className="text-[8px] font-mono text-rose-400">SECRET</span>
                        </div>
                        <input
                          type="password"
                          value={streamConfig.streamKey}
                          onChange={(e) => {
                            setStreamConfig((prev) => ({ ...prev, streamKey: e.target.value }));
                          }}
                          className="w-full bg-neutral-950 px-3 py-2 text-xs font-mono rounded-xl border border-neutral-850 focus:outline-none focus:border-rose-500 text-neutral-200"
                        />

                        <button
                          type="button"
                          onClick={toggleGoLive}
                          disabled={streamStats.status === 'connecting'}
                          className={`mt-3 w-full py-3 rounded-xl text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition-all ${
                            streamStats.status === 'live'
                              ? 'bg-neutral-50 border border-rose-600 text-rose-600'
                              : streamStats.status === 'connecting'
                                ? 'bg-amber-500 text-neutral-950 cursor-wait animate-pulse'
                                : 'bg-rose-600 hover:bg-rose-700 text-white'
                          }`}
                        >
                          <div
                            className={`h-2.5 w-2.5 rounded-full ${
                              streamStats.status === 'live'
                                ? 'bg-rose-600'
                                : 'bg-white'
                            }`}
                          />
                          <span>
                            {streamStats.status === 'live'
                              ? 'STOP LIVE'
                              : streamStats.status === 'connecting'
                                ? 'CONNECTING...'
                                : `GO LIVE — ${streamConfig.protocol}`}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quality Profiles, Framerate, & Bitrate sliders */}
                  <div className="space-y-4 p-4 bg-neutral-950/40 rounded-xl border border-neutral-900">
                    
                    <div>
                      <span className="text-[10px] font-mono text-neutral-400 block mb-2">STREAM QUALITY TARGET PROFILE</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['ultra', 'high', 'medium', 'low'] as StreamQuality[]).map((qObj) => (
                          <button
                            key={qObj}
                            onClick={() => handleQualityChange(qObj)}
                            className={`py-1.5 text-[10px] font-semibold uppercase rounded-lg border cursor-pointer transition-all ${
                              streamConfig.quality === qObj
                                ? 'bg-rose-950 border-rose-500 text-rose-400 font-bold'
                                : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-neutral-300'
                            }`}
                          >
                            {qObj}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Range sliders */}
                    <div className="space-y-3.5 border-t border-neutral-900 pt-3">
                      
                      <div>
                        <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono mb-1">
                          <span>STREAM ALLOCATED BITRATE</span>
                          <span className="text-rose-400 font-bold font-mono">
                            {streamConfig.bitrate} kbps ({ (streamConfig.bitrate / 1000).toFixed(1) } Mbps)
                          </span>
                        </div>
                        <input
                          type="range"
                          min="300"
                          max="10000"
                          step="100"
                          value={streamConfig.bitrate}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setStreamConfig((prev) => ({ ...prev, quality: 'custom', bitrate: val }));
                          }}
                          className="w-full accent-rose-600 h-1.5 bg-neutral-900 rounded-lg cursor-pointer"
                        />
                        <div className="flex justify-between text-[8px] font-mono text-neutral-500 mt-1">
                          <span>300 kbps (LTE Ingest)</span>
                          <span>10,000 kbps (Full HD Fibre)</span>
                        </div>
                      </div>

                      {/* Frame target selection (30 vs 60fps) */}
                      <div>
                        <span className="text-[10px] font-mono text-neutral-400 block mb-1.5">TARGET ENCODING FPS BIND</span>
                        <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-1 rounded-lg border border-neutral-900">
                          {[30, 60].map((fVal) => (
                            <button
                              key={fVal}
                              onClick={() => {
                                setStreamConfig((p) => ({ ...p, fps: fVal }));
                                addLog(`Forced frame ticks pipeline rate target to ${fVal} FPS.`);
                              }}
                              className={`py-1 text-[11px] font-bold rounded-md cursor-pointer transition-all ${
                                streamConfig.fps === fVal ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-400'
                              }`}
                            >
                              {fVal} FPS
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Simulated Network Condition Tester */}
                  <div className="space-y-3 p-4 bg-neutral-950/40 rounded-xl border border-neutral-900">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-neutral-400">SIMULATE CARRIER NETWORK STABILITY</span>
                        <span title="Alters bandwidth headrooms to test compression engines.">
                          <HelpCircle className="h-3.5 w-3.5 text-neutral-500" />
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">Test stream resilience under fluctuating cellular drops.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 bg-neutral-950 p-1.5 rounded-xl border border-neutral-900">
                      {[
                        { val: 'stable', label: 'Stable' },
                        { val: 'fluctuating', label: 'Fluctuate' },
                        { val: 'congested', label: 'Congested' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => {
                            setNetworkCondition(item.val as any);
                            addLog(`FORCED CARRIER PROFILE: ${item.label.toUpperCase()}`);
                          }}
                          className={`py-1.5 text-[10.5px] font-semibold rounded-md transition-all cursor-pointer ${
                            networkCondition === item.val
                              ? item.val === 'stable'
                                ? 'bg-emerald-950 border border-emerald-500 text-emerald-400'
                                : item.val === 'fluctuating'
                                  ? 'bg-yellow-950 border border-yellow-500 text-yellow-400'
                                  : 'bg-rose-950 border border-rose-500 text-rose-400'
                              : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
          </section>
        )}

      </main>

      {/* Page 2: Diagnostics HUD Panel and Simulated Live Chat */}
      {activePage === 'controls' && (
      <footer id="studio-analytics-mud" className="mt-auto border-t border-neutral-900 bg-neutral-950 p-6">
        <div className="max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
          
          {/* Diagnostic Stats Widgets (4 cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <span className="text-[10px] font-mono text-rose-500 font-bold tracking-widest block uppercase">
              DIAGNOSTIC TELEMETRY LOGGER
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase font-mono">Live Framerate</span>
                <span className={`text-2xl font-black font-mono block ${streamStats.isStreaming && streamStats.status === 'live' ? 'text-emerald-400' : 'text-neutral-400'}`}>
                  {streamStats.isStreaming && streamStats.status === 'live' ? streamStats.fps : '0'} <span className="text-xs font-normal">FPS</span>
                </span>
              </div>
              
              <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase font-mono">Avg Latency</span>
                <span className="text-2xl font-black font-mono block text-neutral-300">
                  {streamStats.isStreaming && streamStats.status === 'live'
                    ? streamConfig.protocol === 'WebRTC' ? '120 ms' : '2.1 s'
                    : '—'}
                </span>
              </div>

              <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase font-mono">Packet Loss</span>
                <span className={`text-2xl font-black font-mono block ${streamStats.packetLoss > 2.0 ? 'text-rose-400' : 'text-neutral-300'}`}>
                  {streamStats.isStreaming && streamStats.status === 'live' ? `${streamStats.packetLoss}%` : '0.0%'}
                </span>
              </div>

              <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase font-mono">Frame Drops</span>
                <span className={`text-2xl font-black font-mono block ${streamStats.droppedFrames > 10 ? 'text-rose-400' : 'text-neutral-300'}`}>
                  {streamStats.isStreaming && streamStats.status === 'live' ? streamStats.droppedFrames : '0'}
                </span>
              </div>
            </div>

            {/* Ingestion Monitor Speed Graph (Real-time Canvas-less SVG chart) */}
            <div className="bg-neutral-900/20 p-3 rounded-xl border border-neutral-900 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-400 font-mono">LIVE BITRATE SPEED (LAST 20 SECS)</span>
                <span className="text-[11px] font-mono font-bold text-emerald-400">
                  {streamStats.isStreaming && streamStats.status === 'live' ? `${(streamStats.currentBitrate / 1000).toFixed(2)} Mbps` : '0.00 Mbps'}
                </span>
              </div>

              <div id="svg-chart-container" className="h-20 w-full relative">
                {streamStats.isStreaming && streamStats.status === 'live' ? (
                  <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    
                    {/* Background Filled Path */}
                    <path
                      d={`M 0 30 ${bitrateHistory.map((val, idx) => {
                        const x = (idx / (bitrateHistory.length - 1)) * 100;
                        const ratio = val / 12000; // max limit 12mbps
                        const y = 30 - (ratio * 25);
                        return `L ${x} ${y}`;
                      }).join(' ')} L 100 30 Z`}
                      fill="url(#chartGrad)"
                    />

                    {/* Peak Stroke Line */}
                    <path
                      d={bitrateHistory.map((val, idx) => {
                        const x = (idx / (bitrateHistory.length - 1)) * 100;
                        const ratio = val / 12000;
                        const y = 30 - (ratio * 25);
                        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                      }).join(' ')}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1.2"
                    />
                  </svg>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-600 font-mono uppercase bg-neutral-950/20 rounded-lg">
                    Stream is offline
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Live Chat & Audience comments (4 cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest block uppercase">
                AUDIENCE STREAM FEED
              </span>
              <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
                👁️ {streamStats.viewerCount} VIEWERS
              </span>
            </div>

            {/* Comments log box */}
            <div className="bg-neutral-950 rounded-xl border border-neutral-900 p-3 h-52 flex flex-col justify-between">
              <div className="overflow-y-auto space-y-2 flex-1 pr-1 text-xs">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-neutral-500 font-sans px-4 py-8">
                    {streamStats.status === 'live'
                      ? 'No audience messages received yet.'
                      : 'Audience chat is active when stream is LIVE.'}
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="bg-neutral-900/30 p-2 rounded-lg border border-neutral-900 animate-fade-in text-neutral-300">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-mono text-[11px] ${msg.avatarColor}`}>{msg.user}</span>
                        <span className="text-[9px] text-neutral-500 font-mono">{msg.timestamp}</span>
                      </div>
                      <p className="leading-relaxed leading-normal">{msg.message}</p>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSendComment} className="mt-2 flex space-x-1.5 border-t border-neutral-900 pt-2 shrink-0">
                <input
                  type="text"
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  disabled={streamStats.status !== 'live'}
                  placeholder={streamStats.status === 'live' ? 'Type a broadcaster message...' : 'Chat locked. Go live first.'}
                  className="flex-1 bg-neutral-900 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-850 focus:outline-none focus:border-rose-500 text-neutral-200 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={streamStats.status !== 'live'}
                  className="bg-rose-600 hover:bg-rose-700 disabled:bg-neutral-800 cursor-pointer disabled:cursor-not-allowed text-white p-1.5 rounded-lg transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>

          {/* Console Debug Log panel (4 cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-violet-400 font-bold tracking-widest block uppercase">
                SYSTEM CONSOLE OUTPUT
              </span>
              <button
                onClick={() => {
                  setConnectionLogs([]);
                  addLog('Logs cleared by operator.');
                }}
                className="text-[9px] text-neutral-400 font-mono border border-neutral-800 px-1.5 py-0.5 rounded cursor-pointer hover:bg-neutral-900 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="bg-neutral-950 font-mono text-[10px] text-neutral-400 border border-neutral-900 rounded-xl p-3 h-52 overflow-y-auto space-y-1.5 whitespace-pre-wrap leading-relaxed">
              <div className="text-emerald-500 font-semibold mb-1">=== MOBILE STUDIO BOOT SYSTEM ACTIVE ===</div>
              {connectionLogs.map((log, index) => {
                let clr = 'text-neutral-400';
                if (log.includes('CRITICAL') || log.includes('failed')) clr = 'text-rose-400 font-bold';
                else if (log.includes('WARNING')) clr = 'text-yellow-400';
                else if (log.includes('ACTIVE') || log.includes('connected')) clr = 'text-emerald-400';
                else if (log.includes('INITIATED')) clr = 'text-cyan-400';

                return (
                  <div key={index} className={clr}>
                    {log}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </footer>
      )}
    </div>
  );
}
