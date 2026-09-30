import { ChatMessage, StreamStats, StreamProtocol, StreamQuality } from '../types';

/**
 * Generate a random username for the mock chat stream.
 */
const CHAT_USERS = [
  'TechVibe_X', 'PixelQueen', 'GamerCore99', 'BroadcasterPro', 'ChromaCody',
  'CodeNinja', 'VlogVixen', 'WebRTClife', 'StreamSniper', 'GreenScreenGuy',
  'AestheticSunset', 'ByteSizeNews', 'BitrateBaron', 'LiveTicker', 'MatrixMage'
];

const CHAT_PHRASES = [
  'Wow, that chroma keying looks absolutely razor sharp!',
  'Love the scrolling speed on the ticker! Super smooth.',
  'What protocol works best for HLS streaming latency?',
  'How did you key out the background so cleanly in the canvas?',
  'Is that running at 60fps? It feels incredibly responsive.',
  'Can we upload custom logos to the corner slot?',
  'Try switching to the Cyberpunk Matrix background!',
  'The sunset mountain artwork is so aesthetic.',
  'Is RTMP still the gold standard for YouTube or twitch?',
  'Bitrate is looking very stable! No frame drops at all.',
  'Whoa, loving the mobile landscape view!',
  'Wait, does this support custom hex colors for the color keyer?',
  'Just shared this live streaming board, so cool.',
  'Test stream is looking great, congratulations!',
  'The synthwave perspective lines look crazy satisfying.'
];

const REACTION_PHRASES = {
  greenChroma: [
    'Green screen active! The chroma key outline looks flawless.',
    'Ah, nice green screen! No green reflection on the shoulder pads.',
    'Green color key is keyed out perfectly.'
  ],
  blueChroma: [
    'Wait, blue key color is selected! Classic movie set style.',
    'Switched to blue key, keyer adjusts instantly.'
  ],
  matrixBg: [
    'Whoa, Matrix rain background is sick!',
    'Into the digital realm! Follow the white rabbit.'
  ],
  sunsetBg: [
    'Oh, sunset mountains look so peaceful!',
    'Lofi background, absolute vibes here.'
  ],
  bitrateHigh: [
    '6000kbps stream quality is looking stellar!',
    'High bitrate detected, absolutely zero compression artifacts!'
  ],
  bitrateLow: [
    'Low bitrate is super lightweight, works great on basic LTE.'
  ]
};

export function getRandomUser(): string {
  return CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)];
}

export function getRandomColor(): string {
  const colors = [
    'text-blue-400', 'text-emerald-400', 'text-violet-400', 
    'text-pink-400', 'text-amber-400', 'text-cyan-400', 
    'text-rose-400', 'text-yellow-400'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function generateChatMessage(triggerType?: string): ChatMessage {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  let msg = CHAT_PHRASES[Math.floor(Math.random() * CHAT_PHRASES.length)];
  
  // Choose key responses if customized trigger is provided
  if (triggerType === 'green' && Math.random() > 0.3) {
    msg = REACTION_PHRASES.greenChroma[Math.floor(Math.random() * REACTION_PHRASES.greenChroma.length)];
  } else if (triggerType === 'blue' && Math.random() > 0.3) {
    msg = REACTION_PHRASES.blueChroma[Math.floor(Math.random() * REACTION_PHRASES.blueChroma.length)];
  } else if (triggerType === 'matrix' && Math.random() > 0.3) {
    msg = REACTION_PHRASES.matrixBg[Math.floor(Math.random() * REACTION_PHRASES.matrixBg.length)];
  } else if (triggerType === 'sunset' && Math.random() > 0.3) {
    msg = REACTION_PHRASES.sunsetBg[Math.floor(Math.random() * REACTION_PHRASES.sunsetBg.length)];
  } else if (triggerType === 'highBitrate' && Math.random() > 0.3) {
    msg = REACTION_PHRASES.bitrateHigh[Math.floor(Math.random() * REACTION_PHRASES.bitrateHigh.length)];
  } else if (triggerType === 'lowBitrate' && Math.random() > 0.3) {
    msg = REACTION_PHRASES.bitrateLow[Math.floor(Math.random() * REACTION_PHRASES.bitrateLow.length)];
  }

  return {
    id: Math.random().toString(36).substring(2, 9),
    user: getRandomUser(),
    avatarColor: getRandomColor(),
    message: msg,
    timestamp: timeStr
  };
}

/**
 * Updates simulated stream telemetry states depending on current configurations.
 */
export function simulateStreamStats(
  current: StreamStats,
  selectedProtocol: StreamProtocol,
  selectedBitrate: number,
  fpsTarget: number,
  networkStability: 'stable' | 'fluctuating' | 'congested'
): StreamStats {
  if (!current.isStreaming) {
    return {
      ...current,
      duration: 0,
      viewerCount: 0,
      droppedFrames: 0,
      packetLoss: 0,
      currentBitrate: 0,
      status: 'offline',
      audioLevel: 0
    };
  }

  const nextDuration = current.duration + 1;
  
  // Simple audio simulation: random ambient chatter noise levels
  const nextAudioLevel = Math.max(5, Math.min(95, Math.round(
    current.audioLevel + (Math.random() * 40 - 20)
  )));

  // Telemetry based on stability status
  let packetLoss = 0.02; // excellent base 0.02%
  let fps = fpsTarget;
  let multiplier = 1.0;

  if (networkStability === 'stable') {
    packetLoss = Number((Math.random() * 0.1).toFixed(2));
    fps = Math.max(fpsTarget - 2, fpsTarget - Math.round(Math.random() * 2));
  } else if (networkStability === 'fluctuating') {
    packetLoss = Number((0.5 + Math.random() * 1.5).toFixed(2));
    fps = Math.max(fpsTarget - 12, fpsTarget - Math.round(Math.random() * 8));
    multiplier = 0.8 + Math.random() * 0.3;
  } else if (networkStability === 'congested') {
    packetLoss = Number((3.5 + Math.random() * 4.2).toFixed(2));
    fps = Math.max(12, fpsTarget - 15 - Math.round(Math.random() * 15));
    multiplier = 0.5 + Math.random() * 0.2;
  }

  // Calculate live bit rate fluctuations
  const targetBitrate = selectedBitrate;
  const currentBitrate = Math.round(targetBitrate * multiplier + (Math.random() * (targetBitrate * 0.05) - (targetBitrate * 0.025)));

  // Calculate accumulated frame drops if congested
  let addedDropped = 0;
  if (fps < fpsTarget - 3) {
    addedDropped = Math.round((fpsTarget - fps) * (Math.random() * 1.5 + 0.5));
  }
  const droppedFrames = current.droppedFrames + addedDropped;

  // Viewers slowly trickle in or out
  let viewerDiff = Math.floor(Math.random() * 5) - 1;
  if (current.viewerCount < 10) viewerDiff = Math.floor(Math.random() * 3) + 1;
  const viewerCount = Math.max(3, current.viewerCount + viewerDiff);

  return {
    isStreaming: true,
    duration: nextDuration,
    viewerCount,
    droppedFrames,
    currentBitrate,
    fps,
    audioLevel: nextAudioLevel,
    packetLoss,
    status: current.status // Managed at master controller level during hanshakes
  };
}
