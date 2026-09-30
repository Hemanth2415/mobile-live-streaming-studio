export type StreamProtocol = 'RTMP' | 'RTMPS' | 'SRT' | 'WebRTC' | 'HLS';

export type StreamQuality = 'ultra' | 'high' | 'medium' | 'low' | 'custom';

export type ChromaColorType = 'green' | 'blue' | 'magenta' | 'custom';

export type BgPresetType = 'nature' | 'matrix' | 'city' | 'neon' | 'cozy' | 'solid' | 'custom';

export type LogoPositionType = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface StreamConfig {
  protocol: StreamProtocol;
  streamUrl: string;
  streamKey: string;
  quality: StreamQuality;
  bitrate: number; // in kbps, e.g., 6000
  fps: number; // 30 or 60
  resolution: { width: number; height: number };
}

export interface ChromaConfig {
  enabled: boolean;
  colorType: ChromaColorType;
  customColor: string; // hex
  tolerance: number; // 0 - 255
  smoothing: number; // 0 - 255
  spillReduction: number; // 0 - 100
  bgType: BgPresetType;
  bgSolidColor: string; // hex for solid background
  bgImageUrl: string; // custom image url or base64
}

export interface LogoConfig {
  enabled: boolean;
  preset: string; // 'none' | 'news' | 'gaming' | 'sports' | 'cooking' | 'custom'
  customUrl: string; // raw base64 or source url
  position: LogoPositionType;
  size: number; // percentage of screen width (e.g., 10 to 30)
  opacity: number; // 0.1 to 1.0
  padding: number; // in pixels
}

export interface TickerConfig {
  enabled: boolean;
  text: string;
  speed: 'slow' | 'medium' | 'fast';
  bgColor: string;
  textColor: string;
  fontSize: number; // in pixels relative
}

export interface StreamStats {
  isStreaming: boolean;
  duration: number; // in seconds
  viewerCount: number;
  droppedFrames: number;
  currentBitrate: number; // simulated
  fps: number; // live
  audioLevel: number; // 0 - 100
  packetLoss: number; // percentage
  status: 'offline' | 'connecting' | 'live' | 'error';
}

export interface ChatMessage {
  id: string;
  user: string;
  avatarColor: string;
  message: string;
  timestamp: string;
}
