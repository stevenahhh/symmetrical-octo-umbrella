import React, { useState, useEffect, useRef } from 'react';
import { Camera, VideoOff, Activity, ArrowRight, ArrowLeft, Car, WifiOff, Wifi, Settings } from 'lucide-react';

function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ entered: 0, exited: 0, current: 0 });
  const [processedImage, setProcessedImage] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameId = useRef(null);
  const isWaitingForServerRef = useRef(false);

  // Enumerate cameras
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request initial permission to get labels
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (e) {
        console.error("Failed to enumerate devices", e);
      }
    };
    getDevices();
  }, []);

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    console.log("Connecting to", wsUrl);
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket Connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.image) {
          setProcessedImage(data.image);
        }
        setStats({
          entered: data.entered ?? 0,
          exited: data.exited ?? 0,
          current: data.current ?? 0,
        });
        
        // We received a response, we can send the next frame!
        isWaitingForServerRef.current = false;
      } catch (e) {
        console.error("Error parsing message", e);
        isWaitingForServerRef.current = false;
      }
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket Disconnected');
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      setIsConnected(false);
    };
    
    wsRef.current = ws;
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  const startStream = async () => {
    try {
      const constraints = selectedDeviceId 
        ? { video: { deviceId: { exact: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } } }
        : { video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      
      connectWebSocket();
      isStreamingRef.current = true;
      setIsStreaming(true);
      
      // Start sending frames
      sendFrames();
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera: " + err.message);
    }
  };

  const stopStream = () => {
    isStreamingRef.current = false;
    setIsStreaming(false);
    
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    disconnectWebSocket();
  };

  const sendFrames = () => {
    if (!isStreamingRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;
    
    // Only send a frame if we are NOT waiting for the server to process the previous one.
    // This creates natural backpressure and guarantees ZERO latency lag!
    if (!isWaitingForServerRef.current && video && canvas && ws && ws.readyState === WebSocket.OPEN) {
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get base64 string
        const base64Data = canvas.toDataURL('image/jpeg', 0.6);
        isWaitingForServerRef.current = true;
        ws.send(base64Data);
      }
    }
    
    // Check again very frequently (60fps) to send as soon as ready
    animationFrameId.current = requestAnimationFrame(sendFrames);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 glass-card p-6 rounded-3xl">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
              <Activity className="w-8 h-8 text-indigo-400" />
              Real-Time Vision
            </h1>
            <p className="text-slate-400 mt-1 font-medium">Vehicle Recognition Dashboard</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            {/* Camera Selector */}
            <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-xl border border-slate-700 w-full sm:w-auto">
               <Settings className="w-4 h-4 text-slate-400 ml-2" />
               <select 
                 className="bg-transparent border-none text-sm text-slate-200 focus:outline-none px-2 w-full max-w-[200px] truncate"
                 value={selectedDeviceId}
                 onChange={(e) => setSelectedDeviceId(e.target.value)}
                 disabled={isStreaming}
               >
                 {devices.length === 0 && <option>Loading cameras...</option>}
                 {devices.map((device, idx) => (
                   <option key={device.deviceId} value={device.deviceId}>
                     {device.label || `Camera ${idx + 1}`}
                   </option>
                 ))}
               </select>
            </div>
            
            <button
              onClick={isStreaming ? stopStream : startStream}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg ${
                isStreaming 
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 shadow-red-500/10' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/20'
              }`}
            >
              {isStreaming ? (
                <><VideoOff className="w-5 h-5" /> Stop Stream</>
              ) : (
                <><Camera className="w-5 h-5" /> Start Camera</>
              )}
            </button>
          </div>
        </header>

        {/* Status indicator */}
        <div className="flex items-center gap-3 px-2">
           <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
              {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {isConnected ? 'Connected to Server' : 'Disconnected'}
           </div>
           {isStreaming && (
             <div className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                Transmitting
             </div>
           )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="glass-card rounded-3xl overflow-hidden relative min-h-[400px] md:min-h-[600px] flex items-center justify-center border border-slate-700/50 shadow-2xl bg-black">
              
              {!isStreaming && !processedImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/40 z-10">
                  <Camera className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Camera inactive</p>
                  <p className="text-sm opacity-70">Select your iPad camera and click "Start Camera"</p>
                </div>
              )}

              {/* Hidden video element for capturing camera stream */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{ position: 'absolute', top: 0, left: 0, width: '10px', height: '10px', opacity: 0, pointerEvents: 'none' }}
              />
              
              {/* Hidden canvas for extracting frames */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Display the processed image from WebSocket */}
              {processedImage ? (
                <img 
                  src={processedImage} 
                  alt="Processed Stream" 
                  className="w-full h-full object-contain relative z-20"
                />
              ) : isStreaming && !processedImage ? (
                <div className="flex flex-col items-center justify-center z-10">
                   <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                   <p className="text-slate-400 animate-pulse font-medium">Processing video feed...</p>
                </div>
              ) : null}

              {/* Live indicator overlay */}
              {processedImage && (
                 <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 z-30">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-xs font-bold tracking-wider text-white">LIVE AI</span>
                 </div>
              )}
            </div>
          </div>

          {/* Statistics Sidebar */}
          <div className="lg:col-span-1 space-y-4 flex flex-col">
            <div className="glass-card p-6 rounded-3xl flex-1 flex flex-col justify-center relative overflow-hidden group">
              <h3 className="text-slate-400 font-semibold mb-2 flex items-center gap-2">
                <Car className="w-5 h-5" /> Current Vehicles
              </h3>
              <div className="text-6xl font-black text-white tabular-nums tracking-tighter">
                {stats.current}
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl flex-1 flex flex-col justify-center relative overflow-hidden bg-gradient-to-br from-emerald-500/5 to-transparent">
              <h3 className="text-slate-400 font-semibold mb-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </div>
                Total Entered
              </h3>
              <div className="text-5xl font-bold text-emerald-400 tabular-nums">
                {stats.entered}
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl flex-1 flex flex-col justify-center relative overflow-hidden bg-gradient-to-br from-rose-500/5 to-transparent">
              <h3 className="text-slate-400 font-semibold mb-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center">
                  <ArrowLeft className="w-4 h-4 text-rose-400" />
                </div>
                Total Exited
              </h3>
              <div className="text-5xl font-bold text-rose-400 tabular-nums">
                {stats.exited}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
